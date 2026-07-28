import { AppearanceColorControls } from "@/components/AppearanceColorControls";
import { AppearancePreviewPane } from "@/components/AppearancePreviewPane";
import { AppearanceProceduralControls } from "@/components/AppearanceProceduralControls";
import { AppearanceSurfaceControls } from "@/components/AppearanceSurfaceControls";
import { SavedAppearanceDesigns } from "@/components/SavedAppearanceDesigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  appearanceFillKey as fillKey,
  cloneAppearanceRecipe as cloneRecipe,
  getAppearanceFillLabel as fillLabel,
  getAppearanceFills as allFills,
  getAppearancePresetStyles,
} from "@/lib/appearance-editor";
import {
  APPEARANCE_TARGET_LABELS,
  APPEARANCE_TARGETS,
  type AppearanceCatalogV2,
  type AppearanceDesignV2,
  type AppearanceEditorTarget,
  type AppearanceFill,
  type AppearanceProfileResource,
  type AppearanceProfileV2,
  type AppearanceRecipeV2,
  type AppearanceTarget,
  type DesignReference,
  type GuildAppearanceProfileV2,
} from "@/types/appearance";
import { Save, Sparkles } from "lucide-react";
import * as React from "react";

const TARGET_LABELS = APPEARANCE_TARGET_LABELS;
const GUILD_MODE_DESCRIPTIONS = {
  off: "Personal styles remain active.",
  default: "Personal styles win, then server styles.",
  enforced: "Configured server targets override personal styles.",
} as const;

type EditableProfile = AppearanceProfileV2 | GuildAppearanceProfileV2;

function selectedFills(
  selection: AppearanceRecipeV2["fill"],
): AppearanceFill[] {
  switch (selection.mode) {
    case "fixed":
      return [selection.value];
    case "allowlist":
      return selection.values;
    case "weighted":
      return selection.options.map(({ value }) => value);
  }
}

function selectedFonts(selection: AppearanceRecipeV2["font"]): string[] {
  switch (selection.mode) {
    case "fixed":
      return [selection.fontId];
    case "allowlist":
      return selection.fontIds;
    case "weighted":
      return selection.options.map(({ fontId }) => fontId);
  }
}

type AppearanceEditorProps = {
  catalog: AppearanceCatalogV2;
  resource: AppearanceProfileResource<EditableProfile>;
  kind: "personal" | "guild";
  personalDesigns: readonly AppearanceDesignV2[];
  isSaving: boolean;
  onSave(profile: EditableProfile): Promise<void>;
};

function emptyProfile(kind: AppearanceEditorProps["kind"]): EditableProfile {
  const profile: AppearanceProfileV2 = {
    version: 2,
    designs: [],
    assignments: { all: null, overrides: {} },
  };
  return kind === "guild" ? { ...profile, mode: "default" } : profile;
}

function assignmentFor(
  profile: AppearanceProfileV2,
  target: AppearanceEditorTarget,
): DesignReference | null {
  return target === "all"
    ? profile.assignments.all
    : profile.assignments.overrides[target] ?? profile.assignments.all;
}

function assignmentName(
  profile: AppearanceProfileV2,
  reference: DesignReference | null,
  catalog: AppearanceCatalogV2,
): string {
  if (reference === null) {
    const defaultStyle = catalog.styles.find(
      ({ id }) => id === catalog.defaultStyleId,
    );
    if (defaultStyle === undefined) {
      throw new Error("Default appearance style is missing");
    }
    return defaultStyle.name;
  }
  const option =
    reference.source === "builtin"
      ? catalog.styles.find(({ id }) => id === reference.id)
      : profile.designs.find(({ id }) => id === reference.id);
  if (option === undefined) {
    throw new Error("Assigned appearance design is missing");
  }
  return option.name;
}

