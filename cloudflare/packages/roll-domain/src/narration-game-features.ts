import * as z from "zod";
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
const DIE_TERM = /(?:^|[^a-z0-9_])(?:\d*)d(\d+)(?=[^0-9]|$)/gu;
// A d3 is common outside DCC, so diversity requires the rarer chain sizes.
const RARE_DCC_DIE_SIDES = new Set(["5", "7", "14", "16", "24", "30"]);
const DCC_DIE_SIDES = new Set(["3", ...RARE_DCC_DIE_SIDES]);
// Sides represented by common RPG dice or a curated catalogue mechanic.
const CATALOGUED_DIE_SIDES = new Set([
  "2",
  "4",
  "6",
  "8",
  "10",
  "12",
  "20",
  "100",
  ...DCC_DIE_SIDES,
]);

const NarrationGameFeatureRollEnvelopeSchemaV1 = z.strictObject({
  notation: z.unknown(),
  repetitions: z.unknown(),
});
const NarrationGameFeatureNotationSchemaV1 = z.array(z.string().min(1));
const NarrationGameFeatureRollListSchemaV1 = z.array(z.unknown());
const NarrationGameFeatureRequestEnvelopeSchemaV1 = z.strictObject({
  version: z.unknown(),
  rolls: z.unknown(),
});

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

function validateRoll(
  roll: z.output<typeof NarrationGameFeatureRollEnvelopeSchemaV1>,
): NarrationGameFeatureRollV1 {
  const notationResult = NarrationGameFeatureNotationSchemaV1.safeParse(
    roll.notation,
  );
  if (
    !notationResult.success ||
    notationResult.data.length < 1 ||
    notationResult.data.length > MAX_NOTATION_EXPRESSIONS ||
    notationResult.data.join(" ").length > MAX_NOTATION_LENGTH
  ) {
    throw new Error("Narration game feature roll notation is invalid");
  }
  const repetitionsResult = z.number().safeParse(roll.repetitions);
  if (
    !repetitionsResult.success ||
    !Number.isSafeInteger(repetitionsResult.data) ||
    repetitionsResult.data < 1 ||
    repetitionsResult.data > MAX_REPETITIONS
  ) {
    throw new Error("Narration game feature roll repetitions are invalid");
  }
  return {
    notation: notationResult.data,
    repetitions: repetitionsResult.data,
  };
}

function addObservation(
  observations: Map<NarrationGameFeatureV1, number>,
  kind: NarrationGameFeatureV1,
  occurrences: number,
): void {
  observations.set(kind, (observations.get(kind) ?? 0) + occurrences);
}

function dieSides(notation: string): ReadonlySet<string> {
  const sides = new Set<string>();
  for (const match of notation.matchAll(DIE_TERM)) {
    const side = match[1];
    if (side !== undefined) sides.add(side);
  }
  return sides;
}

type DiceSideObservation = {
  rareDccSides: Set<string>;
  rareDccExpressionCount: number;
  uncataloguedSides: Set<string>;
  uncataloguedExpressionCount: number;
};

function observeDiceSides(
  notation: string,
  repetitions: number,
  observations: Map<NarrationGameFeatureV1, number>,
  diceSideObservation: DiceSideObservation,
): void {
  const observedDieSides = dieSides(notation);
  let containsDccDie = false;
  let containsRareDccDie = false;
  let containsUncataloguedDie = false;
  for (const side of observedDieSides) {
    if (DCC_DIE_SIDES.has(side)) {
      containsDccDie = true;
    }
    if (RARE_DCC_DIE_SIDES.has(side)) {
      containsRareDccDie = true;
      diceSideObservation.rareDccSides.add(side);
    }
    if (!CATALOGUED_DIE_SIDES.has(side)) {
      containsUncataloguedDie = true;
      diceSideObservation.uncataloguedSides.add(side);
    }
  }
  if (containsDccDie) {
    addObservation(observations, "dcc-dice-chain", repetitions);
  }
  if (containsRareDccDie) {
    diceSideObservation.rareDccExpressionCount += repetitions;
  }
  if (containsUncataloguedDie) {
    diceSideObservation.uncataloguedExpressionCount += repetitions;
  }
}

function observeNotation(
  notation: string,
  repetitions: number,
  observations: Map<NarrationGameFeatureV1, number>,
  diceSideObservation: DiceSideObservation,
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
  observeDiceSides(
    notation,
    repetitions,
    observations,
    diceSideObservation,
  );
  if (isMixedStepDicePool(notation)) {
    addObservation(observations, "mixed-step-dice-pool", repetitions);
  }
}

export function extractNarrationGameFeaturesV1(
  request: NarrationGameFeatureRequestV1,
): NarrationGameFeatureResultV1;
export function extractNarrationGameFeaturesV1(
  request: z.input<typeof NarrationGameFeatureRequestEnvelopeSchemaV1>,
): NarrationGameFeatureResultV1 {
  const requestResult =
    NarrationGameFeatureRequestEnvelopeSchemaV1.safeParse(request);
  if (!requestResult.success) {
    throw new Error(
      "Narration game feature request contains an unsupported field",
    );
  }
  const parsedRequest = requestResult.data;
  if (parsedRequest.version !== 1) {
    throw new Error("Narration game feature request version must be 1");
  }
  const rollsResult = NarrationGameFeatureRollListSchemaV1.safeParse(
    parsedRequest.rolls,
  );
  if (
    !rollsResult.success ||
    rollsResult.data.length < 1 ||
    rollsResult.data.length > MAX_SESSION_ROLLS
  ) {
    throw new Error(
      `Narration game feature request requires 1 through ${String(MAX_SESSION_ROLLS)} rolls`,
    );
  }

  const observations = new Map<NarrationGameFeatureV1, number>();
  const diceSideObservation: DiceSideObservation = {
    rareDccSides: new Set(),
    rareDccExpressionCount: 0,
    uncataloguedSides: new Set(),
    uncataloguedExpressionCount: 0,
  };
  for (const input of rollsResult.data) {
    const rollResult = NarrationGameFeatureRollEnvelopeSchemaV1.safeParse(input);
    if (!rollResult.success) {
      throw new Error(
        "Narration game feature roll contains an unsupported field",
      );
    }
    const roll = validateRoll(rollResult.data);
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
        diceSideObservation,
      );
    }
  }

  if (
    diceSideObservation.rareDccSides.size >= 2 &&
    diceSideObservation.rareDccExpressionCount >= 2
  ) {
    addObservation(observations, "dcc-diverse-dice-chain", 1);
  }
  if (diceSideObservation.uncataloguedSides.size >= 2) {
    addObservation(
      observations,
      "diverse-uncatalogued-die-sides",
      diceSideObservation.uncataloguedExpressionCount,
    );
  }

  return {
    version: 1,
    features: [...observations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, occurrences]) => ({ kind, occurrences })),
  };
}
