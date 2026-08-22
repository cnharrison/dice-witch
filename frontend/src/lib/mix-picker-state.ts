import { selectionValuesV3 } from "@/lib/appearance-editor-v3";
import { normalizeMaterialWeightsV3, MATERIAL_WEIGHT_TOTAL_V3 } from "@/lib/material-weight-percentages";
import type {
  AppearanceMaterialV4,
  AppearanceRecipeV3,
  AppearanceSelection,
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