function editorSelection(
  profile: AppearanceProfileV2,
  target: AppearanceEditorTarget,
  catalog: AppearanceCatalogV2,
): {
  recipe: AppearanceRecipeV2;
  styleId: string;
  designId: string | null;
  name: string;
} {
  const reference = assignmentFor(profile, target);
  if (reference === null || reference.source === "builtin") {
    const styleId = reference?.id ?? catalog.defaultStyleId;
    const style = catalog.styles.find(({ id }) => id === styleId);
    if (style === undefined) {
      throw new Error(
        reference === null
          ? "Default appearance style is missing"
          : "Assigned appearance style is missing",
      );
    }
    return {
      recipe: cloneRecipe(style.recipe),
      styleId: style.id,
      designId: null,
      name: style.name,
    };
  }
  const design = profile.designs.find(({ id }) => id === reference.id);
  if (design === undefined) {
    throw new Error("Assigned custom appearance design is missing");
  }
  return {
    recipe: cloneRecipe(design.recipe),
    styleId: "",
    designId: design.id,
    name: design.name,
  };
}

function assignReference(
  profile: EditableProfile,
  target: AppearanceEditorTarget,
  reference: DesignReference,
): EditableProfile {
  if (target === "all") {
    return {
      ...profile,
      assignments: { all: reference, overrides: {} },
    };
  }
  return {
    ...profile,
    assignments: {
      all: profile.assignments.all,
      overrides: { ...profile.assignments.overrides, [target]: reference },
    },
  };
}

function withoutTargetOverride(
  profile: EditableProfile,
  target: AppearanceTarget,
): EditableProfile {
  const overrides = { ...profile.assignments.overrides };
  delete overrides[target];
  return {
    ...profile,
    assignments: { ...profile.assignments, overrides },
  };
}

function withoutDesign(
  profile: EditableProfile,
  designId: string,
): EditableProfile {
  const overrides = Object.fromEntries(
    Object.entries(profile.assignments.overrides).filter(
      ([, reference]) =>
        reference.source !== "custom" || reference.id !== designId,
    ),
  ) as AppearanceProfileV2["assignments"]["overrides"];
  const all = profile.assignments.all;
  return {
    ...profile,
    designs: profile.designs.filter(({ id }) => id !== designId),
    assignments: {
      all:
        all?.source === "custom" && all.id === designId ? null : all,
      overrides,
    },
  };
}

