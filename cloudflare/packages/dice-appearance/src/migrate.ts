import type {
  AppearanceColors,
  AppearanceProfileV1,
  AppearanceProfileV2,
  AppearanceRecipeV1,
  AppearanceRecipeV2,
  GuildAppearanceProfileV1,
  GuildAppearanceProfileV2,
} from "./types";

const LEGACY_GRADIENT = {
  colorSource: "resolved-pair",
  scope: { mode: "fixed", value: "repeated" },
  direction: { mode: "fixed", value: "top-to-bottom" },
} as const;

const LEGACY_LIGHTING = {
  mode: { mode: "fixed", value: "facet" },
  strength: { mode: "fixed", value: "subtle" },
  direction: { mode: "fixed", value: "upper-left" },
} as const;

export function migrateAppearanceRecipeV1(
  recipe: AppearanceRecipeV1,
): AppearanceRecipeV2 {
  return {
    version: 2,
    compatibility: "legacy-v1",
    variation: recipe.variation,
    varyBy: recipe.varyBy,
    colors: structuredClone(recipe.colors),
    fill: structuredClone(recipe.fill),
    font: structuredClone(recipe.font),
    gradient: structuredClone(LEGACY_GRADIENT),
    lighting: structuredClone(LEGACY_LIGHTING),
  };
}

function legacyColors(recipe: AppearanceRecipeV2): AppearanceColors {
  if (
    recipe.colors.mode === "random-pair" ||
    recipe.colors.mode === "vivid-random-pair"
  ) {
    throw new Error("Legacy appearance recipe colors are invalid");
  }
  if (
    recipe.colors.mode === "palette" &&
    new Set(recipe.colors.colors).size !== recipe.colors.colors.length
  ) {
    throw new Error("Legacy appearance recipe colors are invalid");
  }
  return structuredClone(recipe.colors);
}

export function legacyAppearanceRecipeV1(
  recipe: AppearanceRecipeV2,
): AppearanceRecipeV1 {
  if (recipe.compatibility !== "legacy-v1") {
    throw new Error("Legacy appearance recipe is required");
  }
  return {
    version: 1,
    variation: recipe.variation,
    varyBy: recipe.varyBy,
    colors: legacyColors(recipe),
    fill: structuredClone(recipe.fill),
    font: structuredClone(recipe.font),
  };
}

export function migrateAppearanceProfileV1(
  profile: AppearanceProfileV1,
): AppearanceProfileV2 {
  return {
    version: 2,
    designs: profile.designs.map((design) => ({
      id: design.id,
      name: design.name,
      recipe: migrateAppearanceRecipeV1(design.recipe),
    })),
    assignments: structuredClone(profile.assignments),
  };
}

export function migrateGuildAppearanceProfileV1(
  profile: GuildAppearanceProfileV1,
): GuildAppearanceProfileV2 {
  return {
    ...migrateAppearanceProfileV1(profile),
    mode: profile.mode,
  };
}
