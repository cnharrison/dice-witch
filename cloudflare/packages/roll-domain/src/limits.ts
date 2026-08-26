import { z } from "zod";
import {
  Dice,
  Modifiers,
  Parser,
  RollGroup,
} from "@dice-roller/rpg-dice-roller";

export const MAX_RENDERED_DICE = 50;
export const MAX_DIE_SIDES = 999;

type NumericStandardDice = Dice.StandardDice & { readonly sides: number };
type ParsedDiceDefinition =
  | Dice.FudgeDice
  | Dice.PercentileDice
  | NumericStandardDice;
type ParsedRollExpression =
  | ParsedDiceDefinition
  | RollGroup
  | string
  | number
  | readonly ParsedRollExpression[];
type ParserBoundaryInput = z.input<z.ZodUnknown>;

const ParserPrimitiveSchema = z.union([z.string(), z.number()]);

function parseRollExpression(value: ParserBoundaryInput): ParsedRollExpression {
  if (
    value instanceof Dice.FudgeDice ||
    value instanceof Dice.PercentileDice ||
    value instanceof Dice.StandardDice ||
    value instanceof RollGroup
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(parseRollExpression);
  const primitive = ParserPrimitiveSchema.safeParse(value);
  if (primitive.success) return primitive.data;
  throw new Error("Roll parser returned an invalid expression");
}

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
  expression: ParsedRollExpression,
  dice: ParsedDiceDefinition[],
): void {
  if (
    expression instanceof Dice.FudgeDice ||
    expression instanceof Dice.PercentileDice
  ) {
    dice.push(expression);
    return;
  }
  if (expression instanceof Dice.StandardDice) {
    dice.push(expression);
    return;
  }
  if (expression instanceof RollGroup) {
    collectDice(parseRollExpression(expression.expressions), dice);
    return;
  }
  if (Array.isArray(expression)) {
    for (const item of expression) {
      collectDice(parseRollExpression(item), dice);
    }
  }
}

function sidesForLimit(die: ParsedDiceDefinition): number {
  if (die instanceof Dice.PercentileDice) return 100;
  if (die instanceof Dice.FudgeDice) return 6;
  return die.sides;
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
  die: ParsedDiceDefinition,
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

function unsafeExplosion(
  dice: ParsedDiceDefinition[],
  repetitions: number,
): boolean {
  let hasExplosions = false;
  let expectedRolls = 0;
  for (const die of dice) {
    const explode = die.modifiers?.get("explode");
    if (!(explode instanceof Modifiers.ExplodeModifier)) {
      expectedRolls += die.qty;
      continue;
    }
    hasExplosions = true;
    const probability = comparisonProbability(die, explode);
    if (probability >= 1 - Number.EPSILON) return true;
    expectedRolls += die.qty / (1 - probability);
  }
  return hasExplosions && expectedRolls * repetitions > MAX_RENDERED_DICE;
}

export function parseNotationArgs(rawNotation: string): string[] {
  const notation = rawNotation.trim();
  if (notation.length === 0) return [];
  try {
    Parser.parse(notation);
    return [notation];
  } catch {
    return notation.split(/ +/).filter(Boolean);
  }
}

export function checkRollLimits(
  notation: readonly string[],
  repetitions = 1,
): RollLimitResult {
  const containsDice = notation.some((value) =>
    /(\d*)d(\d+|%|F(?:\.\d+)?)/i.test(value),
  );
  if (!containsDice) return { allowed: true, containsDice: false };

  const dice: ParsedDiceDefinition[] = [];
  for (const value of notation) {
    if (value.trim().length === 0) continue;
    try {
      collectDice(Parser.parse(value.trim()), dice);
    } catch {
      return { allowed: true, containsDice: true };
    }
  }

  const repeats = repetitionCount(repetitions);
  const diceCount =
    dice.reduce(
      (total, die) =>
        total + die.qty * (sidesForLimit(die) === 100 ? 2 : 1),
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
  if (dice.some((die) => sidesForLimit(die) > MAX_DIE_SIDES)) {
    return {
      allowed: false,
      containsDice: true,
      code: "TOO_MANY_SIDES",
      message: `Dice notation exceeds the ${MAX_DIE_SIDES} sides limit`,
    };
  }
  if (unsafeExplosion(dice, repeats)) {
    return {
      allowed: false,
      containsDice: true,
      code: "UNSAFE_EXPLOSION",
      message: `Expected explosion work exceeds the ${MAX_RENDERED_DICE}-roll safety limit`,
    };
  }
  return { allowed: true, containsDice: true };
}
