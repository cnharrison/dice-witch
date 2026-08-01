import {
  MAX_NOTATION_EXPRESSIONS,
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
} from "./constants";
import type { NarrationGameFeatureV1 } from "./narration-game-catalog";

export type NarrationGameFeatureRollV1 = Readonly<{
  notation: readonly string[];
  repetitions: number;
}>;

export type NarrationGameFeatureRequestV1 = Readonly<{
  version: 1;
  rolls: readonly NarrationGameFeatureRollV1[];
}>;

export type NarrationGameFeatureObservationV1 = Readonly<{
  kind: NarrationGameFeatureV1;
  occurrences: number;
}>;

export type NarrationGameFeatureResultV1 = Readonly<{
  version: 1;
  features: readonly NarrationGameFeatureObservationV1[];
}>;

const MAX_SESSION_ROLLS = 256;
const ABILITY_SCORE_ROLL = /^4d6(?:kh?3|dl?1)$/u;
const D20_WITH_MODIFIER = /^(?:1)?d20[+-]\d+$/u;
const D6_POOL_KEEP_HIGHEST = /^(?:[2-9]|1\d|20)d6kh?1$/u;
const EXPLODING_STEP_DIE_SOURCE = "(?:1)?d(?:4|6|8|10|12)!{1,2}p?";
const EXPLODING_WILD_DIE_SOURCE = "(?:1)?d6!{1,2}p?";
const EXPLODING_STEP_DIE = new RegExp(`^${EXPLODING_STEP_DIE_SOURCE}$`, "u");
const EXPLODING_TRAIT_AND_WILD_DIE = new RegExp(
  `^\\{(?:${EXPLODING_STEP_DIE_SOURCE},${EXPLODING_WILD_DIE_SOURCE}|${EXPLODING_WILD_DIE_SOURCE},${EXPLODING_STEP_DIE_SOURCE})\\}kh?1$`,
  "u",
);
const FOUR_FATE_DICE = /^4df(?:\.[12])?(?:[+-]\d+)?$/u;
const PERCENTILE_ROLL = /^(?:1)?d(?:100|%)(?:(?:!=|<=|>=|=|<|>)\d+)?$/u;
const PERCENTILE_ROLL_UNDER = /^(?:1)?d(?:100|%)(?:<=|<)\d+$/u;
const TWO_D6_KEEP_LOWEST = /^2d6kl1$/u;
const SINGLE_D10_WITH_MODIFIER = /^(?:1)?d10[+-]\d+$/u;
const SINGLE_D20 = /^(?:1)?d20(?:(?:[+-]|<=|<|>=|>)\d+)?$/u;
const D20_ROLL_UNDER = /^(?:1)?d20(?:<=|<)\d+$/u;
const TWO_D6_WITH_MODIFIER = /^2d6[+-]\d+$/u;
const TWO_D10_WITH_MODIFIER = /^2d10(?:[+-]\d+)?$/u;
const THREE_D6 = /^3d6(?:[+-]\d+)?$/u;
// The Dark Eye compares three separate d20 results; one shared modifier is not that check.
const THREE_D20 = /^3d20$/u;
const TWO_D12_WITH_MODIFIER = /^2d12(?:[+-]\d+)?$/u;
const PLAIN_D6_POOL = /^(?:[2-9]|[1-9]\d+)d6$/u;
const PLAIN_D10_POOL = /^(?:[2-9]|[1-9]\d+)d10$/u;
const TWO_D20_ROLL_UNDER = /^2d20(?:<=|<)\d+$/u;
const D20_WITH_ACCURACY_D6 = /^\{(?=[^}]*(?:1)?d20)(?=[^}]*(?:[2-9]|[1-9]\d+)d6(?:kh1|k1))[^}]+\}$/u;
const D20_WITH_PLOT_D6 = /^\{(?:(?:1)?d20,(?:1)?d6|(?:1)?d6,(?:1)?d20)\}$/u;
const DCC_DIE_TERM = /(?:^|[^a-z0-9_])(?:\d*)d(3|5|7|14|16|24|30)(?=[^0-9]|$)/gu;
// A d3 is common outside DCC, so diversity requires the rarer chain sizes.
const RARE_DCC_DIE_SIDES = new Set(["5", "7", "14", "16", "24", "30"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === fields.length &&
    actual.every((field) => fields.includes(field))
  );
}

