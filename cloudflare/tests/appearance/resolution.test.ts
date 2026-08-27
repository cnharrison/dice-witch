import {
  FANTASY_ESSENCE_PALETTES_R33_V4,
  FANTASY_ESSENCES_V4,
  getAuthoredRenderViewV4,
  validateRenderRequestV4,
  type AppearanceMaterialV4,
  type AppearanceRecipeV3,
  type RenderDieV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import {
  APPEARANCE_CATALOG_V3,
  APPEARANCE_TARGETS,
  BUILTIN_APPEARANCE_STYLES_R34_V3,
  BUILTIN_APPEARANCE_STYLES_V3,
  CHAOTIC_APPEARANCE_STYLE_ID,
  MINIMUM_APPEARANCE_CONTRAST,
  RANDOM_SPECIAL_MATERIALS_V3,
  R32_MATERIAL_PALETTES_V3,
  R32_RANDOM_FONT_OPTIONS_V3,
  migrateAppearanceRecipeV1,
  resolveAppearanceInkV2,
  resolveAppearanceOutlineColorR40V3,
  resolveAppearanceOutlineColorR41V3,
  resolveAppearanceRecipe,
  resolveAppearanceRecipeV2,
  resolveAppearanceRecipeV3,
  type AppearanceRecipeV1,
  type AppearanceRecipeV2,
  type AppearanceResolutionContext,
  type AppearanceResolutionContextV3,
} from "../../packages/dice-appearance/src";

const paletteRecipe: AppearanceRecipeV1 = {
  version: 1,
  variation: "curated",
  varyBy: "die",
  colors: {
    mode: "palette",
    colors: ["#ff0000", "#00ff00", "#0000ff", "#f2d95c"],
  },
  fill: {
    mode: "allowlist",
    values: [
      { type: "solid" },
      { type: "gradient" },
      { type: "pattern", patternId: "checkerboard" },
    ],
  },
  font: {
    mode: "allowlist",
    fontIds: ["liberation-sans", "new-rocker"],
  },
};

const nativeRecipe: AppearanceRecipeV2 = {
  version: 2,
  compatibility: "native-v2",
  variation: "fixed",
  varyBy: "die",
  colors: {
    mode: "palette",
    colors: ["#ff0000", "#00ff00", "#0000ff", "#f2d95c"],
  },
  fill: { mode: "fixed", value: { type: "gradient" } },
  font: { mode: "fixed", fontId: "liberation-sans" },
  gradient: {
    colorSource: "full-palette",
    scope: { mode: "fixed", value: "die-wide" },
    direction: {
      mode: "fixed",
      value: "upper-left-to-lower-right",
    },
  },
  lighting: {
    mode: { mode: "fixed", value: "combined" },
    strength: { mode: "fixed", value: "subtle" },
    direction: { mode: "fixed", value: "upper-left" },
  },
};

function context(
  overrides: Partial<AppearanceResolutionContext> = {},
): AppearanceResolutionContext {
  return {
    renderSeed: 0x1234_5678,
    target: "d20",
    groupIndex: 0,
    dieIndex: 0,
    ...overrides,
  };
}

function contextV3(
  overrides: Partial<AppearanceResolutionContextV3> = {},
): AppearanceResolutionContextV3 {
  return {
    renderSeed: 0x1234_5678,
    target: "d20",
    groupIndex: 0,
    dieIndex: 0,
    ...overrides,
  };
}

function appearanceRecipeV3(
  overrides: Partial<AppearanceRecipeV3> = {},
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "fixed",
    varyBy: "die",
    colors: {
      mode: "palette",
      colors: ["#170022", "#04c9df", "#f3d36a"],
    },
    material: {
      mode: "fixed",
      value: {
        family: "classic",
        treatment: "gradient",
        opacity: "opaque",
        finish: "satin",
        textureScale: 100,
      },
    },
    form: {
      polyhedral: { mode: "fixed", value: "standard" },
      other: "sphere",
    },
    font: { mode: "fixed", value: "liberation-sans" },
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: { mode: "fixed", value: "repeated" },
      direction: {
        mode: "fixed",
        value: "upper-left-to-lower-right",
      },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "gentle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
    ...overrides,
  };
}

describe("resolveAppearanceRecipe", () => {
  it("keeps Fixed recipes stable across render seeds and positions", () => {
    const recipe: AppearanceRecipeV1 = {
      ...paletteRecipe,
      variation: "fixed",
    };
    const first = resolveAppearanceRecipe(recipe, context());
    const second = resolveAppearanceRecipe(
      recipe,
      context({
        renderSeed: 0xffff_ffff,
        target: "d4",
        groupIndex: 99,
        dieIndex: 99,
      }),
    );

    expect(first).toEqual(second);
    expect(first.primaryColor).toBe("#ff0000");
    expect(first.secondaryColor).toBe("#00ff00");
    expect(first.fill).toEqual({ type: "solid" });
    expect(first.fontId).toBe("liberation-sans");
  });

  it("honors roll, group, and die variation scopes", () => {
    const rollRecipe = { ...paletteRecipe, varyBy: "roll" as const };
    const groupRecipe = { ...paletteRecipe, varyBy: "group" as const };
    const dieRecipe = { ...paletteRecipe, varyBy: "die" as const };

    expect(
      resolveAppearanceRecipe(
        rollRecipe,
        context({ groupIndex: 0, dieIndex: 0 }),
      ),
    ).toEqual(
      resolveAppearanceRecipe(
        rollRecipe,
        context({ groupIndex: 7, dieIndex: 12 }),
      ),
    );
    expect(
      resolveAppearanceRecipe(
        groupRecipe,
        context({ groupIndex: 3, dieIndex: 0 }),
      ),
    ).toEqual(
      resolveAppearanceRecipe(
        groupRecipe,
        context({ groupIndex: 3, dieIndex: 12 }),
      ),
    );

    const groupVariants = new Set(
      Array.from({ length: 8 }, (_, groupIndex) =>
        JSON.stringify(
          resolveAppearanceRecipe(
            groupRecipe,
            context({ groupIndex, dieIndex: 0 }),
          ),
        ),
      ),
    );
    const dieVariants = new Set(
      Array.from({ length: 8 }, (_, dieIndex) =>
        JSON.stringify(
          resolveAppearanceRecipe(
            dieRecipe,
            context({ groupIndex: 0, dieIndex }),
          ),
        ),
      ),
    );
    expect(groupVariants.size).toBeGreaterThan(1);
    expect(dieVariants.size).toBeGreaterThan(1);
  });

  it("keeps a tonal primary and derives a readable partner", () => {
    const recipe: AppearanceRecipeV1 = {
      ...paletteRecipe,
      colors: { mode: "tonal", primary: "#5426a8" },
      fill: { mode: "fixed", value: { type: "gradient" } },
      font: { mode: "fixed", fontId: "new-rocker" },
    };
    const resolved = resolveAppearanceRecipe(recipe, context());

    expect(resolved.primaryColor).toBe("#5426a8");
    expect(resolved.secondaryColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolved.secondaryColor).not.toBe(resolved.primaryColor);
    expect(resolved.fontId).toBe("new-rocker");
  });

  it("uses an adjacent curated palette color and any distinct Wild color", () => {
    const curated = resolveAppearanceRecipe(paletteRecipe, context());
    const wild = resolveAppearanceRecipe(
      { ...paletteRecipe, variation: "wild" },
      context(),
    );
    const colors = paletteRecipe.colors;
    if (colors.mode !== "palette") throw new Error("Fixture must be a palette");
    const curatedPrimary = colors.colors.indexOf(curated.primaryColor);
    const curatedSecondary = colors.colors.indexOf(curated.secondaryColor);

    expect(curatedSecondary).toBe(
      (curatedPrimary + 1) % colors.colors.length,
    );
    expect(wild.secondaryColor).not.toBe(wild.primaryColor);
    expect(colors.colors).toContain(wild.primaryColor);
    expect(colors.colors).toContain(wild.secondaryColor);
  });

  it("selects readable ink from the complete resolved surface", () => {
    const bright = resolveAppearanceRecipe(
      {
        ...paletteRecipe,
        variation: "fixed",
        colors: {
          mode: "palette",
          colors: ["#f2d95c", "#fff2a8"],
        },
        fill: {
          mode: "fixed",
          value: { type: "pattern", patternId: "honeycomb" },
        },
      },
      context(),
    );
    const mixed = resolveAppearanceRecipe(
      {
        ...paletteRecipe,
        variation: "fixed",
        colors: {
          mode: "palette",
          colors: ["#000000", "#ffffff"],
        },
        fill: {
          mode: "fixed",
          value: { type: "pattern", patternId: "checkerboard" },
        },
      },
      context(),
    );

    expect(bright.textColor).toBe("#111111");
    expect(bright.outlineColor).toBe("#000000");
    expect(bright.requiresLocalSeparation).toBe(false);
    expect(mixed.outlineColor).toBe("#000000");
    expect(mixed.requiresLocalSeparation).toBe(true);
  });

  it("is deterministic for the same recipe and context", () => {
    const first = resolveAppearanceRecipe(paletteRecipe, context());
    const second = resolveAppearanceRecipe(paletteRecipe, context());
    expect(first).toEqual(second);
  });

  it("rejects invalid resolution context instead of changing scope", () => {
    expect(() =>
      resolveAppearanceRecipe(
        paletteRecipe,
        context({ renderSeed: -1 }),
      ),
    ).toThrow("Appearance render seed must be an unsigned 32-bit integer");
    expect(() =>
      resolveAppearanceRecipe(
        paletteRecipe,
        context({ dieIndex: -1 }),
      ),
    ).toThrow("Appearance die index must be a non-negative safe integer");
  });
});

