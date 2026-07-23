import { describe, expect, it } from "vitest";
import {
  APPEARANCE_GRADIENT_COLOR_SOURCES,
  APPEARANCE_GRADIENT_SCOPES,
  APPEARANCE_LIGHTING_DIRECTIONS,
  APPEARANCE_LIGHTING_MODES,
  APPEARANCE_LIGHTING_STRENGTHS,
  APPEARANCE_LINEAR_DIRECTIONS,
  APPEARANCE_RECIPE_COMPATIBILITIES,
  BUILTIN_APPEARANCE_STYLES_V3,
  applyDesignToAll,
  assignDesignToTarget,
  parseAppearancePreviewRequest,
  parseAppearancePreviewRequestV2,
  parseAppearancePreviewRequestV3,
  parseAppearanceProfile,
  parseAppearanceProfileV2,
  parseAppearanceRecipe,
  parseAppearanceRecipeV2,
  parseGuildAppearanceProfile,
  parseGuildAppearanceProfileV2,
  type AppearanceCatalog,
  type AppearanceRecipeV2,
  type ResolvedAppearanceV2,
} from "../../packages/dice-appearance/src";

const catalog: AppearanceCatalog = {
  builtinStyleIds: ["chaotic", "prototype-obsidian"],
  fontIds: ["liberation-sans", "new-rocker"],
  patternIds: ["checkerboard", "marble"],
};

const customDesignId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";

function validProfileV2(): unknown {
  return {
    version: 2,
    designs: [
      {
        id: customDesignId,
        name: "  Aurora glass  ",
        recipe: {
          version: 2,
          compatibility: "native-v2",
          variation: "wild",
          varyBy: "group",
          colors: {
            mode: "palette",
            colors: ["#A020F0", "#111111", "#008B8B"],
          },
          fill: { mode: "fixed", value: { type: "gradient" } },
          font: { mode: "fixed", fontId: "liberation-sans" },
          gradient: {
            colorSource: "full-palette",
            scope: {
              mode: "weighted",
              options: [
                { value: "repeated", weight: 2 },
                { value: "die-wide", weight: 3 },
              ],
            },
            direction: {
              mode: "allowlist",
              values: [
                "top-to-bottom",
                "upper-left-to-lower-right",
              ],
            },
          },
          lighting: {
            mode: {
              mode: "allowlist",
              values: ["none", "combined"],
            },
            strength: {
              mode: "weighted",
              options: [
                { value: "subtle", weight: 4 },
                { value: "strong", weight: 1 },
              ],
            },
            direction: { mode: "fixed", value: "upper-left" },
          },
        },
      },
    ],
    assignments: {
      all: { source: "custom", id: customDesignId },
      overrides: {},
    },
  };
}

function mutableV2Recipe(profile: unknown): Record<string, unknown> {
  return (
    profile as {
      designs: Array<{ recipe: Record<string, unknown> }>;
    }
  ).designs[0]?.recipe ?? {};
}

function validProfile(): unknown {
  return {
    version: 1,
    designs: [
      {
        id: customDesignId,
        name: "  Purple runes  ",
        recipe: {
          version: 1,
          variation: "curated",
          varyBy: "die",
          colors: { mode: "palette", colors: ["#A020F0", "#111111"] },
          fill: {
            mode: "allowlist",
            values: [
              { type: "gradient" },
              { type: "pattern", patternId: "checkerboard" },
            ],
          },
          font: {
            mode: "allowlist",
            fontIds: ["liberation-sans", "new-rocker"],
          },
        },
      },
    ],
    assignments: {
      all: { source: "builtin", id: "chaotic" },
      overrides: {
        d20: { source: "custom", id: customDesignId },
      },
    },
  };
}

