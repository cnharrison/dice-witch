import {
  parseAppearanceRecipeV3,
  parseDiceViewPreferencesV4,
} from "@dice-witch/dice-v4-model";
import { z } from "zod";
import {
  APPEARANCE_VALIDATION_CATALOG,
  parseAppearanceRecipeV2,
  type EffectiveAppearanceRecipesV2,
  type EffectiveAppearanceRecipesV3,
  type EffectiveAppearanceV4,
} from "../../../packages/dice-appearance/src";
import type { SchemaInput } from "../../../packages/discord-contracts/src/schema-primitives";

export type AppearanceDataService = {
  fetch(request: Request): Promise<Response>;
};

const EffectiveRecipesSchema = z.strictObject({
  d4: z.unknown(),
  d6: z.unknown(),
  d8: z.unknown(),
  d10: z.unknown(),
  d12: z.unknown(),
  d20: z.unknown(),
  percentile: z.unknown(),
  fudge: z.unknown(),
  other: z.unknown(),
});
const EffectiveAppearanceRecipesV2Schema = z.strictObject({
  version: z.literal(2),
  recipes: EffectiveRecipesSchema,
});
const EffectiveAppearanceRecipesV3Schema = z.strictObject({
  version: z.literal(3),
  recipes: EffectiveRecipesSchema,
});
const EffectiveAppearanceV4Schema = z.strictObject({
  version: z.literal(4),
  recipes: EffectiveRecipesSchema,
  diceView: z.unknown(),
});

function invalidEffectiveAppearance(): Error {
  return new Error("Effective appearance response is invalid");
}

function parseRecipesV2(
  recipes: z.output<typeof EffectiveRecipesSchema>,
): EffectiveAppearanceRecipesV2 {
  return {
    d4: parseAppearanceRecipeV2(recipes.d4, APPEARANCE_VALIDATION_CATALOG),
    d6: parseAppearanceRecipeV2(recipes.d6, APPEARANCE_VALIDATION_CATALOG),
    d8: parseAppearanceRecipeV2(recipes.d8, APPEARANCE_VALIDATION_CATALOG),
    d10: parseAppearanceRecipeV2(recipes.d10, APPEARANCE_VALIDATION_CATALOG),
    d12: parseAppearanceRecipeV2(recipes.d12, APPEARANCE_VALIDATION_CATALOG),
    d20: parseAppearanceRecipeV2(recipes.d20, APPEARANCE_VALIDATION_CATALOG),
    percentile: parseAppearanceRecipeV2(
      recipes.percentile,
      APPEARANCE_VALIDATION_CATALOG,
    ),
    fudge: parseAppearanceRecipeV2(
      recipes.fudge,
      APPEARANCE_VALIDATION_CATALOG,
    ),
    other: parseAppearanceRecipeV2(
      recipes.other,
      APPEARANCE_VALIDATION_CATALOG,
    ),
  };
}

function parseRecipesV3(
  recipes: z.output<typeof EffectiveRecipesSchema>,
): EffectiveAppearanceRecipesV3 {
  return {
    d4: parseAppearanceRecipeV3(recipes.d4),
    d6: parseAppearanceRecipeV3(recipes.d6),
    d8: parseAppearanceRecipeV3(recipes.d8),
    d10: parseAppearanceRecipeV3(recipes.d10),
    d12: parseAppearanceRecipeV3(recipes.d12),
    d20: parseAppearanceRecipeV3(recipes.d20),
    percentile: parseAppearanceRecipeV3(recipes.percentile),
    fudge: parseAppearanceRecipeV3(recipes.fudge),
    other: parseAppearanceRecipeV3(recipes.other),
  };
}

export function parseEffectiveAppearanceRecipesV2(
  value: SchemaInput,
): EffectiveAppearanceRecipesV2 {
  const result = EffectiveAppearanceRecipesV2Schema.safeParse(value);
  if (!result.success) throw invalidEffectiveAppearance();
  return parseRecipesV2(result.data.recipes);
}

export function parseEffectiveAppearanceRecipesV3(
  value: SchemaInput,
): EffectiveAppearanceRecipesV3 {
  const result = EffectiveAppearanceRecipesV3Schema.safeParse(value);
  if (!result.success) throw invalidEffectiveAppearance();
  return parseRecipesV3(result.data.recipes);
}

export function parseEffectiveAppearanceV4(
  value: SchemaInput,
): EffectiveAppearanceV4 {
  const result = EffectiveAppearanceV4Schema.safeParse(value);
  if (!result.success) throw invalidEffectiveAppearance();
  return {
    version: 4,
    recipes: parseRecipesV3(result.data.recipes),
    diceView: parseDiceViewPreferencesV4(result.data.diceView),
  };
}

async function loadEffectiveAppearance(
  dataService: AppearanceDataService,
  version: 2 | 3 | 4,
  userId: string,
  guildId: string | null,
): Promise<SchemaInput> {
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
  try {
    const value: SchemaInput = await response.json();
    return value;
  } catch {
    throw invalidEffectiveAppearance();
  }
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
