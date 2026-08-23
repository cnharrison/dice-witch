import {
  Dice,
  Modifiers,
  Parser,
  RollGroup,
} from "@dice-roller/rpg-dice-roller";

export const MAX_RENDERED_DICE = 50;
export const MAX_DIE_SIDES = 999;

declare const ROLL_ANALYSIS: unique symbol;
const validRollAnalyses = new WeakSet();

export type RollDieDefinition = Readonly<{
  kind: "fudge" | "percentile" | "standard";
  qty: number;
  sides: number | null;
  limitSides: number;
  explosionProbability: number | null;
}>;

type RollExpressionAnalysis =
  | {
      sourceNotation: string;
      notation: string;
      valid: true;
      definitions: readonly RollDieDefinition[];
    }
  | { sourceNotation: string; notation: string; valid: false };

export type RollAnalysis = Readonly<{
  readonly [ROLL_ANALYSIS]: true;
  expressions: readonly RollExpressionAnalysis[];
}>;

export type RollLimitResult =
  | { allowed: true; containsDice: boolean }
  | {
      allowed: false;
      containsDice: true;
      code: "TOO_MANY_DICE" | "TOO_MANY_SIDES" | "UNSAFE_EXPLOSION";
      message: string;
    };

function repetitionCount(repetitions: number): number {
  if (!Number.isFinite(repetitions) || repetitions <= 0) return 1;
  return Math.floor(repetitions);
}

function collectDice(
  value: unknown,
  dice: Dice.StandardDice[],
): void {
  if (value instanceof Dice.StandardDice) {
    dice.push(value);
    return;
  }
  if (value instanceof RollGroup) {
    collectDice(value.expressions, dice);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDice(item, dice);
  }
}

function compare(value: number, operator: string, expected: number): boolean {
  switch (operator) {
    case "=":
    case "==":
      return value === expected;
    case ">":
      return value > expected;
    case ">=":
      return value >= expected;
    case "<":
      return value < expected;
    case "<=":
      return value <= expected;
    case "!=":
    case "<>":
    case "!":
      return value !== expected;
    default:
      return false;
  }
}

function comparisonProbability(
  die: Dice.StandardDice,
  modifier: Modifiers.ExplodeModifier,
): number {
  const operator = modifier.comparePoint?.operator ?? "=";
  const expected = modifier.comparePoint?.value ?? die.max;
  let matchingOutcomes = 0;
  for (let value = die.min; value <= die.max; value += 1) {
    if (compare(value, operator, expected)) matchingOutcomes += 1;
  }
  return matchingOutcomes / (die.max - die.min + 1);
}

function dieDefinition(die: Dice.StandardDice): RollDieDefinition {
  const explode = die.modifiers?.get("explode");
  const kind = die instanceof Dice.PercentileDice || die.sides === 100
    ? "percentile"
    : die instanceof Dice.FudgeDice
      ? "fudge"
      : "standard";
  return Object.freeze({
    kind,
    qty: die.qty,
    sides: typeof die.sides === "number" ? die.sides : null,
    limitSides:
      kind === "percentile" ? 100 : kind === "fudge" ? 6 : die.max,
    explosionProbability:
      explode instanceof Modifiers.ExplodeModifier
        ? comparisonProbability(die, explode)
        : null,
  });
}

function unsafeExplosion(
  definitions: readonly RollDieDefinition[],
  repetitions: number,
): boolean {
  let hasExplosions = false;
  let expectedRolls = 0;
  for (const definition of definitions) {
    const probability = definition.explosionProbability;
    if (probability === null) {
      expectedRolls += definition.qty;
      continue;
    }
    hasExplosions = true;
    if (probability >= 1 - Number.EPSILON) return true;
    expectedRolls += definition.qty / (1 - probability);
  }
  return hasExplosions && expectedRolls * repetitions > MAX_RENDERED_DICE;
}

function createRollAnalysis(notation: readonly string[]): RollAnalysis {
  const expressions = notation.map((sourceNotation): RollExpressionAnalysis => {
    const normalized = sourceNotation.toLowerCase().replace(/df/g, "dF");
    try {
      const dice: Dice.StandardDice[] = [];
      collectDice(Parser.parse(normalized), dice);
      return Object.freeze({
        sourceNotation,
        notation: normalized,
        valid: true,
        definitions: Object.freeze(dice.map(dieDefinition)),
      });
    } catch {
      return Object.freeze({
        sourceNotation,
        notation: normalized,
        valid: false,
      });
    }
  });
  const analysis = Object.freeze({ expressions: Object.freeze(expressions) });
  validRollAnalyses.add(analysis);
  return analysis as RollAnalysis;
}

function requireRollAnalysis(analysis: RollAnalysis): void {
  if (!validRollAnalyses.has(analysis)) {
    throw new Error("Roll analysis is invalid");
  }
}

export function analyzeNotationArgs(rawNotation: string): RollAnalysis {
  const notation = rawNotation.trim();
  if (notation.length === 0) return createRollAnalysis([]);
  const combined = createRollAnalysis([notation]);
  return combined.expressions[0]?.valid === true
    ? combined
    : createRollAnalysis(notation.split(/ +/).filter(Boolean));
}

export function parseNotationArgs(rawNotation: string): string[] {
  return analyzeNotationArgs(rawNotation).expressions.map(
    ({ sourceNotation }) => sourceNotation,
  );
}

export function analyzeRollExpressions(
  notation: readonly string[],
): RollAnalysis {
  return createRollAnalysis(notation);
}

export function checkRollAnalysis(
  analysis: RollAnalysis,
  repetitions = 1,
): RollLimitResult {
  requireRollAnalysis(analysis);
  const containsDice = analysis.expressions.some(({ notation }) =>
    /(\d*)d(\d+|%|F(?:\.\d+)?)/i.test(notation),
  );
  if (!containsDice) return { allowed: true, containsDice: false };

  const definitions: RollDieDefinition[] = [];
  for (const expression of analysis.expressions) {
    if (expression.notation.length === 0) continue;
    if (!expression.valid) return { allowed: true, containsDice: true };
    definitions.push(...expression.definitions);
  }

  const repeats = repetitionCount(repetitions);
  const diceCount =
    definitions.reduce(
      (total, definition) =>
        total +
        definition.qty * (definition.kind === "percentile" ? 2 : 1),
      0,
    ) * repeats;
  if (diceCount > MAX_RENDERED_DICE) {
    return {
      allowed: false,
      containsDice: true,
      code: "TOO_MANY_DICE",
      message: `Dice notation exceeds the ${MAX_RENDERED_DICE} dice limit`,
    };
  }
  if (definitions.some(({ limitSides }) => limitSides > MAX_DIE_SIDES)) {
    return {
      allowed: false,
      containsDice: true,
      code: "TOO_MANY_SIDES",
      message: `Dice notation exceeds the ${MAX_DIE_SIDES} sides limit`,
    };
  }
  if (unsafeExplosion(definitions, repeats)) {
    return {
      allowed: false,
      containsDice: true,
      code: "UNSAFE_EXPLOSION",
      message: `Expected explosion work exceeds the ${MAX_RENDERED_DICE}-roll safety limit`,
    };
  }
  return { allowed: true, containsDice: true };
}

export function checkRollLimits(
  notation: readonly string[],
  repetitions = 1,
): RollLimitResult {
  return checkRollAnalysis(
    analyzeRollExpressions(notation.map((value) => value.trim())),
    repetitions,
  );
}