describe("appearance V2 wire contract", () => {
  it("publishes the approved linear-gradient and lighting literals", () => {
    expect(APPEARANCE_RECIPE_COMPATIBILITIES).toEqual([
      "legacy-v1",
      "native-v2",
    ]);
    expect(APPEARANCE_GRADIENT_COLOR_SOURCES).toEqual([
      "resolved-pair",
      "full-palette",
    ]);
    expect(APPEARANCE_GRADIENT_SCOPES).toEqual(["repeated", "die-wide"]);
    expect(APPEARANCE_LINEAR_DIRECTIONS).toEqual([
      "top-to-bottom",
      "upper-right-to-lower-left",
      "right-to-left",
      "lower-right-to-upper-left",
      "bottom-to-top",
      "lower-left-to-upper-right",
      "left-to-right",
      "upper-left-to-lower-right",
    ]);
    expect(APPEARANCE_LIGHTING_MODES).toEqual([
      "none",
      "facet",
      "directional",
      "combined",
    ]);
    expect(APPEARANCE_LIGHTING_STRENGTHS).toEqual([
      "gentle",
      "subtle",
      "strong",
    ]);
    expect(APPEARANCE_LIGHTING_DIRECTIONS).toEqual([
      "top",
      "upper-left",
      "upper-right",
      "left",
      "right",
    ]);

    const recipe: AppearanceRecipeV2 = {
      version: 2,
      compatibility: "native-v2",
      variation: "fixed",
      varyBy: "die",
      colors: { mode: "palette", colors: ["#a020f0", "#111111"] },
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
        strength: { mode: "fixed", value: "gentle" },
        direction: { mode: "fixed", value: "upper-left" },
      },
    };
    expect(parseAppearanceRecipeV2(recipe, catalog)).toEqual(recipe);

    const resolved: ResolvedAppearanceV2[] = [
      {
        version: 2,
        compatibility: "native-v2",
        surface: { type: "solid", color: "#a020f0" },
        lighting: { mode: "none" },
        textColor: "#faf9f6",
        outlineColor: "#000000",
        fontId: "liberation-sans",
        requiresLocalSeparation: false,
      },
      {
        version: 2,
        compatibility: "legacy-v1",
        surface: {
          type: "gradient",
          colors: ["#a020f0", "#a020f0"],
          scope: "repeated",
          direction: "top-to-bottom",
        },
        lighting: { mode: "facet", strength: "subtle" },
        textColor: "#111111",
        outlineColor: "#000000",
        fontId: "liberation-sans",
        requiresLocalSeparation: true,
      },
      {
        version: 2,
        compatibility: "native-v2",
        surface: {
          type: "pattern",
          patternId: "checkerboard",
          primaryColor: "#a020f0",
          secondaryColor: "#111111",
        },
        lighting: {
          mode: "directional",
          strength: "strong",
          direction: "right",
        },
        textColor: "#faf9f6",
        outlineColor: "#000000",
        fontId: "new-rocker",
        requiresLocalSeparation: false,
      },
      {
        version: 2,
        compatibility: "native-v2",
        surface: {
          type: "gradient",
          colors: ["#a020f0", "#111111", "#ffffff"],
          scope: "die-wide",
          direction: "upper-left-to-lower-right",
        },
        lighting: {
          mode: "combined",
          strength: "subtle",
          direction: "upper-left",
        },
        textColor: "#faf9f6",
        outlineColor: "#000000",
        fontId: "liberation-sans",
        requiresLocalSeparation: true,
      },
    ];
    expect(resolved.map(({ lighting }) => lighting.mode)).toEqual([
      "none",
      "facet",
      "directional",
      "combined",
    ]);
  });
});

