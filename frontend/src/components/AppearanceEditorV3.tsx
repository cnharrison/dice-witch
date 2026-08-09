import { AppearancePresetGalleryV3 } from "@/components/AppearancePresetGalleryV3";
import { DiceViewPreferencesV4 } from "@/components/DiceViewPreferencesV4";
import { AppearancePreviewPaneV3 } from "@/components/AppearancePreviewPaneV3";
import { AppearanceRecipeControlsV3 } from "@/components/AppearanceRecipeControlsV3";
import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { AppearanceTargetPickerV3 } from "@/components/AppearanceTargetPickerV3";
import { SavedAppearanceDesigns } from "@/components/SavedAppearanceDesigns";
import { SparkleLoadingIndicator } from "@/components/SparkleLoadingIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppearanceApiError } from "@/lib/appearance";
import {
  appearanceAssignmentForV3,
  applyAppearanceReferenceV3,
  assertAppearanceRecipeSupportsTargetV3,
  beginAppearanceRecipeEditV3,
  clearAppearanceTargetOverrideV3,
  createEmptyAppearanceProfileV3,
  createEmptyAppearanceProfileV4,
  deleteAppearanceDesignV3,
  nextPresetEditNameV3,
  resolveAppearanceEditorSelectionV3,
  upsertAppearanceDesignV3,
  withAutomaticMaterialFormsV3,
  type AppearanceEditorTargetV3,
  type EditableAppearanceProfileV3,
} from "@/lib/appearance-editor-v3";
import {
  APPEARANCE_TARGET_LABELS,
  type AppearanceCatalogV3,
  type AppearanceProfileResource,
} from "@/types/appearance";
import type {
  AppearanceRecipeV3,
  CustomAppearanceDesignV3,
  DiceViewPreferencesV4 as DiceViewPreferencesValueV4,
} from "@dice-witch/dice-v4-model";
import { Check, Save } from "lucide-react";
import * as React from "react";

type AppearanceEditorV3Props = {
  catalog: AppearanceCatalogV3;
  resource: AppearanceProfileResource<EditableAppearanceProfileV3>;
  kind: "personal" | "guild";
  personalDesigns: readonly CustomAppearanceDesignV3[];
  isSaving: boolean;
  version?: 3 | 4;
  onSave(profile: EditableAppearanceProfileV3): Promise<void>;
};

function errorMessage(error: unknown): string {
  if (!(error instanceof AppearanceApiError)) {
    return error instanceof Error ? error.message : "Appearance could not be saved";
  }
  switch (error.code) {
    case "appearance_revision_conflict":
      return "This appearance changed elsewhere. Reloaded settings are required before saving again.";
    case "appearance_profile_version_conflict":
      return "This profile belongs to another appearance version and was not changed.";
    case "appearance_guild_forbidden":
      return "You no longer have permission to change this server appearance.";
    case "appearance_authentication_required":
      return "Your session expired. Sign in again before saving appearance settings.";
    case "appearance_profile_invalid":
      return "This draft contains an unsupported appearance combination.";
    default:
      return "Appearance settings are temporarily unavailable.";
  }
}

