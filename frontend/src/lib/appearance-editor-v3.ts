import {
  APPEARANCE_TARGETS_V4,
  isPolyhedralFormImplementedForTargetV4,
  parseAppearanceMaterialV4,
  parseAppearanceProfileV3,
  parseAppearanceRecipeV3,
  parseGuildAppearanceProfileV3,
  type AppearanceDesignReferenceV3,
  type AppearanceMaterialV4,
  type AppearanceProfileV3,
  type AppearanceRecipeV3,
  type AppearanceSelection,
  type AppearanceTargetV4,
  type GuildAppearanceProfileV3,
  type MaterialFamilyV4,
  type PolyhedralFormV4,
} from "@dice-witch/dice-v4-model";
import type { AppearanceCatalogV3 } from "../types/appearance";

export type AppearanceEditorTargetV3 = AppearanceTargetV4 | "all";
export type EditableAppearanceProfileV3 =
  | AppearanceProfileV3
  | GuildAppearanceProfileV3;

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

function validationCatalog(catalog: AppearanceCatalogV3): {
  builtinStyleIds: string[];
} {
  return { builtinStyleIds: catalog.styles.map(({ id }) => id) };
}

function validateProfile<T extends EditableAppearanceProfileV3>(
  profile: T,
  catalog: AppearanceCatalogV3,
): T {
  const parsed = "mode" in profile
    ? parseGuildAppearanceProfileV3(profile, validationCatalog(catalog))
    : parseAppearanceProfileV3(profile, validationCatalog(catalog));
  return parsed as T;
}

