import { AppearancePresetGalleryV3 } from "@/components/AppearancePresetGalleryV3";
import { DiceViewPreferencesV4 } from "@/components/DiceViewPreferencesV4";
import { AppearancePreviewPaneV3 } from "@/components/AppearancePreviewPaneV3";
import { AppearanceRecipeControlsV3 } from "@/components/AppearanceRecipeControlsV3";
import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { AppearanceTargetPickerV3 } from "@/components/AppearanceTargetPickerV3";
import { SavedAppearanceDesigns } from "@/components/SavedAppearanceDesigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppearanceApiError } from "@/lib/appearance";
import {
  applyAppearanceReferenceV3,
  assertAppearanceRecipeSupportsTargetV3,
  beginAppearanceRecipeEditV3,
  clearAppearanceTargetOverrideV3,
  createEmptyAppearanceProfileV3,
  createEmptyAppearanceProfileV4,
  deleteAppearanceDesignV3,
  nextPresetEditNameV3,
  renameAppearanceDesignV3,
  resolveAppearanceEditorSelectionV3,
  updateAppearanceDesignV3,
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
  AppearanceTargetV4,
  CustomAppearanceDesignV3,
} from "@dice-witch/dice-v4-model";
import { Save } from "lucide-react";
import * as React from "react";

type AppearanceEditorV3Props = {
  catalog: AppearanceCatalogV3;
  resource: AppearanceProfileResource<EditableAppearanceProfileV3>;
  kind: "personal" | "guild";
  personalDesigns: readonly CustomAppearanceDesignV3[];
  isSaving: boolean;
  version?: 3 | 4;
  settingsPanel?: React.ReactNode;
  onDirtyChange?(dirty: boolean): void;
  onSave(profile: EditableAppearanceProfileV3, revision: number): Promise<void>;
};

type AppearanceEditorTab = "design" | "camera" | "server";

type DeletionNotice = Readonly<{
  id: string;
  name: string;
  targets: readonly string[];
}>;

