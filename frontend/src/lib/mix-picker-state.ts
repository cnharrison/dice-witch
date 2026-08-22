import { selectionValuesV3 } from "@/lib/appearance-editor-v3";
import { normalizeMaterialWeightsV3, MATERIAL_WEIGHT_TOTAL_V3 } from "@/lib/material-weight-percentages";
import type { AppearanceCatalogV3 } from "../types/appearance";
import {
  APPEARANCE_PALETTE_COLOR_RANGE_V3,
  FANTASY_ESSENCE_PALETTES_R33_V4,
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

// Variety reads the two randomness axes; wild marks the builtin Random look
// ("Chaos"), which ignores every row and is applied at the assignment level.
export function varietyFromRecipe(
  recipe: AppearanceRecipeV3,
): MixPickerVariety {
  if (recipe.variation === "wild") return "chaos";
  return recipe.variation === "fixed" && recipe.varyBy === "roll"
    ? "matched"
    : "mixed";
}

// Returns null for "chaos": applying it swaps the target's assignment to the
// builtin chaotic style, which the profile layer (not the recipe) owns.
export function applyVariety(
  recipe: AppearanceRecipeV3,
  variety: Exclude<MixPickerVariety, "chaos">,
): AppearanceRecipeV3 {
  if (variety === "matched") {
    return { ...recipe, variation: "fixed", varyBy: "roll" };
  }
  return { ...recipe, variation: "curated", varyBy: "die" };
}

export function materialRowsFromRecipe(
  recipe: AppearanceRecipeV3,
): MaterialRowState {
  const families = selectionValuesV3(recipe.material).map(
    ({ family }) => family,
  );
  if (recipe.material.mode === "weighted") {
    return {
      mode: "weighted",
      families,
      weights: recipe.material.options.map(({ weight }) => weight),
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
  | { mode: "randomized"; primary: HexColor };

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
  return {
    mode: "single",
    primary: colors.primary,
    tonal: colors.mode === "tonal",
  };
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
  }
}

export function curatedPalettePool(
  catalog: AppearanceCatalogV3,
): HexColor[][] {
  const pool: HexColor[][] = [];
  for (const style of catalog.styles) {
    const { colors } = style.recipe;
    if (colors.mode === "palette") pool.push([...colors.colors]);
  }
  pool.push(
    ...Object.values(FANTASY_ESSENCE_PALETTES_R33_V4).map((p) => [...p]),
  );
  return pool;
}

// Surprise me replaces COLORS only; everything else in the recipe stays.
export function surpriseColors(
  palettes: readonly (readonly HexColor[])[],
  random: () => number,
): Extract<AppearanceColorsV3, { mode: "palette" }> {
  if (palettes.length === 0) {
    throw new Error("No curated palettes available");
  }
  const picked = palettes[Math.floor(random() * palettes.length)];
  return { mode: "palette", colors: validatedPalette(picked) };
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
      return next;
    }
    case "accent":
      return {
        ...recipe,
        colors: paletteForAccent(recipe, catalog),
        randomization: "one-palette-color-v1",
      };
    case "bright":
      return {
        ...recipe,
        varyBy: "die",
        randomization: "full-spectrum-v2",
        colors: { mode: "vivid-random-pair" },
      };
  }
}

// resolveMaterial supplies a value for families the current selection does
// not already carry (catalog defaults), so user-tuned parameters survive
// edits of the families they belong to.
export function applyMaterialRows(
  recipe: AppearanceRecipeV3,
  rows: MaterialRowState,
  resolveMaterial: (family: string) => AppearanceMaterialV4,
): AppearanceRecipeV3 {
  const existing = new Map(
    selectionValuesV3(recipe.material).map((value) => [value.family, value]),
  );
  const values = rows.families.map((family) =>
    existing.get(family as never) ?? resolveMaterial(family),
  );
  switch (rows.mode) {
    case "fixed":
      return {
        ...recipe,
        material: { mode: "fixed", value: values[0] as AppearanceMaterialV4 },
      };
    case "allowlist":
      return { ...recipe, material: { mode: "allowlist", values } };
    case "weighted": {
      // Legacy profiles store exact integer weights; only renormalize when
      // the incoming set does not already fill the shared total.
      const totalWeight = rows.weights.reduce((sum, weight) => sum + weight, 0);
      const normalized =
        totalWeight === MATERIAL_WEIGHT_TOTAL_V3
          ? [...rows.weights]
          : normalizeMaterialWeightsV3([...rows.weights]);
      return {
        ...recipe,
        material: {
          mode: "weighted",
          options: values.map((value, index) => ({
            value,
            weight: normalized[index],
          })),
        },
      };
    }
  }
}
