import { describe, expect, it } from "vitest";
import type {
  AppearanceMaterialV4,
  AppearanceRecipeV3,
  AppearanceSelection,
} from "@dice-witch/dice-v4-model";
import {
  deriveAppearanceSeedV4,
  parseAppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import {
  CHAOS_ASSIGNMENT_V3,
  applyColorScheme,
  applyColorsRow,
  applyMaterialRows,
  applyStringRows,
  applyVariety,
  colorsRowFromRecipe,
  hasProceduralFontSelection,
  materialRowsFromRecipe,
  replaceMaterialFamily,
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
  it("maps fixed recipes and shared draws to Matched Set", () => {
    expect(
      varietyFromRecipe({ ...base(), variation: "fixed", varyBy: "die" }, false),
    ).toBe("matched");
    expect(
      varietyFromRecipe(
        { ...base(), variation: "curated", varyBy: "roll" },
        false,
      ),
    ).toBe("matched");
  });

  it("maps independent recipes to Mixed Bag and only the Random assignment to Chaos", () => {
    expect(
      varietyFromRecipe({ ...base(), variation: "wild", varyBy: "die" }, false),
    ).toBe("mixed");
    expect(
      varietyFromRecipe({ ...base(), variation: "wild", varyBy: "die" }, true),
    ).toBe("chaos");
    expect(
      varietyFromRecipe(
        { ...base(), variation: "curated", varyBy: "group" },
        false,
      ),
    ).toBe("mixed");
  });

  it("classifies every Start From preset by its actual roll behavior", () => {
    const styleIds = [
      ...APPEARANCE_CATALOG_V3.featuredStyleIds,
      ...APPEARANCE_CATALOG_V3.collectorStyleIds,
    ];
    for (const styleId of styleIds) {
      const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
      if (style === undefined) throw new Error(`Missing style: ${styleId}`);
      const expected = styleId === "chaotic"
        ? "chaos"
        : styleId === "rainbow"
          ? "mixed"
          : "matched";
      expect(varietyFromRecipe(style.recipe, styleId === "chaotic")).toBe(
        expected,
      );
    }
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
  it("patches only color semantics and preserves weighted texture values", () => {
    const metal = {
      family: "metal",
      metal: "steel",
      finish: "brushed",
      patinaStrength: 42,
      textureScale: 137,
    } as const satisfies AppearanceMaterialV4;
    const wood = {
      family: "wood",
      wood: "walnut",
      finish: "polished",
      grainDensity: 71,
      textureScale: 163,
    } as const satisfies AppearanceMaterialV4;
    const recipe = {
      ...recipeWithMaterial({
        mode: "weighted",
        options: [
          { value: metal, weight: 700 },
          { value: wood, weight: 300 },
        ],
      }),
      randomization: "full-spectrum-v2" as const,
    };
    const colors = {
      mode: "palette" as const,
      colors: ["#e40303", "#ff8c00", "#ffed00", "#008026"],
    };

    const next = applyColorScheme(recipe, colors, "coordinated");
    expect(next.colors).toEqual(colors);
    expect(next.colorDistribution).toBe("coordinated");
    expect(next.material).toEqual(recipe.material);
    expect(next.randomization).toBe("full-spectrum-v2");
    expect(next.form).toEqual(recipe.form);
    expect(next.font).toEqual(recipe.font);
    expect(next.engraving).toEqual(recipe.engraving);
    expect(next.gradient).toEqual(recipe.gradient);
    expect(next.lighting).toEqual(recipe.lighting);
  });

  it("treats Classic solid and gradient as color presentation", () => {
    const classic = {
      family: "classic",
      treatment: "solid",
      opacity: "translucent",
      finish: "gloss",
      textureScale: 137,
    } as const satisfies AppearanceMaterialV4;
    const recipe = recipeWithMaterial({ mode: "fixed", value: classic });
    const colors = {
      mode: "palette" as const,
      colors: ["#e40303", "#ff8c00", "#ffed00"],
    };

    const next = applyColorScheme(recipe, colors, "coordinated");
    expect(next.material).toEqual({
      mode: "fixed",
      value: { ...classic, treatment: "gradient" },
    });
  });

  it("replaces one compatible texture without changing siblings or weights", () => {
    const recipe = recipeWithMaterial({
      mode: "weighted",
      options: [
        { value: materialValue("metal"), weight: 700 },
        { value: materialValue("wood"), weight: 300 },
      ],
    });
    const replacement = materialValue("tuned-metal");
    expect(
      replaceMaterialFamily(recipe.material, "metal", replacement),
    ).toEqual({
      mode: "weighted",
      options: [
        { value: replacement, weight: 700 },
        { value: materialValue("wood"), weight: 300 },
      ],
    });
  });

  it("collapses duplicate-family texture variants into one weighted option", () => {
    const selection: AppearanceRecipeV3["material"] = {
      mode: "weighted",
      options: [
        { value: materialValue("metal"), weight: 400 },
        { value: materialValue("metal"), weight: 300 },
        { value: materialValue("wood"), weight: 300 },
      ],
    };
    const replacement = materialValue("tuned-metal");

    expect(replaceMaterialFamily(selection, "metal", replacement)).toEqual({
      mode: "weighted",
      options: [
        { value: replacement, weight: 700 },
        { value: materialValue("wood"), weight: 300 },
      ],
    });
  });

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
