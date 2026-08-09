import {
  APPEARANCE_TARGETS_V4,
  parseAppearanceRecipeV3,
  parseDiceViewPreferencesV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_TARGETS,
  APPEARANCE_VALIDATION_CATALOG,
  parseAppearanceRecipeV2,
  type EffectiveAppearanceRecipesV2,
  type EffectiveAppearanceRecipesV3,
  type EffectiveAppearanceV4,
} from "../../../packages/dice-appearance/src";

export type AppearanceDataService = {
  fetch(request: Request): Promise<Response>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

export function parseEffectiveAppearanceRecipesV2(
  value: unknown,
): EffectiveAppearanceRecipesV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["recipes", "version"]) ||
    value.version !== 2 ||
    !isRecord(value.recipes) ||
    !hasExactKeys(value.recipes, APPEARANCE_TARGETS)
  ) {
    throw new Error("Effective appearance response is invalid");
  }
  const recipes = value.recipes;
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [
      target,
      parseAppearanceRecipeV2(
        recipes[target],
        APPEARANCE_VALIDATION_CATALOG,
      ),
    ]),
  ) as EffectiveAppearanceRecipesV2;
}

export function parseEffectiveAppearanceRecipesV3(
  value: unknown,
): EffectiveAppearanceRecipesV3 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["recipes", "version"]) ||
    value.version !== 3 ||
    !isRecord(value.recipes) ||
    !hasExactKeys(value.recipes, APPEARANCE_TARGETS_V4)
  ) {
    throw new Error("Effective appearance response is invalid");
  }
  const recipes = value.recipes;
  return Object.fromEntries(
    APPEARANCE_TARGETS_V4.map((target) => [
      target,
      parseAppearanceRecipeV3(recipes[target]),
    ]),
  ) as EffectiveAppearanceRecipesV3;
}

export function parseEffectiveAppearanceV4(
  value: unknown,
): EffectiveAppearanceV4 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["diceView", "recipes", "version"]) ||
    value.version !== 4 ||
    !isRecord(value.recipes) ||
    !hasExactKeys(value.recipes, APPEARANCE_TARGETS_V4)
  ) {
    throw new Error("Effective appearance response is invalid");
  }
  const recipes = value.recipes;
  return {
    version: 4,
    recipes: Object.fromEntries(
      APPEARANCE_TARGETS_V4.map((target) => [
        target,
        parseAppearanceRecipeV3(recipes[target]),
      ]),
    ) as EffectiveAppearanceRecipesV3,
    diceView: parseDiceViewPreferencesV4(value.diceView),
  };
}

async function loadEffectiveAppearance(
  dataService: AppearanceDataService,
  version: 2 | 3 | 4,
  userId: string,
  guildId: string | null,
): Promise<unknown> {
  let response: Response;
  try {
    response = await dataService.fetch(
      new Request(
        `https://data.internal/internal/appearance/v${version}/effective`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, guildId }),
        },
      ),
    );
  } catch {
    throw new Error("Effective appearance lookup failed");
  }
  if (!response.ok) throw new Error("Effective appearance lookup failed");
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("Effective appearance response is invalid");
  }
  return value;
}

export async function loadEffectiveAppearanceV2(
  dataService: AppearanceDataService,
  userId: string,
  guildId: string | null,
): Promise<EffectiveAppearanceRecipesV2> {
  return parseEffectiveAppearanceRecipesV2(
    await loadEffectiveAppearance(dataService, 2, userId, guildId),
  );
}

export async function loadEffectiveAppearanceV3(
  dataService: AppearanceDataService,
  userId: string,
  guildId: string | null,
): Promise<EffectiveAppearanceRecipesV3> {
  return parseEffectiveAppearanceRecipesV3(
    await loadEffectiveAppearance(dataService, 3, userId, guildId),
  );
}

export async function loadEffectiveAppearanceV4(
  dataService: AppearanceDataService,
  userId: string,
  guildId: string | null,
): Promise<EffectiveAppearanceV4> {
  return parseEffectiveAppearanceV4(
    await loadEffectiveAppearance(dataService, 4, userId, guildId),
  );
}
