import {
  APPEARANCE_TARGETS_V4,
  FANTASY_ESSENCE_PALETTES_R33_V4,
  MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3,
  MAX_APPEARANCE_DESIGNS_V3,
  MAX_MATERIAL_SELECTION_OPTIONS_V3,
  createDefaultDiceViewPreferencesV4,
  isPolyhedralFormImplementedForTargetV4,
  type AppearanceDesignReferenceV3,
  type AppearanceMaterialV4,
  type AppearanceProfileV4,
  type AppearanceRecipeV3,
  type AppearanceSelection,
  type AppearanceTargetV4,
  type CustomAppearanceDesignV3,
  type GuildAppearanceProfileV4,
  type MaterialFamilyV4,
  type PolyhedralFormV4,
} from "@dice-witch/dice-v4-model";
import type { AppearanceCatalogV3 } from "../types/appearance";

export type AppearanceEditorTargetV3 = AppearanceTargetV4 | "all";
export type EditableAppearanceProfileV4 =
  | AppearanceProfileV4
  | GuildAppearanceProfileV4;

export type AppearanceEditorSelectionV3 = Readonly<{
  recipe: AppearanceRecipeV3;
  styleId: string;
  designId: string | null;
  name: string;
}>;

type AppearanceDesignDraftV3 = Readonly<{
  id: string;
  name: string;
  recipe: AppearanceRecipeV3;
}>;

type NamedAppearanceDesignV3 = Readonly<{ name: string }>;

export function nextPresetEditNameV3(
  designs: readonly NamedAppearanceDesignV3[],
): string {
  const names = new Set(designs.map(({ name }) => name));
  for (let edit = 1; edit <= designs.length + 1; edit += 1) {
    const candidate = `Edit ${String(edit)}`;
    if (!names.has(candidate)) return candidate;
  }
  throw new Error("Appearance edit name could not be allocated");
}

function copySuffixV3(copy: number): string {
  if (copy === 0) return "";
  return copy === 1 ? " copy" : ` copy ${String(copy)}`;
}

export function nextAppearanceDesignNameV3(
  designs: readonly NamedAppearanceDesignV3[],
  base: string,
): string {
  const trimmedBase = base.trim();
  if (trimmedBase.length === 0) {
    throw new Error("Appearance design name base is empty");
  }
  const names = new Set(designs.map(({ name }) => name));
  for (let copy = 0; copy <= designs.length + 1; copy += 1) {
    const suffix = copySuffixV3(copy);
    const candidate = `${trimmedBase
      .slice(0, MAX_APPEARANCE_DESIGN_NAME_CHARACTERS_V3 - suffix.length)
      .trimEnd()}${suffix}`;
    if (!names.has(candidate)) return candidate;
  }
  throw new Error("Appearance design name could not be allocated");
}

function hslChannelV3(
  hue: number,
  saturation: number,
  lightness: number,
  offset: number,
): number {
  const k = (offset + hue / 30) % 12;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel =
    lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  return Math.round(channel * 255);
}