function normalizeNotation(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "");
}

function isMixedStepDicePool(notation: string): boolean {
  if (!notation.startsWith("{") || !notation.endsWith("}")) return false;
  const sides = new Set(
    [...notation.matchAll(/(?:\d*)d(4|6|8|10|12)(?=[,}])/gu)].map(
      (match) => match[1],
    ),
  );
  return sides.size >= 2;
}

function validateRoll(value: unknown): NarrationGameFeatureRollV1 {
  if (!isRecord(value) || !hasExactFields(value, ["notation", "repetitions"])) {
    throw new Error("Narration game feature roll contains an unsupported field");
  }
  if (
    !Array.isArray(value.notation) ||
    value.notation.length < 1 ||
    value.notation.length > MAX_NOTATION_EXPRESSIONS ||
    !value.notation.every(
      (notation) => typeof notation === "string" && notation.length > 0,
    ) ||
    value.notation.join(" ").length > MAX_NOTATION_LENGTH
  ) {
    throw new Error("Narration game feature roll notation is invalid");
  }
  const repetitions = value.repetitions;
  if (
    typeof repetitions !== "number" ||
    !Number.isSafeInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > MAX_REPETITIONS
  ) {
    throw new Error("Narration game feature roll repetitions are invalid");
  }
  return {
    notation: value.notation.map((notation) => String(notation)),
    repetitions,
  };
}

function addObservation(
  observations: Map<NarrationGameFeatureV1, number>,
  kind: NarrationGameFeatureV1,
  occurrences: number,
): void {
  observations.set(kind, (observations.get(kind) ?? 0) + occurrences);
}

function dccDieSides(notation: string): ReadonlySet<string> {
  const sides = new Set<string>();
  for (const match of notation.matchAll(DCC_DIE_TERM)) {
    const side = match[1];
    if (side !== undefined) sides.add(side);
  }
  return sides;
}

type DccDiceChainObservation = {
  rareSides: Set<string>;
  rareExpressionCount: number;
};