function cloneRecipe(recipe: AppearanceRecipeV3): AppearanceRecipeV3 {
  return parseAppearanceRecipeV3(structuredClone(recipe));
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
  const material = parseAppearanceMaterialV4(
    structuredClone(metadata.defaultValue),
  );
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

export function createEmptyAppearanceProfileV3(
  kind: "personal",
): AppearanceProfileV3;
export function createEmptyAppearanceProfileV3(
  kind: "guild",
): GuildAppearanceProfileV3;
export function createEmptyAppearanceProfileV3(
  kind: "personal" | "guild",
): EditableAppearanceProfileV3 {
  const profile: AppearanceProfileV3 = {
    version: 3,
    designs: [],
    assignments: { all: null, overrides: {} },
  };
  return kind === "guild" ? { ...profile, mode: "default" } : profile;
}

export function appearanceAssignmentForV3(
  profile: AppearanceProfileV3,
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
  profile: EditableAppearanceProfileV3,
  target: AppearanceEditorTargetV3,
  catalog: AppearanceCatalogV3,
): AppearanceEditorSelectionV3 {
  const validated = validateProfile(profile, catalog);
  const reference = appearanceAssignmentForV3(validated, target);
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
  const design = validated.designs.find(({ id }) => id === reference.id);
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
  const parsed = parseAppearanceRecipeV3(recipe);
  return parseAppearanceRecipeV3({
    ...parsed,
    form: { ...parsed.form, policy: "material-default-v1" },
  });
}

export function beginAppearanceRecipeEditV3(
  current: AppearanceRecipeV3,
  next: AppearanceRecipeV3,
  editingBuiltin: boolean,
): AppearanceRecipeV3 {
  const parsedCurrent = parseAppearanceRecipeV3(current);
  const parsedNext = withAutomaticMaterialFormsV3(next);
  if (!editingBuiltin) return parsedNext;
  const strength = sameSelection(
    parsedCurrent.lighting.strength,
    parsedNext.lighting.strength,
  )
    ? { mode: "fixed" as const, value: "gentle" as const }
    : parsedNext.lighting.strength;
  const editable = structuredClone(parsedNext);
  delete editable.randomization;
  return parseAppearanceRecipeV3({
    ...editable,
    variation: "fixed",
    lighting: { ...editable.lighting, strength },
  });
}

export function assertAppearanceRecipeSupportsTargetV3(
  recipe: AppearanceRecipeV3,
  target: AppearanceEditorTargetV3,
): AppearanceRecipeV3 {
  const parsed = parseAppearanceRecipeV3(recipe);
  if (target === "other" || parsed.form.policy !== undefined) return parsed;
  const targets = target === "all"
    ? APPEARANCE_TARGETS_V4.filter(
        (candidate): candidate is Exclude<AppearanceTargetV4, "other"> =>
          candidate !== "other",
      )
    : [target];
  for (const form of selectionValuesV3(parsed.form.polyhedral)) {
    for (const candidate of targets) {
      if (!isPolyhedralFormImplementedForTargetV4(candidate, form)) {
        throw new Error(
          `Appearance form ${form} is not implemented for ${candidate}`,
        );
      }
    }
  }
  return parsed;
}

export function applyAppearanceReferenceV3<
  Profile extends EditableAppearanceProfileV3,
>(
  profile: Profile,
  target: AppearanceEditorTargetV3,
  reference: AppearanceDesignReferenceV3,
  catalog: AppearanceCatalogV3,
): Profile {
  const validated = validateProfile(profile, catalog);
  const assignments = target === "all"
    ? { all: reference, overrides: {} }
    : {
        all: validated.assignments.all,
        overrides: {
          ...validated.assignments.overrides,
          [target]: reference,
        },
      };
  return validateProfile({ ...validated, assignments } as Profile, catalog);
}

export function clearAppearanceTargetOverrideV3<
  Profile extends EditableAppearanceProfileV3,
>(
  profile: Profile,
  target: AppearanceTargetV4,
  catalog: AppearanceCatalogV3,
): Profile {
  const validated = validateProfile(profile, catalog);
  const overrides = { ...validated.assignments.overrides };
  delete overrides[target];
  return validateProfile(
    {
      ...validated,
      assignments: { ...validated.assignments, overrides },
    } as Profile,
    catalog,
  );
}

export function upsertAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV3,
>(
  profile: Profile,
  target: AppearanceEditorTargetV3,
  draft: AppearanceDesignDraftV3,
  catalog: AppearanceCatalogV3,
): Profile {
  const validated = validateProfile(profile, catalog);
  const recipe = assertAppearanceRecipeSupportsTargetV3(draft.recipe, target);
  const index = validated.designs.findIndex(({ id }) => id === draft.id);
  const design = { id: draft.id, name: draft.name, recipe };
  const designs = [...validated.designs];
  if (index === -1) designs.push(design);
  else designs[index] = design;
  return applyAppearanceReferenceV3(
    validateProfile({ ...validated, designs } as Profile, catalog),
    target,
    { source: "custom", id: draft.id },
    catalog,
  );
}

export function deleteAppearanceDesignV3<
  Profile extends EditableAppearanceProfileV3,
>(
  profile: Profile,
  designId: string,
  catalog: AppearanceCatalogV3,
): Profile {
  const validated = validateProfile(profile, catalog);
  if (!validated.designs.some(({ id }) => id === designId)) {
    throw new Error(`Appearance custom design is missing: ${designId}`);
  }
  const overrides = Object.fromEntries(
    Object.entries(validated.assignments.overrides).filter(
      ([, reference]) =>
        reference.source !== "custom" || reference.id !== designId,
    ),
  ) as AppearanceProfileV3["assignments"]["overrides"];
  const all = validated.assignments.all;
  return validateProfile(
    {
      ...validated,
      designs: validated.designs.filter(({ id }) => id !== designId),
      assignments: {
        all: all?.source === "custom" && all.id === designId ? null : all,
        overrides,
      },
    } as Profile,
    catalog,
  );
}

export function setGuildAppearanceModeV3(
  profile: GuildAppearanceProfileV3,
  mode: GuildAppearanceProfileV3["mode"],
  catalog: AppearanceCatalogV3,
): GuildAppearanceProfileV3 {
  return validateProfile({ ...profile, mode }, catalog);
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
  const parsed = parseAppearanceRecipeV3(recipe);
  const families = selectedMaterialFamilies(parsed);
  const requiresStandardForm = usesRepeatedGradient(parsed);
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
  const parsed = parseAppearanceRecipeV3(recipe);
  if (target === "other") return catalog.materials;
  const forms = new Set(selectedForms(parsed));
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
  const requiresClassicMaterial = usesRepeatedGradient(parsed);
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
