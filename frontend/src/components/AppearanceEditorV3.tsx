import { DiceViewPreferencesV4 } from "@/components/DiceViewPreferencesV4";
import { AppearancePreviewPaneV3 } from "@/components/AppearancePreviewPaneV3";
import { AppearanceScopeBanner } from "@/components/AppearanceScopeBanner";
import { MixPickerColorsRow } from "@/components/MixPickerColorsRow";
import { MixPickerFineTune } from "@/components/MixPickerFineTune";
import { MixPickerMaterialsRow } from "@/components/MixPickerMaterialsRow";
import { MixPickerNumbersRow } from "@/components/MixPickerNumbersRow";
import { MixPickerStartFromRow } from "@/components/MixPickerStartFromRow";
import { MixPickerVarietyControl } from "@/components/MixPickerVarietyControl";
import { AppearanceSelectV3 } from "@/components/AppearanceSelectV3";
import { AppearanceTargetPickerV3 } from "@/components/AppearanceTargetPickerV3";
import { SavedAppearanceDesigns } from "@/components/SavedAppearanceDesigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppearanceApiError } from "@/lib/appearance-api-error";
import {
  applyAppearanceReferenceV3,
  assertAppearanceRecipeSupportsTargetV3,
  beginAppearanceRecipeEditV3,
  clearAppearanceTargetOverrideV3,
  clearAppearanceAllAssignmentV3,
  createEmptyAppearanceProfileV4,
  deleteAppearanceDesignV3,
  duplicateAppearanceDesignV3,
  nextAppearanceDesignNameV3,
  reconcileAppearanceColorEditV3,
  reconcileAppearanceMaterialEditV3,
  restoreAppearanceDesignV3,
  nextPresetEditNameV3,
  renameAppearanceDesignV3,
  resolveAppearanceEditorSelectionV3,
  updateAppearanceDesignV3,
  upsertAppearanceDesignV3,
  withAutomaticMaterialFormsV3,
  type AppearanceEditorTargetV3,
  type EditableAppearanceProfileV4,
} from "@/lib/appearance-editor-v3";
import {
  applyVariety,
  CHAOS_ASSIGNMENT_V3,
  type MixPickerVariety,
} from "@/lib/mix-picker-state";
import { useAppearanceThumbVersion } from "@/lib/use-appearance-thumbs-version";
import {
  APPEARANCE_TARGET_LABELS,
  type AppearanceCatalogV3,
  type AppearanceProfileResource,
} from "@/types/appearance";
import {
  APPEARANCE_TARGETS_V4,
  MAX_APPEARANCE_DESIGNS_V3,
  type AppearanceRecipeV3,
  type AppearanceTargetV4,
  type CustomAppearanceDesignV3,
} from "@dice-witch/dice-v4-model";
import { Save, Undo2 } from "lucide-react";
import * as React from "react";

type AppearanceEditorV3Props = {
  catalog: AppearanceCatalogV3;
  resource: AppearanceProfileResource<EditableAppearanceProfileV4>;
  kind: "personal" | "guild";
  personalDesigns: readonly CustomAppearanceDesignV3[];
  isSaving: boolean;
  settingsPanel?: React.ReactNode;
  onDirtyChange?(dirty: boolean): void;
  onSave(profile: EditableAppearanceProfileV4, revision: number): Promise<void>;
};

type AppearanceEditorTab = "design" | "camera" | "server";