function observeNotation(
  notation: string,
  repetitions: number,
  observations: Map<NarrationGameFeatureV1, number>,
  dccObservation: DccDiceChainObservation,
): void {
  if (ABILITY_SCORE_ROLL.test(notation)) {
    addObservation(
      observations,
      "four-d6-keep-highest-three",
      repetitions,
    );
  }
  if (D20_WITH_MODIFIER.test(notation)) {
    addObservation(observations, "single-d20-plus-modifier", repetitions);
  }
  if (D6_POOL_KEEP_HIGHEST.test(notation)) {
    addObservation(observations, "d6-pool-keep-highest", repetitions);
  }
  if (EXPLODING_STEP_DIE.test(notation)) {
    addObservation(observations, "exploding-step-die", repetitions);
  }
  if (EXPLODING_TRAIT_AND_WILD_DIE.test(notation)) {
    addObservation(observations, "exploding-step-die", repetitions);
    addObservation(
      observations,
      "exploding-trait-plus-wild-d6-keep-highest",
      repetitions,
    );
  }
  if (FOUR_FATE_DICE.test(notation)) {
    addObservation(observations, "four-fate-dice", repetitions);
  }
  if (PERCENTILE_ROLL.test(notation)) {
    addObservation(observations, "single-percentile-roll", repetitions);
  }
  if (PERCENTILE_ROLL_UNDER.test(notation)) {
    addObservation(
      observations,
      "percentile-roll-under-threshold",
      repetitions,
    );
  }
  if (TWO_D6_KEEP_LOWEST.test(notation)) {
    addObservation(observations, "two-d6-keep-lowest", repetitions);
  }
  if (SINGLE_D10_WITH_MODIFIER.test(notation)) {
    addObservation(observations, "single-d10-plus-modifier", repetitions);
  }
  if (SINGLE_D20.test(notation)) {
    addObservation(observations, "single-d20-roll", repetitions);
  }
  if (D20_ROLL_UNDER.test(notation)) {
    addObservation(observations, "d20-roll-under-threshold", repetitions);
  }
  if (TWO_D6_WITH_MODIFIER.test(notation)) {
    addObservation(observations, "two-d6-plus-modifier", repetitions);
  }
  if (TWO_D10_WITH_MODIFIER.test(notation)) {
    addObservation(observations, "two-d10-plus-modifier", repetitions);
  }
  if (THREE_D6.test(notation)) {
    addObservation(observations, "three-d6", repetitions);
  }
  if (THREE_D20.test(notation)) {
    addObservation(observations, "three-d20", repetitions);
  }
  if (TWO_D12_WITH_MODIFIER.test(notation)) {
    addObservation(observations, "two-d12-plus-modifier", repetitions);
  }
  if (PLAIN_D6_POOL.test(notation)) {
    addObservation(observations, "plain-d6-pool", repetitions);
  }
  if (PLAIN_D10_POOL.test(notation)) {
    addObservation(observations, "plain-d10-pool", repetitions);
  }
  if (TWO_D20_ROLL_UNDER.test(notation)) {
    addObservation(
      observations,
      "two-d20-roll-under-threshold",
      repetitions,
    );
  }
  if (D20_WITH_ACCURACY_D6.test(notation)) {
    addObservation(observations, "d20-with-accuracy-d6", repetitions);
  }
  if (D20_WITH_PLOT_D6.test(notation)) {
    addObservation(observations, "d20-with-plot-d6", repetitions);
  }
  const observedDccSides = dccDieSides(notation);
  if (observedDccSides.size > 0) {
    addObservation(observations, "dcc-dice-chain", repetitions);
    let containsRareDccDie = false;
    for (const side of observedDccSides) {
      if (!RARE_DCC_DIE_SIDES.has(side)) continue;
      containsRareDccDie = true;
      dccObservation.rareSides.add(side);
    }
    if (containsRareDccDie) {
      dccObservation.rareExpressionCount += repetitions;
    }
  }
  if (isMixedStepDicePool(notation)) {
    addObservation(observations, "mixed-step-dice-pool", repetitions);
  }
}

export function extractNarrationGameFeaturesV1(
  request: NarrationGameFeatureRequestV1,
): NarrationGameFeatureResultV1;
export function extractNarrationGameFeaturesV1(
  request: unknown,
): NarrationGameFeatureResultV1 {
  if (
    !isRecord(request) ||
    !hasExactFields(request, ["version", "rolls"])
  ) {
    throw new Error(
      "Narration game feature request contains an unsupported field",
    );
  }
  if (request.version !== 1) {
    throw new Error("Narration game feature request version must be 1");
  }
  if (
    !Array.isArray(request.rolls) ||
    request.rolls.length < 1 ||
    request.rolls.length > MAX_SESSION_ROLLS
  ) {
    throw new Error(
      `Narration game feature request requires 1 through ${String(MAX_SESSION_ROLLS)} rolls`,
    );
  }

  const observations = new Map<NarrationGameFeatureV1, number>();
  const dccObservation: DccDiceChainObservation = {
    rareSides: new Set(),
    rareExpressionCount: 0,
  };
  for (const value of request.rolls) {
    const roll = validateRoll(value);
    for (const value of roll.notation) {
      addObservation(
        observations,
        "observed-roll-expression",
        roll.repetitions,
      );
      observeNotation(
        normalizeNotation(value),
        roll.repetitions,
        observations,
        dccObservation,
      );
    }
  }

  if (
    dccObservation.rareSides.size >= 2 &&
    dccObservation.rareExpressionCount >= 2
  ) {
    addObservation(observations, "dcc-diverse-dice-chain", 1);
  }

  return {
    version: 1,
    features: [...observations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, occurrences]) => ({ kind, occurrences })),
  };
}
