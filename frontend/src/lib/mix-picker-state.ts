import { selectionValuesV3 } from "@/lib/appearance-editor-v3";
import { normalizeMaterialWeightsV3, MATERIAL_WEIGHT_TOTAL_V3 } from "@/lib/material-weight-percentages";
import type { AppearanceCatalogV3 } from "../types/appearance";
import {
  APPEARANCE_PALETTE_COLOR_RANGE_V3,
  APPEARANCE_SELECTION_WEIGHT_RANGE_V3,
} from "@dice-witch/dice-v4-model";
import type {
  AppearanceColorsV3,
  AppearanceDesignReferenceV3,
  AppearanceMaterialV4,
  AppearanceRecipeV3,
  AppearanceSelection,
  HexColor,
} from "@dice-witch/dice-v4-model";

export type MixPickerVariety = "matched" | "mixed" | "chaos";
export type ColorSchemeDistribution = "coordinated" | "one-per-die";

export type MaterialRowState =
  | { mode: "fixed"; families: readonly string[] }
  | { mode: "allowlist"; families: readonly string[] }
  | {
      mode: "weighted";
      families: readonly string[];
      weights: readonly number[];
    };

// Font and engraving selections are plain string unions, so their rows share
// one generic conversion. Values are the ids themselves — nothing to preserve.
export type StringRowState<V extends string> =
  | { mode: "fixed"; id: V }
  | { mode: "allowlist"; ids: readonly V[] }
  | {
      mode: "weighted";
      ids: readonly V[];
      weights: readonly number[];
    };

export function stringRowsFromSelection<V extends string>(
  selection: AppearanceSelection<V>,
): StringRowState<V> {
  if (selection.mode === "fixed") {
    return { mode: "fixed", id: selection.value };
  }
  if (selection.mode === "allowlist") {
    return { mode: "allowlist", ids: selection.values };
  }
  return {
    mode: "weighted",
    ids: selection.options.map(({ value }) => value),
    weights: selection.options.map(({ weight }) => weight),
  };
}

export function applyStringRows<V extends string>(
  selection: AppearanceSelection<V>,
  rows: StringRowState<V>,
): AppearanceSelection<V> {
  switch (rows.mode) {
    case "fixed":
      return { mode: "fixed", value: rows.id };
    case "allowlist":
      return { mode: "allowlist", values: [...rows.ids] };
    case "weighted": {
      const totalWeight = rows.weights.reduce((sum, weight) => sum + weight, 0);
      const normalized =
        totalWeight === MATERIAL_WEIGHT_TOTAL_V3
          ? [...rows.weights]
          : normalizeMaterialWeightsV3([...rows.weights]);
      return {
        mode: "weighted",
        options: rows.ids.map((value, index) => ({
          value,
          weight: normalized[index],
        })),
      };
    }
  }
}

export function hasProceduralFontSelection(recipe: AppearanceRecipeV3): boolean {
  return recipe.font.mode !== "fixed";
}

export function varietyFromRecipe(
  recipe: AppearanceRecipeV3,
  isChaosAssignment: boolean,
): MixPickerVariety {
  if (isChaosAssignment) return "chaos";
  if (recipe.colorDistribution === "one-per-die") return "mixed";
  if (recipe.variation === "fixed" || recipe.varyBy === "roll") {
    return "matched";
  }
  return "mixed";
}

// Returns null for "chaos": applying it swaps the target's assignment to the
// builtin chaotic style, which the profile layer (not the recipe) owns.
export function applyVariety(
  recipe: AppearanceRecipeV3,
  variety: Exclude<MixPickerVariety, "chaos">,
): AppearanceRecipeV3 {
  if (variety === "matched") {
    return { ...recipe, variation: "curated", varyBy: "roll" };
  }
  return { ...recipe, variation: "curated", varyBy: "die" };
}

export function materialRowsFromRecipe(
  recipe: AppearanceRecipeV3,
): MaterialRowState {
  const values = selectionValuesV3(recipe.material);
  const families = [...new Set(values.map(({ family }) => family))];
  if (recipe.material.mode === "weighted") {
    const weightByFamily = new Map<string, number>();
    for (const { value, weight } of recipe.material.options) {
      weightByFamily.set(
        value.family,
        (weightByFamily.get(value.family) ?? 0) + weight,
      );
    }
    return {
      mode: "weighted",
      families,
      weights: normalizeMaterialWeightsV3(
        families.map((family) => {
          const weight = weightByFamily.get(family);
          if (weight === undefined) {
            throw new Error(`Material family weight is missing: ${family}`);
          }
          return weight;
        }),
      ),
    };
  }
  if (recipe.material.mode === "allowlist") {
    return { mode: "allowlist", families };
  }
  return { mode: "fixed", families };
}

