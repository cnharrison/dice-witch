import { describe, expect, it } from "vitest";
import {
  legacyAppearanceRecipeV1,
  migrateAppearanceProfileV1,
  migrateAppearanceRecipeV1,
  migrateGuildAppearanceProfileV1,
  parseAppearanceProfile,
  parseAppearanceProfileV2,
  parseGuildAppearanceProfile,
  type AppearanceCatalog,
  type AppearanceRecipeV2,
} from "../../packages/dice-appearance/src";

const catalog: AppearanceCatalog = {
  builtinStyleIds: ["chaotic"],
  fontIds: ["liberation-sans", "new-rocker"],
  patternIds: ["checkerboard"],
};
const designId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";

function profileV1(): unknown {
  return {
    version: 1,
    designs: [
      {
        id: designId,
        name: "Legacy spectrum",
        recipe: {
          version: 1,
          variation: "wild",
          varyBy: "group",
          colors: {
            mode: "palette",
            colors: ["#A020F0", "#111111", "#008B8B"],
          },
          fill: {
            mode: "weighted",
            options: [
              { value: { type: "gradient" }, weight: 3 },
              {
                value: { type: "pattern", patternId: "checkerboard" },
                weight: 2,
              },
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
      all: { source: "custom", id: designId },
      overrides: { d20: { source: "builtin", id: "chaotic" } },
    },
  };
}

describe("appearance V1 to V2 migration", () => {
  it("adds the exact legacy treatment without mutating the profile", () => {
    const source = parseAppearanceProfile(profileV1(), catalog);
    const sourceJson = JSON.stringify(source);
    const migrated = migrateAppearanceProfileV1(source);

    expect(migrated).toEqual({
      version: 2,
      designs: [
        {
          id: designId,
          name: "Legacy spectrum",
          recipe: {
            version: 2,
            compatibility: "legacy-v1",
            variation: "wild",
            varyBy: "group",
            colors: {
              mode: "palette",
              colors: ["#a020f0", "#111111", "#008b8b"],
            },
            fill: source.designs[0]?.recipe.fill,
            font: source.designs[0]?.recipe.font,
            gradient: {
              colorSource: "resolved-pair",
              scope: { mode: "fixed", value: "repeated" },
              direction: { mode: "fixed", value: "top-to-bottom" },
            },
            lighting: {
              mode: { mode: "fixed", value: "facet" },
              strength: { mode: "fixed", value: "subtle" },
              direction: { mode: "fixed", value: "upper-left" },
            },
          },
        },
      ],
      assignments: source.assignments,
    });
    expect(parseAppearanceProfileV2(migrated, catalog)).toEqual(migrated);
    expect(JSON.stringify(source)).toBe(sourceJson);

    const migratedPalette = migrated.designs[0]?.recipe.colors;
    if (migratedPalette?.mode !== "palette") {
      throw new Error("Migrated palette is missing");
    }
    migratedPalette.colors[0] = "#ffffff";
    expect(source.designs[0]?.recipe.colors).toEqual({
      mode: "palette",
      colors: ["#a020f0", "#111111", "#008b8b"],
    });
  });

  it("reconstructs byte-for-byte canonical V1 recipe JSON for fixed hashing", () => {
    const source = parseAppearanceProfile(profileV1(), catalog);
    const recipeV1 = source.designs[0]?.recipe;
    if (recipeV1 === undefined) throw new Error("Fixture recipe is missing");

    const migrated = migrateAppearanceRecipeV1(recipeV1);
    const reconstructed = legacyAppearanceRecipeV1(migrated);
    expect(reconstructed).toEqual(recipeV1);
    expect(JSON.stringify(reconstructed)).toBe(JSON.stringify(recipeV1));
  });

  it("preserves guild mode and rejects native recipes as legacy", () => {
    const source = profileV1() as Record<string, unknown>;
    source.mode = "enforced";
    const guild = parseGuildAppearanceProfile(source, catalog);
    expect(migrateGuildAppearanceProfileV1(guild).mode).toBe("enforced");

    const guildRecipe = guild.designs[0]?.recipe;
    if (guildRecipe === undefined) throw new Error("Fixture recipe is missing");
    const native = {
      ...migrateAppearanceRecipeV1(guildRecipe),
      compatibility: "native-v2",
    } satisfies AppearanceRecipeV2;
    expect(() => legacyAppearanceRecipeV1(native)).toThrow(
      "Legacy appearance recipe is required",
    );
  });
});
