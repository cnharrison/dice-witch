import {
  parseAppearanceRecipeV3,
  parseDiceViewPreferencesV4,
  type AppearanceRecipeV3,
  type DiceViewPreferencesV4,
} from "@dice-witch/dice-v4-model";
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

export type AppearancePreviewRequestV4 = AppearancePreviewRequestV3 & {
  diceView: DiceViewPreferencesV4;
  // Per-die designs refine the ALL composite; absent for single-target
  // previews, which already carry the exact recipe.
  overrides?: Partial<Record<AppearanceTarget, AppearanceRecipeV3>>;
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

function isPreviewTarget(value: unknown): value is AppearancePreviewTarget {
  return (
    value === "all" ||
    (typeof value === "string" &&
      APPEARANCE_TARGETS.some((target) => target === value))
  );
}

function isPreviewState(value: unknown): value is AppearancePreviewState {
  return (
    value === "normal" ||
    value === "critical-success" ||
    value === "critical-failure"
  );
}

function parseAppearancePreviewEnvelope(
  value: unknown,
): AppearancePreviewRequestBase<unknown> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["recipe", "seed", "state", "target"]) ||
    !isPreviewTarget(value.target) ||
    !isPreviewState(value.state) ||
    !Number.isInteger(value.seed) ||
    Number(value.seed) < 0 ||
    Number(value.seed) > 0xffff_ffff
  ) {
    throw new Error("Appearance preview request is invalid");
  }
  return {
    target: value.target,
    recipe: value.recipe,
    seed: Number(value.seed),
    state: value.state,
  };
}

export function parseAppearancePreviewRequest(
  value: unknown,
  catalog: AppearanceCatalog,
): AppearancePreviewRequest {
  const request = parseAppearancePreviewEnvelope(value);
  return {
    ...request,
    recipe: parseAppearanceRecipe(request.recipe, catalog),
  };
}

export function parseAppearancePreviewRequestV2(
  value: unknown,
  catalog: AppearanceCatalog,
): AppearancePreviewRequestV2 {
  const request = parseAppearancePreviewEnvelope(value);
  return {
    ...request,
    recipe: parseAppearanceRecipeV2(request.recipe, catalog),
  };
}

export function parseAppearancePreviewRequestV3(
  value: unknown,
): AppearancePreviewRequestV3 {
  const request = parseAppearancePreviewEnvelope(value);
  return {
    ...request,
    recipe: parseAppearanceRecipeV3(request.recipe),
  };
}

const PREVIEW_REQUEST_V4_KEYS = [
  "diceView",
  "recipe",
  "seed",
  "state",
  "target",
] as const;

function parsePreviewOverrides(
  value: unknown,
  target: AppearancePreviewTarget,
): Partial<Record<AppearanceTarget, AppearanceRecipeV3>> {
  if (target !== "all" || !isRecord(value)) {
    throw new Error("Appearance preview request is invalid");
  }
  const entries = Object.entries(value);
  if (
    entries.length === 0 ||
    !entries.every(([key]) =>
      APPEARANCE_TARGETS.some((candidate) => candidate === key),
    )
  ) {
    throw new Error("Appearance preview request is invalid");
  }
  return Object.fromEntries(
    entries.map(([key, recipe]) => [key, parseAppearanceRecipeV3(recipe)]),
  );
}

export function parseAppearancePreviewRequestV4(
  value: unknown,
): AppearancePreviewRequestV4 {
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, PREVIEW_REQUEST_V4_KEYS) &&
      !hasExactKeys(value, [...PREVIEW_REQUEST_V4_KEYS, "overrides"]))
  ) {
    throw new Error("Appearance preview request is invalid");
  }
  const request = parseAppearancePreviewEnvelope({
    recipe: value.recipe,
    seed: value.seed,
    state: value.state,
    target: value.target,
  });
  const parsed: AppearancePreviewRequestV4 = {
    ...request,
    recipe: parseAppearanceRecipeV3(request.recipe),
    diceView: parseDiceViewPreferencesV4(value.diceView),
  };
  if (!("overrides" in value)) return parsed;
  return {
    ...parsed,
    overrides: parsePreviewOverrides(value.overrides, request.target),
  };
}
