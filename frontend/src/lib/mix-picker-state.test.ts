import { describe, expect, it } from "vitest";
import type {
  AppearanceMaterialV4,
  AppearanceRecipeV3,
  AppearanceSelection,
} from "@dice-witch/dice-v4-model";
import {
  FANTASY_ESSENCE_PALETTES_R33_V4,
  deriveAppearanceSeedV4,
  parseAppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import {
  CHAOS_ASSIGNMENT_V3,
  applyColorsRow,
  applyMaterialRows,
  applyStringRows,
  applyVariety,
  colorsRowFromRecipe,
  curatedPalettePool,
  hasProceduralFontSelection,
  materialRowsFromRecipe,
  stringRowsFromSelection,
  surpriseColors,
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

  it("aggregates Random's hidden variants into normalized family rows", () => {
    const random = APPEARANCE_CATALOG_V3.styles.find(
      ({ id }) => id === "chaotic",
    );
    if (random === undefined) throw new Error("Random fixture is missing");
    const rows = materialRowsFromRecipe(random.recipe);
    if (rows.mode !== "weighted") throw new Error("expected weighted");

    expect(new Set(rows.families).size).toBe(rows.families.length);
    expect(rows.families.length).toBeLessThan(
      random.recipe.material.mode === "weighted"
        ? random.recipe.material.options.length
        : 0,
    );
    expect(rows.weights.reduce((sum, weight) => sum + weight, 0)).toBe(
      MATERIAL_WEIGHT_TOTAL_V3,
    );
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

  it("materializes Random family rows as one valid value per family", () => {
    const random = APPEARANCE_CATALOG_V3.styles.find(
      ({ id }) => id === "chaotic",
    );
    if (random === undefined) throw new Error("Random fixture is missing");
    const rows = materialRowsFromRecipe(random.recipe);
    const next = applyMaterialRows(random.recipe, rows, (family) => {
      const entry = APPEARANCE_CATALOG_V3.materials.find(
        ({ family: candidate }) => candidate === family,
      );
      if (entry === undefined) throw new Error(`Missing material: ${family}`);
      return structuredClone(entry.defaultValue);
    });
    const parsed = parseAppearanceRecipeV3(next);
    if (parsed.material.mode !== "weighted") throw new Error("expected weighted");

    expect(
      parsed.material.options.map(({ value }) => value.family),
    ).toEqual(rows.families);
    expect(
      new Set(parsed.material.options.map(({ value }) => JSON.stringify(value))).size,
    ).toBe(parsed.material.options.length);
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
    for (const variation of ["fixed", "curated"] as const) {
      expect(
        varietyFromRecipe({ ...base(), variation, varyBy: "roll" }),
      ).toBe("matched");
    }
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
      variation: "curated",
      varyBy: "roll",
    });
    expect(applyVariety(recipe, "mixed")).toMatchObject({
      variation: "curated",
      varyBy: "die",
    });
    expect(applyVariety(recipe, "chaos" as never)).toBeDefined();
  });

  it("gives a matched roll one shared draw and rerolls the next roll", () => {
    const recipe = applyVariety(base(), "matched");
    const seed = (renderSeed: number, dieIndex: number) =>
      deriveAppearanceSeedV4({
        renderSeed,
        target: "d6",
        groupIndex: 0,
        dieIndex,
        variation: recipe.variation,
        varyBy: recipe.varyBy,
        recipe,
      });

    expect(seed(100, 0)).toBe(seed(100, 1));
    expect(seed(101, 0)).not.toBe(seed(100, 0));
  });
});

function base(): AppearanceRecipeV3 {
  return recipeWithMaterial({ mode: "fixed", value: materialValue("classic") });
}

describe("colors row", () => {
  it("round-trips palette, solid, tonal, and random modes one-to-one", () => {
    const modes: AppearanceRecipeV3["colors"][] = [
      { mode: "palette", colors: ["#111111", "#222222", "#333333"] },
      { mode: "solid", primary: "#444444" },
      { mode: "tonal", primary: "#555555" },
      { mode: "random", primary: "#666666" },
    ];
    for (const colors of modes) {
      const recipe = { ...base(), colors };
      expect(applyColorsRow(recipe, colorsRowFromRecipe(recipe))).toEqual(
        recipe,
      );
    }
  });

  it("maps single chips to solid or tonal by the tonal flag", () => {
    const recipe = base();
    expect(applyColorsRow(recipe, { mode: "single", primary: "#101010", tonal: false }).colors)
      .toEqual({ mode: "solid", primary: "#101010" });
    expect(applyColorsRow(recipe, { mode: "single", primary: "#101010", tonal: true }).colors)
      .toEqual({ mode: "tonal", primary: "#101010" });
  });

  it("rejects palettes the validator would reject", () => {
    const recipe = base();
    expect(() =>
      applyColorsRow(recipe, { mode: "palette", colors: ["#111111"] }),
    ).toThrow();
    expect(() =>
      applyColorsRow(recipe, {
        mode: "palette",
        colors: ["#111111", "#111111"],
      }),
    ).toThrow();
  });
});

describe("surprise me", () => {
  it("picks deterministically from the pool and writes COLORS only", () => {
    const palettes = [
      ["#070707", "#171717", "#272727", "#373737"],
      ["#ff0000", "#00ff00"],
    ];
    const picked = surpriseColors(palettes, null, () => 0.99);
    expect(picked).toEqual({
      mode: "palette",
      colors: ["#ff0000", "#00ff00"],
    });
    const recipe = applyColorsRow(base(), picked);
    expect(recipe.colors).toEqual(picked);
    // Everything except colors is untouched.
    expect(recipe.material).toEqual(base().material);
  });

  it("deduplicates choices and excludes the current palette", () => {
    const current = ["#070707", "#171717"] as const;
    const alternative = ["#ff0000", "#00ff00"] as const;
    expect(
      surpriseColors([current, current, alternative], current, () => 0),
    ).toEqual({ mode: "palette", colors: alternative });
  });

  it("fails fast without an alternative palette", () => {
    const only = ["#070707", "#171717"] as const;
    expect(() => surpriseColors([], null, Math.random)).toThrow();
    expect(() => surpriseColors([only], only, Math.random)).toThrow();
  });

  it("curated pool draws from catalog styles and all fantasy essences", () => {
    const catalog = {
      styles: [
        { id: "rainbow", recipe: { colors: { mode: "palette", colors: ["#aa0000", "#00aa00", "#0000aa"] } } },
        { id: "rainbow-copy", recipe: { colors: { mode: "palette", colors: ["#aa0000", "#00aa00", "#0000aa"] } } },
        { id: "solid", recipe: { colors: { mode: "solid", primary: "#101010" } } },
      ],
    } as never;
    const pool = curatedPalettePool(catalog);
    expect(pool).toHaveLength(1 + Object.keys(FANTASY_ESSENCE_PALETTES_R33_V4).length);
    expect(pool[0]).toEqual(["#aa0000", "#00aa00", "#0000aa"]);
  });
});

describe("chaos assignment op", () => {
  it("targets the builtin chaotic style at assignment level", () => {
    expect(CHAOS_ASSIGNMENT_V3).toEqual({ source: "builtin", id: "chaotic" });
  });
});

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