type DeletionNotice = Readonly<{
  design: CustomAppearanceDesignV3;
  targets: readonly AppearanceEditorTargetV3[];
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

function designState(profile: EditableAppearanceProfileV4): unknown {
  return { designs: profile.designs, assignments: profile.assignments };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasDesignNameChanges(
  profile: EditableAppearanceProfileV4,
  nameDrafts: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(nameDrafts).some(([id, name]) =>
    profile.designs.some((design) => design.id === id && design.name !== name),
  );
}

function designTargets(
  profile: EditableAppearanceProfileV4,
  designId: string,
): AppearanceEditorTargetV3[] {
  const targets: AppearanceEditorTargetV3[] = [];
  if (
    profile.assignments.all?.source === "custom" &&
    profile.assignments.all.id === designId
  ) {
    targets.push("all");
  }
  for (const [target, reference] of Object.entries(
    profile.assignments.overrides,
  )) {
    if (reference?.source === "custom" && reference.id === designId) {
      targets.push(target as AppearanceTargetV4);
    }
  }
  return targets;
}

function targetLabels(
  targets: readonly AppearanceEditorTargetV3[],
): string[] {
  return targets.map((target) => APPEARANCE_TARGET_LABELS[target]);
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
  settingsPanel,
  onDirtyChange,
  onSave,
}: AppearanceEditorV3Props) {
  const resourceProfile = React.useMemo(
    () => resource.profile ?? createEmptyAppearanceProfileV4(kind),
    [kind, resource.profile],
  );
  const [baselineProfile, setBaselineProfile] =
    React.useState<EditableAppearanceProfileV4>(() =>
      structuredClone(resourceProfile),
    );
  const [baselineRevision, setBaselineRevision] = React.useState(resource.revision);
  const [draftProfile, setDraftProfile] =
    React.useState<EditableAppearanceProfileV4>(() =>
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
  const [explicitDesignIds, setExplicitDesignIds] = React.useState<
    readonly string[]
  >([]);
  const [personalDesignId, setPersonalDesignId] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<AppearanceEditorTab>("design");
  const [previewExpanded, setPreviewExpanded] = React.useState(true);
  const [fineTuneOpen, setFineTuneOpen] = React.useState(false);
  const [savedOpen, setSavedOpen] = React.useState(false);
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
    const localCameraChanged = !sameValue(draft.diceView, baseline.diceView);
    const remoteDesignChanged = !sameValue(
      designState(resourceProfile),
      designState(baseline),
    );
    const remoteCameraChanged = !sameValue(
      resourceProfile.diceView,
      baseline.diceView,
    );
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
    if (localCameraChanged) {
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
  const displayedDesigns = [
    ...draftProfile.designs.map((design) => ({
      ...design,
      name: nameDrafts[design.id] ?? design.name,
      pendingDeletion: false,
    })),
    ...deletionNotices.map(({ design }) => ({
      ...design,
      pendingDeletion: true,
    })),
  ];
  const hasNameChanges = hasDesignNameChanges(draftProfile, nameDrafts);
  const designDirty =
    !sameValue(designState(draftProfile), designState(baselineProfile)) ||
    hasNameChanges;
  const cameraDirty = !sameValue(
    draftProfile.diceView,
    baselineProfile.diceView,
  );
  const hasServerTab = settingsPanel !== undefined;
  const editorTabs: readonly AppearanceEditorTab[] = [
    "design",
    "camera",
    ...(hasServerTab ? (["server"] as const) : []),
  ];
  const unsavedDrafts = [
    ...(designDirty ? ["Design"] : []),
    ...(cameraDirty ? ["Camera"] : []),
  ];
  const hasUnsavedChanges = unsavedDrafts.length > 0;
  const hasTargetOverride =
    target !== "all" && draftProfile.assignments.overrides[target] !== undefined;
  const overrideTargets = Object.entries(draftProfile.assignments.overrides)
    .filter(([, reference]) => reference !== undefined)
    .map(([overrideTarget]) => overrideTarget as AppearanceTargetV4);
  const overriddenTargetSet = new Set(overrideTargets);
  const allAffectedTargets = APPEARANCE_TARGETS_V4.filter(
    (candidate) => !overriddenTargetSet.has(candidate),
  );
  const atDesignCap = draftProfile.designs.length >= MAX_APPEARANCE_DESIGNS_V3;
  // The ALL composite preview shows each die with its own design where one
  // exists; only the remaining dice take the ALL recipe.
  const previewOverrides =
    previewTarget === "all" && overrideTargets.length > 0
      ? Object.fromEntries(
          overrideTargets.map((overrideTarget) => [
            overrideTarget,
            resolveAppearanceEditorSelectionV3(
              draftProfile,
              overrideTarget,
              catalog,
            ).recipe,
          ]),
        )
      : undefined;
  const thumbVersion = useAppearanceThumbVersion();

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
      activeTab === "server" && !hasServerTab
    ) {
      setActiveTab("design");
    }
  }, [activeTab, hasServerTab]);

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

  // Mix picker edits flow through the same copy-on-write machinery as before;
  // material/color reconcilers keep curated-palette and randomization rules.
  const changeMixMaterials = (nextRecipe: AppearanceRecipeV3) =>
    setCustomRecipe(reconcileAppearanceMaterialEditV3(nextRecipe, catalog));
  const changeMixColors = (nextRecipe: AppearanceRecipeV3) =>
    setCustomRecipe(reconcileAppearanceColorEditV3(nextRecipe));
  const changeMixVariety = (
    variety: Exclude<MixPickerVariety, "chaos">,
  ) => setCustomRecipe(applyVariety(activeSelection.recipe, variety));
  const applyChaos = () => selectStyle(CHAOS_ASSIGNMENT_V3.id);

  const removeDraftMetadata = (designId: string) => {
    setExplicitDesignIds((ids) => ids.filter((id) => id !== designId));
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
    profile: EditableAppearanceProfileV4,
    previousDesignId: string | null,
  ): EditableAppearanceProfileV4 | null => {
    if (
      previousDesignId === null ||
      baselineProfile.designs.some(({ id }) => id === previousDesignId) ||
      explicitDesignIds.includes(previousDesignId) ||
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

  const createDesign = () => {
    try {
      const id = crypto.randomUUID();
      const basedOnStyle = activeSelection.designId === null;
      const name = nextAppearanceDesignNameV3(
        draftProfile.designs,
        activeSelection.name,
      );
      const recipe = beginAppearanceRecipeEditV3(
        activeSelection.recipe,
        activeSelection.recipe,
        basedOnStyle,
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
      setExplicitDesignIds((ids) => [...ids, id]);
      if (basedOnStyle) {
        setBasedOnStyles((styles) => ({
          ...styles,
          [id]: activeSelection.name,
        }));
      }
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const duplicateDesign = (designId: string) => {
    try {
      const duplicateId = crypto.randomUUID();
      setDraftProfile(
        duplicateAppearanceDesignV3(
          draftProfile,
          designId,
          duplicateId,
          catalog,
        ),
      );
      if (activeTab !== "design") activateTab("design", true);
      setEditingDesignId(duplicateId);
      setExplicitDesignIds((ids) => [...ids, duplicateId]);
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
    activateTab("design", true);
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
        ...notices.filter(({ design: staged }) => staged.id !== designId),
        { design, targets },
      ]);
      removeDraftMetadata(designId);
      if (editingDesignId === designId) setEditingDesignId(null);
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const restoreDesign = (designId: string) => {
    const notice = deletionNotices.find(
      ({ design }) => design.id === designId,
    );
    if (notice === undefined) return;
    try {
      setDraftProfile(
        restoreAppearanceDesignV3(
          draftProfile,
          notice.design,
          notice.targets,
          catalog,
        ),
      );
      setDeletionNotices((notices) =>
        notices.filter(({ design }) => design.id !== designId),
      );
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

  const handleEditOverride = (editTarget: AppearanceTargetV4) => {
    selectTarget(editTarget);
    const reference = draftProfile.assignments.overrides[editTarget];
    if (reference?.source === "custom") {
      setEditingDesignId(reference.id);
    }
  };

  // Discard removes only the assignment; a saved design stays listed, while
  // an unassigned unsaved draft is staged for deletion.
  const discardOverride = (discardTarget: AppearanceTargetV4) => {
    const reference = draftProfile.assignments.overrides[discardTarget];
    if (reference === undefined) return;
    const deletesDraft =
      reference.source === "custom" &&
      !designTargets(draftProfile, reference.id).some(
        (assignedTarget) => assignedTarget !== discardTarget,
      ) &&
      !baselineProfile.designs.some(({ id }) => id === reference.id);
    try {
      let next = clearAppearanceTargetOverrideV3(
        draftProfile,
        discardTarget,
        catalog,
      );
      if (deletesDraft && reference.source === "custom") {
        const design = draftProfile.designs.find(
          ({ id }) => id === reference.id,
        );
        if (design !== undefined) {
          next = deleteAppearanceDesignV3(next, design.id, catalog);
          setDeletionNotices((notices) => [
            ...notices.filter(({ design: staged }) => staged.id !== design.id),
            { design, targets: [] },
          ]);
          removeDraftMetadata(design.id);
        }
      }
      setDraftProfile(next);
      if (reference.source === "custom" && editingDesignId === reference.id) {
        setEditingDesignId(null);
      }
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const handleDiscardOverride = (discardTarget: AppearanceTargetV4) => {
    if (
      window.confirm(
        `Discard ${APPEARANCE_TARGET_LABELS[discardTarget]}'s design?`,
      )
    ) {
      discardOverride(discardTarget);
    }
  };

  const backToDefault = () => {
    if (!window.confirm("Reset to default dice mix?")) return;
    if (target !== "all") {
      discardOverride(target);
      return;
    }
    try {
      let next = clearAppearanceAllAssignmentV3(draftProfile, catalog);
      const reference = draftProfile.assignments.all;
      if (
        reference?.source === "custom" &&
        !designTargets(draftProfile, reference.id).some(
          (assignedTarget) => assignedTarget !== "all",
        ) &&
        !baselineProfile.designs.some(({ id }) => id === reference.id)
      ) {
        const design = draftProfile.designs.find(({ id }) => id === reference.id);
        if (design !== undefined) {
          next = deleteAppearanceDesignV3(next, design.id, catalog);
          removeDraftMetadata(design.id);
        }
      }
      setDraftProfile(next);
      setEditingDesignId(null);
      setStatus(null);
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const materializeNames = (): EditableAppearanceProfileV4 => {
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
    let profile: EditableAppearanceProfileV4;
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
      setExplicitDesignIds([]);
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
    setExplicitDesignIds([]);
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
    return [
      `Changes to ${displayedName} affect: ${targetList(targetLabels(targets))}.`,
    ];
  });

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <div className="order-1 rounded-xl border bg-card p-4 shadow-sm sm:p-6 xl:col-start-1 xl:row-start-1">
        <div className="mb-2 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving || (target !== "all" && !hasTargetOverride)}
            onClick={backToDefault}
          >
            <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to default
          </Button>
        </div>
        <AppearanceTargetPickerV3
          value={target}
          disabled={isSaving}
          onChange={selectTarget}
          overrideTargets={overrideTargets}
          onEditOverride={handleEditOverride}
          onDiscardOverride={handleDiscardOverride}
        />
        <div className="mt-3">
          <AppearanceScopeBanner
            target={target}
            hasOverride={hasTargetOverride}
            affectedTargets={allAffectedTargets}
            disabled={isSaving}
            sharedNotices={changedSharedDesigns}
            onReset={target === "all" ? undefined : clearTargetOverride}
          />
        </div>
      </div>

      <aside className="order-2 space-y-4 xl:sticky xl:top-6 xl:z-10 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-start">
        <Button
          type="button"
          variant="outline"
          className="w-full xl:hidden"
          aria-controls={`${kind}-appearance-preview`}
          aria-expanded={previewExpanded}
          onClick={() => setPreviewExpanded((expanded) => !expanded)}
        >
          {previewExpanded ? "Hide preview" : "Show preview"}
        </Button>
        <div
          id={`${kind}-appearance-preview`}
          className={previewExpanded ? "" : "hidden xl:block"}
        >
          <AppearancePreviewPaneV3
            target={previewTarget}
            recipe={previewRecipe}
            diceView={draftProfile.diceView}
            overrides={previewOverrides}
          />
        </div>
        {displayedDesigns.length > 0 && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full xl:hidden"
              aria-controls={`${kind}-saved-designs`}
              aria-expanded={savedOpen}
              onClick={() => setSavedOpen((open) => !open)}
            >
              {savedOpen ? "Hide saved designs" : "Saved designs"}
              <span className="sr-only">, {displayedDesigns.length} total</span>
            </Button>
            <div
              id={`${kind}-saved-designs`}
              className={savedOpen ? "" : "hidden xl:block"}
            >
              <SavedAppearanceDesigns
                designs={displayedDesigns}
                isSaving={isSaving}
                canDuplicate={!atDesignCap}
                onApply={applySavedDesign}
                onEdit={editDesign}
                onDuplicate={duplicateDesign}
                onDelete={deleteDesign}
                onRestore={restoreDesign}
              />
            </div>
          </>
        )}
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

          <MixPickerStartFromRow
            catalog={catalog}
            selectedStyleId={activeSelection.styleId}
            thumbVersion={thumbVersion}
            disabled={isSaving}
            onSelect={selectStyle}
          />

          {activeDesign === undefined ? (
            <div className="rounded-lg border bg-muted/20 p-4">
              <Button
                type="button"
                variant="outline"
                disabled={isSaving || atDesignCap}
                onClick={createDesign}
              >
                New design
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5 rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {basedOnStyles[activeDesign.id] !== undefined && (
                  <>
                    <span className="text-xs font-medium text-muted-foreground">
                      Based on {basedOnStyles[activeDesign.id]}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground"
                    >
                      ·
                    </span>
                  </>
                )}
                <Label htmlFor={`${kind}-design-name-v3`}>
                  Custom design name
                </Label>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving || atDesignCap}
                  onClick={() => duplicateDesign(activeDesign.id)}
                >
                  Duplicate
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <MixPickerMaterialsRow
              recipe={activeSelection.recipe}
              catalog={catalog}
              thumbVersion={thumbVersion}
              disabled={isSaving}
              onChange={changeMixMaterials}
            />
            <MixPickerColorsRow
              recipe={activeSelection.recipe}
              catalog={catalog}
              disabled={isSaving}
              onChange={changeMixColors}
            />
            <MixPickerNumbersRow
              recipe={activeSelection.recipe}
              catalog={catalog}
              thumbVersion={thumbVersion}
              disabled={isSaving}
              onChange={setCustomRecipe}
            />
            <MixPickerVarietyControl
              recipe={activeSelection.recipe}
              disabled={isSaving}
              onSelect={changeMixVariety}
              onChaos={applyChaos}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={() => setFineTuneOpen(true)}
              >
                Fine-tune →
              </Button>
            </div>
          </div>

          {deletionNotices.length > 0 && (
            <div
              role="status"
              aria-live="polite"
              className="space-y-1 rounded-lg border border-brand/35 bg-muted/20 p-4 text-sm"
            >
              {deletionNotices.map((notice) => (
                <p key={notice.design.id}>
                  {notice.targets.length === 0
                    ? `Deleting ${notice.design.name} is staged.`
                    : `Deleting ${notice.design.name} returns ${targetList(targetLabels(notice.targets))} to inheritance/default.`}
                </p>
              ))}
            </div>
          )}

        </div>

        <div
          id={`${kind}-camera-panel`}
          role="tabpanel"
          aria-labelledby={`${kind}-camera-tab`}
          hidden={activeTab !== "camera"}
        >
          <DiceViewPreferencesV4
            value={draftProfile.diceView}
            selectedTarget={previewTarget}
            disabled={isSaving}
            onChange={(diceView) => {
              setDraftProfile({ ...draftProfile, diceView });
              setStatus(null);
            }}
          />
        </div>

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

        <MixPickerFineTune
          recipe={activeSelection.recipe}
          catalog={catalog}
          open={fineTuneOpen && activeTab === "design"}
          disabled={isSaving}
          onClose={() => setFineTuneOpen(false)}
          onChange={setCustomRecipe}
        />
      </div>
    </section>
  );
}