export function AppearanceEditor({
  catalog,
  resource,
  kind,
  personalDesigns,
  isSaving,
  onSave,
}: AppearanceEditorProps) {
  const currentProfile = resource.profile ?? emptyProfile(kind);
  const initialSelection = editorSelection(currentProfile, "all", catalog);
  const [target, setTarget] = React.useState<AppearanceEditorTarget>("all");
  const [recipe, setRecipe] = React.useState(initialSelection.recipe);
  const [selectedStyleId, setSelectedStyleId] = React.useState(
    initialSelection.styleId,
  );
  const [designName, setDesignName] = React.useState(initialSelection.name);
  const [editingDesignId, setEditingDesignId] = React.useState<string | null>(
    initialSelection.designId,
  );
  const [status, setStatus] = React.useState<string | null>(null);
  const [personalDesignId, setPersonalDesignId] = React.useState("");
  const [guildMode, setGuildMode] = React.useState<
    GuildAppearanceProfileV2["mode"]
  >(
    kind === "guild" && resource.profile && "mode" in resource.profile
      ? resource.profile.mode
      : "default",
  );

  React.useEffect(() => {
    if (kind === "guild" && resource.profile && "mode" in resource.profile) {
      setGuildMode(resource.profile.mode);
    }
  }, [kind, resource.profile, resource.revision]);

  React.useEffect(() => {
    if (
      personalDesignId !== "" &&
      !personalDesigns.some(({ id }) => id === personalDesignId)
    ) {
      setPersonalDesignId("");
    }
  }, [personalDesignId, personalDesigns]);

  const selectedFillValues = React.useMemo(
    () => selectedFills(recipe.fill),
    [recipe.fill],
  );
  const availableFills = React.useMemo(
    () => allFills(catalog, selectedFillValues),
    [catalog, selectedFillValues],
  );
  const presetStyles = getAppearancePresetStyles(catalog, selectedStyleId);

  const setCustomRecipe = (nextRecipe: AppearanceRecipeV2) => {
    if (selectedStyleId === "") {
      setRecipe(nextRecipe);
      return;
    }

    const lightingStrength: AppearanceRecipeV2["lighting"]["strength"] =
      nextRecipe.lighting.strength !== recipe.lighting.strength
        ? nextRecipe.lighting.strength
        : { mode: "fixed", value: "gentle" };
    setRecipe({
      ...nextRecipe,
      variation: "fixed",
      lighting: { ...nextRecipe.lighting, strength: lightingStrength },
    });
    setSelectedStyleId("");
  };

  const persistedProfile = (): EditableProfile =>
    kind === "guild"
      ? { ...currentProfile, mode: guildMode }
      : currentProfile;

  const saveProfile = async (
    profile: EditableProfile,
    message: string,
  ): Promise<boolean> => {
    setStatus(null);
    try {
      await onSave(profile);
      setStatus(message);
      return true;
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Appearance could not be saved",
      );
      return false;
    }
  };

  const loadSelection = (
    profile: AppearanceProfileV2,
    nextTarget: AppearanceEditorTarget,
  ) => {
    const selection = editorSelection(profile, nextTarget, catalog);
    setTarget(nextTarget);
    setSelectedStyleId(selection.styleId);
    setEditingDesignId(selection.designId);
    setDesignName(selection.name);
    setRecipe(selection.recipe);
  };

  const selectTarget = (nextTarget: AppearanceEditorTarget) => {
    loadSelection(currentProfile, nextTarget);
    setStatus(null);
  };

  const selectStyle = (styleId: string) => {
    const style = catalog.styles.find(({ id }) => id === styleId);
    if (style === undefined) {
      throw new Error("Selected appearance style is missing");
    }
    setSelectedStyleId(style.id);
    setEditingDesignId(null);
    setDesignName(style.name);
    setRecipe(cloneRecipe(style.recipe));
  };

  const randomize = () => {
    const randomStyle = catalog.styles.find(
      ({ id }) => id === "chaotic",
    );
    if (randomStyle === undefined) {
      throw new Error("Random appearance style is missing");
    }
    setSelectedStyleId("");
    setEditingDesignId(null);
    setDesignName("Random design");
    setRecipe(cloneRecipe(randomStyle.recipe));
  };

  const copyPersonalDesign = () => {
    const design = personalDesigns.find(({ id }) => id === personalDesignId);
    if (design === undefined) {
      throw new Error("Selected personal appearance design is missing");
    }
    setSelectedStyleId("");
    setEditingDesignId(null);
    setDesignName(design.name);
    setRecipe(cloneRecipe(design.recipe));
    setStatus(
      `${design.name} was copied into this server draft. Save & apply to keep the detached copy.`,
    );
  };

  const applyPreset = async () => {
    if (selectedStyleId === "") return;
    const profile = assignReference(persistedProfile(), target, {
      source: "builtin",
      id: selectedStyleId,
    });
    await saveProfile(
      profile,
      `${TARGET_LABELS[target]} now uses the selected preset.`,
    );
  };

  const saveCustomDesign = async () => {
    const name = designName.trim();
    if (name.length < 1 || name.length > 50) {
      setStatus("Design names must contain 1–50 characters.");
      return;
    }
    const profile = persistedProfile();
    const id = editingDesignId ?? crypto.randomUUID();
    const existingIndex = profile.designs.findIndex((design) => design.id === id);
    if (existingIndex === -1 && profile.designs.length >= 10) {
      setStatus("You can save at most ten designs.");
      return;
    }
    const designs = [...profile.designs];
    const design = { id, name, recipe: cloneRecipe(recipe) };
    if (existingIndex === -1) designs.push(design);
    else designs[existingIndex] = design;
    const assigned = assignReference(
      { ...profile, designs },
      target,
      { source: "custom", id },
    );
    const saved = await saveProfile(
      assigned,
      `${name} was saved and applied to ${TARGET_LABELS[target]}.`,
    );
    if (!saved) return;
    setEditingDesignId(id);
    setSelectedStyleId("");
    setDesignName(name);
  };

  const editDesign = (designId: string) => {
    const design = currentProfile.designs.find(({ id }) => id === designId);
    if (design === undefined) return;
    setEditingDesignId(design.id);
    setSelectedStyleId("");
    setDesignName(design.name);
    setRecipe(cloneRecipe(design.recipe));
  };

  const deleteDesign = async (designId: string) => {
    const design = currentProfile.designs.find(({ id }) => id === designId);
    if (design === undefined) return;
    const profile = withoutDesign(persistedProfile(), designId);
    const saved = await saveProfile(profile, `${design.name} was deleted.`);
    if (!saved) return;
    if (editingDesignId === designId) loadSelection(profile, target);
  };

  const clearTargetOverride = async () => {
    if (target === "all") return;
    const profile = withoutTargetOverride(persistedProfile(), target);
    const saved = await saveProfile(
      profile,
      `${TARGET_LABELS[target]} now inherits the All dice design.`,
    );
    if (saved) loadSelection(profile, target);
  };

  const toggleFill = (fill: AppearanceFill) => {
    const key = fillKey(fill);
    const selected = selectedFillValues.some((value) => fillKey(value) === key);
    const values = selected
      ? selectedFillValues.filter((value) => fillKey(value) !== key)
      : [...selectedFillValues, fill];
    if (values.length === 0) return;
    setSelectedStyleId("");
    setRecipe({ ...recipe, fill: { mode: "allowlist", values } });
  };

  const selectedFontIds = selectedFonts(recipe.font);
  const toggleFont = (fontId: string) => {
    const selected = selectedFontIds.includes(fontId);
    const fontIds = selected
      ? selectedFontIds.filter((value) => value !== fontId)
      : [...selectedFontIds, fontId];
    if (fontIds.length === 0) return;
    setSelectedStyleId("");
    setRecipe({ ...recipe, font: { mode: "allowlist", fontIds } });
  };

  const activeAssignment = assignmentFor(currentProfile, target);
  const hasTargetOverride =
    target !== "all" &&
    currentProfile.assignments.overrides[target] !== undefined;

  return (
    <section
      className={
        target === "all"
          ? "grid gap-6"
          : "grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]"
      }
    >
      <div className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Target
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Dice target">
            {["all", ...APPEARANCE_TARGETS].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  selectTarget(value as AppearanceEditorTarget)
                }
                aria-pressed={target === value}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  target === value
                    ? "border-brand bg-brand text-brand-foreground"
                    : "bg-background hover:border-brand/70"
                }`}
              >
                {TARGET_LABELS[value as AppearanceEditorTarget]}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <p>
              Current design: {assignmentName(currentProfile, activeAssignment, catalog)}
            </p>
            {hasTargetOverride && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void clearTargetOverride()}
                className="font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50"
              >
                Use All dice design
              </button>
            )}
          </div>
        </div>

        {kind === "guild" && (
          <fieldset className="rounded-lg border bg-muted/30 p-4">
            <legend className="px-1 text-sm font-semibold">Server styling mode</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["off", "default", "enforced"] as const).map((mode) => (
                <label key={mode} className="flex items-start gap-2 rounded-md border bg-background p-3">
                  <input
                    type="radio"
                    name="guild-appearance-mode"
                    value={mode}
                    checked={guildMode === mode}
                    onChange={() => setGuildMode(mode)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium capitalize">{mode}</span>
                    <span className="block text-xs text-muted-foreground">
                      {GUILD_MODE_DESCRIPTIONS[mode]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={isSaving}
              onClick={() =>
                void saveProfile(
                  { ...persistedProfile(), mode: guildMode },
                  "Server styling mode was saved.",
                )
              }
            >
              Save mode
            </Button>
          </fieldset>
        )}

        {kind === "guild" && personalDesigns.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Copy one of my designs</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Copying creates a detached server draft. Later personal edits will
              not change the server design.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <select
                aria-label="Personal design to copy"
                value={personalDesignId}
                onChange={(event) => setPersonalDesignId(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Choose a personal design</option>
                {personalDesigns.map((design) => (
                  <option key={design.id} value={design.id}>
                    {design.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={personalDesignId === "" || isSaving}
                onClick={copyPersonalDesign}
              >
                Copy to draft
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="space-y-1.5">
            <span className="text-sm font-semibold">Preset</span>
            <select
              value={selectedStyleId}
              onChange={(event) => selectStyle(event.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {selectedStyleId === "" && <option value="">Custom draft</option>}
              {presetStyles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" onClick={randomize}>
            <Sparkles className="mr-2 h-4 w-4" />
            Randomize
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={selectedStyleId === "" || isSaving}
            onClick={() => void applyPreset()}
          >
            Apply preset
          </Button>
        </div>

        <AppearanceColorControls
          recipe={recipe}
          onChange={setCustomRecipe}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-semibold">Fill or pattern</span>
            <select
              value={
                recipe.fill.mode === "fixed"
                  ? fillKey(recipe.fill.value)
                  : "random"
              }
              onChange={(event) => {
                const value = event.target.value;
                if (value === "random") {
                  setCustomRecipe({
                    ...recipe,
                    fill: { mode: "allowlist", values: availableFills },
                  });
                  return;
                }
                const fill = availableFills.find(
                  (candidate) => fillKey(candidate) === value,
                );
                if (fill !== undefined) {
                  setCustomRecipe({
                    ...recipe,
                    fill: { mode: "fixed", value: fill },
                  });
                }
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="random">Procedural mix</option>
              {availableFills.map((fill) => (
                <option key={fillKey(fill)} value={fillKey(fill)}>
                  {fillLabel(fill, catalog)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-semibold">Font</span>
            <select
              value={
                recipe.font.mode === "fixed" ? recipe.font.fontId : "random"
              }
              onChange={(event) => {
                const value = event.target.value;
                setCustomRecipe({
                  ...recipe,
                  font:
                    value === "random"
                      ? {
                          mode: "allowlist",
                          fontIds: catalog.fonts.map(({ id }) => id),
                        }
                      : { mode: "fixed", fontId: value },
                });
              }}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="random">Procedural mix</option>
              {catalog.fonts.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <AppearanceSurfaceControls
          recipe={recipe}
          onChange={setCustomRecipe}
        />

        <details className="rounded-lg border bg-muted/20 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Advanced procedural controls
          </summary>
          <div className="mt-4 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Variation</span>
                <select
                  value={recipe.variation}
                  onChange={(event) => {
                    setSelectedStyleId("");
                    setRecipe({
                      ...recipe,
                      variation: event.target.value as AppearanceRecipeV2["variation"],
                    });
                  }}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="fixed">Fixed</option>
                  <option value="curated">Curated</option>
                  <option value="wild">Wild</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Change appearance</span>
                <select
                  value={recipe.varyBy}
                  onChange={(event) => {
                    setSelectedStyleId("");
                    setRecipe({
                      ...recipe,
                      varyBy: event.target.value as AppearanceRecipeV2["varyBy"],
                    });
                  }}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="die">For each die</option>
                  <option value="group">For dice rolled together</option>
                  <option value="roll">Once per roll</option>
                </select>
              </label>
            </div>

            <AppearanceProceduralControls
              recipe={recipe}
              onChange={(next) => {
                setSelectedStyleId("");
                setRecipe(next);
              }}
            />

            <fieldset>
              <legend className="text-sm font-medium">Fill allowlist</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableFills.map((fill) => (
                  <label key={fillKey(fill)} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedFillValues.some(
                        (value) => fillKey(value) === fillKey(fill),
                      )}
                      onChange={() => toggleFill(fill)}
                    />
                    {fillLabel(fill, catalog)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium">Font allowlist</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {catalog.fonts.map((font) => (
                  <label key={font.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedFontIds.includes(font.id)}
                      onChange={() => toggleFont(font.id)}
                    />
                    {font.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </details>

        <div className="rounded-lg border border-brand/35 bg-brand/10 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-design-name`}>Design name</Label>
              <Input
                id={`${kind}-design-name`}
                value={designName}
                maxLength={50}
                onChange={(event) => setDesignName(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={() => selectTarget(target)}
            >
              Cancel design changes
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => void saveCustomDesign()}
            >
              <Save className="mr-2 h-4 w-4" />
              Save &amp; apply
            </Button>
          </div>
        </div>

        {status && (
          <p role="status" className="text-sm font-medium text-brand">
            {status}
          </p>
        )}
      </div>

      <aside
        className={
          target === "all"
            ? "space-y-4"
            : "space-y-4 xl:sticky xl:top-6 xl:self-start"
        }
      >
        <AppearancePreviewPane target={target} recipe={recipe} />

        {currentProfile.designs.length > 0 && (
          <SavedAppearanceDesigns
            designs={currentProfile.designs}
            isSaving={isSaving}
            onEdit={editDesign}
            onDelete={(designId) => void deleteDesign(designId)}
          />
        )}
      </aside>
    </section>
  );
}
