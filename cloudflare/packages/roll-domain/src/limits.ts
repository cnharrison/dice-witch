import {
  Dice,
  Modifiers,
  Parser,
  RollGroup,
} from "@dice-roller/rpg-dice-roller";

export const MAX_RENDERED_DICE = 50;
export const MAX_DIE_SIDES = 999;

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

function sidesForLimit(die: Dice.StandardDice): number {
  if (die instanceof Dice.PercentileDice) return 100;
  if (die instanceof Dice.FudgeDice) return 6;
  return typeof die.sides === "number" ? die.sides : die.max;
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

function unsafeExplosion(
  dice: Dice.StandardDice[],
  repetitions: number,
): boolean {
  let hasExplosions = false;
  let expectedDice = 0;
  for (const die of dice) {
    const explode = die.modifiers?.get("explode");
    if (!(explode instanceof Modifiers.ExplodeModifier)) {
      expectedDice += die.qty;
      continue;
    }
    hasExplosions = true;
    if (explode.compound) {
      expectedDice += die.qty;
      continue;
    }
    const probability = comparisonProbability(die, explode);
    if (probability >= 1 - Number.EPSILON) return true;
    expectedDice += die.qty / (1 - probability);
  }
  return hasExplosions && expectedDice * repetitions > MAX_RENDERED_DICE;
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

  const dice: Dice.StandardDice[] = [];
  for (const value of notation) {
    if (value.trim().length === 0) continue;
    try {
      collectDice(Parser.parse(value.trim()) as unknown, dice);
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
      message: `Expected exploded dice count exceeds the ${MAX_RENDERED_DICE} dice image limit`,
    };
  }
  return { allowed: true, containsDice: true };
}