const TAB_LABELS: Readonly<Record<AppearanceEditorTab, string>> = {
  design: "Design",
  camera: "Camera",
  server: "Server settings",
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

function designState(profile: EditableAppearanceProfileV3): unknown {
  return { designs: profile.designs, assignments: profile.assignments };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasDesignNameChanges(
  profile: EditableAppearanceProfileV3,
  nameDrafts: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(nameDrafts).some(([id, name]) =>
    profile.designs.some((design) => design.id === id && design.name !== name),
  );
}

function designTargets(
  profile: EditableAppearanceProfileV3,
  designId: string,
): string[] {
  if (
    profile.assignments.all?.source === "custom" &&
    profile.assignments.all.id === designId
  ) {
    return [APPEARANCE_TARGET_LABELS.all];
  }
  return Object.entries(profile.assignments.overrides)
    .filter(([, reference]) =>
      reference?.source === "custom" && reference.id === designId,
    )
    .map(([target]) => APPEARANCE_TARGET_LABELS[target as AppearanceTargetV4]);
}

function targetList(targets: readonly string[]): string {
  if (targets.length === 0) return "no currently assigned targets";
  if (targets.length === 1) return targets[0] ?? "";
  return `${targets.slice(0, -1).join(", ")} and ${targets.at(-1)}`;
}

export function AppearanceEditorV3({
  catalog,
  resource,
  kind,
  personalDesigns,
  isSaving,
  version = 3,
  settingsPanel,
  onDirtyChange,
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
  const [baselineProfile, setBaselineProfile] =
    React.useState<EditableAppearanceProfileV3>(() =>
      structuredClone(resourceProfile),
    );
  const [baselineRevision, setBaselineRevision] = React.useState(resource.revision);
  const [draftProfile, setDraftProfile] =
    React.useState<EditableAppearanceProfileV3>(() =>
      structuredClone(resourceProfile),
    );
  const [target, setTarget] = React.useState<AppearanceEditorTargetV3>("all");
  const [previewTarget, setPreviewTarget] =
    React.useState<AppearanceEditorTargetV3>("all");
  const [editingDesignId, setEditingDesignId] =
    React.useState<string | null>(null);
  const [nameDrafts, setNameDrafts] = React.useState<Record<string, string>>({});
  const [basedOnStyles, setBasedOnStyles] = React.useState<
    Record<string, string>
  >({});
  const [deletionNotices, setDeletionNotices] = React.useState<DeletionNotice[]>(
    [],
  );
  const [personalDesignId, setPersonalDesignId] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<AppearanceEditorTab>("design");
  const [previewExpanded, setPreviewExpanded] = React.useState(true);
  const tabRefs = React.useRef<
    Partial<Record<AppearanceEditorTab, HTMLButtonElement | null>>
  >({});
  const baselineProfileRef = React.useRef(baselineProfile);
  const draftProfileRef = React.useRef(draftProfile);
  const nameDraftsRef = React.useRef(nameDrafts);
  baselineProfileRef.current = baselineProfile;
  draftProfileRef.current = draftProfile;
  nameDraftsRef.current = nameDrafts;

  React.useEffect(() => {
    const baseline = baselineProfileRef.current;
    const draft = draftProfileRef.current;
    const localDesignChanged =
      !sameValue(designState(draft), designState(baseline)) ||
      hasDesignNameChanges(draft, nameDraftsRef.current);
    const localCameraChanged =
      draft.version === 4 &&
      baseline.version === 4 &&
      !sameValue(draft.diceView, baseline.diceView);
    const remoteDesignChanged = !sameValue(
      designState(resourceProfile),
      designState(baseline),
    );
    const remoteCameraChanged =
      resourceProfile.version === 4 &&
      baseline.version === 4 &&
      !sameValue(resourceProfile.diceView, baseline.diceView);
    if (
      (localDesignChanged && remoteDesignChanged) ||
      (localCameraChanged && remoteCameraChanged)
    ) {
      setStatus(
        "This appearance changed elsewhere. Cancel to load the newer settings before saving again.",
      );
      return;
    }

    const next = structuredClone(resourceProfile);
    if (localDesignChanged) {
      next.designs = structuredClone(draft.designs);
      next.assignments = structuredClone(draft.assignments);
    }
    if (localCameraChanged && next.version === 4 && draft.version === 4) {
      next.diceView = structuredClone(draft.diceView);
    }
    setDraftProfile(next);
    setBaselineProfile(structuredClone(resourceProfile));
    setBaselineRevision(resource.revision);
  }, [resource.revision, resourceProfile]);

  React.useEffect(() => {
    if (
      personalDesignId !== "" &&
      !personalDesigns.some(({ id }) => id === personalDesignId)
    ) {
      setPersonalDesignId("");
    }
  }, [personalDesignId, personalDesigns]);

  const assignedSelection = resolveAppearanceEditorSelectionV3(
    draftProfile,
    target,
    catalog,
  );
  const editingDesign = editingDesignId === null
    ? undefined
    : draftProfile.designs.find(({ id }) => id === editingDesignId);
  const activeSelection = editingDesign === undefined
    ? assignedSelection
    : {
        recipe: editingDesign.recipe,
        styleId: "",
        designId: editingDesign.id,
        name: editingDesign.name,
      };
  const previewSelection = resolveAppearanceEditorSelectionV3(
    draftProfile,
    previewTarget,
    catalog,
  );
  const previewRecipe =
    editingDesign !== undefined && previewTarget === target
      ? editingDesign.recipe
      : previewSelection.recipe;
  const activeDesign = activeSelection.designId === null
    ? undefined
    : draftProfile.designs.find(({ id }) => id === activeSelection.designId);
  const activeDesignName = activeDesign === undefined
    ? ""
    : nameDrafts[activeDesign.id] ?? activeDesign.name;
  const displayedDesigns = draftProfile.designs.map((design) => ({
    ...design,
    name: nameDrafts[design.id] ?? design.name,
  }));
  const hasNameChanges = hasDesignNameChanges(draftProfile, nameDrafts);
  const designDirty =
    !sameValue(designState(draftProfile), designState(baselineProfile)) ||
    hasNameChanges;
  const cameraDirty =
    draftProfile.version === 4 &&
    baselineProfile.version === 4 &&
    !sameValue(draftProfile.diceView, baselineProfile.diceView);
  const hasCameraTab = draftProfile.version === 4;
  const hasServerTab = settingsPanel !== undefined;
  const editorTabs: readonly AppearanceEditorTab[] = [
    "design",
    ...(hasCameraTab ? (["camera"] as const) : []),
    ...(hasServerTab ? (["server"] as const) : []),
  ];
  const unsavedDrafts = [
    ...(designDirty ? ["Design"] : []),
    ...(cameraDirty ? ["Camera"] : []),
  ];
  const hasUnsavedChanges = unsavedDrafts.length > 0;
  const hasTargetOverride =
    target !== "all" && draftProfile.assignments.overrides[target] !== undefined;

  React.useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  React.useEffect(() => {
    if (!hasUnsavedChanges) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [hasUnsavedChanges]);

  React.useEffect(() => {
    if (
      (activeTab === "camera" && !hasCameraTab) ||
      (activeTab === "server" && !hasServerTab)
    ) {
      setActiveTab("design");
    }
  }, [activeTab, hasCameraTab, hasServerTab]);

  const activateTab = (tab: AppearanceEditorTab, focus = false) => {
    setActiveTab(tab);
    if (focus) tabRefs.current[tab]?.focus();
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tab: AppearanceEditorTab,
  ) => {
    const index = editorTabs.indexOf(tab);
    let nextIndex: number | undefined;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + editorTabs.length) % editorTabs.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % editorTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = editorTabs.length - 1;
    }
    const nextTab = nextIndex === undefined ? undefined : editorTabs[nextIndex];
    if (nextTab === undefined) return;
    event.preventDefault();
    activateTab(nextTab, true);
  };

  const selectTarget = (nextTarget: AppearanceEditorTargetV3) => {
    setTarget(nextTarget);
    setPreviewTarget(nextTarget);
    setEditingDesignId(null);
    setStatus(null);
  };

  const removeDraftMetadata = (designId: string) => {
    setNameDrafts((drafts) => {
      const updated = { ...drafts };
      delete updated[designId];
      return updated;
    });
    setBasedOnStyles((styles) => {
      const updated = { ...styles };
      delete updated[designId];
      return updated;
    });
  };

  const removeReplacedDraftDesign = (
    profile: EditableAppearanceProfileV3,
    previousDesignId: string | null,
  ): EditableAppearanceProfileV3 | null => {
    if (
      previousDesignId === null ||
      baselineProfile.designs.some(({ id }) => id === previousDesignId) ||
      designTargets(profile, previousDesignId).length > 0
    ) {
      return profile;
    }
    const design = draftProfile.designs.find(({ id }) => id === previousDesignId);
    const designName = design === undefined
      ? null
      : nameDrafts[design.id] ?? design.name;
    if (
      designName !== null &&
      !window.confirm(`Discard the unsaved custom design ${designName}?`)
    ) {
      return null;
    }
    removeDraftMetadata(previousDesignId);
    return deleteAppearanceDesignV3(profile, previousDesignId, catalog);
  };

  const selectStyle = (styleId: string) => {
    try {
      const next = removeReplacedDraftDesign(
        applyAppearanceReferenceV3(
          draftProfile,
          target,
          { source: "builtin", id: styleId },
          catalog,
        ),
        activeSelection.designId,
      );
      if (next === null) return;
      setDraftProfile(next);
      setEditingDesignId(null);
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const setCustomRecipe = (nextRecipe: AppearanceRecipeV3) => {
    if (sameValue(activeSelection.recipe, nextRecipe)) return;
    try {
      if (activeDesign === undefined) {
        const id = crypto.randomUUID();
        const name = nextPresetEditNameV3(draftProfile.designs);
        const recipe = beginAppearanceRecipeEditV3(
          activeSelection.recipe,
          nextRecipe,
          true,
        );
        setDraftProfile(
          upsertAppearanceDesignV3(
            draftProfile,
            target,
            { id, name, recipe },
            catalog,
          ),
        );
        setEditingDesignId(id);
        setBasedOnStyles((styles) => ({
          ...styles,
          [id]: activeSelection.name,
        }));
      } else {
        setDraftProfile(
          updateAppearanceDesignV3(
            draftProfile,
            {
              id: activeDesign.id,
              name: activeDesign.name,
              recipe: beginAppearanceRecipeEditV3(
                activeSelection.recipe,
                nextRecipe,
                false,
              ),
            },
            catalog,
          ),
        );
      }
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const copyPersonalDesign = () => {
    const design = personalDesigns.find(({ id }) => id === personalDesignId);
    if (design === undefined) {
      setStatus("Choose a personal design to copy.");
      return;
    }
    try {
      const recipe = withAutomaticMaterialFormsV3(
        assertAppearanceRecipeSupportsTargetV3(design.recipe, target),
      );
      const id = crypto.randomUUID();
      const next = removeReplacedDraftDesign(
        upsertAppearanceDesignV3(
          draftProfile,
          target,
          { id, name: design.name, recipe },
          catalog,
        ),
        activeSelection.designId,
      );
      if (next === null) return;
      setDraftProfile(next);
      setEditingDesignId(id);
      setStatus(
        `${design.name} was copied into this server draft. Save & apply to keep the detached copy.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const applySavedDesign = (designId: string) => {
    const design = draftProfile.designs.find(({ id }) => id === designId);
    if (design === undefined) return;
    try {
      assertAppearanceRecipeSupportsTargetV3(design.recipe, target);
      const next = removeReplacedDraftDesign(
        applyAppearanceReferenceV3(
          draftProfile,
          target,
          { source: "custom", id: design.id },
          catalog,
        ),
        activeSelection.designId,
      );
      if (next === null) return;
      setDraftProfile(next);
      setEditingDesignId(null);
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const editDesign = (designId: string) => {
    if (!draftProfile.designs.some(({ id }) => id === designId)) return;
    setEditingDesignId(designId);
    setStatus(null);
  };

  const deleteDesign = (designId: string) => {
    const design = draftProfile.designs.find(({ id }) => id === designId);
    if (design === undefined) return;
    const targets = designTargets(draftProfile, designId);
    try {
      setDraftProfile(deleteAppearanceDesignV3(draftProfile, designId, catalog));
      setDeletionNotices((notices) => [
        ...notices.filter(({ id }) => id !== designId),
        { id: designId, name: design.name, targets },
      ]);
      removeDraftMetadata(designId);
      if (editingDesignId === designId) setEditingDesignId(null);
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const clearTargetOverride = () => {
    if (target === "all") return;
    try {
      setDraftProfile(
        clearAppearanceTargetOverrideV3(draftProfile, target, catalog),
      );
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const materializeNames = (): EditableAppearanceProfileV3 => {
    let profile = draftProfile;
    for (const [id, name] of Object.entries(nameDrafts)) {
      if (
        profile.designs.some(
          (design) => design.id === id && design.name !== name,
        )
      ) {
        profile = renameAppearanceDesignV3(profile, id, name.trim(), catalog);
      }
    }
    return profile;
  };

  const saveDraft = async () => {
    setStatus(null);
    let profile: EditableAppearanceProfileV3;
    try {
      profile = materializeNames();
    } catch (error) {
      setStatus(errorMessage(error));
      return;
    }
    try {
      await onSave(profile, baselineRevision);
      setBaselineProfile(structuredClone(profile));
      setDraftProfile(structuredClone(profile));
      setEditingDesignId(null);
      setNameDrafts({});
      setBasedOnStyles({});
      setDeletionNotices([]);
      setStatus("Appearance changes were saved and applied.");
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const cancelDraft = () => {
    const latestProfile =
      resource.revision === baselineRevision ? baselineProfile : resourceProfile;
    setBaselineProfile(structuredClone(latestProfile));
    setBaselineRevision(resource.revision);
    setDraftProfile(structuredClone(latestProfile));
    setEditingDesignId(null);
    setNameDrafts({});
    setBasedOnStyles({});
    setDeletionNotices([]);
    setStatus(null);
  };

  const changedSharedDesigns = draftProfile.designs.flatMap((design) => {
    const baseline = baselineProfile.designs.find(({ id }) => id === design.id);
    const displayedName = nameDrafts[design.id] ?? design.name;
    if (
      baseline === undefined ||
      (sameValue(baseline.recipe, design.recipe) && baseline.name === displayedName)
    ) {
      return [];
    }
    const targets = designTargets(draftProfile, design.id);
    return [`Changes to ${displayedName} affect: ${targetList(targets)}.`];
  });

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <div className="order-1 rounded-xl border bg-card p-4 shadow-sm sm:p-6 xl:col-start-1 xl:row-start-1">
        <AppearanceTargetPickerV3
          value={target}
          disabled={isSaving}
          onChange={selectTarget}
        />
        {hasTargetOverride && (
          <button
            type="button"
            disabled={isSaving}
            onClick={clearTargetOverride}
            className="mt-2 text-xs font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-50"
          >
            Use ALL design
          </button>
        )}
      </div>

      <aside className="order-2 xl:col-start-2 xl:row-span-2 xl:row-start-1">
        <Button
          type="button"
          variant="outline"
          className="mb-3 w-full xl:hidden"
          aria-controls={`${kind}-appearance-preview`}
          aria-expanded={previewExpanded}
          onClick={() => setPreviewExpanded((expanded) => !expanded)}
        >
          {previewExpanded ? "Hide preview" : "Show preview"}
        </Button>
        <div
          id={`${kind}-appearance-preview`}
          className={`${previewExpanded ? "" : "hidden xl:block"} xl:sticky xl:top-6 xl:z-10`}
        >
          <AppearancePreviewPaneV3
            target={previewTarget}
            recipe={previewRecipe}
            mode={activeTab === "camera" ? "camera" : "design"}
            {...(draftProfile.version === 4
              ? { diceView: draftProfile.diceView }
              : {})}
          />
        </div>
      </aside>

      <div className="order-3 space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6 xl:col-start-1 xl:row-start-2">
        <div
          role="tablist"
          aria-label="Appearance editor"
          className="flex gap-1 overflow-x-auto border-b"
        >
          {editorTabs.map((tab) => {
            const dirty =
              (tab === "design" && designDirty) ||
              (tab === "camera" && cameraDirty);
            return (
              <button
                key={tab}
                ref={(element) => {
                  tabRefs.current[tab] = element;
                }}
                id={`${kind}-${tab}-tab`}
                type="button"
                role="tab"
                aria-controls={`${kind}-${tab}-panel`}
                aria-selected={activeTab === tab}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => activateTab(tab)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
                className={`min-h-11 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  activeTab === tab
                    ? "border-brand text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABELS[tab]}
                {dirty && (
                  <>
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-block h-2 w-2 rounded-full bg-brand"
                    />
                    <span className="sr-only">, unsaved changes</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div
          id={`${kind}-design-panel`}
          role="tabpanel"
          aria-labelledby={`${kind}-design-tab`}
          hidden={activeTab !== "design"}
          className="space-y-6"
        >
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

          <AppearancePresetGalleryV3
            catalog={catalog}
            selectedStyleId={activeSelection.styleId}
            disabled={isSaving}
            onSelect={selectStyle}
          />

          {activeDesign !== undefined && (
            <div className="space-y-1.5 rounded-lg border bg-muted/20 p-4">
              {basedOnStyles[activeDesign.id] !== undefined && (
                <p className="text-xs font-medium text-muted-foreground">
                  Based on {basedOnStyles[activeDesign.id]}
                </p>
              )}
              <Label htmlFor={`${kind}-design-name-v3`}>
                Custom design name
              </Label>
              <Input
                id={`${kind}-design-name-v3`}
                aria-label="Custom design name"
                value={activeDesignName}
                maxLength={catalog.bounds.maximumDesignNameCharacters}
                onChange={(event) => {
                  setNameDrafts((drafts) => ({
                    ...drafts,
                    [activeDesign.id]: event.target.value,
                  }));
                  setStatus(null);
                }}
              />
            </div>
          )}

          <AppearanceRecipeControlsV3
            recipe={activeSelection.recipe}
            catalog={catalog}
            target={target}
            onChange={setCustomRecipe}
          />

          {(changedSharedDesigns.length > 0 || deletionNotices.length > 0) && (
            <div
              role="status"
              aria-live="polite"
              className="space-y-1 rounded-lg border border-brand/35 bg-muted/20 p-4 text-sm"
            >
              {changedSharedDesigns.map((message) => (
                <p key={message}>{message}</p>
              ))}
              {deletionNotices.map((notice) => (
                <p key={notice.id}>
                  {notice.targets.length === 0
                    ? `Deleting ${notice.name} is staged.`
                    : `Deleting ${notice.name} returns ${targetList(notice.targets)} to inheritance/default.`}
                </p>
              ))}
            </div>
          )}

          {displayedDesigns.length > 0 && (
            <SavedAppearanceDesigns
              designs={displayedDesigns}
              isSaving={isSaving}
              onApply={applySavedDesign}
              onEdit={editDesign}
              onDelete={deleteDesign}
            />
          )}
        </div>

        {draftProfile.version === 4 && (
          <div
            id={`${kind}-camera-panel`}
            role="tabpanel"
            aria-labelledby={`${kind}-camera-tab`}
            hidden={activeTab !== "camera"}
          >
            <DiceViewPreferencesV4
              value={draftProfile.diceView}
              disabled={isSaving}
              onChange={(diceView) => {
                setDraftProfile({ ...draftProfile, diceView });
                setStatus(null);
              }}
              onPreviewTargetChange={setPreviewTarget}
            />
          </div>
        )}

        {hasServerTab && (
          <div
            id={`${kind}-server-panel`}
            role="tabpanel"
            aria-labelledby={`${kind}-server-tab`}
            hidden={activeTab !== "server"}
            className="space-y-6"
          >
            {activeTab === "server" ? settingsPanel : null}
          </div>
        )}

        {hasUnsavedChanges && (
          <div className="sticky bottom-2 z-20 rounded-lg border border-brand/35 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
            <div className="grid grid-cols-2 items-center gap-3 sm:grid-cols-[1fr_auto_auto]">
              <p
                className="col-span-2 text-sm font-medium text-foreground sm:col-span-1"
                aria-live="polite"
              >
                Unsaved changes: {unsavedDrafts.join(" and ")}.
              </p>
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
                onClick={() => void saveDraft()}
              >
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Save &amp; apply
              </Button>
            </div>
          </div>
        )}

        {status !== null && (
          <p role="status" className="text-sm font-medium text-brand">
            {status}
          </p>
        )}
      </div>
    </section>
  );
}