describe("appearance V2 validation", () => {
  it("canonicalizes native personal and guild profiles", () => {
    const profile = parseAppearanceProfileV2(validProfileV2(), catalog);
    expect(profile.designs[0]?.name).toBe("Aurora glass");
    expect(profile.designs[0]?.recipe.colors).toEqual({
      mode: "palette",
      colors: ["#a020f0", "#111111", "#008b8b"],
    });
    expect(profile.designs[0]?.recipe.gradient.scope).toEqual({
      mode: "weighted",
      options: [
        { value: "repeated", weight: 2 },
        { value: "die-wide", weight: 3 },
      ],
    });

    const guild = validProfileV2() as Record<string, unknown>;
    guild.mode = "enforced";
    expect(parseGuildAppearanceProfileV2(guild, catalog).mode).toBe(
      "enforced",
    );
  });

  it("rejects mixed versions, missing fields, and unknown fields", () => {
    const mixed = validProfileV2();
    mutableV2Recipe(mixed).version = 1;
    expect(() => parseAppearanceProfileV2(mixed, catalog)).toThrow(
      "Appearance recipe V2 is invalid",
    );

    const structurallyMixed = validProfileV2() as {
      designs: Array<{ recipe: unknown }>;
    };
    const mixedDesign = structurallyMixed.designs[0];
    if (mixedDesign === undefined) throw new Error("Fixture design is missing");
    mixedDesign.recipe = mutableV2Recipe(validProfile());
    expect(() => parseAppearanceProfileV2(structurallyMixed, catalog)).toThrow(
      "Appearance recipe V2 has invalid fields",
    );

    expect(() =>
      parseAppearanceRecipe(mutableV2Recipe(validProfileV2()), catalog),
    ).toThrow("Appearance recipe has invalid fields");

    const missing = validProfileV2();
    delete mutableV2Recipe(missing).lighting;
    expect(() => parseAppearanceProfileV2(missing, catalog)).toThrow(
      "Appearance recipe V2 has invalid fields",
    );

    const unknown = validProfileV2();
    const gradient = mutableV2Recipe(unknown).gradient as Record<
      string,
      unknown
    >;
    gradient.radialOrigin = "center";
    expect(() => parseAppearanceProfileV2(unknown, catalog)).toThrow(
      "Appearance gradient V2 has invalid fields",
    );
  });

  it("rejects invalid, duplicate, and unbounded treatment selections", () => {
    const duplicate = validProfileV2();
    const duplicateGradient = mutableV2Recipe(duplicate)
      .gradient as Record<string, unknown>;
    duplicateGradient.scope = {
      mode: "allowlist",
      values: ["repeated", "repeated"],
    };
    expect(() => parseAppearanceProfileV2(duplicate, catalog)).toThrow(
      "Appearance gradient scopes must be distinct",
    );

    const invalidWeight = validProfileV2();
    const invalidLighting = mutableV2Recipe(invalidWeight)
      .lighting as Record<string, unknown>;
    invalidLighting.strength = {
      mode: "weighted",
      options: [{ value: "subtle", weight: 0 }],
    };
    expect(() => parseAppearanceProfileV2(invalidWeight, catalog)).toThrow(
      "Appearance selection weight must be from 1 through 1000",
    );

    const unsupported = validProfileV2();
    const unsupportedGradient = mutableV2Recipe(unsupported)
      .gradient as Record<string, unknown>;
    unsupportedGradient.direction = {
      mode: "fixed",
      value: "clockwise",
    };
    expect(() => parseAppearanceProfileV2(unsupported, catalog)).toThrow(
      "Appearance linear direction is not supported",
    );
  });

  it("accepts native random pairs and repeated palette stops only across native V2 boundaries", () => {
    const randomPair = validProfileV2();
    mutableV2Recipe(randomPair).colors = { mode: "random-pair" };
    expect(
      parseAppearanceProfileV2(randomPair, catalog).designs[0]?.recipe.colors,
    ).toEqual({ mode: "random-pair" });

    const vividRandomPair = validProfileV2();
    mutableV2Recipe(vividRandomPair).colors = {
      mode: "vivid-random-pair",
    };
    expect(
      parseAppearanceProfileV2(vividRandomPair, catalog).designs[0]?.recipe
        .colors,
    ).toEqual({ mode: "vivid-random-pair" });

    const repeatedPalette = validProfileV2();
    mutableV2Recipe(repeatedPalette).colors = {
      mode: "palette",
      colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
    };
    expect(
      parseAppearanceProfileV2(repeatedPalette, catalog).designs[0]?.recipe
        .colors,
    ).toEqual({
      mode: "palette",
      colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
    });

    const oneDistinctColor = validProfileV2();
    mutableV2Recipe(oneDistinctColor).colors = {
      mode: "palette",
      colors: ["#ffffff", "#ffffff"],
    };
    expect(() => parseAppearanceProfileV2(oneDistinctColor, catalog)).toThrow(
      "Appearance palette must contain at least two distinct colors",
    );

    const legacyRandomPair = mutableV2Recipe(validProfileV2());
    legacyRandomPair.compatibility = "legacy-v1";
    legacyRandomPair.colors = { mode: "random-pair" };
    legacyRandomPair.gradient = {
      colorSource: "resolved-pair",
      scope: { mode: "fixed", value: "repeated" },
      direction: { mode: "fixed", value: "top-to-bottom" },
    };
    legacyRandomPair.lighting = {
      mode: { mode: "fixed", value: "facet" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    };
    expect(() => parseAppearanceRecipeV2(legacyRandomPair, catalog)).toThrow(
      "Legacy appearance recipe colors are invalid",
    );

    legacyRandomPair.colors = {
      mode: "vivid-random-pair",
    };
    expect(() => parseAppearanceRecipeV2(legacyRandomPair, catalog)).toThrow(
      "Legacy appearance recipe colors are invalid",
    );

    legacyRandomPair.colors = {
      mode: "palette",
      colors: ["#5bcffa", "#f5abb9", "#ffffff", "#f5abb9", "#5bcffa"],
    };
    expect(() => parseAppearanceRecipeV2(legacyRandomPair, catalog)).toThrow(
      "Legacy appearance recipe colors are invalid",
    );

    const duplicateV1 = mutableV2Recipe(validProfile());
    duplicateV1.colors = {
      mode: "palette",
      colors: ["#a020f0", "#a020f0"],
    };
    expect(() => parseAppearanceRecipe(duplicateV1, catalog)).toThrow(
      "Appearance palette colors must be distinct",
    );
  });

  it("enforces canonical compatibility treatments", () => {
    const legacy = validProfileV2();
    const legacyRecipe = mutableV2Recipe(legacy);
    legacyRecipe.compatibility = "legacy-v1";
    expect(() => parseAppearanceProfileV2(legacy, catalog)).toThrow(
      "Legacy appearance recipe treatment is invalid",
    );

    const nativePair = validProfileV2();
    const nativeGradient = mutableV2Recipe(nativePair)
      .gradient as Record<string, unknown>;
    nativeGradient.colorSource = "resolved-pair";
    expect(() => parseAppearanceProfileV2(nativePair, catalog)).toThrow(
      "Native appearance recipes require full-palette gradients",
    );

    const validLegacy = mutableV2Recipe(validProfileV2());
    validLegacy.compatibility = "legacy-v1";
    validLegacy.gradient = {
      colorSource: "resolved-pair",
      scope: { mode: "fixed", value: "repeated" },
      direction: { mode: "fixed", value: "top-to-bottom" },
    };
    validLegacy.lighting = {
      mode: { mode: "fixed", value: "facet" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    };
    expect(() => parseAppearanceRecipeV2(validLegacy, catalog)).not.toThrow();
  });
});

describe("appearance preview version boundaries", () => {
  it("parses exact Profile V3 preview requests without browser migration", () => {
    const style = BUILTIN_APPEARANCE_STYLES_V3[0];
    if (style === undefined) throw new Error("V3 style fixture is missing");
    const request = {
      target: "all",
      recipe: style.recipe,
      seed: 0xffff_ffff,
      state: "critical-failure",
    };

    expect(parseAppearancePreviewRequestV3(request)).toEqual(request);
    expect(() =>
      parseAppearancePreviewRequestV3({
        ...request,
        recipe: mutableV2Recipe(validProfileV2()),
      }),
    ).toThrow("Appearance recipe V3 has invalid fields");
    expect(() =>
      parseAppearancePreviewRequestV3({ ...request, remoteTextureUrl: "x" }),
    ).toThrow("Appearance preview request is invalid");
  });

  it("parses V2 recipes and rejects V1/V2 mixtures", () => {
    const v2Request = {
      target: "all",
      recipe: mutableV2Recipe(validProfileV2()),
      seed: 0xffff_ffff,
      state: "critical-success",
    };
    const v1Request = {
      ...v2Request,
      recipe: mutableV2Recipe(validProfile()),
    };

    expect(
      parseAppearancePreviewRequestV2(v2Request, catalog),
    ).toMatchObject({ recipe: { version: 2 } });
    expect(() =>
      parseAppearancePreviewRequestV2(v1Request, catalog),
    ).toThrow();
    expect(() => parseAppearancePreviewRequest(v2Request, catalog)).toThrow();
  });

  it("keeps V2 preview envelopes exact and bounded", () => {
    const request = {
      target: "d20",
      recipe: mutableV2Recipe(validProfileV2()),
      seed: 1,
      state: "normal",
      unexpected: true,
    };
    expect(() =>
      parseAppearancePreviewRequestV2(request, catalog),
    ).toThrow("Appearance preview request is invalid");

    const outOfRange = {
      target: request.target,
      recipe: request.recipe,
      seed: 0x1_0000_0000,
      state: request.state,
    };
    expect(() =>
      parseAppearancePreviewRequestV2(outOfRange, catalog),
    ).toThrow("Appearance preview request is invalid");
  });
});

describe("parseAppearanceProfile", () => {
  it("validates references and returns a canonical profile", () => {
    const profile = parseAppearanceProfile(validProfile(), catalog);

    expect(profile.designs[0]?.name).toBe("Purple runes");
    expect(profile.designs[0]?.recipe.colors).toEqual({
      mode: "palette",
      colors: ["#a020f0", "#111111"],
    });
    expect(profile.assignments.overrides.d20).toEqual({
      source: "custom",
      id: customDesignId,
    });
  });

  it("accepts an unconfigured profile that resolves through Chaotic", () => {
    expect(
      parseAppearanceProfile(
        {
          version: 1,
          designs: [],
          assignments: { all: null, overrides: {} },
        },
        catalog,
      ),
    ).toEqual({
      version: 1,
      designs: [],
      assignments: { all: null, overrides: {} },
    });
  });

  it("accepts explicit weighted surface and font selections", () => {
    const profile = validProfile() as {
      designs: Array<{
        recipe: {
          fill: unknown;
          font: unknown;
        };
      }>;
    };
    const design = profile.designs[0];
    if (design === undefined) throw new Error("Fixture design is missing");
    design.recipe.fill = {
      mode: "weighted",
      options: [
        { value: { type: "gradient" }, weight: 60 },
        {
          value: { type: "pattern", patternId: "checkerboard" },
          weight: 40,
        },
      ],
    };
    design.recipe.font = {
      mode: "weighted",
      options: [
        { fontId: "liberation-sans", weight: 7 },
        { fontId: "new-rocker", weight: 3 },
      ],
    };

    const parsed = parseAppearanceProfile(profile, catalog);
    expect(parsed.designs[0]?.recipe.fill).toEqual(design.recipe.fill);
    expect(parsed.designs[0]?.recipe.font).toEqual(design.recipe.font);
  });

  it("rejects duplicate weighted options and invalid weights", () => {
    const profile = validProfile() as {
      designs: Array<{ recipe: { fill: unknown; font: unknown } }>;
    };
    const design = profile.designs[0];
    if (design === undefined) throw new Error("Fixture design is missing");
    design.recipe.fill = {
      mode: "weighted",
      options: [
        { value: { type: "gradient" }, weight: 60 },
        { value: { type: "gradient" }, weight: 40 },
      ],
    };
    expect(() => parseAppearanceProfile(profile, catalog)).toThrow(
      "Appearance weighted fills must be distinct",
    );

    design.recipe.fill = { mode: "fixed", value: { type: "gradient" } };
    design.recipe.font = {
      mode: "weighted",
      options: [{ fontId: "liberation-sans", weight: 0 }],
    };
    expect(() => parseAppearanceProfile(profile, catalog)).toThrow(
      "Appearance selection weight must be from 1 through 1000",
    );
  });

  it("rejects unknown catalog identifiers", () => {
    const profile = validProfile() as {
      designs: Array<{ recipe: { font: { fontIds: string[] } } }>;
    };
    const [design] = profile.designs;
    if (design === undefined) throw new Error("Fixture design is missing");
    design.recipe.font.fontIds = ["missing-font"];

    expect(() => parseAppearanceProfile(profile, catalog)).toThrow(
      "Appearance font id is not supported",
    );
  });

  it("rejects duplicate palette colors so Wild pairs remain distinct", () => {
    const profile = validProfile() as {
      designs: Array<{ recipe: { colors: { colors: string[] } } }>;
    };
    const [design] = profile.designs;
    if (design === undefined) throw new Error("Fixture design is missing");
    design.recipe.colors.colors = ["#a020f0", "#A020F0"];

    expect(() => parseAppearanceProfile(profile, catalog)).toThrow(
      "Appearance palette colors must be distinct",
    );
  });

  it("rejects custom references that are not owned by the profile", () => {
    const profile = validProfile() as {
      assignments: { overrides: Record<string, unknown> };
    };
    profile.assignments.overrides.d6 = {
      source: "custom",
      id: "c69e0632-9a4b-4677-9dbc-dce2c98acb28",
    };

    expect(() => parseAppearanceProfile(profile, catalog)).toThrow(
      "Appearance custom design reference is missing",
    );
  });

  it("rejects more than ten custom designs", () => {
    const profile = validProfile() as { designs: unknown[] };
    profile.designs = Array.from({ length: 11 }, (_, index) => ({
      ...(profile.designs[0] as object),
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));

    expect(() => parseAppearanceProfile(profile, catalog)).toThrow(
      "Appearance profile must contain at most ten designs",
    );
  });

  it("rejects unknown fields instead of silently storing them", () => {
    const profile = validProfile() as Record<string, unknown>;
    profile.unexpected = true;

    expect(() => parseAppearanceProfile(profile, catalog)).toThrow(
      "Appearance profile has invalid fields",
    );
  });
});

describe("parseGuildAppearanceProfile", () => {
  it("validates and canonicalizes the guild mode with the shared profile", () => {
    const profile = validProfile() as Record<string, unknown>;
    profile.mode = "enforced";

    expect(parseGuildAppearanceProfile(profile, catalog).mode).toBe(
      "enforced",
    );
  });

  it("rejects invalid modes and unknown fields", () => {
    const invalidMode = validProfile() as Record<string, unknown>;
    invalidMode.mode = "sometimes";
    expect(() => parseGuildAppearanceProfile(invalidMode, catalog)).toThrow(
      "Guild appearance mode is invalid",
    );

    const unknownField = validProfile() as Record<string, unknown>;
    unknownField.mode = "default";
    unknownField.unexpected = true;
    expect(() => parseGuildAppearanceProfile(unknownField, catalog)).toThrow(
      "Guild appearance profile has invalid fields",
    );
  });
});

describe("appearance assignments", () => {
  it("applies one design to all dice and removes overrides", () => {
    const profile = parseAppearanceProfile(validProfile(), catalog);
    const reference = { source: "custom", id: customDesignId } as const;

    expect(applyDesignToAll(profile, reference).assignments).toEqual({
      all: reference,
      overrides: {},
    });
  });

  it("assigns one die type without replacing the all-dice design", () => {
    const profile = parseAppearanceProfile(validProfile(), catalog);
    const reference = { source: "builtin", id: "prototype-obsidian" } as const;

    expect(
      assignDesignToTarget(profile, "d6", reference).assignments,
    ).toEqual({
      all: { source: "builtin", id: "chaotic" },
      overrides: {
        d6: reference,
        d20: { source: "custom", id: customDesignId },
      },
    });
  });
});
