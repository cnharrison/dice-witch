import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_TARGETS_V4,
  APPEARANCE_VARIATIONS_V3,
  APPEARANCE_VARIATION_SCOPES_V3,
  CLASSIC_FINISHES_V4,
  canonicalJsonV4,
  CLASSIC_OPACITIES_V4,
  CLASSIC_TREATMENTS_V4,
  ENGRAVING_FINISHES_V4,
  FANTASY_ESSENCES_V4,
  FANTASY_FINISHES_V4,
  FONT_IDS_V4,
  GEMSTONE_FINISHES_V4,
  GEMSTONE_STYLES_V4,
  GLASS_FINISHES_V4,
  GLASS_STYLES_V4,
  GRADIENT_SCOPES_V4,
  HOLLOW_METAL_CONSTRUCTIONS_V4,
  LIGHTING_DIRECTIONS_V4,
  LIGHTING_MODES_V4,
  LIGHTING_STRENGTHS_V4,
  LINEAR_DIRECTIONS_V4,
  LIQUID_CORE_STYLES_V4,
  MATERIAL_FAMILIES_V4,
  METALS_V4,
  METAL_FINISHES_V4,
  PATTERN_IDS_V4,
  RESIN_FINISHES_V4,
  RESIN_INCLUSIONS_V4,
  SHARP_RESIN_STYLES_V4,
  STONE_FINISHES_V4,
  STONE_STYLES_V4,
  WOOD_FINISHES_V4,
  WOOD_STYLES_V4,
  parseAppearanceMaterialV4,
  parseAppearanceRecipeV3,
  type AppearanceMaterialV4,
} from "@dice-witch/dice-v4-model";
import { APPEARANCE_FONT_IDS } from "../../packages/dice-svg/src/types";
import {
  APPEARANCE_CATALOG_V1,
  APPEARANCE_CATALOG_V2,
  APPEARANCE_CATALOG_V3,
  APPEARANCE_VALIDATION_CATALOG,
  APPEARANCE_VALIDATION_CATALOG_V3,
  APPROVED_COLLECTOR_STYLE_IDS_V3,
  BUILTIN_APPEARANCE_RECIPES,
  BUILTIN_APPEARANCE_RECIPES_V2,
  BUILTIN_APPEARANCE_RECIPES_V3,
  BUILTIN_APPEARANCE_STYLES_V3,
  CHAOTIC_APPEARANCE_STYLE_ID,
  FEATURED_APPEARANCE_PATTERN_IDS,
  FEATURED_APPEARANCE_STYLE_IDS,
  parseAppearanceProfile,
  parseAppearanceRecipeV2,
  RANDOM_SPECIAL_MATERIALS_V3,
  resolveAppearanceRecipe,
  resolveAppearanceRecipeV2,
  type AppearanceCatalogOptionV3,
  type AppearanceMaterialCatalogV3,
} from "../../packages/dice-appearance/src";

function optionIds<Id extends string>(
  options: readonly AppearanceCatalogOptionV3<Id>[],
): Id[] {
  return options.map(({ id }) => id);
}

function materialCatalog<
  Family extends AppearanceMaterialCatalogV3["family"],
>(family: Family): Extract<AppearanceMaterialCatalogV3, { family: Family }> {
  const material = APPEARANCE_CATALOG_V3.materials.find(
    (candidate) => candidate.family === family,
  );
  if (material === undefined) {
    throw new Error(`Appearance material ${family} is missing`);
  }
  return material as Extract<
    AppearanceMaterialCatalogV3,
    { family: Family }
  >;
}