// Chaos swaps the target's assignment to the builtin "Random" style instead
// of editing its recipe. Frontend has no import path to dice-appearance's
// CHAOTIC_APPEARANCE_STYLE_ID, so the contract id is pinned here; consumers
// resolve it against catalog.styles and fail fast if it disappears.
export const CHAOS_ASSIGNMENT_V3 = {
  source: "builtin",
  id: "chaotic",
} as const satisfies AppearanceDesignReferenceV3;

export type ColorsRowState =
  | { mode: "palette"; colors: readonly HexColor[] }
  | { mode: "single"; primary: HexColor; tonal: boolean }
  // colors.mode "random" re-rolls the color every render; carried through
  // untouched so read→apply round-trips preserve its semantics.
  | { mode: "randomized"; primary: HexColor }
  | {
      mode: "generated";
      colors: { mode: "random-pair" | "vivid-random-pair" };
    };

function validatedPalette(colors: readonly HexColor[]): HexColor[] {
  const { minimum, maximum } = APPEARANCE_PALETTE_COLOR_RANGE_V3;
  if (colors.length < minimum || colors.length > maximum) {
    throw new Error(`Palette needs ${minimum}–${maximum} colors`);
  }
  if (new Set(colors).size < 2) {
    throw new Error("Palette needs two distinct colors");
  }
  return [...colors];
}

export function colorsRowFromRecipe(
  recipe: AppearanceRecipeV3,
): ColorsRowState {
  const { colors } = recipe;
  if (colors.mode === "palette") {
    return { mode: "palette", colors: [...colors.colors] };
  }
  if (colors.mode === "random") {
    return { mode: "randomized", primary: colors.primary };
  }
  if (colors.mode === "random-pair" || colors.mode === "vivid-random-pair") {
    return { mode: "generated", colors };
  }
  return {
    mode: "single",
    primary: colors.primary,
    tonal: colors.mode === "tonal",
  };
}

function mapMaterialSelection(
  selection: AppearanceRecipeV3["material"],
  map: (material: AppearanceMaterialV4) => AppearanceMaterialV4,
): AppearanceRecipeV3["material"] {
  switch (selection.mode) {
    case "fixed":
      return { mode: "fixed", value: map(selection.value) };
    case "allowlist":
      return { mode: "allowlist", values: selection.values.map(map) };
    case "weighted":
      return {
        mode: "weighted",
        options: selection.options.map(({ value, weight }) => ({
          value: map(value),
          weight,
        })),
      };
  }
}

export function replaceMaterialFamily(
  selection: AppearanceRecipeV3["material"],
  family: string,
  next: AppearanceMaterialV4,
): AppearanceRecipeV3["material"] {
  if (selection.mode === "fixed") return { mode: "fixed", value: next };
  if (selection.mode === "allowlist") {
    const index = selection.values.findIndex((value) => value.family === family);
    if (index < 0) throw new Error(`Material family is not selected: ${family}`);
    return {
      mode: "allowlist",
      values: selection.values.filter(
        (value, position) => value.family !== family || position === index,
      ).map((value, position) => position === index ? next : value),
    };
  }

  const familyOptions = selection.options.filter(
    ({ value }) => value.family === family,
  );
  if (familyOptions.length === 0) {
    throw new Error(`Material family is not selected: ${family}`);
  }
  const familyWeight = familyOptions.reduce(
    (sum, { weight }) => sum + weight,
    0,
  );
  const firstIndex = selection.options.findIndex(
    ({ value }) => value.family === family,
  );
  const collapsed = selection.options.flatMap((option, index) => {
    if (option.value.family !== family) return [option];
    return index === firstIndex ? [{ value: next, weight: familyWeight }] : [];
  });
  const weights = collapsed.map(({ weight }) => weight);
  const normalized = weights.some(
    (weight) => weight > APPEARANCE_SELECTION_WEIGHT_RANGE_V3.maximum,
  )
    ? normalizeMaterialWeightsV3(weights)
    : weights;
  return {
    mode: "weighted",
    options: collapsed.map(({ value }, index) => ({
      value,
      weight: normalized[index] as number,
    })),
  };
}

export function applyColorScheme(
  recipe: AppearanceRecipeV3,
  colors: AppearanceColorsV3,
  distribution: ColorSchemeDistribution,
): AppearanceRecipeV3 {
  const materials = selectionValuesV3(recipe.material);
  const canChangeClassicPresentation =
    materials.filter(({ family }) => family === "classic").length <= 1;
  const next: AppearanceRecipeV3 = {
    ...recipe,
    colors: structuredClone(colors),
    colorDistribution: distribution,
    material: mapMaterialSelection(recipe.material, (material) => {
      if (
        !canChangeClassicPresentation ||
        material.family !== "classic" ||
        material.treatment === "pattern"
      ) {
        return material;
      }
      const treatment =
        distribution === "one-per-die" || colors.mode !== "palette"
          ? "solid"
          : "gradient";
      return { ...material, treatment };
    }),
  };
  if (next.randomization === "one-palette-color-v1") {
    delete next.randomization;
  }
  return next;
}

