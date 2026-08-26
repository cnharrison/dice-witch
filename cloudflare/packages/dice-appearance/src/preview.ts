import {
  parseAppearanceRecipeV3,
  parseDiceViewPreferencesV4,
  type AppearanceRecipeV3,
  type DiceViewPreferencesV4,
} from "@dice-witch/dice-v4-model";
import * as z from "zod";
import {
  APPEARANCE_TARGETS,
  type AppearanceCatalog,
  type AppearanceRecipeV1,
  type AppearanceRecipeV2,
  type AppearanceTarget,
} from "./types";
import {
  parseAppearanceRecipe,
  parseAppearanceRecipeV2,
} from "./validate";

export type AppearancePreviewTarget = AppearanceTarget | "all";
export type AppearancePreviewState =
  | "normal"
  | "critical-success"
  | "critical-failure";

type AppearancePreviewRequestBase<Recipe> = {
  target: AppearancePreviewTarget;
  recipe: Recipe;
  seed: number;
  state: AppearancePreviewState;
};

export type AppearancePreviewRequest = AppearancePreviewRequestBase<
  AppearanceRecipeV1
>;

export type AppearancePreviewRequestV2 = AppearancePreviewRequestBase<
  AppearanceRecipeV2
>;

export type AppearancePreviewRequestV3 = AppearancePreviewRequestBase<
  AppearanceRecipeV3
>;

export type AppearancePreviewOverrides = Partial<
  Record<AppearanceTarget, AppearanceRecipeV3>
>;

export type AppearancePreviewRequestV4 = AppearancePreviewRequestV3 & {
  diceView: DiceViewPreferencesV4;
  // Per-die designs refine the ALL composite; absent for single-target
  // previews, which already carry the exact recipe.
  overrides?: AppearancePreviewOverrides;
};

type ValidationInput = z.input<z.ZodUnknown>;

const appearanceTargetSchema = z.enum(APPEARANCE_TARGETS);
const previewTargetSchema = z.enum([...APPEARANCE_TARGETS, "all"]);
const previewStateSchema = z.enum([
  "normal",
  "critical-success",
  "critical-failure",
]);
const previewEnvelopeSchema = z.strictObject({
  target: previewTargetSchema,
  recipe: z.unknown(),
  seed: z.number().int().min(0).max(0xffff_ffff),
  state: previewStateSchema,
});
const previewRequestV4Schema = z.strictObject({
  diceView: z.unknown(),
  recipe: z.unknown(),
  seed: z.number().int().min(0).max(0xffff_ffff),
  state: previewStateSchema,
  target: previewTargetSchema,
  overrides: z.unknown().optional(),
});
const previewOverridesSchema = z.partialRecord(
  appearanceTargetSchema,
  z.unknown(),
);

function parseAppearancePreviewEnvelope(
  value: ValidationInput,
): z.output<typeof previewEnvelopeSchema> {
  const parsed = previewEnvelopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Appearance preview request is invalid");
  }
  return parsed.data;
}

export function parseAppearancePreviewRequest(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearancePreviewRequest {
  const request = parseAppearancePreviewEnvelope(value);
  return {
    ...request,
    recipe: parseAppearanceRecipe(request.recipe, catalog),
  };
}

export function parseAppearancePreviewRequestV2(
  value: ValidationInput,
  catalog: AppearanceCatalog,
): AppearancePreviewRequestV2 {
  const request = parseAppearancePreviewEnvelope(value);
  return {
    ...request,
    recipe: parseAppearanceRecipeV2(request.recipe, catalog),
  };
}

export function parseAppearancePreviewRequestV3(
  value: ValidationInput,
): AppearancePreviewRequestV3 {
  const request = parseAppearancePreviewEnvelope(value);
  return {
    ...request,
    recipe: parseAppearanceRecipeV3(request.recipe),
  };
}

function parsePreviewOverrides(
  value: ValidationInput,
  target: AppearancePreviewTarget,
) {
  const parsed = previewOverridesSchema.safeParse(value);
  if (target !== "all" || !parsed.success) {
    throw new Error("Appearance preview request is invalid");
  }
  const entries = Object.entries(parsed.data);
  if (entries.length === 0) {
    throw new Error("Appearance preview request is invalid");
  }
  const overrides: AppearancePreviewOverrides = {};
  for (const [targetKey, recipe] of entries) {
    const parsedTarget = appearanceTargetSchema.parse(targetKey);
    overrides[parsedTarget] = parseAppearanceRecipeV3(recipe);
  }
  return overrides;
}

export function parseAppearancePreviewRequestV4(
  value: ValidationInput,
): AppearancePreviewRequestV4 {
  const envelope = previewRequestV4Schema.safeParse(value);
  if (!envelope.success) {
    throw new Error("Appearance preview request is invalid");
  }
  const request = parseAppearancePreviewEnvelope({
    recipe: envelope.data.recipe,
    seed: envelope.data.seed,
    state: envelope.data.state,
    target: envelope.data.target,
  });
  const parsed: AppearancePreviewRequestV4 = {
    ...request,
    recipe: parseAppearanceRecipeV3(request.recipe),
    diceView: parseDiceViewPreferencesV4(envelope.data.diceView),
  };
  if (!Object.hasOwn(envelope.data, "overrides")) return parsed;
  return {
    ...parsed,
    overrides: parsePreviewOverrides(envelope.data.overrides, request.target),
  };
}