export function AppearanceEditorV3({
  catalog,
  resource,
  kind,
  personalDesigns,
  isSaving,
  version = 3,
  onSave,
}: AppearanceEditorV3Props) {
  const resourceProfile = React.useMemo(
    () =>
      resource.profile ??
      (version === 4
        ? createEmptyAppearanceProfileV4(kind)
        : createEmptyAppearanceProfileV3(kind)),
    [kind, resource.profile, version],
  );
  const [currentProfile, setCurrentProfile] =
    React.useState<EditableAppearanceProfileV3>(resourceProfile);
  const [diceViewDraft, setDiceViewDraft] =
    React.useState<DiceViewPreferencesValueV4 | null>(
      resourceProfile.version === 4
        ? structuredClone(resourceProfile.diceView)
        : null,
    );
  const diceViewDirtyRef = React.useRef(false);
  const initial = resolveAppearanceEditorSelectionV3(
    currentProfile,
    "all",
    catalog,
  );
  const [target, setTarget] =
    React.useState<AppearanceEditorTargetV3>("all");
  const [previewTarget, setPreviewTarget] =
    React.useState<AppearanceEditorTargetV3>("all");
  const [recipe, setRecipe] = React.useState(initial.recipe);
  const [selectedStyleId, setSelectedStyleId] = React.useState(initial.styleId);
  const [editingDesignId, setEditingDesignId] = React.useState<string | null>(
    initial.designId,
  );
  const [designName, setDesignName] = React.useState(initial.name);
  const [automaticDesignName, setAutomaticDesignName] = React.useState(
    initial.styleId !== "",
  );
  const [status, setStatus] = React.useState<string | null>(null);
  const [presetState, setPresetState] = React.useState<
    "idle" | "applying" | "applied"
  >("idle");
  const [customizing, setCustomizing] = React.useState(false);
  const [personalDesignId, setPersonalDesignId] = React.useState("");

  React.useEffect(() => {
    setCurrentProfile(resourceProfile);
    if (resourceProfile.version === 4 && !diceViewDirtyRef.current) {
      setDiceViewDraft(structuredClone(resourceProfile.diceView));
    }
  }, [resource.revision, resourceProfile]);

  const diceViewDirty =
    currentProfile.version === 4 &&
    diceViewDraft !== null &&
    JSON.stringify(currentProfile.diceView) !== JSON.stringify(diceViewDraft);
  diceViewDirtyRef.current = diceViewDirty;

  const withDiceViewDraft = <Profile extends EditableAppearanceProfileV3>(
    profile: Profile,
  ): Profile => {
    if (profile.version !== 4 || diceViewDraft === null) return profile;
    return { ...profile, diceView: structuredClone(diceViewDraft) } as Profile;
  };

  React.useEffect(() => {
    if (
      personalDesignId !== "" &&
      !personalDesigns.some(({ id }) => id === personalDesignId)
    ) {
      setPersonalDesignId("");
    }
  }, [personalDesignId, personalDesigns]);

  const saveProfile = async (
    profile: EditableAppearanceProfileV3,
    message: string | null,
  ): Promise<boolean> => {
    setStatus(null);
    try {
      await onSave(profile);
      setCurrentProfile(profile);
      setStatus(message);
      return true;
    } catch (error) {
      setStatus(errorMessage(error));
      return false;
    }
  };

  const loadSelection = (
    profile: EditableAppearanceProfileV3,
    nextTarget: AppearanceEditorTargetV3,
  ) => {
    const selection = resolveAppearanceEditorSelectionV3(
      profile,
      nextTarget,
      catalog,
    );
    setTarget(nextTarget);
    setPreviewTarget(nextTarget);
    setRecipe(selection.recipe);
    setSelectedStyleId(selection.styleId);
    setEditingDesignId(selection.designId);
    setDesignName(selection.name);
    setAutomaticDesignName(selection.styleId !== "");
    setCustomizing(false);
  };

  const selectTarget = (nextTarget: AppearanceEditorTargetV3) => {
    loadSelection(currentProfile, nextTarget);
    setStatus(null);
    setPresetState("idle");
  };

  const selectStyle = async (styleId: string) => {
    setPresetState("applying");
    const profile = applyAppearanceReferenceV3(
      currentProfile,
      target,
      { source: "builtin", id: styleId },
      catalog,
    );
    const saved = await saveProfile(profile, null);
    if (saved) {
      loadSelection(profile, target);
      setPresetState("applied");
    } else {
      setPresetState("idle");
    }
  };

  const setCustomRecipe = (next: AppearanceRecipeV3) => {
    setPresetState("idle");
    try {
      const editingPreset = selectedStyleId !== "";
      setRecipe(beginAppearanceRecipeEditV3(recipe, next, editingPreset));
      if (editingPreset && automaticDesignName) {
        setDesignName(
          nextPresetEditNameV3(currentProfile.designs),
        );
      }
      setAutomaticDesignName(false);
      setSelectedStyleId("");
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const saveCustomDesign = async () => {
    const name = designName.trim();
    const id = editingDesignId ?? crypto.randomUUID();
    let profile: EditableAppearanceProfileV3;
    try {
      profile = withDiceViewDraft(
        upsertAppearanceDesignV3(
          currentProfile,
          target,
          { id, name, recipe },
          catalog,
        ),
      );
    } catch (error) {
      setStatus(errorMessage(error));
      return;
    }
    const saved = await saveProfile(
      profile,
      `${name} was saved and applied to ${APPEARANCE_TARGET_LABELS[target]}.`,
    );
    if (!saved) return;
    setEditingDesignId(id);
    setSelectedStyleId("");
    setDesignName(name);
    setAutomaticDesignName(false);
    setCustomizing(false);
    diceViewDirtyRef.current = false;
    if (profile.version === 4) {
      setDiceViewDraft(structuredClone(profile.diceView));
    }
  };

  const saveDiceView = async () => {
    const profile = withDiceViewDraft(currentProfile);
    const saved = await saveProfile(profile, "Dice view settings were saved.");
    if (!saved) return;
    diceViewDirtyRef.current = false;
    if (profile.version === 4) {
      setDiceViewDraft(structuredClone(profile.diceView));
    }
  };

  const cancelDraft = () => {
    loadSelection(currentProfile, target);
    if (currentProfile.version === 4) {
      setDiceViewDraft(structuredClone(currentProfile.diceView));
    }
    diceViewDirtyRef.current = false;
  };

  const copyPersonalDesign = () => {
    const design = personalDesigns.find(({ id }) => id === personalDesignId);
    if (design === undefined) {
      setStatus("Choose a personal design to copy.");
      return;
    }
    try {
      const next = assertAppearanceRecipeSupportsTargetV3(
        design.recipe,
        target,
      );
      setRecipe(withAutomaticMaterialFormsV3(next));
      setSelectedStyleId("");
      setEditingDesignId(null);
      setDesignName(design.name);
      setAutomaticDesignName(false);
      setCustomizing(true);
      setStatus(
        `${design.name} was copied into this server draft. Save & apply to keep the detached copy.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const applySavedDesign = async (designId: string) => {
    const design = currentProfile.designs.find(({ id }) => id === designId);
    if (design === undefined) return;
    try {
      assertAppearanceRecipeSupportsTargetV3(design.recipe, target);
      const profile = applyAppearanceReferenceV3(
        currentProfile,
        target,
        { source: "custom", id: design.id },
        catalog,
      );
      const saved = await saveProfile(
        profile,
        `${design.name} now applies to ${APPEARANCE_TARGET_LABELS[target]}.`,
      );
      if (saved) loadSelection(profile, target);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const editDesign = (designId: string) => {
    const design = currentProfile.designs.find(({ id }) => id === designId);
    if (design === undefined) return;
    try {
      setRecipe(
        withAutomaticMaterialFormsV3(
          assertAppearanceRecipeSupportsTargetV3(design.recipe, target),
        ),
      );
      setEditingDesignId(design.id);
      setSelectedStyleId("");
      setDesignName(design.name);
      setAutomaticDesignName(false);
      setCustomizing(true);
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const deleteDesign = async (designId: string) => {
    const design = currentProfile.designs.find(({ id }) => id === designId);
    if (design === undefined) return;
    const profile = deleteAppearanceDesignV3(
      currentProfile,
      designId,
      catalog,
    );
    const saved = await saveProfile(profile, `${design.name} was deleted.`);
    if (saved && editingDesignId === designId) loadSelection(profile, target);
  };

  const clearTargetOverride = async () => {
    if (target === "all") return;
    const profile = clearAppearanceTargetOverrideV3(
      currentProfile,
      target,
      catalog,
    );
    const saved = await saveProfile(
      profile,
      `${APPEARANCE_TARGET_LABELS[target]} now inherits the All dice design.`,
    );
    if (saved) loadSelection(profile, target);
  };

  const activeReference = appearanceAssignmentForV3(currentProfile, target);
  const activeSelection = resolveAppearanceEditorSelectionV3(
    currentProfile,
    target,
    catalog,
  );
  const hasTargetOverride =
    target !== "all" &&
    currentProfile.assignments.overrides[target] !== undefined;

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <div className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div>
          <AppearanceTargetPickerV3
            value={target}
            disabled={isSaving}
            onChange={selectTarget}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <p>
              Current design: {activeSelection.name}
              {activeReference === null ? " (default)" : ""}
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

        {currentProfile.version === 4 && diceViewDraft !== null && (
          <DiceViewPreferencesV4
            value={diceViewDraft}
            disabled={isSaving}
            onChange={(next) => {
              setDiceViewDraft(next);
              setStatus(null);
            }}
            onPreviewTargetChange={setPreviewTarget}
          />
        )}

        {kind === "guild" && personalDesigns.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-semibold">Copy one of my designs</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block space-y-1.5 text-xs font-medium">
                <span className="block">Design</span>
                <AppearanceSelectV3
                  aria-label="Personal design to copy"
                  value={personalDesignId}
                  onChange={(event) => setPersonalDesignId(event.target.value)}
                  className="sm:h-10"
                >
                <option value="">Choose a personal design</option>
                {personalDesigns.map((design) => (
                  <option key={design.id} value={design.id}>
                    {design.name}
                  </option>
                ))}
                </AppearanceSelectV3>
              </label>
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

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <AppearancePresetGalleryV3
            catalog={catalog}
            selectedStyleId={selectedStyleId}
            disabled={isSaving || presetState === "applying" || customizing}
            onSelect={(styleId) => void selectStyle(styleId)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={isSaving || presetState === "applying" || customizing}
            onClick={() => {
              setPresetState("idle");
              setRecipe(withAutomaticMaterialFormsV3(recipe));
              setCustomizing(true);
              setStatus(null);
            }}
          >
            Customize
          </Button>
        </div>

        {customizing && (
          <AppearanceRecipeControlsV3
            recipe={recipe}
            catalog={catalog}
            target={target}
            onChange={setCustomRecipe}
          />
        )}

        {(customizing || diceViewDirty) && (
          <div className="sticky bottom-2 z-20 rounded-lg border border-brand/35 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              {customizing ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`${kind}-design-name-v3`}>Design name</Label>
                  <Input
                    id={`${kind}-design-name-v3`}
                    aria-label="Design name"
                    value={designName}
                    maxLength={catalog.bounds.maximumDesignNameCharacters}
                    onChange={(event) => {
                      setDesignName(event.target.value);
                      setAutomaticDesignName(false);
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Save the camera draft when it looks right.
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={isSaving}
                onClick={cancelDraft}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSaving}
                onClick={() =>
                  void (customizing ? saveCustomDesign() : saveDiceView())
                }
              >
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Save &amp; apply
              </Button>
            </div>
          </div>
        )}

        {presetState === "applying" ? (
          <SparkleLoadingIndicator
            label="Applying preset"
            className="w-fit"
          />
        ) : presetState === "applied" ? (
          <p role="status" className="text-brand">
            <Check
              data-completion-glyph="check"
              className="h-7 w-7"
              strokeWidth={3}
              aria-hidden="true"
            />
            <span className="sr-only">Preset applied</span>
          </p>
        ) : status !== null ? (
          <p role="status" className="text-sm font-medium text-brand">
            {status}
          </p>
        ) : null}
      </div>

      <aside className="space-y-4">
        <div className="xl:sticky xl:top-6 xl:z-10">
          <AppearancePreviewPaneV3
            target={previewTarget}
            recipe={recipe}
            {...(diceViewDraft === null ? {} : { diceView: diceViewDraft })}
          />
        </div>
        {currentProfile.designs.length > 0 && (
          <SavedAppearanceDesigns
            designs={currentProfile.designs}
            isSaving={isSaving}
            onApply={(designId) => void applySavedDesign(designId)}
            onEdit={editDesign}
            onDelete={(designId) => void deleteDesign(designId)}
          />
        )}
      </aside>
    </section>
  );
}