export function applyColorsRow(
  recipe: AppearanceRecipeV3,
  row: ColorsRowState,
): AppearanceRecipeV3 {
  switch (row.mode) {
    case "palette":
      return {
        ...recipe,
        colors: { mode: "palette", colors: validatedPalette(row.colors) },
      };
    case "single":
      return {
        ...recipe,
        colors: {
          mode: row.tonal ? "tonal" : "solid",
          primary: row.primary,
        },
      };
    case "randomized":
      return { ...recipe, colors: { mode: "random", primary: row.primary } };
    case "generated":
      return { ...recipe, colors: row.colors };
  }
}

// Fine-tune's color-chance radios map onto randomization policies; side
// effects (palette conversion) are stated inline in the panel captions.
export type ColorChance = "mine" | "accent" | "bright";

export function colorChanceOf(recipe: AppearanceRecipeV3): ColorChance {
  const policy = recipe.randomization;
  if (policy === "one-palette-color-v1") return "accent";
  if (
    policy === "full-spectrum-v1" ||
    policy === "full-spectrum-v2" ||
    recipe.colors.mode === "vivid-random-pair" ||
    recipe.colors.mode === "random-pair"
  ) {
    return "bright";
  }
  return "mine";
}

function primaryOf(recipe: AppearanceRecipeV3): HexColor | null {
  const colors = recipe.colors;
  if (colors.mode === "palette") return colors.colors[0] ?? null;
  if (
    colors.mode === "random" ||
    colors.mode === "solid" ||
    colors.mode === "tonal"
  ) {
    return colors.primary;
  }
  return null;
}

function paletteForAccent(
  recipe: AppearanceRecipeV3,
  catalog: AppearanceCatalogV3,
): AppearanceColorsV3 {
  if (recipe.colors.mode === "palette") return recipe.colors;
  const primary = primaryOf(recipe) ?? catalog.editorDefaults.primaryColor;
  const accent =
    catalog.editorDefaults.palette.find((color) => color !== primary) ??
    "#888888";
  return { mode: "palette", colors: [primary, accent] };
}

export function applyColorChance(
  recipe: AppearanceRecipeV3,
  chance: ColorChance,
  catalog: AppearanceCatalogV3,
): AppearanceRecipeV3 {
  switch (chance) {
    case "mine": {
      const next = { ...recipe };
      delete next.randomization;
      if (next.colors.mode === "palette") {
        next.colorDistribution = "coordinated";
      } else {
        delete next.colorDistribution;
      }
      return next;
    }
    case "accent": {
      const next = {
        ...recipe,
        colors: paletteForAccent(recipe, catalog),
        randomization: "one-palette-color-v1" as const,
      };
      delete next.colorDistribution;
      return next;
    }
    case "bright": {
      const next = {
        ...recipe,
        varyBy: "die" as const,
        randomization: "full-spectrum-v2" as const,
        colors: { mode: "vivid-random-pair" as const },
      };
      delete next.colorDistribution;
      return next;
    }
  }
}

// A family with one selected value keeps its tuned parameters. Rich Random
// families have several hidden variants, so an explicit family edit chooses
// the catalog default instead of arbitrarily keeping one hidden variant.
export function applyMaterialRows(
  recipe: AppearanceRecipeV3,
  rows: MaterialRowState,
  resolveMaterial: (family: string) => AppearanceMaterialV4,
): AppearanceRecipeV3 {
  if (
    rows.families.length === 0 ||
    new Set(rows.families).size !== rows.families.length
  ) {
    throw new Error("Material rows require distinct families");
  }
  const existing = new Map<string, AppearanceMaterialV4[]>();
  for (const value of selectionValuesV3(recipe.material)) {
    const familyValues = existing.get(value.family) ?? [];
    familyValues.push(value);
    existing.set(value.family, familyValues);
  }
  const values = rows.families.map((family) => {
    const familyValues = existing.get(family);
    if (familyValues?.length !== 1) return resolveMaterial(family);
    const value = familyValues[0];
    if (value === undefined) {
      throw new Error(`Material family value is missing: ${family}`);
    }
    return value;
  });
  switch (rows.mode) {
    case "fixed": {
      const value = values[0];
      if (values.length !== 1 || value === undefined) {
        throw new Error("Fixed material rows require one family");
      }
      return { ...recipe, material: { mode: "fixed", value } };
    }
    case "allowlist":
      return { ...recipe, material: { mode: "allowlist", values } };
    case "weighted": {
      if (rows.weights.length !== values.length) {
        throw new Error("Material row weights do not match their families");
      }
      const normalized = normalizeMaterialWeightsV3(rows.weights);
      return {
        ...recipe,
        material: {
          mode: "weighted",
          options: values.map((value, index) => {
            const weight = normalized[index];
            if (weight === undefined) {
              throw new Error(`Material family weight is missing: ${value.family}`);
            }
            return { value, weight };
          }),
        },
      };
    }
  }
}
