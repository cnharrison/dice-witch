import { describe, expect, it } from "vitest";
import type {
  AppearanceMaterialV4,
  AppearanceRecipeV3,
  AppearanceSelection,
} from "@dice-witch/dice-v4-model";
import {
  applyMaterialRows,
  applyStringRows,
  applyVariety,
  hasProceduralFontSelection,
  materialRowsFromRecipe,
  stringRowsFromSelection,
  varietyFromRecipe,
} from "@/lib/mix-picker-state";
import { MATERIAL_WEIGHT_TOTAL_V3 } from "@/lib/material-weight-percentages";

// State-layer tests exercise data flow, not render validity: family-specific
// parameters are opaque here, so fixtures only carry the discriminator.
const materialValue = (family: string) => ({ family }) as AppearanceMaterialV4;

function recipeWithMaterial(
  material: AppearanceRecipeV3["material"],
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "curated",
    varyBy: "die",
    colors: { mode: "palette", colors: ["#111111", "#222222"] },
    material,
    form: { polyhedral: { mode: "fixed", value: "standard" }, other: "sphere" },
    font: { mode: "fixed", value: "cinzel" },
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: { mode: "fixed", value: "repeated" },
      direction: { mode: "fixed", value: "top-to-bottom" },
    },
    lighting: {
      mode: { mode: "fixed", value: "facet" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

describe("string rows (font / engraving)", () => {
  it("round-trips fixed, allowlist, and weighted font selections", () => {
    const selections: AppearanceSelection<"cinzel" | "fraunces">[] = [
      { mode: "fixed", value: "cinzel" },
      { mode: "allowlist", values: ["cinzel", "fraunces"] },
      {
        mode: "weighted",
        options: [
          { value: "cinzel", weight: 700 },
          { value: "fraunces", weight: 300 },
        ],
      },
    ];
    for (const selection of selections) {
      expect(
        applyStringRows(selection, stringRowsFromSelection(selection)),
      ).toEqual(selection);
    }
  });

  it("normalizes off-total weighted engraving rows", () => {
    const next = applyStringRows(
      { mode: "fixed", value: "matte-ink" } as never,
      {
        mode: "weighted",
        ids: ["matte-ink", "luminous"],
        weights: [500, 250],
      } as never,
    );
    if (next.mode !== "weighted") throw new Error("expected weighted");
    expect(next.options.reduce((sum, option) => sum + option.weight, 0)).toBe(
      MATERIAL_WEIGHT_TOTAL_V3,
    );
  });
});

describe("materialRowsFromRecipe", () => {
  it("loads a legacy five-material weighted mix one-to-one", () => {
    const families = ["classic", "sharp-resin", "glass", "metal", "wood"];
    const weights = [370, 230, 200, 150, 50];
    const recipe = recipeWithMaterial({
      mode: "weighted",
      options: families.map((family, index) => ({
        value: materialValue(family),
        weight: weights[index] as number,
      })),
    });
    expect(materialRowsFromRecipe(recipe)).toEqual({
      mode: "weighted",
      families,
      weights,
    });
  });

  it("reads fixed and allowlist selections", () => {
    const fixed = recipeWithMaterial({
      mode: "fixed",
      value: materialValue("glass"),
    });
    expect(materialRowsFromRecipe(fixed)).toEqual({
      mode: "fixed",
      families: ["glass"],
    });
    const allowlist = recipeWithMaterial({
      mode: "allowlist",
      values: [materialValue("classic"), materialValue("wood")],
    });
    expect(materialRowsFromRecipe(allowlist)).toEqual({
      mode: "allowlist",
      families: ["classic", "wood"],
    });
  });

  it("round-trips rows through applyMaterialRows untouched", () => {
    const recipe = recipeWithMaterial({
      mode: "weighted",
      options: [
        { value: materialValue("classic"), weight: 600 },
        { value: materialValue("glass"), weight: 400 },
      ],
    });
    const rows = materialRowsFromRecipe(recipe);
    expect(applyMaterialRows(recipe, rows, materialValue)).toEqual(recipe);
  });
});

describe("applyMaterialRows", () => {
  it("preserves tuned parameters for kept families and resolves new ones", () => {
    const tunedGlass = materialValue("glass");
    const recipe = recipeWithMaterial({
      mode: "allowlist",
      values: [tunedGlass],
    });
    const next = applyMaterialRows(
      recipe,
      { mode: "allowlist", families: ["glass", "metal"] },
      (family) => materialValue(`default-${family}`),
    );
    expect(next.material).toEqual({
      mode: "allowlist",
      values: [tunedGlass, materialValue("default-metal")],
    });
  });

  it("normalizes weighted rows onto the shared total", () => {
    const recipe = recipeWithMaterial({
      mode: "weighted",
      options: [{ value: materialValue("classic"), weight: 50 }],
    });
    const next = applyMaterialRows(
      recipe,
      {
        mode: "weighted",
        families: ["classic", "glass"],
        weights: [500, 300],
      },
      materialValue,
    );
    if (next.material.mode !== "weighted") throw new Error("expected weighted");
    const total = next.material.options.reduce(
      (sum, option) => sum + option.weight,
      0,
    );
    expect(total).toBe(MATERIAL_WEIGHT_TOTAL_V3);
  });
});

describe("variety", () => {
  it("maps variation x varyBy onto the three-state control", () => {
    expect(varietyFromRecipe({ ...base(), variation: "wild" })).toBe("chaos");
    expect(
      varietyFromRecipe({ ...base(), variation: "fixed", varyBy: "roll" }),
    ).toBe("matched");
    expect(
      varietyFromRecipe({ ...base(), variation: "curated", varyBy: "die" }),
    ).toBe("mixed");
    // Legacy group scoping reads as Mixed; Fine-tune exposes vary per group.
    expect(
      varietyFromRecipe({ ...base(), variation: "curated", varyBy: "group" }),
    ).toBe("mixed");
  });

  it("applies matched and mixed, and defers chaos to assignment level", () => {
    const recipe = base();
    expect(applyVariety(recipe, "matched")).toMatchObject({
      variation: "fixed",
      varyBy: "roll",
    });
    expect(applyVariety(recipe, "mixed")).toMatchObject({
      variation: "curated",
      varyBy: "die",
    });
    expect(applyVariety(recipe, "chaos" as never)).toBeDefined();
  });
});

function base(): AppearanceRecipeV3 {
  return recipeWithMaterial({ mode: "fixed", value: materialValue("classic") });
}

describe("hasProceduralFontSelection", () => {
  it("flags non-fixed font selections as legacy procedural", () => {
    expect(hasProceduralFontSelection(base())).toBe(false);
    expect(
      hasProceduralFontSelection({
        ...base(),
        font: { mode: "allowlist", values: ["cinzel"] },
      }),
    ).toBe(true);
  });
});