describe("built-in appearance catalog", () => {
  it("preserves 26 uniquely identified public V1 styles", () => {
    expect(APPEARANCE_CATALOG_V1.version).toBe(1);
    expect(APPEARANCE_CATALOG_V1.styles).toHaveLength(26);
    const ids = APPEARANCE_CATALOG_V1.styles.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(CHAOTIC_APPEARANCE_STYLE_ID);
    expect(Object.keys(BUILTIN_APPEARANCE_RECIPES)).toEqual(
      expect.arrayContaining(ids),
    );
  });

  it("publishes native V2 built-ins without replacing the V1 catalog", () => {
    expect(APPEARANCE_CATALOG_V1.version).toBe(1);
    expect(APPEARANCE_CATALOG_V2.version).toBe(2);
    expect(APPEARANCE_CATALOG_V2.defaultStyleId).toBe(
      CHAOTIC_APPEARANCE_STYLE_ID,
    );
    expect(APPEARANCE_CATALOG_V2.styles.map(({ id }) => id)).toEqual([
      ...APPEARANCE_CATALOG_V1.styles.map(({ id }) => id),
      "dice-witch",
      "pride",
      "trans",
    ]);
    expect(Object.keys(BUILTIN_APPEARANCE_RECIPES_V2).sort()).toEqual(
      Object.keys(BUILTIN_APPEARANCE_RECIPES).sort(),
    );

    for (const style of APPEARANCE_CATALOG_V2.styles) {
      expect(style.recipe).toMatchObject({
        version: 2,
        compatibility: "native-v2",
        gradient: {
          colorSource: "full-palette",
          scope: { mode: "fixed", value: "die-wide" },
          direction: { mode: "fixed" },
        },
        lighting: {
          mode: { mode: "fixed" },
          strength: { mode: "fixed", value: "gentle" },
          direction: { mode: "fixed", value: "upper-left" },
        },
      });
      expect(
        parseAppearanceRecipeV2(
          style.recipe,
          APPEARANCE_VALIDATION_CATALOG,
        ),
      ).toEqual(style.recipe);
    }
    expect(
      new Set(
        APPEARANCE_CATALOG_V1.styles.map(({ recipe }) => recipe.version),
      ),
    ).toEqual(new Set([1]));
  });

  it("keeps the Dice Witch theme tonal from hot pink in every current catalog", () => {
    for (const catalog of [APPEARANCE_CATALOG_V2, APPEARANCE_CATALOG_V3]) {
      expect(
        catalog.styles.find(({ id }) => id === "dice-witch")?.recipe.colors,
      ).toEqual({ mode: "tonal", primary: "#ff00ff" });
    }
  });

  it("publishes target-complete V3 built-ins and approved collectors", () => {
    const v2Ids = APPEARANCE_CATALOG_V2.styles.map(({ id }) => id);
    const v3Ids = BUILTIN_APPEARANCE_STYLES_V3.map(({ id }) => id);
    expect(v3Ids.slice(0, v2Ids.length)).toEqual(v2Ids);
    expect(v3Ids.slice(v2Ids.length)).toEqual([
      "solid",
      "rainbow",
      ...APPROVED_COLLECTOR_STYLE_IDS_V3,
    ]);
    expect(new Set(v3Ids).size).toBe(v3Ids.length);
    expect(APPEARANCE_VALIDATION_CATALOG_V3.builtinStyleIds).toEqual(v3Ids);
    expect(Object.keys(BUILTIN_APPEARANCE_RECIPES_V3)).toEqual(v3Ids);

    for (const style of BUILTIN_APPEARANCE_STYLES_V3) {
      expect(parseAppearanceRecipeV3(style.recipe)).toEqual(style.recipe);
      for (const recipe of Object.values(style.overrides ?? {})) {
        expect(parseAppearanceRecipeV3(recipe)).toEqual(recipe);
      }
    }
  });

  it("publishes the cherry Solid, per-die Rainbow, and staging Dice Witch Alt recipes", () => {
    const solid = BUILTIN_APPEARANCE_RECIPES_V3.solid?.recipe;
    expect(solid).toMatchObject({
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "solid", primary: "#d2042d" },
      material: {
        mode: "fixed",
        value: {
          family: "classic",
          treatment: "solid",
          opacity: "opaque",
          finish: "satin",
        },
      },
      font: { mode: "fixed", value: "liberation-sans" },
    });

    const rainbow = BUILTIN_APPEARANCE_RECIPES_V3.rainbow?.recipe;
    expect(rainbow).toMatchObject({
      variation: "wild",
      varyBy: "die",
      randomization: "one-palette-color-v1",
      colors: {
        mode: "palette",
        colors: [
          "#d7263d",
          "#f46036",
          "#f9c80e",
          "#2e933c",
          "#3366cc",
          "#8a4fff",
        ],
      },
      material: {
        mode: "fixed",
        value: { family: "classic", treatment: "solid", finish: "gloss" },
      },
      font: { mode: "fixed", value: "liberation-sans" },
    });

    const diceWitch = BUILTIN_APPEARANCE_RECIPES_V3["dice-witch"]?.recipe;
    expect(diceWitch).toMatchObject({
      colors: { mode: "tonal", primary: "#ff00ff" },
      material: {
        mode: "fixed",
        value: {
          family: "sharp-resin",
          style: "clear",
          inclusion: "mylar",
          clarity: 84,
          inclusionDensity: 24,
          finish: "polished",
        },
      },
      form: { policy: "material-default-v1" },
      font: { mode: "fixed", value: "new-rocker" },
      engraving: { mode: "fixed", value: "luminous" },
    });
    expect(
      createHash("sha256").update(canonicalJsonV4(diceWitch)).digest("hex"),
    ).toBe("8766791af34f4e44b47ab1998c349e398d77e9b57d36a27b87ffdd3f0367abea");
  });

  it("pins Random V2 to the approved solid-first material recipe", () => {
    const random = BUILTIN_APPEARANCE_RECIPES_V3[CHAOTIC_APPEARANCE_STYLE_ID]
      ?.recipe;
    if (random === undefined || random.material.mode !== "weighted") {
      throw new Error("Random V3 weighted material recipe is missing");
    }
    expect(random.randomization).toBe("full-spectrum-v2");
    expect(random.material.options).toHaveLength(18);
    expect(
      random.material.options.reduce((total, option) => total + option.weight, 0),
    ).toBe(1_500);

    const solid = random.material.options.find(
      ({ value }) =>
        value.family === "classic" && value.treatment === "solid",
    );
    expect(solid?.weight).toBe(900);
    const gradient = random.material.options.find(
      ({ value }) =>
        value.family === "classic" && value.treatment === "gradient",
    );
    expect(gradient?.weight).toBe(240);
    const patterns = random.material.options.filter(
      ({ value }) =>
        value.family === "classic" && value.treatment === "pattern",
    );
    expect(patterns).toHaveLength(10);
    expect(patterns.map(({ value }) =>
      value.family === "classic" && value.treatment === "pattern"
        ? value.patternId
        : null,
    )).toEqual(PATTERN_IDS_V4);
    expect(patterns.every(({ weight }) => weight === 21)).toBe(true);

    const specials = random.material.options.filter(
      ({ value }) => value.family !== "classic",
    );
    expect(specials.map(({ value }) => value)).toEqual(
      RANDOM_SPECIAL_MATERIALS_V3.map(({ material }) => material),
    );
    expect(specials.every(({ weight }) => weight === 25)).toBe(true);

    expect(random.engraving).toEqual({
      mode: "weighted",
      options: ENGRAVING_FINISHES_V4.map((value) => ({ value, weight: 1 })),
    });
    expect(random.gradient.direction).toEqual({
      mode: "weighted",
      options: LINEAR_DIRECTIONS_V4.map((value) => ({
        value,
        weight: value.includes("upper-") || value.includes("lower-") ? 2 : 1,
      })),
    });
  });

  it("publishes a complete V3 editor catalog without inferred bounds", () => {
    expect(APPEARANCE_CATALOG_V3).toMatchObject({
      version: 3,
      defaultStyleId: CHAOTIC_APPEARANCE_STYLE_ID,
      editorDefaults: {
        primaryColor: "#8a1f82",
        palette: [
          "#8a1f82",
          "#04c9df",
          "#f3d36a",
          "#d7263d",
          "#2e933c",
          "#8a4fff",
        ],
        patternId: "checkerboard",
      },
      bounds: {
        paletteColors: { minimum: 2, maximum: 6 },
        percentage: { minimum: 0, maximum: 100, step: 1 },
        textureScale: { minimum: 25, maximum: 400, step: 1 },
        selectionWeight: { minimum: 1, maximum: 1_000, step: 1 },
        maximumTotalSelectionWeight: 10_000,
        maximumMaterialOptions: 25,
        maximumDesigns: 10,
        maximumDesignNameCharacters: 50,
        maximumProfileJsonCharacters: 65_536,
      },
    });
    expect(APPEARANCE_CATALOG_V3.featuredStyleIds).toEqual(
      FEATURED_APPEARANCE_STYLE_IDS,
    );
    expect(APPEARANCE_CATALOG_V3.collectorStyleIds).toEqual(
      APPROVED_COLLECTOR_STYLE_IDS_V3,
    );
    expect(APPEARANCE_CATALOG_V3.featuredPatternIds).toEqual(
      FEATURED_APPEARANCE_PATTERN_IDS,
    );
    expect(APPEARANCE_CATALOG_V3.styles).toEqual(
      BUILTIN_APPEARANCE_STYLES_V3,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.targets)).toEqual(
      APPEARANCE_TARGETS_V4,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.patterns)).toEqual(PATTERN_IDS_V4);
    expect(optionIds(APPEARANCE_CATALOG_V3.fonts)).toEqual(FONT_IDS_V4);
    expect(optionIds(APPEARANCE_CATALOG_V3.engravingFinishes)).toEqual(
      ENGRAVING_FINISHES_V4,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.variations)).toEqual(
      APPEARANCE_VARIATIONS_V3,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.variationScopes)).toEqual(
      APPEARANCE_VARIATION_SCOPES_V3,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.colorModes)).toEqual([
      "solid",
      "tonal",
      "random",
      "palette",
      "random-pair",
      "vivid-random-pair",
    ]);
    expect(optionIds(APPEARANCE_CATALOG_V3.selectionModes)).toEqual([
      "fixed",
      "allowlist",
      "weighted",
    ]);
    expect(optionIds(APPEARANCE_CATALOG_V3.gradient.scopes)).toEqual(
      GRADIENT_SCOPES_V4,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.gradient.directions)).toEqual(
      LINEAR_DIRECTIONS_V4,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.lighting.modes)).toEqual(
      LIGHTING_MODES_V4,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.lighting.strengths)).toEqual(
      LIGHTING_STRENGTHS_V4,
    );
    expect(optionIds(APPEARANCE_CATALOG_V3.lighting.directions)).toEqual(
      LIGHTING_DIRECTIONS_V4,
    );
    expect(APPEARANCE_CATALOG_V3.materials.map(({ family }) => family)).toEqual(
      MATERIAL_FAMILIES_V4,
    );
    for (const material of APPEARANCE_CATALOG_V3.materials) {
      expect(parseAppearanceMaterialV4(material.defaultValue)).toEqual(
        material.defaultValue,
      );
      expect(material.defaultValue.family).toBe(material.family);
    }

    const classic = materialCatalog("classic");
    expect(optionIds(classic.treatments)).toEqual(CLASSIC_TREATMENTS_V4);
    expect(optionIds(classic.opacities)).toEqual(CLASSIC_OPACITIES_V4);
    expect(optionIds(classic.finishes)).toEqual(CLASSIC_FINISHES_V4);
    const sharpResin = materialCatalog("sharp-resin");
    expect(optionIds(sharpResin.styles)).toEqual(SHARP_RESIN_STYLES_V4);
    expect(optionIds(sharpResin.inclusions)).toEqual(RESIN_INCLUSIONS_V4);
    expect(optionIds(sharpResin.finishes)).toEqual(RESIN_FINISHES_V4);
    const liquidCore = materialCatalog("liquid-core");
    expect(optionIds(liquidCore.cores)).toEqual(LIQUID_CORE_STYLES_V4);
    expect(optionIds(liquidCore.finishes)).toEqual(RESIN_FINISHES_V4);
    const gemstone = materialCatalog("gemstone");
    expect(optionIds(gemstone.stones)).toEqual(GEMSTONE_STYLES_V4);
    expect(optionIds(gemstone.finishes)).toEqual(GEMSTONE_FINISHES_V4);
    const glass = materialCatalog("glass");
    expect(optionIds(glass.styles)).toEqual(GLASS_STYLES_V4);
    expect(optionIds(glass.finishes)).toEqual(GLASS_FINISHES_V4);
    const stone = materialCatalog("stone");
    expect(optionIds(stone.stones)).toEqual(STONE_STYLES_V4);
    expect(optionIds(stone.finishes)).toEqual(STONE_FINISHES_V4);
    const metal = materialCatalog("metal");
    expect(optionIds(metal.metals)).toEqual(METALS_V4);
    expect(optionIds(metal.finishes)).toEqual(METAL_FINISHES_V4);
    const hollowMetal = materialCatalog("hollow-metal");
    expect(optionIds(hollowMetal.constructions)).toEqual(
      HOLLOW_METAL_CONSTRUCTIONS_V4,
    );
    expect(optionIds(hollowMetal.metals)).toEqual(METALS_V4);
    expect(optionIds(hollowMetal.finishes)).toEqual(METAL_FINISHES_V4);
    const wood = materialCatalog("wood");
    expect(optionIds(wood.woods)).toEqual(WOOD_STYLES_V4);
    expect(optionIds(wood.finishes)).toEqual(WOOD_FINISHES_V4);
    const fantasy = materialCatalog("fantasy");
    expect(optionIds(fantasy.essences)).toEqual(FANTASY_ESSENCES_V4);
    expect(optionIds(fantasy.finishes)).toEqual(FANTASY_FINISHES_V4);

    expect(APPEARANCE_CATALOG_V3.forms).toEqual([
      expect.objectContaining({
        id: "standard",
        targets: [
          "d4",
          "d6",
          "d8",
          "d10",
          "d12",
          "d20",
          "percentile",
          "fudge",
        ],
      }),
      expect.objectContaining({ id: "sharp", targets: ["d20"] }),
      expect.objectContaining({
        id: "crystal-cut",
        targets: [
          "d4",
          "d6",
          "d8",
          "d10",
          "d12",
          "d20",
          "percentile",
          "fudge",
        ],
      }),
      expect.objectContaining({
        id: "hollow-cage",
        targets: [
          "d4",
          "d6",
          "d8",
          "d10",
          "d12",
          "d20",
          "percentile",
          "fudge",
        ],
      }),
      expect.objectContaining({ id: "sphere", targets: ["other"] }),
    ]);
    const formsById = new Map(
      APPEARANCE_CATALOG_V3.forms.map((form) => [form.id, form]),
    );
    const solidFamilies = MATERIAL_FAMILIES_V4.filter(
      (family) => family !== "hollow-metal",
    );
    expect(formsById.get("standard")?.materialFamilies).toEqual(solidFamilies);
    expect(formsById.get("sharp")?.materialFamilies).toEqual(solidFamilies);
    expect(formsById.get("crystal-cut")?.materialFamilies).toEqual([
      "sharp-resin",
      "gemstone",
      "glass",
      "fantasy",
    ]);
    expect(formsById.get("hollow-cage")?.materialFamilies).toEqual([
      "hollow-metal",
    ]);
    expect(formsById.get("sphere")?.materialFamilies).toEqual(
      MATERIAL_FAMILIES_V4,
    );
  });

  it("gives V3 Random explicit 60% solid and retained font weights", () => {
    const random = BUILTIN_APPEARANCE_RECIPES_V3.chaotic?.recipe;
    if (
      random === undefined ||
      random.material.mode !== "weighted" ||
      random.font.mode !== "weighted"
    ) {
      throw new Error("V3 Random weighted selections are missing");
    }
    expect(random.colors).toEqual({ mode: "vivid-random-pair" });
    expect(random.variation).toBe("wild");
    expect(random.varyBy).toBe("die");

    const materialWeight = (family: AppearanceMaterialV4["family"]): number =>
      random.material.mode === "weighted"
        ? random.material.options
            .filter(({ value }) => value.family === family)
            .reduce((total, { weight }) => total + weight, 0)
        : 0;
    expect(materialWeight("classic")).toBe(1_350);
    expect(
      random.material.options
        .filter(({ value }) => value.family !== "classic")
        .reduce((total, { weight }) => total + weight, 0),
    ).toBe(150);
    expect(
      random.material.options.reduce(
        (total, { weight }) => total + weight,
        0,
      ),
    ).toBe(1_500);
    expect(
      new Set(
        random.material.options.flatMap(({ value }) =>
          value.family === "classic" && "patternId" in value
            ? [value.patternId]
            : [],
        ),
      ),
    ).toEqual(new Set(PATTERN_IDS_V4));

    const liberation = random.font.options.find(
      ({ value }) => value === "liberation-sans",
    );
    expect(liberation?.weight).toBe(700);
    expect(
      random.font.options.reduce((total, { weight }) => total + weight, 0),
    ).toBe(1_000);
  });

  it("freezes approved collector identities and all-target special forms", () => {
    const byId = new Map(
      BUILTIN_APPEARANCE_STYLES_V3.map((style) => [style.id, style]),
    );
    expect(
      APPROVED_COLLECTOR_STYLE_IDS_V3.map((id) => byId.get(id)?.name),
    ).toEqual([
      "Nacreous Resin",
      "Vortical Core",
      "Prismatic Glass",
      "Striated Steel",
      "Brass Filigree",
      "Figured Walnut",
    ]);

    const fixedMaterial = (id: string): AppearanceMaterialV4 => {
      const material = byId.get(id)?.recipe.material;
      if (material?.mode !== "fixed") {
        throw new Error(`Collector ${id} material is not fixed`);
      }
      return material.value;
    };
    expect(fixedMaterial("hex-appeal")).toMatchObject({
      family: "sharp-resin",
      clarity: 84,
      inclusionDensity: 34,
    });
    expect(fixedMaterial("critical-mass")).toMatchObject({
      family: "liquid-core",
      clarity: 78,
      particleDensity: 42,
    });
    expect(fixedMaterial("glass-cannon")).toMatchObject({
      family: "glass",
      clarity: 88,
    });
    expect(fixedMaterial("heavy-metal")).toMatchObject({
      family: "metal",
      metal: "steel",
    });
    expect(fixedMaterial("grain-expectations")).toMatchObject({
      family: "wood",
      wood: "walnut",
      grainDensity: 64,
    });

    expect(byId.get("hex-appeal")?.recipe.form.polyhedral).toEqual({
      mode: "fixed",
      value: "crystal-cut",
    });
    expect(byId.get("glass-cannon")?.recipe.form.polyhedral).toEqual({
      mode: "fixed",
      value: "crystal-cut",
    });
    expect(byId.get("hollow-victory")?.recipe.form.polyhedral).toEqual({
      mode: "fixed",
      value: "hollow-cage",
    });
    expect(fixedMaterial("hollow-victory")).toMatchObject({
      family: "hollow-metal",
      metal: "brass",
    });
  });

  it("publishes eight embedded renderer fonts", () => {
    expect(APPEARANCE_CATALOG_V1.fonts).toEqual([
      { id: "liberation-sans", name: "Liberation Sans" },
      { id: "new-rocker", name: "New Rocker" },
      { id: "stencil-ops", name: "Stencil Ops" },
      { id: "creeping-horror", name: "Creeping Horror" },
      { id: "special-elite", name: "Special Elite" },
      { id: "luckiest-guy", name: "Luckiest Guy" },
      { id: "fontdiner-swanky", name: "Fontdiner Swanky" },
      { id: "syncopate", name: "Syncopate" },
    ]);
    expect(APPEARANCE_CATALOG_V1.fonts.map(({ id }) => id)).toEqual(
      APPEARANCE_FONT_IDS,
    );
  });

  it("keeps public style, pattern, and font metadata aligned with validation", () => {
    expect(APPEARANCE_VALIDATION_CATALOG.builtinStyleIds).toEqual(
      APPEARANCE_CATALOG_V2.styles.map(({ id }) => id),
    );
    expect(APPEARANCE_VALIDATION_CATALOG.patternIds).toEqual(
      APPEARANCE_CATALOG_V1.patterns.map(({ id }) => id),
    );
    expect(APPEARANCE_VALIDATION_CATALOG.fontIds).toEqual(
      APPEARANCE_CATALOG_V1.fonts.map(({ id }) => id),
    );
  });

  it("validates every built-in recipe and assignment through the public contract", () => {
    const designId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";
    for (const style of APPEARANCE_CATALOG_V1.styles) {
      const profile = parseAppearanceProfile(
        {
          version: 1,
          designs: [{ id: designId, name: style.name, recipe: style.recipe }],
          assignments: {
            all: { source: "builtin", id: style.id },
            overrides: { d20: { source: "custom", id: designId } },
          },
        },
        APPEARANCE_VALIDATION_CATALOG,
      );
      expect(profile.assignments.all).toEqual({
        source: "builtin",
        id: style.id,
      });
      expect(profile.designs[0]?.recipe).toEqual(style.recipe);
    }
  });

  it("resolves every built-in to supported renderer assets", () => {
    const fonts = new Set(APPEARANCE_VALIDATION_CATALOG.fontIds);
    const patterns = new Set(APPEARANCE_VALIDATION_CATALOG.patternIds);
    for (const [index, style] of APPEARANCE_CATALOG_V1.styles.entries()) {
      const resolved = resolveAppearanceRecipe(style.recipe, {
        renderSeed: 0xa5a5_0000 + index,
        target: "d20",
        groupIndex: 0,
        dieIndex: index,
      });
      expect(fonts.has(resolved.fontId)).toBe(true);
      if (resolved.fill.type === "pattern") {
        expect(patterns.has(resolved.fill.patternId)).toBe(true);
      }
    }
  });

  it("publishes the featured presets and preserves V2 fixed themes", () => {
    expect(FEATURED_APPEARANCE_STYLE_IDS).toEqual([
      "dice-witch",
      "solid",
      "rainbow",
      "pride",
      "trans",
      "crimson-palette",
      "amber-palette",
      "verdant-palette",
      "azure-palette",
      "monochrome-palette",
      "chaotic",
    ]);
    expect(FEATURED_APPEARANCE_PATTERN_IDS).toEqual([
      "checkerboard",
      "dots",
      "stripes",
      "triangles",
      "crosshatch",
    ]);
    const v2FeaturedIds = FEATURED_APPEARANCE_STYLE_IDS.filter(
      (id) => id !== "solid" && id !== "rainbow",
    );
    const featured = v2FeaturedIds.map((id) => {
      const style = APPEARANCE_CATALOG_V2.styles.find(
        (candidate) => candidate.id === id,
      );
      if (style === undefined) throw new Error(`Featured style ${id} is missing`);
      return style;
    });
    expect(featured.map(({ name }) => name)).toEqual([
      "Dice Witch",
      "Pride",
      "Trans",
      "Ember",
      "Gold",
      "Verdant",
      "Ocean",
      "Monochrome",
      "Random",
    ]);

    const resolved = featured.map(({ recipe }) =>
      resolveAppearanceRecipeV2(recipe, {
        renderSeed: 0x1234_5678,
        target: "d20",
        groupIndex: 0,
        dieIndex: 0,
      }),
    );
    const [
      diceWitch,
      pride,
      trans,
      ember,
      gold,
      verdant,
      ocean,
      monochrome,
      random,
    ] = resolved;
    expect(diceWitch).toMatchObject({
      surface: { type: "solid", color: "#ff00ff" },
      textColor: "#111111",
      fontId: "new-rocker",
    });
    expect(pride).toMatchObject({
      surface: {
        type: "gradient",
        colors: [
          "#d7263d",
          "#f46036",
          "#f9c80e",
          "#2e933c",
          "#3366cc",
          "#8a4fff",
        ],
        scope: "die-wide",
        direction: "top-to-bottom",
      },
      fontId: "liberation-sans",
    });
    expect(BUILTIN_APPEARANCE_RECIPES.pride?.font).toEqual({
      mode: "fixed",
      fontId: "new-rocker",
    });
    expect(trans).toMatchObject({
      surface: {
        type: "gradient",
        colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
        scope: "die-wide",
        direction: "top-to-bottom",
      },
      lighting: { mode: "none" },
      fontId: "liberation-sans",
    });
    expect(ember).toMatchObject({
      surface: {
        type: "gradient",
        colors: ["#4a0b0b", "#c62828", "#ff7a1a"],
        scope: "die-wide",
        direction: "top-to-bottom",
      },
      lighting: { mode: "none" },
      fontId: "special-elite",
    });
    expect(gold).toMatchObject({
      surface: { type: "solid", color: "#d6a514" },
      lighting: { mode: "none" },
      fontId: "stencil-ops",
    });
    expect(verdant).toMatchObject({
      surface: {
        type: "pattern",
        patternId: "crosshatch",
        primaryColor: "#0b3d2e",
        secondaryColor: "#6ecb63",
      },
      lighting: { mode: "none" },
      fontId: "liberation-sans",
    });
    expect(ocean).toMatchObject({
      surface: {
        type: "gradient",
        colors: ["#041b3d", "#006da8", "#34d1bf"],
        scope: "die-wide",
        direction: "upper-left-to-lower-right",
      },
      lighting: { mode: "none" },
      fontId: "syncopate",
    });
    expect(monochrome).toMatchObject({
      surface: {
        type: "pattern",
        patternId: "checkerboard",
        primaryColor: "#20242a",
        secondaryColor: "#edf2f7",
      },
      lighting: { mode: "none" },
      fontId: "liberation-sans",
    });
    expect(random?.surface.type).not.toBe("solid");

    for (const [index, style] of featured.slice(3, 8).entries()) {
      expect(style.recipe.variation).toBe("fixed");
      expect(
        resolveAppearanceRecipeV2(style.recipe, {
          renderSeed: 0xffff_0000,
          target: "d6",
          groupIndex: 4,
          dieIndex: index + 10,
        }),
      ).toEqual(resolved[index + 3]);
    }
  });

  it("gives native Random bounded 60/40 material and legacy font totals", () => {
    const random =
      BUILTIN_APPEARANCE_RECIPES_V2[CHAOTIC_APPEARANCE_STYLE_ID];
    if (random === undefined) throw new Error("V2 Random fixture is missing");

    expect(random.colors).toEqual({ mode: "vivid-random-pair" });
    expect(random.fill).toEqual({
      mode: "weighted",
      options: [
        { value: { type: "gradient" }, weight: 600 },
        ...FEATURED_APPEARANCE_PATTERN_IDS.map((patternId) => ({
          value: { type: "pattern" as const, patternId },
          weight: 80,
        })),
      ],
    });
    expect(random.font).toEqual({
      mode: "weighted",
      options: APPEARANCE_CATALOG_V2.fonts.map(({ id }) => ({
        fontId: id,
        weight: id === "liberation-sans" ? 490 : 30,
      })),
    });
    if (random.fill.mode !== "weighted" || random.font.mode !== "weighted") {
      throw new Error("V2 Random weighted selections are missing");
    }
    expect(
      random.fill.options.reduce((total, { weight }) => total + weight, 0),
    ).toBe(1_000);
    expect(
      random.font.options.reduce((total, { weight }) => total + weight, 0),
    ).toBe(700);
  });

  it("gives Random broad per-die pairs and only curated patterns", () => {
    const random = BUILTIN_APPEARANCE_RECIPES_V2[CHAOTIC_APPEARANCE_STYLE_ID];
    if (random === undefined) throw new Error("V2 Random fixture is missing");
    const sample = Array.from({ length: 1_000 }, (_, dieIndex) =>
      resolveAppearanceRecipeV2(random, {
        renderSeed: 0x5eed_0001,
        target: "d20",
        groupIndex: 0,
        dieIndex,
      }),
    );
    const gradients = sample.filter(({ surface }) => surface.type === "gradient");
    expect(gradients.length / sample.length).toBeGreaterThan(0.56);
    expect(gradients.length / sample.length).toBeLessThan(0.64);
    expect(
      new Set(
        sample.flatMap(({ surface }) =>
          surface.type === "pattern" ? [surface.patternId] : [],
        ),
      ),
    ).toEqual(new Set(FEATURED_APPEARANCE_PATTERN_IDS));
    const colorPairs = sample.map(({ surface }) =>
      surface.type === "solid"
        ? surface.color
        : surface.type === "gradient"
          ? surface.colors.join(":")
          : `${surface.primaryColor}:${surface.secondaryColor}`,
    );
    expect(new Set(colorPairs).size).toBeGreaterThan(950);
  });

  it("makes Chaotic vary independently with legacy-weighted surfaces and typography", () => {
    const chaotic = BUILTIN_APPEARANCE_RECIPES[CHAOTIC_APPEARANCE_STYLE_ID];
    expect(chaotic).toBeDefined();
    if (chaotic === undefined) throw new Error("Chaotic fixture is missing");
    expect(chaotic.variation).toBe("wild");
    expect(chaotic.varyBy).toBe("die");
    expect(chaotic.fill).toEqual({
      mode: "weighted",
      options: [
        { value: { type: "gradient" }, weight: 600 },
        ...APPEARANCE_CATALOG_V1.patterns.map(({ id }) => ({
          value: { type: "pattern" as const, patternId: id },
          weight: 40,
        })),
      ],
    });
    expect(chaotic.font).toEqual({
      mode: "weighted",
      options: APPEARANCE_CATALOG_V1.fonts.map(({ id }) => ({
        fontId: id,
        weight: id === "liberation-sans" ? 490 : 30,
      })),
    });

    const first = resolveAppearanceRecipe(chaotic, {
      renderSeed: 0x1234_5678,
      target: "d6",
      groupIndex: 0,
      dieIndex: 0,
    });
    const second = resolveAppearanceRecipe(chaotic, {
      renderSeed: 0x1234_5678,
      target: "d6",
      groupIndex: 0,
      dieIndex: 1,
    });
    expect(second).not.toEqual(first);
  });

  it("keeps Chaotic close to 60% gradients and 70% base typography", () => {
    const chaotic = BUILTIN_APPEARANCE_RECIPES[CHAOTIC_APPEARANCE_STYLE_ID];
    if (chaotic === undefined) throw new Error("Chaotic fixture is missing");
    const sample = Array.from({ length: 10_000 }, (_, dieIndex) =>
      resolveAppearanceRecipe(chaotic, {
        renderSeed: 0x5eed_0001,
        target: "d20",
        groupIndex: 0,
        dieIndex,
      }),
    );
    const gradientRatio =
      sample.filter(({ fill }) => fill.type === "gradient").length /
      sample.length;
    const baseFontRatio =
      sample.filter(({ fontId }) => fontId === "liberation-sans").length /
      sample.length;

    expect(gradientRatio).toBeGreaterThan(0.58);
    expect(gradientRatio).toBeLessThan(0.62);
    expect(baseFontRatio).toBeGreaterThan(0.68);
    expect(baseFontRatio).toBeLessThan(0.72);
    expect(new Set(sample.map(({ fontId }) => fontId))).toEqual(
      new Set(APPEARANCE_VALIDATION_CATALOG.fontIds),
    );
    expect(
      new Set(
        sample.flatMap(({ fill }) =>
          fill.type === "pattern" ? [fill.patternId] : [],
        ),
      ),
    ).toEqual(new Set(APPEARANCE_VALIDATION_CATALOG.patternIds));
  });
});