describe("resolveAppearanceRecipeV2", () => {
  it("resolves every palette color and fixed treatment exactly", () => {
    const first = resolveAppearanceRecipeV2(nativeRecipe, context());
    const second = resolveAppearanceRecipeV2(
      nativeRecipe,
      context({ renderSeed: 0xffff_ffff, target: "d4", dieIndex: 99 }),
    );

    expect(first).toEqual(second);
    expect(first.surface).toEqual({
      type: "gradient",
      colors: ["#ff0000", "#00ff00", "#0000ff", "#f2d95c"],
      scope: "die-wide",
      direction: "upper-left-to-lower-right",
    });
    expect(first.lighting).toEqual({
      mode: "combined",
      strength: "subtle",
      direction: "upper-left",
    });
  });

  it("uses the first weighted treatment for Fixed recipes", () => {
    const resolved = resolveAppearanceRecipeV2(
      {
        ...nativeRecipe,
        gradient: {
          ...nativeRecipe.gradient,
          scope: {
            mode: "weighted",
            options: [
              { value: "repeated", weight: 1 },
              { value: "die-wide", weight: 99 },
            ],
          },
        },
        lighting: {
          ...nativeRecipe.lighting,
          mode: {
            mode: "weighted",
            options: [
              { value: "directional", weight: 1 },
              { value: "none", weight: 99 },
            ],
          },
          strength: {
            mode: "weighted",
            options: [
              { value: "strong", weight: 1 },
              { value: "subtle", weight: 99 },
            ],
          },
          direction: {
            mode: "weighted",
            options: [
              { value: "right", weight: 1 },
              { value: "top", weight: 99 },
            ],
          },
        },
      },
      context(),
    );

    expect(resolved.surface).toMatchObject({ scope: "repeated" });
    expect(resolved.lighting).toEqual({
      mode: "directional",
      strength: "strong",
      direction: "right",
    });
  });

  it("resolves native solid, pattern, None, and Facet branches", () => {
    const solid = resolveAppearanceRecipeV2(
      {
        ...nativeRecipe,
        fill: { mode: "fixed", value: { type: "solid" } },
        lighting: {
          ...nativeRecipe.lighting,
          mode: { mode: "fixed", value: "none" },
        },
      },
      context(),
    );
    const pattern = resolveAppearanceRecipeV2(
      {
        ...nativeRecipe,
        fill: {
          mode: "fixed",
          value: { type: "pattern", patternId: "checkerboard" },
        },
        lighting: {
          ...nativeRecipe.lighting,
          mode: { mode: "fixed", value: "facet" },
          strength: { mode: "fixed", value: "strong" },
        },
      },
      context(),
    );

    expect(solid.surface).toEqual({ type: "solid", color: "#ff0000" });
    expect(solid.lighting).toEqual({ mode: "none" });
    expect(pattern.surface).toEqual({
      type: "pattern",
      patternId: "checkerboard",
      primaryColor: "#ff0000",
      secondaryColor: "#00ff00",
    });
    expect(pattern.lighting).toEqual({ mode: "facet", strength: "strong" });
  });

  it("preserves complete V1 resolution for every migrated fill", () => {
    const fills: AppearanceRecipeV1["fill"][] = [
      { mode: "fixed", value: { type: "solid" } },
      { mode: "fixed", value: { type: "gradient" } },
      {
        mode: "fixed",
        value: { type: "pattern", patternId: "checkerboard" },
      },
    ];

    for (const fill of fills) {
      const recipe = { ...paletteRecipe, variation: "fixed" as const, fill };
      const legacy = resolveAppearanceRecipe(recipe, context());
      const migrated = resolveAppearanceRecipeV2(
        migrateAppearanceRecipeV1(recipe),
        context(),
      );

      expect(migrated.textColor).toBe(legacy.textColor);
      expect(migrated.outlineColor).toBe(legacy.outlineColor);
      expect(migrated.fontId).toBe(legacy.fontId);
      expect(migrated.requiresLocalSeparation).toBe(
        legacy.requiresLocalSeparation,
      );
      expect(migrated.lighting).toEqual({
        mode: "facet",
        strength: "subtle",
      });
      if (legacy.fill.type === "solid") {
        expect(migrated.surface).toEqual({
          type: "solid",
          color: legacy.primaryColor,
        });
      } else if (legacy.fill.type === "gradient") {
        expect(migrated.surface).toEqual({
          type: "gradient",
          colors: [legacy.primaryColor, legacy.secondaryColor],
          scope: "repeated",
          direction: "top-to-bottom",
        });
      } else {
        expect(migrated.surface).toEqual({
          type: "pattern",
          patternId: legacy.fill.patternId,
          primaryColor: legacy.primaryColor,
          secondaryColor: legacy.secondaryColor,
        });
      }
    }
  });

  it("keeps legacy contrast while native Other includes sphere form", () => {
    const legacyRecipe: AppearanceRecipeV1 = {
      ...paletteRecipe,
      variation: "fixed",
      colors: { mode: "palette", colors: ["#515151", "#767676"] },
      fill: { mode: "fixed", value: { type: "solid" } },
      font: { mode: "fixed", fontId: "liberation-sans" },
    };
    const legacy = resolveAppearanceRecipe(legacyRecipe, context({ target: "other" }));
    const migrated = resolveAppearanceRecipeV2(
      migrateAppearanceRecipeV1(legacyRecipe),
      context({ target: "other" }),
    );
    const native = resolveAppearanceRecipeV2(
      {
        ...nativeRecipe,
        colors: { mode: "palette", colors: ["#515151", "#767676"] },
        fill: { mode: "fixed", value: { type: "solid" } },
        lighting: {
          ...nativeRecipe.lighting,
          mode: { mode: "fixed", value: "none" },
        },
      },
      context({ target: "other" }),
    );

    expect(legacy.requiresLocalSeparation).toBe(false);
    expect(migrated.requiresLocalSeparation).toBe(false);
    expect(native.requiresLocalSeparation).toBe(true);
  });

  it("preserves V1 fixed hashing and weighted random-consumption order", () => {
    const recipe: AppearanceRecipeV1 = {
      ...paletteRecipe,
      variation: "fixed",
      colors: { mode: "random", primary: "#5426a8" },
      fill: {
        mode: "weighted",
        options: [
          { value: { type: "gradient" }, weight: 1 },
          {
            value: { type: "pattern", patternId: "checkerboard" },
            weight: 9,
          },
        ],
      },
      font: {
        mode: "weighted",
        options: [
          { fontId: "new-rocker", weight: 1 },
          { fontId: "liberation-sans", weight: 9 },
        ],
      },
    };
    const legacy = resolveAppearanceRecipe(recipe, context());
    const migrated = resolveAppearanceRecipeV2(
      migrateAppearanceRecipeV1(recipe),
      context({ renderSeed: 0xffff_ffff, target: "d4", dieIndex: 99 }),
    );

    expect(migrated.fontId).toBe(legacy.fontId);
    expect(migrated.textColor).toBe(legacy.textColor);
    expect(migrated.surface.type).toBe(legacy.fill.type);
    if (migrated.surface.type === "gradient") {
      expect(migrated.surface.colors).toEqual([
        legacy.primaryColor,
        legacy.secondaryColor,
      ]);
    } else if (migrated.surface.type === "pattern") {
      expect(migrated.surface).toMatchObject({
        patternId:
          legacy.fill.type === "pattern" ? legacy.fill.patternId : undefined,
        primaryColor: legacy.primaryColor,
        secondaryColor: legacy.secondaryColor,
      });
    } else {
      expect(migrated.surface.color).toBe(legacy.primaryColor);
    }
  });

  it("rotates Curated palettes and lets Wild rotate or reverse", () => {
    const procedural: AppearanceRecipeV2 = {
      ...nativeRecipe,
      variation: "curated",
      gradient: {
        ...nativeRecipe.gradient,
        scope: { mode: "allowlist", values: ["repeated", "die-wide"] },
        direction: {
          mode: "allowlist",
          values: ["top-to-bottom", "left-to-right"],
        },
      },
      lighting: {
        mode: {
          mode: "allowlist",
          values: ["none", "facet", "directional", "combined"],
        },
        strength: { mode: "allowlist", values: ["subtle", "strong"] },
        direction: {
          mode: "allowlist",
          values: ["top", "upper-left", "right"],
        },
      },
    };
    const source = nativeRecipe.colors;
    if (source.mode !== "palette") throw new Error("Fixture must be a palette");
    const rotations = source.colors.map((_, index) => [
      ...source.colors.slice(index),
      ...source.colors.slice(0, index),
    ]);
    const reversals = rotations.map((colors) => [...colors].reverse());
    const curated = Array.from({ length: 12 }, (_, dieIndex) =>
      resolveAppearanceRecipeV2(procedural, context({ dieIndex })),
    );
    const wild = Array.from({ length: 12 }, (_, dieIndex) =>
      resolveAppearanceRecipeV2(
        { ...procedural, variation: "wild" },
        context({ dieIndex }),
      ),
    );

    for (const result of curated) {
      if (result.surface.type !== "gradient") {
        throw new Error("Resolved gradient is missing");
      }
      expect(rotations).toContainEqual(result.surface.colors);
      expect(["repeated", "die-wide"]).toContain(result.surface.scope);
      expect(["top-to-bottom", "left-to-right"]).toContain(
        result.surface.direction,
      );
      expect(["none", "facet", "directional", "combined"]).toContain(
        result.lighting.mode,
      );
    }
    for (const result of wild) {
      if (result.surface.type !== "gradient") {
        throw new Error("Resolved gradient is missing");
      }
      expect([...rotations, ...reversals]).toContainEqual(
        result.surface.colors,
      );
      expect(["repeated", "die-wide"]).toContain(result.surface.scope);
      expect(["top-to-bottom", "left-to-right"]).toContain(
        result.surface.direction,
      );
      expect(["none", "facet", "directional", "combined"]).toContain(
        result.lighting.mode,
      );
    }
    expect(
      wild.some(
        ({ surface }) =>
          surface.type === "gradient" &&
          reversals.some(
            (colors) => JSON.stringify(colors) === JSON.stringify(surface.colors),
          ),
      ),
    ).toBe(true);
    expect(
      new Set(curated.map((value) => JSON.stringify(value))).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(wild.map((value) => JSON.stringify(value))).size,
    ).toBeGreaterThan(1);
  });

  it("selects only configured weighted treatments for Wild recipes", () => {
    const weighted: AppearanceRecipeV2 = {
      ...nativeRecipe,
      variation: "wild",
      gradient: {
        ...nativeRecipe.gradient,
        scope: {
          mode: "weighted",
          options: [
            { value: "repeated", weight: 1 },
            { value: "die-wide", weight: 1 },
          ],
        },
        direction: {
          mode: "weighted",
          options: [
            { value: "top-to-bottom", weight: 1 },
            { value: "right-to-left", weight: 1 },
          ],
        },
      },
      lighting: {
        mode: {
          mode: "weighted",
          options: [
            { value: "directional", weight: 1 },
            { value: "combined", weight: 1 },
          ],
        },
        strength: {
          mode: "weighted",
          options: [
            { value: "subtle", weight: 1 },
            { value: "strong", weight: 1 },
          ],
        },
        direction: {
          mode: "weighted",
          options: [
            { value: "upper-left", weight: 1 },
            { value: "right", weight: 1 },
          ],
        },
      },
    };
    const results = Array.from({ length: 24 }, (_, dieIndex) =>
      resolveAppearanceRecipeV2(weighted, context({ dieIndex })),
    );
    const scopes = new Set<string>();
    const directions = new Set<string>();
    const lightingModes = new Set<string>();
    for (const result of results) {
      if (result.surface.type !== "gradient") {
        throw new Error("Resolved gradient is missing");
      }
      scopes.add(result.surface.scope);
      directions.add(result.surface.direction);
      lightingModes.add(result.lighting.mode);
      expect(["repeated", "die-wide"]).toContain(result.surface.scope);
      expect(["top-to-bottom", "right-to-left"]).toContain(
        result.surface.direction,
      );
      expect(["directional", "combined"]).toContain(result.lighting.mode);
      if (
        result.lighting.mode !== "directional" &&
        result.lighting.mode !== "combined"
      ) {
        throw new Error("Resolved directional lighting is missing");
      }
      expect(["subtle", "strong"]).toContain(result.lighting.strength);
      expect(["upper-left", "right"]).toContain(result.lighting.direction);
    }
    expect(scopes.size).toBe(2);
    expect(directions.size).toBe(2);
    expect(lightingModes.size).toBe(2);
  });

  it("honors roll, group, and die variation scopes", () => {
    const procedural: AppearanceRecipeV2 = {
      ...nativeRecipe,
      variation: "curated",
    };
    const rollRecipe = { ...procedural, varyBy: "roll" as const };
    const groupRecipe = { ...procedural, varyBy: "group" as const };
    const dieRecipe = { ...procedural, varyBy: "die" as const };

    expect(
      resolveAppearanceRecipeV2(
        rollRecipe,
        context({ groupIndex: 0, dieIndex: 0 }),
      ),
    ).toEqual(
      resolveAppearanceRecipeV2(
        rollRecipe,
        context({ groupIndex: 7, dieIndex: 12 }),
      ),
    );
    expect(
      resolveAppearanceRecipeV2(
        groupRecipe,
        context({ groupIndex: 3, dieIndex: 0 }),
      ),
    ).toEqual(
      resolveAppearanceRecipeV2(
        groupRecipe,
        context({ groupIndex: 3, dieIndex: 12 }),
      ),
    );
    const variants = new Set(
      Array.from({ length: 12 }, (_, dieIndex) =>
        JSON.stringify(
          resolveAppearanceRecipeV2(
            dieRecipe,
            context({ groupIndex: 0, dieIndex }),
          ),
        ),
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it("preserves the existing native random-pair resolution", () => {
    const randomPair: AppearanceRecipeV2 = {
      ...nativeRecipe,
      variation: "wild",
      varyBy: "die",
      colors: { mode: "random-pair" },
      lighting: {
        ...nativeRecipe.lighting,
        strength: { mode: "fixed", value: "gentle" },
      },
    };

    expect(
      resolveAppearanceRecipeV2(
        randomPair,
        context({ dieIndex: 7 }),
      ),
    ).toEqual({
      version: 2,
      compatibility: "native-v2",
      surface: {
        type: "gradient",
        colors: ["#793a88", "#2a3a62"],
        scope: "die-wide",
        direction: "upper-left-to-lower-right",
      },
      lighting: {
        mode: "combined",
        strength: "gentle",
        direction: "upper-left",
      },
      textColor: "#faf9f6",
      outlineColor: "#000000",
      fontId: "liberation-sans",
      requiresLocalSeparation: false,
    });
  });

  it("resolves broad deterministic random pairs at the configured scope", () => {
    const randomPair: AppearanceRecipeV2 = {
      ...nativeRecipe,
      variation: "wild",
      varyBy: "die",
      colors: { mode: "random-pair" },
    };
    const results = Array.from({ length: 50 }, (_, dieIndex) =>
      resolveAppearanceRecipeV2(randomPair, context({ dieIndex })),
    );
    const pairs = results.map(({ surface }) => {
      if (surface.type !== "gradient") {
        throw new Error("Resolved random-pair gradient is missing");
      }
      expect(surface.colors).toHaveLength(2);
      expect(surface.colors[0]).not.toBe(surface.colors[1]);
      return surface.colors.join(":");
    });

    expect(new Set(pairs).size).toBeGreaterThanOrEqual(48);
    expect(resolveAppearanceRecipeV2(randomPair, context({ dieIndex: 7 }))).toEqual(
      resolveAppearanceRecipeV2(randomPair, context({ dieIndex: 7 })),
    );

    const rollScoped = { ...randomPair, varyBy: "roll" as const };
    expect(
      resolveAppearanceRecipeV2(rollScoped, context({ dieIndex: 0 })),
    ).toEqual(
      resolveAppearanceRecipeV2(
        rollScoped,
        context({ groupIndex: 9, dieIndex: 49 }),
      ),
    );
  });

  it("resolves vivid random pairs without muting local separation", () => {
    const vividRandomPair: AppearanceRecipeV2 = {
      ...nativeRecipe,
      variation: "wild",
      varyBy: "die",
      colors: { mode: "vivid-random-pair" },
      fill: {
        mode: "weighted",
        options: [
          { value: { type: "gradient" }, weight: 600 },
          {
            value: { type: "pattern", patternId: "stripes" },
            weight: 400,
          },
        ],
      },
      lighting: {
        ...nativeRecipe.lighting,
        strength: { mode: "fixed", value: "gentle" },
      },
    };
    const resolved = APPEARANCE_TARGETS.flatMap((target) =>
      Array.from({ length: 100 }, (_, dieIndex) => ({
        appearance: resolveAppearanceRecipeV2(
          vividRandomPair,
          context({ target, dieIndex }),
        ),
        target,
      })),
    );
    let totalChroma = 0;
    const surfaceTypes = new Set<string>();
    const textColors = new Set<string>();
    for (const { appearance, target } of resolved) {
      const { surface } = appearance;
      if (surface.type === "solid") {
        throw new Error("Vivid random pair resolved to a solid surface");
      }
      surfaceTypes.add(surface.type);
      const [primary, secondary] =
        surface.type === "gradient"
          ? surface.colors
          : [surface.primaryColor, surface.secondaryColor];
      expect(primary).not.toBe(secondary);
      expect(appearance.requiresLocalSeparation).toBe(false);
      const ink = resolveAppearanceInkV2(
        surface,
        appearance.lighting,
        target,
      );
      expect(ink.minimumContrast).toBeGreaterThanOrEqual(
        MINIMUM_APPEARANCE_CONTRAST,
      );
      textColors.add(appearance.textColor);
      for (const color of [primary, secondary]) {
        const channels = [1, 3, 5].map((offset) =>
          Number.parseInt(color.slice(offset, offset + 2), 16),
        );
        totalChroma += Math.max(...channels) - Math.min(...channels);
      }
    }

    expect(surfaceTypes).toEqual(new Set(["gradient", "pattern"]));
    expect(textColors).toEqual(new Set(["#111111", "#faf9f6"]));
    expect(totalChroma / (resolved.length * 2)).toBeGreaterThan(120);
    const pinned = resolveAppearanceRecipeV2(
      vividRandomPair,
      context({ target: "d20", dieIndex: 17 }),
    );
    expect(pinned).toEqual({
      version: 2,
      compatibility: "native-v2",
      surface: {
        type: "pattern",
        patternId: "stripes",
        primaryColor: "#5e23ff",
        secondaryColor: "#2c07a2",
      },
      lighting: {
        mode: "combined",
        strength: "gentle",
        direction: "upper-left",
      },
      textColor: "#faf9f6",
      outlineColor: "#000000",
      fontId: "liberation-sans",
      requiresLocalSeparation: false,
    });
    expect(
      resolveAppearanceRecipeV2(
        vividRandomPair,
        context({ target: "d20", dieIndex: 17 }),
      ),
    ).toEqual(pinned);
  });

  it("uses local separation only when Strong lighting cannot preserve vivid contrast", () => {
    const fixedLighting = (
      mode: "none" | "facet" | "directional" | "combined",
      strength: "gentle" | "subtle" | "strong" = "gentle",
      direction: "top" | "upper-left" | "upper-right" | "left" | "right" =
        "upper-left",
    ): AppearanceRecipeV2["lighting"] => ({
      mode: { mode: "fixed", value: mode },
      strength: { mode: "fixed", value: strength },
      direction: { mode: "fixed", value: direction },
    });
    const strengths = ["gentle", "subtle", "strong"] as const;
    const directions = [
      "top",
      "upper-left",
      "upper-right",
      "left",
      "right",
    ] as const;
    const treatments = [
      { mode: "none" as const, strength: "gentle" as const },
      ...strengths.map((strength) => ({ mode: "facet" as const, strength })),
      ...strengths.flatMap((strength) =>
        directions.flatMap((direction) => [
          { mode: "directional" as const, strength, direction },
          { mode: "combined" as const, strength, direction },
        ]),
      ),
    ].map((treatment) => ({
      ...treatment,
      lighting: fixedLighting(
        treatment.mode,
        treatment.strength,
        "direction" in treatment ? treatment.direction : "upper-left",
      ),
    }));
    const fills = [
      { type: "solid" as const },
      { type: "gradient" as const },
      { type: "pattern" as const, patternId: "stripes" },
    ];

    let separated = 0;
    for (const { lighting, mode, strength } of treatments) {
      for (const fill of fills) {
        const recipe: AppearanceRecipeV2 = {
          ...nativeRecipe,
          variation: "wild",
          colors: { mode: "vivid-random-pair" },
          fill: { mode: "fixed", value: fill },
          lighting,
        };
        for (const target of APPEARANCE_TARGETS) {
          for (let dieIndex = 0; dieIndex < 3; dieIndex += 1) {
            const appearance = resolveAppearanceRecipeV2(
              recipe,
              context({ target, dieIndex }),
            );
            const ink = resolveAppearanceInkV2(
              appearance.surface,
              appearance.lighting,
              target,
            );
            if (appearance.requiresLocalSeparation) {
              separated += 1;
              expect(strength).toBe("strong");
              expect(["directional", "combined"]).toContain(mode);
              expect(ink.minimumContrast).toBeLessThan(
                MINIMUM_APPEARANCE_CONTRAST,
              );
            } else {
              expect(ink.minimumContrast).toBeGreaterThanOrEqual(
                MINIMUM_APPEARANCE_CONTRAST,
              );
            }
          }
        }
      }
    }
    expect(separated).toBeGreaterThan(0);
  });

  it("preserves repeated native palette stops in their fixed order", () => {
    const trans = resolveAppearanceRecipeV2(
      {
        ...nativeRecipe,
        colors: {
          mode: "palette",
          colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
        },
      },
      context(),
    );

    expect(trans.surface).toMatchObject({
      type: "gradient",
      colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
    });
  });

  it("preserves valid random-color collisions as duplicate stops", () => {
    const initial: AppearanceRecipeV1 = {
      ...paletteRecipe,
      colors: { mode: "random", primary: "#000000" },
      fill: { mode: "fixed", value: { type: "gradient" } },
      font: { mode: "fixed", fontId: "liberation-sans" },
    };
    const collisionColor = resolveAppearanceRecipe(initial, context())
      .secondaryColor;
    const collision = {
      ...initial,
      colors: { mode: "random" as const, primary: collisionColor },
    };
    const legacy = resolveAppearanceRecipe(collision, context());
    expect(legacy.primaryColor).toBe(legacy.secondaryColor);

    expect(
      resolveAppearanceRecipeV2(
        migrateAppearanceRecipeV1(collision),
        context(),
      ).surface,
    ).toEqual({
      type: "gradient",
      colors: [collisionColor, collisionColor],
      scope: "repeated",
      direction: "top-to-bottom",
    });

    const nativeInitial: AppearanceRecipeV2 = {
      ...nativeRecipe,
      variation: "curated",
      colors: { mode: "random", primary: "#000000" },
    };
    const nativeInitialSurface = resolveAppearanceRecipeV2(
      nativeInitial,
      context(),
    ).surface;
    if (nativeInitialSurface.type !== "gradient") {
      throw new Error("Resolved gradient is missing");
    }
    const nativeCollisionColor = nativeInitialSurface.colors[1];
    expect(
      resolveAppearanceRecipeV2(
        {
          ...nativeInitial,
          colors: { mode: "random", primary: nativeCollisionColor },
        },
        context(),
      ).surface,
    ).toMatchObject({
      type: "gradient",
      colors: [nativeCollisionColor, nativeCollisionColor],
    });
  });
});

describe("resolveAppearanceRecipeV3", () => {
  it("compiles every fixed Profile V3 field into one detached V4 appearance", () => {
    const recipe = appearanceRecipeV3();
    const resolved = resolveAppearanceRecipeV3(recipe, contextV3());

    expect(resolved).toMatchObject({
      version: 3,
      form: "standard",
      appearance: {
        material: {
          family: "classic",
          treatment: "gradient",
          textureScale: 100,
        },
        palette: ["#170022", "#04c9df", "#f3d36a"],
        texture: {
          generatorId: "classic-v1",
          scale: 100,
          rotation: 45,
          offsetU: 0,
          offsetV: 0,
          scope: "face-local",
        },
        lighting: {
          mode: "combined",
          strength: "gentle",
          direction: "upper-left",
        },
        engraving: {
          fontId: "liberation-sans",
          finish: "matte-ink",
        },
        outlineColor: "#000000",
      },
    });
    expect(Number.isInteger(resolved.appearance.texture.seed)).toBe(true);
    const snapshot = structuredClone(resolved);
    if (recipe.colors.mode !== "palette") {
      throw new Error("Palette fixture is missing");
    }
    recipe.colors.colors[0] = "#ffffff";
    if (recipe.material.mode !== "fixed") {
      throw new Error("Material fixture is missing");
    }
    recipe.material.value.textureScale = 200;
    expect(resolved).toEqual(snapshot);
  });

  it("resolves adaptive outlines only for non-hollow polyhedral forms", () => {
    const recipe = (colors: [string, string]) =>
      appearanceRecipeV3({
        colors: { mode: "palette", colors },
        lighting: {
          mode: { mode: "fixed", value: "none" },
          strength: { mode: "fixed", value: "gentle" },
          direction: { mode: "fixed", value: "upper-left" },
        },
      });
    const resolveD6 = (colors: [string, string]) =>
      resolveAppearanceRecipeV3(
        recipe(colors),
        contextV3({ target: "d6" }),
      ).appearance;

    expect(resolveD6(["#f2d95c", "#fff2a8"]).outlineColor).toBe("#000000");
    expect(resolveD6(["#173f35", "#24584a"]).outlineColor).toBe("#ffffff");
    expect(resolveD6(["#000000", "#ffffff"]).outlineColor).toBe("#000000");
    expect(
      resolveAppearanceRecipeV3(
        recipe(["#173f35", "#24584a"]),
        contextV3({ target: "other" }),
      ).appearance.outlineColor,
    ).toBe("#000000");

    const hollowMaterial = {
      family: "hollow-metal",
      construction: "filigree",
      metal: "brass",
      finish: "polished",
      openness: 60,
      textureScale: 100,
    } as const;
    expect(
      resolveAppearanceRecipeV3(
        {
          ...recipe(["#173f35", "#24584a"]),
          material: { mode: "fixed", value: hollowMaterial },
          form: {
            polyhedral: { mode: "fixed", value: "hollow-cage" },
            other: "sphere",
          },
        },
        contextV3({ target: "d20" }),
      ).appearance.outlineColor,
    ).toBe("#000000");
  });

  it("limits r41 white outlines to near-black plain solids", () => {
    const solidRecipe = (color: string) =>
      appearanceRecipeV3({
        colors: { mode: "solid", primary: color },
        material: {
          mode: "fixed",
          value: {
            family: "classic",
            treatment: "solid",
            opacity: "opaque",
            finish: "satin",
            textureScale: 100,
          },
        },
      });
    const blue = resolveAppearanceRecipeV3(
      solidRecipe("#0040e0"),
      contextV3({ target: "d20" }),
      "property-streams-r37",
    );
    const nearBlack = resolveAppearanceRecipeV3(
      solidRecipe("#173f35"),
      contextV3({ target: "d20" }),
      "property-streams-r37",
    );
    const subtleRed = resolveAppearanceRecipeV3(
      {
        ...solidRecipe("#d2042d"),
        lighting: {
          mode: { mode: "fixed", value: "combined" },
          strength: { mode: "fixed", value: "subtle" },
          direction: { mode: "fixed", value: "upper-left" },
        },
      },
      contextV3({ target: "d6" }),
      "property-streams-r37",
    );
    const gradient = resolveAppearanceRecipeV3(
      appearanceRecipeV3({
        colors: {
          mode: "palette",
          colors: ["#173f35", "#58253e"],
        },
        material: {
          mode: "fixed",
          value: {
            family: "classic",
            treatment: "gradient",
            opacity: "opaque",
            finish: "satin",
            textureScale: 100,
          },
        },
      }),
      contextV3({ target: "d20" }),
      "property-streams-r37",
    );
    const lavaStyle = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === "elemental-lava",
    );
    if (lavaStyle === undefined) throw new Error("Lava style is missing");
    const lava = resolveAppearanceRecipeV3(
      lavaStyle.recipe,
      contextV3({ renderSeed: 2, target: "d20" }),
      "property-streams-r37",
    );
    const sphere = resolveAppearanceRecipeV3(
      solidRecipe("#173f35"),
      contextV3({ target: "other" }),
      "property-streams-r37",
    );
    const hollowStyle = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === "hollow-victory",
    );
    if (hollowStyle === undefined) throw new Error("Hollow style is missing");
    const hollow = resolveAppearanceRecipeV3(
      hollowStyle.recipe,
      contextV3({ target: "d20" }),
      "property-streams-r37",
    );

    expect(blue.appearance.outlineColor).toBe("#ffffff");
    expect(resolveAppearanceOutlineColorR40V3(blue, "d20")).toBe("#000000");
    expect(resolveAppearanceOutlineColorR40V3(nearBlack, "d20")).toBe(
      "#ffffff",
    );
    expect(resolveAppearanceOutlineColorR41V3(nearBlack, "d20")).toBe(
      "#ffffff",
    );
    expect(resolveAppearanceOutlineColorR41V3(subtleRed, "d6")).toBe(
      "#000000",
    );
    expect(resolveAppearanceOutlineColorR41V3(blue, "d20")).toBe("#000000");
    expect(resolveAppearanceOutlineColorR40V3(gradient, "d20")).toBe(
      "#ffffff",
    );
    expect(resolveAppearanceOutlineColorR41V3(gradient, "d20")).toBe(
      "#000000",
    );
    expect(lava.appearance.outlineColor).toBe("#000000");
    expect(resolveAppearanceOutlineColorR40V3(lava, "d20")).toBe("#ffffff");
    expect(resolveAppearanceOutlineColorR41V3(lava, "d20")).toBe("#000000");
    expect(resolveAppearanceOutlineColorR41V3(sphere, "other")).toBe(
      "#000000",
    );
    expect(resolveAppearanceOutlineColorR41V3(hollow, "d20")).toBe(
      "#000000",
    );
  });

  it("automatically pairs approved d20 materials with shapes and keeps other targets standard", () => {
    const materials = [
      {
        material: {
          family: "sharp-resin",
          style: "clear",
          inclusion: "mica",
          finish: "polished",
          clarity: 80,
          inclusionDensity: 45,
          textureScale: 100,
        } as const,
        d20Form: "sharp",
      },
      {
        material: {
          family: "glass",
          style: "prismatic",
          finish: "polished",
          clarity: 90,
          textureScale: 100,
        } as const,
        d20Form: "crystal-cut",
      },
      {
        material: {
          family: "hollow-metal",
          construction: "filigree",
          metal: "brass",
          finish: "polished",
          openness: 60,
          textureScale: 100,
        } as const,
        d20Form: "hollow-cage",
      },
      {
        material: {
          family: "wood",
          wood: "walnut",
          finish: "polished",
          grainDensity: 50,
          textureScale: 100,
        } as const,
        d20Form: "standard",
      },
    ] as const;

    for (const { material, d20Form } of materials) {
      const recipe = appearanceRecipeV3({
        material: { mode: "fixed", value: material },
        form: {
          policy: "material-default-v1",
          polyhedral: { mode: "fixed", value: "standard" },
          other: "sphere",
        },
        gradient: {
          scope: { mode: "fixed", value: "die-wide" },
          direction: {
            mode: "fixed",
            value: "upper-left-to-lower-right",
          },
        },
      });
      expect(resolveAppearanceRecipeV3(recipe, contextV3({ target: "d20" })).form)
        .toBe(d20Form);
      expect(resolveAppearanceRecipeV3(recipe, contextV3({ target: "d12" })).form)
        .toBe("standard");
      expect(resolveAppearanceRecipeV3(recipe, contextV3({ target: "other" })).form)
        .toBe("sphere");
    }
  });

  it("resolves Random with the approved distribution, palettes, forms, and variation", () => {
    const style = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === CHAOTIC_APPEARANCE_STYLE_ID,
    );
    if (style === undefined) throw new Error("Random V3 style is missing");

    const sampleCount = 12_000;
    let solids = 0;
    let gradients = 0;
    let patterns = 0;
    let specials = 0;
    let diagonalGradients = 0;
    const stopCounts = new Map<number, number>();
    const patternIds = new Set<string>();
    const specialIds = new Set<string>();
    const engravingFinishes = new Set<string>();
    for (let dieIndex = 0; dieIndex < sampleCount; dieIndex += 1) {
      const resolved = resolveAppearanceRecipeV3(
        style.recipe,
        contextV3({ target: "d20", dieIndex }),
      );
      const { appearance } = resolved;
      engravingFinishes.add(appearance.engraving.finish);
      if (appearance.material.family === "classic") {
        expect(resolved.form).toBe("standard");
        switch (appearance.material.treatment) {
          case "solid":
            solids += 1;
            break;
          case "gradient": {
            gradients += 1;
            const stops = appearance.palette.length;
            stopCounts.set(stops, (stopCounts.get(stops) ?? 0) + 1);
            if ([45, 135, 225, 315].includes(appearance.texture.rotation)) {
              diagonalGradients += 1;
            }
            break;
          }
          case "pattern":
            patterns += 1;
            patternIds.add(appearance.material.patternId);
            break;
        }
      } else {
        specials += 1;
        const special = RANDOM_SPECIAL_MATERIALS_V3.find(
          ({ d20Material }) =>
            JSON.stringify(d20Material) === JSON.stringify(appearance.material),
        );
        if (special === undefined) {
          throw new Error("Random selected an unknown d20 special material");
        }
        specialIds.add(special.id);
        expect(appearance.palette).toEqual(special.palette);
        expect(resolved.form).toBe(special.d20Form);
      }
    }

    expect(solids / sampleCount).toBeGreaterThan(0.57);
    expect(solids / sampleCount).toBeLessThan(0.63);
    expect(gradients / sampleCount).toBeGreaterThan(0.14);
    expect(gradients / sampleCount).toBeLessThan(0.18);
    expect(patterns / sampleCount).toBeGreaterThan(0.12);
    expect(patterns / sampleCount).toBeLessThan(0.16);
    expect(specials / sampleCount).toBeGreaterThan(0.08);
    expect(specials / sampleCount).toBeLessThan(0.12);
    expect(patternIds).toEqual(
      new Set([
        "checkerboard",
        "dots",
        "stripes",
        "stars",
        "zigzag",
        "triangles",
        "honeycomb",
        "circuit",
        "crosshatch",
        "swirl",
      ]),
    );
    expect(specialIds).toEqual(
      new Set([
        "nacreous-resin",
        "vortical-core",
        "prismatic-glass",
        "striated-steel",
        "brass-filigree",
        "figured-walnut",
      ]),
    );
    expect(engravingFinishes).toEqual(
      new Set(["matte-ink", "enamel", "metallic", "luminous", "void"]),
    );
    expect([...stopCounts.keys()].sort()).toEqual([2, 3, 4, 5, 6]);
    for (const count of stopCounts.values()) {
      expect(count / gradients).toBeGreaterThan(0.17);
      expect(count / gradients).toBeLessThan(0.23);
    }
    expect(diagonalGradients / gradients).toBeGreaterThan(0.63);
    expect(diagonalGradients / gradients).toBeLessThan(0.7);

    const nonD20Specials = new Set<string>();
    for (let dieIndex = 0; dieIndex < 6_000; dieIndex += 1) {
      const resolved = resolveAppearanceRecipeV3(
        style.recipe,
        contextV3({ target: "d12", dieIndex }),
      );
      expect(resolved.form).toBe("standard");
      if (resolved.appearance.material.family !== "classic") {
        const special = RANDOM_SPECIAL_MATERIALS_V3.find(
          ({ material }) =>
            JSON.stringify(material) ===
            JSON.stringify(resolved.appearance.material),
        );
        if (special === undefined) {
          throw new Error("Random selected an unknown standard special material");
        }
        nonD20Specials.add(special.id);
        expect(resolved.appearance.palette).toEqual(special.palette);
      }
    }
    expect(nonD20Specials).toEqual(specialIds);
    expect(
      resolveAppearanceRecipeV3(
        style.recipe,
        contextV3({ target: "other", dieIndex: 0 }),
      ).form,
    ).toBe("sphere");
  }, 15_000);

  it("resolves r32 Random with deterministic new-material ranges and no Tengwar", () => {
    const random = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === CHAOTIC_APPEARANCE_STYLE_ID,
    )?.recipe;
    if (random === undefined) throw new Error("Random recipe is missing");

    const sampleCount = 6_000;
    const firstIndexByMaterial = new Map<string, number>();
    const countByMaterial = new Map<string, number>();
    const fonts = new Set<string>();
    let classicSolids = 0;
    for (let dieIndex = 0; dieIndex < sampleCount; dieIndex += 1) {
      const resolutionContext = contextV3({
        target: "d6",
        dieIndex,
        dieIdentity: `r32-random:${String(dieIndex)}`,
      });
      const resolved = resolveAppearanceRecipeV3(
        random,
        resolutionContext,
        "property-streams-r32",
      );
      expect(
        resolveAppearanceRecipeV3(
          random,
          resolutionContext,
          "property-streams-r32",
        ),
      ).toEqual(resolved);
      const { material } = resolved.appearance;
      fonts.add(resolved.appearance.engraving.fontId);
      if (material.family === "classic" && material.treatment === "solid") {
        classicSolids += 1;
      }

      if (material.family !== "elemental" && material.family !== "paint") {
        continue;
      }
      const id = material.family === "elemental"
        ? `elemental-${material.style}`
        : "paint-splatter";
      const expectedPalette = material.family === "elemental"
        ? R32_MATERIAL_PALETTES_V3[`elemental-${material.style}`]
        : R32_MATERIAL_PALETTES_V3["paint-splatter"];
      firstIndexByMaterial.set(id, firstIndexByMaterial.get(id) ?? dieIndex);
      countByMaterial.set(id, (countByMaterial.get(id) ?? 0) + 1);
      expect(resolved.form).toBe("standard");
      expect(resolved.appearance.texture.scope).toBe("die-wide");
      expect(resolved.appearance.palette).toEqual(expectedPalette);
      if (material.family === "elemental") {
        if (material.style === "lava") {
          expect(material.fissureDensity).toBeGreaterThanOrEqual(48);
          expect(material.fissureDensity).toBeLessThanOrEqual(86);
          expect(material.glowIntensity).toBeGreaterThanOrEqual(56);
          expect(material.glowIntensity).toBeLessThanOrEqual(92);
          expect(material.textureScale).toBeGreaterThanOrEqual(75);
          expect(material.textureScale).toBeLessThanOrEqual(165);
        } else if (material.style === "sand") {
          expect(material.grainSize).toBeGreaterThanOrEqual(70);
          expect(material.grainSize).toBeLessThanOrEqual(96);
          expect(material.windDirection).toBeGreaterThanOrEqual(-35);
          expect(material.windDirection).toBeLessThanOrEqual(35);
          expect(material.textureScale).toBeGreaterThanOrEqual(105);
          expect(material.textureScale).toBeLessThanOrEqual(225);
        } else {
          expect(material.cloudCover).toBeGreaterThanOrEqual(
            material.style === "blue-sky" ? 42 : 54,
          );
          expect(material.cloudCover).toBeLessThanOrEqual(
            material.style === "blue-sky" ? 74 : 82,
          );
          expect(material.horizonHeight).toBeGreaterThanOrEqual(34);
          expect(material.horizonHeight).toBeLessThanOrEqual(68);
          expect(material.textureScale).toBeGreaterThanOrEqual(185);
          expect(material.textureScale).toBeLessThanOrEqual(305);
        }
      } else {
        expect(material.dropDensity).toBeGreaterThanOrEqual(50);
        expect(material.dropDensity).toBeLessThanOrEqual(82);
        expect(material.streakLength).toBeGreaterThanOrEqual(34);
        expect(material.streakLength).toBeLessThanOrEqual(78);
        expect(material.textureScale).toBeGreaterThanOrEqual(90);
        expect(material.textureScale).toBeLessThanOrEqual(185);
      }
    }

    expect(Object.fromEntries(firstIndexByMaterial)).toEqual({
      "elemental-sunset": 6,
      "elemental-lava": 21,
      "elemental-sand": 29,
      "elemental-blue-sky": 37,
      "paint-splatter": 63,
    });
    expect(classicSolids / sampleCount).toBeGreaterThan(0.57);
    expect(classicSolids / sampleCount).toBeLessThan(0.63);
    expect([...countByMaterial.values()]).toHaveLength(5);
    for (const count of countByMaterial.values()) {
      expect(count / sampleCount).toBeGreaterThan(0.014);
      expect(count / sampleCount).toBeLessThan(0.026);
    }
    expect(fonts).toEqual(
      new Set(R32_RANDOM_FONT_OPTIONS_V3.map(({ value }) => value)),
    );
    expect(fonts.has("alcarin-tengwar")).toBe(false);
  }, 20_000);

  it("locks r33 Fantasy palettes and sky softness without changing r32", () => {
    for (const essence of FANTASY_ESSENCES_V4) {
      const recipe = appearanceRecipeV3({
        material: {
          mode: "fixed",
          value: {
            family: "fantasy",
            essence,
            intensity: 60,
            finish: "radiant",
            textureScale: 100,
          },
        },
      });
      expect(
        resolveAppearanceRecipeV3(recipe, contextV3(), "property-streams-r33")
          .appearance.palette,
      ).toEqual(FANTASY_ESSENCE_PALETTES_R33_V4[essence]);
      expect(
        resolveAppearanceRecipeV3(recipe, contextV3(), "property-streams-r32")
          .appearance.palette,
      ).toEqual(recipe.colors.mode === "palette" ? recipe.colors.colors : []);
    }

    const fantasyOptions: AppearanceMaterialV4[] = [
      {
        family: "fantasy",
        essence: "ice",
        intensity: 60,
        finish: "radiant",
        textureScale: 100,
      },
      {
        family: "fantasy",
        essence: "bone",
        intensity: 60,
        finish: "radiant",
        textureScale: 100,
      },
    ];
    for (const material of [
      { mode: "allowlist" as const, values: fantasyOptions },
      {
        mode: "weighted" as const,
        options: fantasyOptions.map((value) => ({ value, weight: 1 })),
      },
    ]) {
      for (let renderSeed = 0; renderSeed < 4; renderSeed += 1) {
        const resolved = resolveAppearanceRecipeV3(
          appearanceRecipeV3({ material }),
          contextV3({ renderSeed }),
          "property-streams-r33",
        );
        if (resolved.appearance.material.family !== "fantasy") {
          throw new Error("Resolved Fantasy selection is invalid");
        }
        expect(resolved.appearance.palette).toEqual(
          FANTASY_ESSENCE_PALETTES_R33_V4[
            resolved.appearance.material.essence
          ],
        );
      }
    }

    const sky = appearanceRecipeV3({
      material: {
        mode: "fixed",
        value: {
          family: "elemental",
          style: "blue-sky",
          cloudCover: 58,
          horizonHeight: 48,
          textureScale: 305,
        },
      },
    });
    const r32 = resolveAppearanceRecipeV3(sky, contextV3(), "property-streams-r32");
    const r33 = resolveAppearanceRecipeV3(sky, contextV3(), "property-streams-r33");
    expect(r32.appearance.material).toMatchObject({ textureScale: 305 });
    expect(r33.appearance.material).toMatchObject({ textureScale: 25 });
  });

  it("keeps Brass Filigree bright enough for black engraving without a wash", () => {
    const style = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === "hollow-victory",
    );
    if (style === undefined) throw new Error("Brass Filigree is missing");

    for (const target of ["d4", "d12", "d20"] as const) {
      const resolved = resolveAppearanceRecipeV3(
        style.overrides?.[target] ?? style.recipe,
        contextV3({ target }),
      );
      expect(resolved.appearance).toMatchObject({
        palette: ["#d49a20", "#e7b640", "#ffe080"],
        engraving: { color: "#111111" },
        requiresLocalSeparation: false,
      });
      expect(resolved.appearance.material).toMatchObject({
        metal: "brass",
        finish: "polished",
      });
    }
  });

  it("maps repeated gradients to face-local polyhedra but keeps Other spherical", () => {
    const recipe = appearanceRecipeV3();
    const polyhedral = resolveAppearanceRecipeV3(recipe, contextV3());
    const spherical = resolveAppearanceRecipeV3(
      recipe,
      contextV3({ target: "other" }),
    );

    expect(polyhedral.appearance.texture.scope).toBe("face-local");
    expect(spherical).toMatchObject({
      form: "sphere",
      appearance: { texture: { scope: "die-wide", rotation: 45 } },
    });
  });

  it("keeps named material, palette, and texture streams independent from font choices", () => {
    const recipe = appearanceRecipeV3({
      variation: "wild",
      colors: { mode: "vivid-random-pair" },
      material: {
        mode: "weighted",
        options: [
          {
            value: {
              family: "classic",
              treatment: "gradient",
              opacity: "opaque",
              finish: "satin",
              textureScale: 100,
            },
            weight: 9,
          },
          {
            value: {
              family: "wood",
              wood: "walnut",
              finish: "polished",
              grainDensity: 64,
              textureScale: 100,
            },
            weight: 1,
          },
        ],
      },
      font: {
        mode: "allowlist",
        values: ["liberation-sans", "new-rocker"],
      },
      gradient: {
        scope: { mode: "fixed", value: "die-wide" },
        direction: { mode: "fixed", value: "left-to-right" },
      },
    });
    const changedFont: AppearanceRecipeV3 = {
      ...recipe,
      font: { mode: "fixed", value: "syncopate" },
    };
    const first = resolveAppearanceRecipeV3(recipe, contextV3());
    const replay = resolveAppearanceRecipeV3(recipe, contextV3());
    const changed = resolveAppearanceRecipeV3(changedFont, contextV3());

    expect(replay).toEqual(first);
    expect(changed.appearance.material).toEqual(first.appearance.material);
    expect(changed.appearance.palette).toEqual(first.appearance.palette);
    expect(changed.appearance.texture).toEqual(first.appearance.texture);
    expect(changed.appearance.engraving.fontId).toBe("syncopate");
  });

  it("rerolls generated r27 palettes while keeping one palette across dice", () => {
    for (const colors of [
      { mode: "vivid-random-pair" as const },
      { mode: "random-pair" as const },
      { mode: "random" as const, primary: "#f4b82f" },
    ]) {
      const recipe = appearanceRecipeV3({
        variation: "fixed",
        varyBy: "die",
        colors,
      });
      const first = resolveAppearanceRecipeV3(
        recipe,
        contextV3({ renderSeed: 100, target: "d4", dieIndex: 0 }),
        "property-streams-r27",
      );
      const samePalette = resolveAppearanceRecipeV3(
        recipe,
        contextV3({ renderSeed: 100, target: "other", dieIndex: 8 }),
        "property-streams-r27",
      );
      const reseeded = resolveAppearanceRecipeV3(
        recipe,
        contextV3({ renderSeed: 101, target: "d4", dieIndex: 0 }),
        "property-streams-r27",
      );

      expect(samePalette.appearance.palette).toEqual(first.appearance.palette);
      expect(reseeded.appearance.palette).not.toEqual(first.appearance.palette);
      if (colors.mode === "random") {
        expect(first.appearance.palette[0]).toBe(colors.primary);
        expect(reseeded.appearance.palette[0]).toBe(colors.primary);
      }
      const [firstColor, secondColor] = first.appearance.palette.map((color) =>
        [1, 3, 5].map((offset) =>
          Number.parseInt(color.slice(offset, offset + 2), 16),
        ),
      );
      if (firstColor === undefined || secondColor === undefined) {
        throw new Error("Generated palette fixture is missing");
      }
      expect(
        Math.hypot(
          ...firstColor.map(
            (channel, index) => channel - (secondColor[index] ?? channel),
          ),
        ),
      ).toBeGreaterThan(colors.mode === "vivid-random-pair" ? 120 : 109);
    }
  });

  it("restores per-die palettes for the built-in Random recipe in r28", () => {
    const randomRecipe = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === CHAOTIC_APPEARANCE_STYLE_ID,
    )?.recipe;
    if (randomRecipe === undefined) {
      throw new Error("Random appearance recipe is missing");
    }
    const recipe: AppearanceRecipeV3 = {
      ...randomRecipe,
      material: {
        mode: "fixed",
        value: {
          family: "classic",
          treatment: "solid",
          opacity: "opaque",
          finish: "satin",
          textureScale: 100,
        },
      },
    };
    const contexts = Array.from({ length: 6 }, (_, dieIndex) =>
      contextV3({
        target: "d6",
        dieIndex,
        dieIdentity: `random-preview:${String(dieIndex)}`,
      }),
    );
    const palettes = (policy: "property-streams-r27" | "property-streams-r28") =>
      contexts.map((resolutionContext) =>
        resolveAppearanceRecipeV3(recipe, resolutionContext, policy).appearance
          .palette.join(","),
      );
    const r27Palettes = palettes("property-streams-r27");
    const r28Palettes = palettes("property-streams-r28");

    expect(new Set(r27Palettes).size).toBe(1);
    expect(new Set(r28Palettes).size).toBe(contexts.length);
    expect(palettes("property-streams-r28")).toEqual(r28Palettes);
  });

  it("maps built-in Random solids once across the whole die in r29", () => {
    const randomRecipe = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === CHAOTIC_APPEARANCE_STYLE_ID,
    )?.recipe;
    if (randomRecipe === undefined) {
      throw new Error("Random appearance recipe is missing");
    }
    const material = {
      family: "classic" as const,
      treatment: "solid" as const,
      opacity: "opaque" as const,
      finish: "satin" as const,
      textureScale: 100,
    };
    const customSolid = appearanceRecipeV3({
      material: { mode: "fixed", value: material },
    });
    const randomContext = contextV3({
      renderSeed: 7,
      target: "d6",
      groupIndex: 0,
      dieIndex: 1,
    });
    const randomR28 = resolveAppearanceRecipeV3(
      randomRecipe,
      randomContext,
      "property-streams-r28",
    );
    const randomR29 = resolveAppearanceRecipeV3(
      randomRecipe,
      randomContext,
      "property-streams-r29",
    );

    expect(randomR28.appearance.material).toMatchObject({
      family: "classic",
      treatment: "solid",
    });
    expect(randomR29.appearance.material).toEqual(randomR28.appearance.material);
    expect(randomR28.appearance.texture.scope).toBe("face-local");
    expect(randomR29.appearance.texture.scope).toBe("bounded-die-wide");
    for (const recipe of [
      customSolid,
      { ...customSolid, randomization: "full-spectrum-v2" as const },
    ]) {
      expect(
        resolveAppearanceRecipeV3(
          recipe,
          contextV3({ target: "d6" }),
          "property-streams-r29",
        ).appearance.texture.scope,
      ).toBe("face-local");
    }
    const customSharp = appearanceRecipeV3({
      material: { mode: "fixed", value: material },
      form: {
        polyhedral: { mode: "fixed", value: "sharp" },
        other: "sphere",
      },
    });
    for (const policy of ["property-streams-r28", "property-streams-r29"] as const) {
      expect(
        resolveAppearanceRecipeV3(
          customSharp,
          contextV3({ target: "d20" }),
          policy,
        ).appearance.texture.scope,
      ).toBe("die-wide");
    }
  });

  it("makes r30 Random solids one nearly-flat hue without changing r29", () => {
    const randomRecipe = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === CHAOTIC_APPEARANCE_STYLE_ID,
    )?.recipe;
    if (randomRecipe === undefined) {
      throw new Error("Random appearance recipe is missing");
    }
    const resolutionContext = contextV3({
      renderSeed: 7,
      target: "d6",
      groupIndex: 0,
      dieIndex: 1,
    });
    const r29 = resolveAppearanceRecipeV3(
      randomRecipe,
      resolutionContext,
      "property-streams-r29",
    );
    const r30 = resolveAppearanceRecipeV3(
      randomRecipe,
      resolutionContext,
      "property-streams-r30",
    );

    expect(r30.appearance.material).toEqual(r29.appearance.material);
    expect(new Set(r29.appearance.palette).size).toBe(2);
    expect(new Set(r30.appearance.palette).size).toBe(1);
    expect(r30.appearance.palette[0]).toBe(r29.appearance.palette[0]);
    expect(r30.appearance.texture.scope).toBe("bounded-die-wide");
  });

  it("removes multi-color Classic Solid fields only in r31", () => {
    const material = {
      family: "classic" as const,
      treatment: "solid" as const,
      opacity: "opaque" as const,
      finish: "satin" as const,
      textureScale: 100,
    };
    const recipe = appearanceRecipeV3({
      material: { mode: "fixed", value: material },
      colors: { mode: "vivid-random-pair" },
    });
    const resolutionContext = contextV3({ target: "d6" });
    const r30 = resolveAppearanceRecipeV3(
      recipe,
      resolutionContext,
      "property-streams-r30",
    );
    const r31 = resolveAppearanceRecipeV3(
      recipe,
      resolutionContext,
      "property-streams-r31",
    );

    expect(new Set(r30.appearance.palette).size).toBe(2);
    expect(r30.appearance.texture.scope).toBe("face-local");
    expect(new Set(r31.appearance.palette).size).toBe(1);
    expect(r31.appearance.palette[0]).toBe(r30.appearance.palette[0]);
    expect(r31.appearance.texture.scope).toBe("die-wide");

    const gradient = resolveAppearanceRecipeV3(
      {
        ...recipe,
        material: {
          mode: "fixed",
          value: { ...material, treatment: "gradient" },
        },
      },
      resolutionContext,
      "property-streams-r31",
    );
    expect(new Set(gradient.appearance.palette).size).toBe(2);
    expect(gradient.appearance.texture.scope).toBe("face-local");
  });

  it("chooses one independent six-color Rainbow hue per die in r30", () => {
    const rainbow = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === "rainbow",
    )?.recipe;
    if (rainbow === undefined) throw new Error("Rainbow recipe is missing");
    const allowed = new Set([
      "#d7263d",
      "#f46036",
      "#f9c80e",
      "#2e933c",
      "#3366cc",
      "#8a4fff",
    ]);
    const palettes = Array.from({ length: 24 }, (_, dieIndex) =>
      resolveAppearanceRecipeV3(
        rainbow,
        contextV3({ target: "d6", dieIndex, dieIdentity: `rainbow:${String(dieIndex)}` }),
        "property-streams-r30",
      ).appearance.palette,
    );

    expect(palettes.every((palette) => new Set(palette).size === 1)).toBe(true);
    expect(palettes.every(([color]) => allowed.has(color))).toBe(true);
    expect(new Set(palettes.map(([color]) => color)).size).toBeGreaterThan(1);
  });

  it("defaults compatible materials to all-target r30 special forms", () => {
    const targets = ["d4", "d6", "d8", "d10", "d12", "d20", "percentile", "fudge"] as const;
    const crystalFamilies = ["sharp-resin", "gemstone", "glass", "fantasy"] as const;
    for (const family of crystalFamilies) {
      const material = RANDOM_SPECIAL_MATERIALS_V3.find(
        ({ d20Material }) => d20Material.family === family,
      )?.d20Material;
      const fallback = APPEARANCE_CATALOG_V3.materials.find(
        (candidate) => candidate.family === family,
      )?.defaultValue;
      const selected = material ?? fallback;
      if (selected === undefined) throw new Error(`${family} material is missing`);
      const recipe = appearanceRecipeV3({
        material: { mode: "fixed", value: selected },
        form: {
          policy: "material-default-v1",
          polyhedral: { mode: "fixed", value: "standard" },
          other: "sphere",
        },
        gradient: {
          scope: { mode: "fixed", value: "die-wide" },
          direction: { mode: "fixed", value: "upper-left-to-lower-right" },
        },
      });
      for (const target of targets) {
        expect(
          resolveAppearanceRecipeV3(
            recipe,
            contextV3({ target }),
            "property-streams-r30",
          ).form,
        ).toBe("crystal-cut");
      }
    }

    const hollow = APPEARANCE_CATALOG_V3.materials.find(
      ({ family }) => family === "hollow-metal",
    )?.defaultValue;
    if (hollow === undefined) throw new Error("Hollow material is missing");
    const hollowRecipe = appearanceRecipeV3({
      material: { mode: "fixed", value: hollow },
      form: {
        policy: "material-default-v1",
        polyhedral: { mode: "fixed", value: "standard" },
        other: "sphere",
      },
      gradient: {
        scope: { mode: "fixed", value: "die-wide" },
        direction: { mode: "fixed", value: "upper-left-to-lower-right" },
      },
    });
    for (const target of targets) {
      expect(
        resolveAppearanceRecipeV3(
          hollowRecipe,
          contextV3({ target }),
          "property-streams-r30",
        ).form,
      ).toBe("hollow-cage");
    }
  });

  it("uses every Random special form across non-d20 dice in r30", () => {
    const random = BUILTIN_APPEARANCE_STYLES_V3.find(
      ({ id }) => id === CHAOTIC_APPEARANCE_STYLE_ID,
    )?.recipe;
    if (random === undefined) throw new Error("Random recipe is missing");

    for (const special of RANDOM_SPECIAL_MATERIALS_V3) {
      const recipe: AppearanceRecipeV3 = {
        ...random,
        material: { mode: "fixed", value: special.material },
      };
      const resolved = resolveAppearanceRecipeV3(
        recipe,
        contextV3({ target: "d6" }),
        "property-streams-r30",
      );
      expect(resolved.appearance.material).toEqual(special.d20Material);
      const family = special.d20Material.family;
      expect(resolved.form).toBe(
        family === "hollow-metal"
          ? "hollow-cage"
          : ["sharp-resin", "gemstone", "glass", "fantasy"].includes(family)
            ? "crystal-cut"
            : "standard",
      );
    }
  });

  it("keeps custom generated palettes consistent across dice in r28", () => {
    const recipe = appearanceRecipeV3({
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "vivid-random-pair" },
    });
    const first = resolveAppearanceRecipeV3(
      recipe,
      contextV3({ target: "d4", dieIdentity: "custom:0" }),
      "property-streams-r28",
    );
    const second = resolveAppearanceRecipeV3(
      recipe,
      contextV3({ target: "other", dieIdentity: "custom:1" }),
      "property-streams-r28",
    );

    expect(second.appearance.palette).toEqual(first.appearance.palette);
  });

  it("preserves explicit palettes across dice in r28", () => {
    const colors = ["#170022", "#04c9df", "#f3d36a"] as const;
    const recipe = appearanceRecipeV3({
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "palette", colors: [...colors] },
    });
    for (const resolutionContext of [
      contextV3({ target: "d4", dieIdentity: "palette:0" }),
      contextV3({ target: "other", dieIdentity: "palette:1" }),
    ]) {
      expect(
        resolveAppearanceRecipeV3(
          recipe,
          resolutionContext,
          "property-streams-r28",
        ).appearance.palette,
      ).toEqual(colors);
    }
  });

  it("distributes shared two-color palettes across one-color materials in r35", () => {
    const colors = ["#f05a24", "#04c9df"] as const;
    const material = {
      family: "classic" as const,
      treatment: "solid" as const,
      opacity: "opaque" as const,
      finish: "satin" as const,
      textureScale: 100,
    };
    const solid = appearanceRecipeV3({
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "palette", colors: [...colors] },
      material: { mode: "fixed", value: material },
    });
    const gradient = appearanceRecipeV3({
      ...solid,
      material: {
        mode: "fixed",
        value: { ...material, treatment: "gradient" },
      },
    });
    const palettes = (
      recipe: AppearanceRecipeV3,
      policy: "property-streams-r34" | "property-streams-r35",
    ) =>
      Array.from({ length: 24 }, (_, dieIndex) =>
        resolveAppearanceRecipeV3(
          recipe,
          contextV3({ target: "d6", dieIdentity: `custom:${String(dieIndex)}` }),
          policy,
        ).appearance.palette,
      );

    expect(new Set(palettes(solid, "property-streams-r34").flat())).toEqual(
      new Set([colors[0]]),
    );
    const solidR35 = palettes(solid, "property-streams-r35");
    expect(
      solidR35.every((palette) => new Set(palette).size === 1),
    ).toBe(true);
    expect(new Set(solidR35.flat())).toEqual(new Set(colors));

    const gradientR35 = palettes(gradient, "property-streams-r35");
    expect(
      gradientR35.every((palette) =>
        colors.every((color) => palette.includes(color)),
      ),
    ).toBe(true);
    expect(new Set(gradientR35.map(([color]) => color))).toEqual(
      new Set(colors),
    );

    const generatedSolid = appearanceRecipeV3({
      ...solid,
      colors: { mode: "vivid-random-pair" },
    });
    const generatedGradient = appearanceRecipeV3({
      ...gradient,
      colors: { mode: "vivid-random-pair" },
    });
    const generatedGradientR35 = palettes(
      generatedGradient,
      "property-streams-r35",
    );
    const generatedColors = new Set(generatedGradientR35[0]);
    expect(generatedColors.size).toBe(2);
    expect(
      new Set(
        generatedGradientR35.map((palette) => [...palette].sort().join(",")),
      ).size,
    ).toBe(1);
    expect(
      new Set(palettes(generatedSolid, "property-streams-r35").flat()),
    ).toEqual(generatedColors);
  });

  it("honors explicit coordinated and one-per-die color schemes", () => {
    const colors = ["#f05a24", "#04c9df", "#8a4fff"] as const;
    const base = appearanceRecipeV3({
      variation: "curated",
      varyBy: "die",
      colors: { mode: "palette", colors: [...colors] },
      material: {
        mode: "fixed",
        value: {
          family: "classic",
          treatment: "gradient",
          opacity: "opaque",
          finish: "satin",
          textureScale: 100,
        },
      },
    });
    const palettes = (recipe: AppearanceRecipeV3) =>
      Array.from({ length: 256 }, (_, dieIndex) =>
        resolveAppearanceRecipeV3(
          recipe,
          contextV3({
            target: "d6",
            dieIndex,
            dieIdentity: `custom:${String(dieIndex)}`,
          }),
          "property-streams-r37",
        ).appearance.palette,
      );

    const coordinated = palettes({
      ...base,
      colorDistribution: "coordinated",
    });
    expect(coordinated.every((palette) => palette.join() === colors.join())).toBe(
      true,
    );

    const onePerDie = palettes({
      ...base,
      colorDistribution: "one-per-die",
    });
    expect(onePerDie.every((palette) => new Set(palette).size === 1)).toBe(true);
    expect(new Set(onePerDie.flat())).toEqual(new Set(colors));

    const rollScoped = palettes({
      ...base,
      varyBy: "roll",
      colorDistribution: "one-per-die",
    });
    expect(rollScoped.every((palette) => new Set(palette).size === 1)).toBe(true);
    expect(new Set(rollScoped.flat())).toEqual(new Set(colors));

    const groupScoped = palettes({
      ...base,
      varyBy: "group",
      colorDistribution: "one-per-die",
    });
    expect(groupScoped.every((palette) => new Set(palette).size === 1)).toBe(true);
    expect(new Set(groupScoped.flat())).toEqual(new Set(colors));
  });

  it("keeps Splatter's authored background first in r35", () => {
    const splatter = BUILTIN_APPEARANCE_STYLES_R34_V3.find(
      ({ id }) => id === "paint-splatter",
    );
    if (splatter === undefined) throw new Error("Splatter fixture is missing");

    const palettes = Array.from({ length: 512 }, (_, dieIndex) =>
      resolveAppearanceRecipeV3(
        splatter.recipe,
        contextV3({ target: "d6", dieIdentity: `custom:${String(dieIndex)}` }),
        "property-streams-r35",
      ).appearance.palette,
    );
    const authored = R32_MATERIAL_PALETTES_V3["paint-splatter"];

    for (const palette of palettes) {
      expect(palette).toEqual(authored);
    }
  });

  it("keeps authored Complete look palettes coordinated across a matched set", () => {
    const styleIds = [
      "hex-appeal",
      "critical-mass",
      "glass-cannon",
      "heavy-metal",
      "hollow-victory",
      "grain-expectations",
      "elemental-lava-r33",
      "elemental-sand",
      "elemental-blue-sky-r33",
      "elemental-sunset-r33",
      "paint-splatter",
    ];

    for (const styleId of styleIds) {
      const style = APPEARANCE_CATALOG_V3.styles.find(
        ({ id }) => id === styleId,
      );
      if (style === undefined || style.recipe.colors.mode !== "palette") {
        throw new Error(`Complete look fixture is missing: ${styleId}`);
      }

      for (let dieIndex = 0; dieIndex < 32; dieIndex += 1) {
        const resolved = resolveAppearanceRecipeV3(
          style.recipe,
          contextV3({
            target: "d6",
            dieIndex,
            dieIdentity: `custom:${String(dieIndex)}`,
          }),
          "property-streams-r37",
        );
        expect(resolved.appearance.palette).toEqual(style.recipe.colors.colors);
      }
    }
  });

  it("keeps Lava's crust and glow colors in their authored order", () => {
    const lava = APPEARANCE_CATALOG_V3.styles.find(
      ({ id }) => id === "elemental-lava-r33",
    );
    if (lava === undefined) throw new Error("Lava fixture is missing");

    const authored = R32_MATERIAL_PALETTES_V3["elemental-lava"];
    for (const policy of [
      "property-streams-r35",
      "property-streams-r37",
    ] as const) {
      const palettes = Array.from({ length: 64 }, (_, dieIndex) =>
        resolveAppearanceRecipeV3(
          lava.recipe,
          contextV3({
            target: "d6",
            dieIndex,
            dieIdentity: `custom:${String(dieIndex)}`,
          }),
          policy,
        ).appearance.palette,
      );

      for (const palette of palettes) {
        expect(palette).toEqual(authored);
      }
    }
  });

  it("keeps every r27 chosen random partner visibly distinct", () => {
    const recipe = appearanceRecipeV3({
      variation: "fixed",
      colors: { mode: "random", primary: "#808080" },
    });
    for (let renderSeed = 0; renderSeed < 64; renderSeed += 1) {
      const [primary, partner] = resolveAppearanceRecipeV3(
        recipe,
        contextV3({ renderSeed }),
        "property-streams-r27",
      ).appearance.palette.map((color) =>
        [1, 3, 5].map((offset) =>
          Number.parseInt(color.slice(offset, offset + 2), 16),
        ),
      );
      if (primary === undefined || partner === undefined) {
        throw new Error("Random partner fixture is missing");
      }
      expect(
        Math.hypot(
          ...primary.map(
            (channel, index) => channel - (partner[index] ?? channel),
          ),
        ),
      ).toBeGreaterThanOrEqual(110);
    }
  });

  it("rerolls r27 texture placement without coupling it to font edits", () => {
    const recipe = appearanceRecipeV3({
      variation: "fixed",
      colors: { mode: "palette", colors: ["#18cfd1", "#095b62"] },
    });
    const changedFont: AppearanceRecipeV3 = {
      ...recipe,
      font: { mode: "fixed", value: "syncopate" },
    };
    const first = resolveAppearanceRecipeV3(
      recipe,
      contextV3({ renderSeed: 200 }),
      "property-streams-r27",
    );
    const fontOnly = resolveAppearanceRecipeV3(
      changedFont,
      contextV3({ renderSeed: 200 }),
      "property-streams-r27",
    );
    const reseeded = resolveAppearanceRecipeV3(
      recipe,
      contextV3({ renderSeed: 201 }),
      "property-streams-r27",
    );

    expect(fontOnly.appearance.engraving.fontId).toBe("syncopate");
    expect({
      ...fontOnly.appearance,
      engraving: { ...fontOnly.appearance.engraving, fontId: "font" },
    }).toEqual({
      ...first.appearance,
      engraving: { ...first.appearance.engraving, fontId: "font" },
    });
    expect(first.appearance.texture.scope).toBe("face-local");
    expect(reseeded.appearance.palette).toEqual(first.appearance.palette);
    expect(reseeded.appearance.texture.seed).not.toBe(
      first.appearance.texture.seed,
    );
  });

  it("keeps shadow colors dominant with a subtle darker partner", () => {
    const resolved = resolveAppearanceRecipeV3(
      appearanceRecipeV3({
        variation: "fixed",
        colors: { mode: "shadow", primary: "#6699cc" },
      }),
      contextV3(),
      "property-streams-r37",
    );

    expect(resolved.appearance.palette).toEqual(["#6699cc", "#527aa3"]);
  });

  it("keeps r27 tonal partners close to the selected color", () => {
    const resolved = resolveAppearanceRecipeV3(
      appearanceRecipeV3({
        variation: "fixed",
        colors: { mode: "tonal", primary: "#6f42c1" },
      }),
      contextV3(),
      "property-streams-r27",
    );

    expect(resolved.appearance.palette).toEqual(["#6f42c1", "#9371d1"]);
  });

  it.each([
    ["canvaskit-v4-r30", "property-streams-r30"],
    ["canvaskit-v4-r31", "property-streams-r31"],
    ["canvaskit-v4-r32", "property-streams-r32"],
    ["canvaskit-v4-r33", "property-streams-r33"],
    ["canvaskit-v4-r34", "property-streams-r34"],
    ["canvaskit-v4-r35", "property-streams-r35"],
    ["canvaskit-v4-r36", "property-streams-r35"],
    ["canvaskit-v4-r37", "property-streams-r37"],
    ["canvaskit-v4-r38", "property-streams-r37"],
    ["canvaskit-v4-r39", "property-streams-r37"],
    ["canvaskit-v4-r40", "property-streams-r37"],
    ["canvaskit-v4-r41", "property-streams-r37"],
    ["canvaskit-v4-r42", "property-streams-r37"],
  ] as const)(
    "builds a valid %s snapshot for every built-in and target",
    (rendererRevision, seedPolicy) => {
      const resultByTarget = {
        d4: 4,
        d6: 6,
        d8: 8,
        d10: 10,
        d12: 12,
        d20: 20,
        percentile: 90,
        fudge: 1,
        other: 999,
      } as const;

      const usesR37Catalog =
        rendererRevision === "canvaskit-v4-r37" ||
        rendererRevision === "canvaskit-v4-r38" ||
        rendererRevision === "canvaskit-v4-r39" ||
        rendererRevision === "canvaskit-v4-r40" ||
        rendererRevision === "canvaskit-v4-r41" ||
        rendererRevision === "canvaskit-v4-r42";
      const styles = usesR37Catalog
        ? BUILTIN_APPEARANCE_STYLES_V3
        : BUILTIN_APPEARANCE_STYLES_R34_V3;
      for (const style of styles) {
        const r32OnlyStyle =
          style.id.startsWith("elemental-") || style.id === "paint-splatter";
        if (
          rendererRevision !== "canvaskit-v4-r32" &&
          rendererRevision !== "canvaskit-v4-r33" &&
          rendererRevision !== "canvaskit-v4-r34" &&
          rendererRevision !== "canvaskit-v4-r35" &&
          rendererRevision !== "canvaskit-v4-r36" &&
          rendererRevision !== "canvaskit-v4-r37" &&
          rendererRevision !== "canvaskit-v4-r38" &&
          rendererRevision !== "canvaskit-v4-r39" &&
          rendererRevision !== "canvaskit-v4-r40" &&
          rendererRevision !== "canvaskit-v4-r41" &&
          rendererRevision !== "canvaskit-v4-r42" &&
          r32OnlyStyle
        ) {
          continue;
        }
        for (const target of APPEARANCE_TARGETS) {
          const recipe = style.overrides?.[target] ?? style.recipe;
          const resolved = resolveAppearanceRecipeV3(
            recipe,
            contextV3({ target }),
            seedPolicy,
          );
          let outlineColor: RenderDieV4["appearance"]["outlineColor"] =
            "#000000";
          if (rendererRevision === "canvaskit-v4-r39") {
            outlineColor = resolved.appearance.outlineColor;
          } else if (rendererRevision === "canvaskit-v4-r40") {
            outlineColor = resolveAppearanceOutlineColorR40V3(resolved, target);
          } else if (
            rendererRevision === "canvaskit-v4-r41" ||
            rendererRevision === "canvaskit-v4-r42"
          ) {
            outlineColor = resolveAppearanceOutlineColorR41V3(resolved, target);
          }
          const common = {
            target,
            result: resultByTarget[target],
            form: resolved.form,
            appearance: {
              ...resolved.appearance,
              outlineColor,
              effect: null,
            },
            icons: [] satisfies RenderDieV4["icons"],
            view: getAuthoredRenderViewV4(
              rendererRevision,
              "legacy",
              {
                target,
                result: resultByTarget[target],
                form: resolved.form,
              },
            ),
          };
          const die: RenderDieV4 =
            target === "other"
              ? { ...common, target, sides: 999 }
              : { ...common, target };
          expect(() =>
            validateRenderRequestV4({
              version: 4,
              rendererRevision,
              groups: [[die]],
            }),
          ).not.toThrow();
        }
      }
    },
  );

  it("requires physical local separation when Void turns light ink dark", () => {
    const resolved = resolveAppearanceRecipeV3(
      appearanceRecipeV3({
        colors: { mode: "palette", colors: ["#050208", "#170022"] },
        engraving: { mode: "fixed", value: "void" },
      }),
      contextV3(),
    );

    expect(resolved.appearance.engraving).toEqual({
      fontId: "liberation-sans",
      finish: "void",
      color: "#faf9f6",
    });
    expect(resolved.appearance.requiresLocalSeparation).toBe(true);
  });

  it("fails closed when face-local gradients cannot map to a physical side", () => {
    expect(() =>
      resolveAppearanceRecipeV3(
        appearanceRecipeV3({
          form: {
            polyhedral: { mode: "fixed", value: "sharp" },
            other: "sphere",
          },
        }),
        contextV3(),
      ),
    ).toThrow(
      "Appearance repeated gradient requires standard polyhedral form",
    );
  });
});