function vividHexColorV3(
  hue: number,
  saturation: number,
  lightness: number,
): string {
  return `#${[
    hslChannelV3(hue, saturation, lightness, 0),
    hslChannelV3(hue, saturation, lightness, 8),
    hslChannelV3(hue, saturation, lightness, 4),
  ]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function createVividAppearancePaletteV3(
  colorCount: number,
  providedRandomValues?: Uint32Array,
): string[] {
  if (!Number.isSafeInteger(colorCount) || colorCount < 2 || colorCount > 6) {
    throw new Error("Vivid palette must contain from two through six colors");
  }
  const randomValues =
    providedRandomValues ??
    crypto.getRandomValues(new Uint32Array(colorCount + 1));
  if (randomValues.length < colorCount + 1) {
    throw new Error("Vivid palette random values are incomplete");
  }
  const first = randomValues[0];
  if (first === undefined) {
    throw new Error("Vivid palette random values are incomplete");
  }
  const baseHue = first % 360;
  return Array.from({ length: colorCount }, (_, index) => {
    const value = randomValues[index + 1];
    if (value === undefined) {
      throw new Error("Vivid palette random values are incomplete");
    }
    const jitter = (value % 17) - 8;
    const hue = (baseHue + (index * 360) / colorCount + jitter + 360) % 360;
    const saturation = (76 + ((value >>> 8) % 20)) / 100;
    const lightness = (44 + ((value >>> 16) % 17)) / 100;
    return vividHexColorV3(hue, saturation, lightness);
  });
}

function cloneProfile<T extends EditableAppearanceProfileV4>(profile: T): T {
  return structuredClone(profile);
}

function cloneRecipe(recipe: AppearanceRecipeV3): AppearanceRecipeV3 {
  return structuredClone(recipe);
}

export function createDefaultAppearanceMaterialV3(
  family: MaterialFamilyV4,
  catalog: AppearanceCatalogV3,
): AppearanceMaterialV4 {
  const metadata = catalog.materials.find(
    (candidate) => candidate.family === family,
  );
  if (metadata === undefined) {
    throw new Error(`Appearance material catalog is missing: ${family}`);
  }
  const material = structuredClone(metadata.defaultValue);
  if (material.family !== family) {
    throw new Error(`Appearance material default is invalid: ${family}`);
  }
  return material;
}

function sameSelection<Value>(
  left: AppearanceSelection<Value>,
  right: AppearanceSelection<Value>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function selectionValuesV3<Value>(
  selection: AppearanceSelection<Value>,
): readonly Value[] {
  switch (selection.mode) {
    case "fixed":
      return [selection.value];
    case "allowlist":
      return selection.values;
    case "weighted":
      return selection.options.map(({ value }) => value);
  }
}

function appearancePrimaryColorV3(
  recipe: AppearanceRecipeV3,
  defaultColor: string,
): string {
  const colors = recipe.colors;
  if (
    colors.mode === "solid" ||
    colors.mode === "tonal" ||
    colors.mode === "random"
  ) {
    return colors.primary;
  }
  return colors.mode === "palette"
    ? colors.colors[0] ?? defaultColor
    : defaultColor;
}

function usesFixedClassicSolidV3(recipe: AppearanceRecipeV3): boolean {
  return (
    recipe.material.mode === "fixed" &&
    recipe.material.value.family === "classic" &&
    recipe.material.value.treatment === "solid"
  );
}

export function reconcileAppearanceColorEditV3(
  recipe: AppearanceRecipeV3,
): AppearanceRecipeV3 {
  const edited = cloneRecipe(recipe);
  if (
    edited.colors.mode === "solid" ||
    edited.randomization === "one-palette-color-v1" ||
    !usesFixedClassicSolidV3(edited)
  ) {
    return edited;
  }
  const material = edited.material;
  if (material.mode !== "fixed" || material.value.family !== "classic") {
    throw new Error("Fixed Classic Solid appearance is invalid");
  }
  return {
    ...edited,
    material: {
      mode: "fixed",
      value: { ...material.value, treatment: "gradient" },
    },
  };
}

function curatedMaterialColorsV3(
  recipe: AppearanceRecipeV3,
  catalog: AppearanceCatalogV3,
): AppearanceRecipeV3["colors"] | null {
  if (recipe.material.mode !== "fixed") return null;
  const material = recipe.material.value;
  if (material.family === "fantasy") {
    return {
      mode: "palette",
      colors: [...FANTASY_ESSENCE_PALETTES_R33_V4[material.essence]],
    };
  }
  if (material.family !== "elemental" && material.family !== "paint") {
    return null;
  }
  const styleId = `${material.family}-${material.style}`;
  const style = catalog.styles.find(({ id }) => id === styleId);
  if (style?.recipe.colors.mode !== "palette") {
    throw new Error(`Curated material palette is missing: ${styleId}`);
  }
  return structuredClone(style.recipe.colors);
}

export function reconcileAppearanceMaterialEditV3(
  recipe: AppearanceRecipeV3,
  catalog: AppearanceCatalogV3,
): AppearanceRecipeV3 {
  const edited = cloneRecipe(recipe);
  const curatedColors = curatedMaterialColorsV3(edited, catalog);
  if (curatedColors !== null) return { ...edited, colors: curatedColors };
  if (
    !usesFixedClassicSolidV3(edited) ||
    edited.colors.mode === "solid" ||
    edited.randomization === "one-palette-color-v1"
  ) {
    return edited;
  }
  return {
    ...edited,
    colors: {
      mode: "solid",
      primary: appearancePrimaryColorV3(
        edited,
        catalog.editorDefaults.primaryColor,
      ),
    },
  };
}

export function createEmptyAppearanceProfileV4(
  kind: "personal",
): AppearanceProfileV4;
export function createEmptyAppearanceProfileV4(
  kind: "guild",
): GuildAppearanceProfileV4;
export function createEmptyAppearanceProfileV4(
  kind: "personal" | "guild",
): AppearanceProfileV4 | GuildAppearanceProfileV4 {
  const profile: AppearanceProfileV4 = {
    version: 4,
    designs: [],
    assignments: { all: null, overrides: {} },
    diceView: createDefaultDiceViewPreferencesV4(),
  };
  return kind === "guild" ? { ...profile, mode: "default" } : profile;
}

export function appearanceAssignmentForV3(
  profile: Pick<AppearanceProfileV4, "assignments">,
  target: AppearanceEditorTargetV3,
): AppearanceDesignReferenceV3 | null {
  return target === "all"
    ? profile.assignments.all
    : profile.assignments.overrides[target] ?? profile.assignments.all;
}

function builtinStyle(
  catalog: AppearanceCatalogV3,
  id: string,
): AppearanceCatalogV3["styles"][number] {
  const style = catalog.styles.find((candidate) => candidate.id === id);
  if (style === undefined) {
    throw new Error(`Appearance built-in style is missing: ${id}`);
  }
  return style;
}

export function resolveAppearanceEditorSelectionV3(
  profile: EditableAppearanceProfileV4,
  target: AppearanceEditorTargetV3,
  catalog: AppearanceCatalogV3,
): AppearanceEditorSelectionV3 {
  const reference = appearanceAssignmentForV3(profile, target);
  if (reference === null || reference.source === "builtin") {
    const style = builtinStyle(catalog, reference?.id ?? catalog.defaultStyleId);
    const recipe =
      target === "all"
        ? style.recipe
        : style.overrides?.[target] ?? style.recipe;
    return {
      recipe: cloneRecipe(recipe),
      styleId: style.id,
      designId: null,
      name: style.name,
    };
  }
  const design = profile.designs.find(({ id }) => id === reference.id);
  if (design === undefined) {
    throw new Error(`Appearance custom design is missing: ${reference.id}`);
  }
  return {
    recipe: cloneRecipe(design.recipe),
    styleId: "",
    designId: design.id,
    name: design.name,
  };
}

export function withAutomaticMaterialFormsV3(
  recipe: AppearanceRecipeV3,
): AppearanceRecipeV3 {
  const edited = cloneRecipe(recipe);
  return {
    ...edited,
    form: { ...edited.form, policy: "material-default-v1" },
  };
}

export function beginAppearanceRecipeEditV3(
  current: AppearanceRecipeV3,
  next: AppearanceRecipeV3,
  editingBuiltin: boolean,
): AppearanceRecipeV3 {
  const edited = withAutomaticMaterialFormsV3(next);
  if (!editingBuiltin) return edited;
  const strength = sameSelection(
    current.lighting.strength,
    edited.lighting.strength,
  )
    ? { mode: "fixed" as const, value: "gentle" as const }
    : edited.lighting.strength;
  const editable = structuredClone(edited);
  const preservesFullSpectrum =
    (editable.randomization === "full-spectrum-v1" ||
      editable.randomization === "full-spectrum-v2") &&
    sameSelection(current.colors, edited.colors);
  if (
    editable.randomization !== "one-palette-color-v1" &&
    !preservesFullSpectrum
  ) {
    delete editable.randomization;
  }
  return {
    ...editable,
    variation: "fixed",
    lighting: { ...editable.lighting, strength },
  };
}

export function assertAppearanceRecipeSupportsTargetV3(
  recipe: AppearanceRecipeV3,
  target: AppearanceEditorTargetV3,
): AppearanceRecipeV3 {
  const parsed = cloneRecipe(recipe);
  if (
    selectionValuesV3(parsed.material).length >
    MAX_MATERIAL_SELECTION_OPTIONS_V3
  ) {
    throw new Error("Appearance recipe material selection is invalid");
  }
  if (target === "other" || parsed.form.policy !== undefined) return parsed;
  const targets = target === "all"
    ? APPEARANCE_TARGETS_V4.filter(
        (candidate): candidate is Exclude<AppearanceTargetV4, "other"> =>
          candidate !== "other",
      )
    : [target];
  for (const form of selectionValuesV3(parsed.form.polyhedral)) {
    for (const candidate of targets) {
      if (
        !isPolyhedralFormImplementedForTargetV4(
          candidate,
          form,
          "canvaskit-v4-r32",
        )
      ) {
        throw new Error(
          `Appearance form ${form} is not implemented for ${candidate}`,
        );
      }
    }
  }
  return parsed;
}

export function applyAppearanceReferenceV3<
  Profile extends EditableAppearanceProfileV4,
>(
  profile: Profile,
  target: AppearanceEditorTargetV3,
  reference: AppearanceDesignReferenceV3,
): Profile {
  const edited = cloneProfile(profile);
  const assignments = target === "all"
    ? { all: reference, overrides: edited.assignments.overrides }
    : {
        all: edited.assignments.all,
        overrides: {
          ...edited.assignments.overrides,
          [target]: reference,
        },
      };
  return { ...edited, assignments } as Profile;
}

export function clearAppearanceTargetOverrideV3<
  Profile extends EditableAppearanceProfileV4,
>(profile: Profile, target: AppearanceTargetV4): Profile {
  const edited = cloneProfile(profile);
  const overrides = { ...edited.assignments.overrides };
  delete overrides[target];
  return {
    ...edited,
    assignments: { ...edited.assignments, overrides },
  } as Profile;
}

// "Back to default": resolution falls back to the builtin Random recipe.
export function clearAppearanceAllAssignmentV3<
  Profile extends EditableAppearanceProfileV4,
>(profile: Profile): Profile {
  const edited = cloneProfile(profile);
  return {
    ...edited,
    assignments: { ...edited.assignments, all: null },
  } as Profile;
}

function assertDesignCanBeAdded(profile: EditableAppearanceProfileV4): void {
  if (profile.designs.length >= MAX_APPEARANCE_DESIGNS_V3) {
    throw new Error("Appearance profile must contain at most ten designs");
  }
}

export function upsertAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV4,
>(
  profile: Profile,
  target: AppearanceEditorTargetV3,
  draft: AppearanceDesignDraftV3,
): Profile {
  const edited = cloneProfile(profile);
  const recipe = assertAppearanceRecipeSupportsTargetV3(draft.recipe, target);
  const index = edited.designs.findIndex(({ id }) => id === draft.id);
  if (index === -1) assertDesignCanBeAdded(edited);
  const design = { id: draft.id, name: draft.name, recipe };
  const designs = [...edited.designs];
  if (index === -1) designs.push(design);
  else designs[index] = design;
  return applyAppearanceReferenceV3(
    { ...edited, designs } as Profile,
    target,
    { source: "custom", id: draft.id },
  );
}

export function updateAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV4,
>(profile: Profile, draft: AppearanceDesignDraftV3): Profile {
  const edited = cloneProfile(profile);
  if (!edited.designs.some(({ id }) => id === draft.id)) {
    throw new Error(`Appearance custom design is missing: ${draft.id}`);
  }
  const assignedTargets: AppearanceEditorTargetV3[] = [];
  if (
    edited.assignments.all?.source === "custom" &&
    edited.assignments.all.id === draft.id
  ) {
    assignedTargets.push("all");
  } else {
    for (const [target, reference] of Object.entries(
      edited.assignments.overrides,
    )) {
      if (reference?.source === "custom" && reference.id === draft.id) {
        assignedTargets.push(target as AppearanceTargetV4);
      }
    }
  }
  let recipe = cloneRecipe(draft.recipe);
  for (const assignedTarget of assignedTargets) {
    recipe = assertAppearanceRecipeSupportsTargetV3(recipe, assignedTarget);
  }
  return {
    ...edited,
    designs: edited.designs.map((design) =>
      design.id === draft.id
        ? { id: draft.id, name: draft.name, recipe }
        : design,
    ),
  } as Profile;
}

export function renameAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV4,
>(profile: Profile, designId: string, name: string): Profile {
  const edited = cloneProfile(profile);
  if (!edited.designs.some(({ id }) => id === designId)) {
    throw new Error(`Appearance custom design is missing: ${designId}`);
  }
  return {
    ...edited,
    designs: edited.designs.map((design) =>
      design.id === designId ? { ...design, name } : design,
    ),
  } as Profile;
}

export function duplicateAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV4,
>(profile: Profile, designId: string, duplicateId: string): Profile {
  const edited = cloneProfile(profile);
  const design = edited.designs.find(({ id }) => id === designId);
  if (design === undefined) {
    throw new Error(`Appearance custom design is missing: ${designId}`);
  }
  if (edited.designs.some(({ id }) => id === duplicateId)) {
    throw new Error(`Appearance custom design already exists: ${duplicateId}`);
  }
  assertDesignCanBeAdded(edited);
  const duplicate = {
    id: duplicateId,
    name: nextAppearanceDesignNameV3(edited.designs, design.name),
    recipe: cloneRecipe(design.recipe),
  };
  return { ...edited, designs: [...edited.designs, duplicate] } as Profile;
}

export function restoreAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV4,
>(
  profile: Profile,
  design: CustomAppearanceDesignV3,
  targets: readonly AppearanceEditorTargetV3[],
): Profile {
  const edited = cloneProfile(profile);
  if (edited.designs.some(({ id }) => id === design.id)) {
    throw new Error(`Appearance custom design already exists: ${design.id}`);
  }
  assertDesignCanBeAdded(edited);
  let restored = {
    ...edited,
    designs: [
      ...edited.designs,
      {
        id: design.id,
        name: design.name,
        recipe: cloneRecipe(design.recipe),
      },
    ],
  } as Profile;
  for (const target of targets) {
    restored = applyAppearanceReferenceV3(
      restored,
      target,
      { source: "custom", id: design.id },
    );
  }
  return restored;
}

export function deleteAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV4,
>(profile: Profile, designId: string): Profile {
  const edited = cloneProfile(profile);
  if (!edited.designs.some(({ id }) => id === designId)) {
    throw new Error(`Appearance custom design is missing: ${designId}`);
  }
  const overrides = Object.fromEntries(
    Object.entries(edited.assignments.overrides).filter(
      ([, reference]) =>
        reference.source !== "custom" || reference.id !== designId,
    ),
  ) as AppearanceProfileV4["assignments"]["overrides"];
  const all = edited.assignments.all;
  return {
    ...edited,
    designs: edited.designs.filter(({ id }) => id !== designId),
    assignments: {
      all: all?.source === "custom" && all.id === designId ? null : all,
      overrides,
    },
  } as Profile;
}

export function setGuildAppearanceModeV3<
  Profile extends GuildAppearanceProfileV4,
>(profile: Profile, mode: Profile["mode"]): Profile {
  return { ...cloneProfile(profile), mode } as Profile;
}

function selectedMaterialFamilies(
  recipe: AppearanceRecipeV3,
): ReadonlySet<MaterialFamilyV4> {
  return new Set(
    selectionValuesV3(recipe.material).map(({ family }) => family),
  );
}

function selectedForms(
  recipe: AppearanceRecipeV3,
): readonly PolyhedralFormV4[] {
  return selectionValuesV3(recipe.form.polyhedral);
}

function usesRepeatedGradient(recipe: AppearanceRecipeV3): boolean {
  return selectionValuesV3(recipe.gradient.scope).includes("repeated");
}

function targetSupportsForm(
  form: AppearanceCatalogV3["forms"][number],
  target: AppearanceEditorTargetV3,
): boolean {
  if (target === "other") return form.id === "sphere";
  if (form.id === "sphere") return false;
  if (target !== "all") return form.targets.includes(target);
  return APPEARANCE_TARGETS_V4.every(
    (candidate) => candidate === "other" || form.targets.includes(candidate),
  );
}

export function compatibleRenderFormsV3(
  recipe: AppearanceRecipeV3,
  target: AppearanceEditorTargetV3,
  catalog: AppearanceCatalogV3,
): AppearanceCatalogV3["forms"] {
  const families = selectedMaterialFamilies(recipe);
  const requiresStandardForm = usesRepeatedGradient(recipe);
  return catalog.forms.filter(
    (form) =>
      (!requiresStandardForm || form.id === "standard") &&
      targetSupportsForm(form, target) &&
      form.materialFamilies.some((family) => families.has(family)),
  );
}

export function compatibleMaterialFamiliesV3(
  recipe: AppearanceRecipeV3,
  target: AppearanceEditorTargetV3,
  catalog: AppearanceCatalogV3,
): AppearanceCatalogV3["materials"] {
  if (target === "other") return catalog.materials;
  const forms = new Set(selectedForms(recipe));
  const compatibleFamilies = new Set(
    catalog.forms
      .filter(
        (form) =>
          form.id !== "sphere" &&
          forms.has(form.id) &&
          targetSupportsForm(form, target),
      )
      .flatMap(({ materialFamilies }) => materialFamilies),
  );
  const requiresClassicMaterial = usesRepeatedGradient(recipe);
  return catalog.materials.filter(
    ({ family }) =>
      compatibleFamilies.has(family) &&
      (!requiresClassicMaterial || family === "classic"),
  );
}

export function materialSelectionValuesV3(
  recipe: AppearanceRecipeV3,
): readonly AppearanceMaterialV4[] {
  return selectionValuesV3(recipe.material);
}
