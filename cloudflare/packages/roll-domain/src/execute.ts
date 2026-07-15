import {
  Dice,
  DiceRoll,
  NumberGenerator,
  Parser,
  Results,
  RollGroup,
} from "@dice-roller/rpg-dice-roller";
import {
  MAX_NOTATION_EXPRESSIONS,
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
} from "./constants";
import { MAX_RENDERED_DICE, checkRollLimits } from "./limits";
import { createDeterministicRandom } from "./random";

export type RollDie = {
  sides: number | "%" | "F";
  rolled: number;
  modifiers: string[];
};

export type RollOutcome = {
  notation: string;
  output: string;
  total: number;
  dice: RollDie[];
};

export type RollExecutionError =
  | {
      code: "TOO_MANY_DICE" | "TOO_MANY_SIDES" | "UNSAFE_EXPLOSION" | "NO_DICE";
      message: string;
    }
  | {
      code: "INVALID_NOTATION" | "NON_FINITE_TOTAL";
      notation: string;
    };

export type RollExecutionRequest = {
  notation: readonly string[];
  repetitions?: number;
  seed: number;
};

export type RollExecutionResult = {
  version: 1;
  seed: number;
  outcomes: RollOutcome[];
  errors: RollExecutionError[];
};

type RandomEngine = { next(): number };

function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Roll seed must be an unsigned 32-bit integer");
  }
}

function normalizeRepetitions(repetitions: number | undefined): number {
  if (repetitions === undefined) return 1;
  if (
    !Number.isSafeInteger(repetitions) ||
    repetitions <= 0 ||
    repetitions > MAX_REPETITIONS
  ) {
    throw new Error(
      `Roll repetitions must be an integer from 1 through ${MAX_REPETITIONS}`,
    );
  }
  return repetitions;
}

function seededEngine(seed: number): RandomEngine {
  const random = createDeterministicRandom(seed);
  return { next: random.nextInt32 };
}

function normalizeNotation(notation: string): string {
  return notation.toLowerCase().replace(/df/g, "dF");
}

function collectDiceDefinitions(
  value: unknown,
  definitions: Dice.StandardDice[],
): void {
  if (value instanceof Dice.StandardDice) {
    definitions.push(value);
    return;
  }
  if (value instanceof RollGroup) {
    collectDiceDefinitions(value.expressions, definitions);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDiceDefinitions(item, definitions);
  }
}

function collectRollResults(
  value: unknown,
  groups: Results.RollResults[],
): void {
  if (value instanceof Results.RollResults) {
    groups.push(value);
    return;
  }
  if (value instanceof Results.ResultGroup) {
    collectRollResults(value.results, groups);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRollResults(item, groups);
  }
}

function percentileDice(
  value: number,
  modifiers: string[],
): RollDie[] {
  return [
    {
      sides: "%",
      rolled: value === 100 ? 0 : Math.floor(value / 10) * 10,
      modifiers,
    },
    {
      sides: 10,
      rolled: value % 10,
      modifiers: [],
    },
  ];
}

function physicalDice(
  definition: Dice.StandardDice,
  result: Results.RollResult,
): RollDie[] {
  const modifiers = [...result.modifiers];
  if (definition instanceof Dice.FudgeDice) {
    return [{ sides: "F", rolled: result.value, modifiers }];
  }
  if (definition instanceof Dice.PercentileDice || definition.sides === 100) {
    return percentileDice(result.value, modifiers);
  }
  if (typeof definition.sides !== "number") {
    throw new Error("Roll result contains unsupported die sides");
  }
  return [{ sides: definition.sides, rolled: result.value, modifiers }];
}

function diceForRoll(
  notation: string,
  parsed: unknown,
  roll: DiceRoll,
): RollDie[] {
  const definitions: Dice.StandardDice[] = [];
  const resultGroups: Results.RollResults[] = [];
  collectDiceDefinitions(parsed, definitions);
  collectRollResults(roll.rolls, resultGroups);
  if (definitions.length !== resultGroups.length) {
    throw new Error(`Roll result shape does not match notation: ${notation}`);
  }
  return definitions.flatMap((definition, index) => {
    const group = resultGroups[index];
    if (group === undefined) {
      throw new Error(`Roll result group is missing: ${notation}`);
    }
    return group.rolls.flatMap((result) => physicalDice(definition, result));
  });
}

function limitError(
  seed: number,
  result: Exclude<ReturnType<typeof checkRollLimits>, { allowed: true }>,
): RollExecutionResult {
  return {
    version: 1,
    seed,
    outcomes: [],
    errors: [{ code: result.code, message: result.message }],
  };
}

export function executeRoll(request: RollExecutionRequest): RollExecutionResult {
  validateSeed(request.seed);
  if (request.notation.length > MAX_NOTATION_EXPRESSIONS) {
    throw new Error(
      `Roll request cannot contain more than ${MAX_NOTATION_EXPRESSIONS} notation expressions`,
    );
  }
  const notationLength = request.notation.reduce(
    (length, value) => length + value.length,
    Math.max(0, request.notation.length - 1),
  );
  if (notationLength > MAX_NOTATION_LENGTH) {
    throw new Error(
      `Roll notation must not exceed ${MAX_NOTATION_LENGTH} characters`,
    );
  }
  const repetitions = normalizeRepetitions(request.repetitions);
  const notation = request.notation.map(normalizeNotation);
  const limits = checkRollLimits(notation, repetitions);
  if (!limits.allowed) return limitError(request.seed, limits);
  if (!limits.containsDice) {
    return {
      version: 1,
      seed: request.seed,
      outcomes: [],
      errors: [{ code: "NO_DICE", message: "Roll notation contains no dice" }],
    };
  }

  const repeatedNotation = Array.from(
    { length: repetitions },
    () => notation,
  ).flat();
  const outcomes: RollOutcome[] = [];
  const errors: RollExecutionError[] = [];
  const generator = NumberGenerator.generator;
  const previousEngine = generator.engine as RandomEngine;
  generator.engine = seededEngine(request.seed);
  try {
    for (const value of repeatedNotation) {
      let parsed: unknown;
      let roll: DiceRoll;
      try {
        parsed = Parser.parse(value) as unknown;
        roll = new DiceRoll(value);
      } catch {
        errors.push({ code: "INVALID_NOTATION", notation: value });
        continue;
      }
      if (!Number.isFinite(roll.total)) {
        errors.push({ code: "NON_FINITE_TOTAL", notation: value });
        continue;
      }
      outcomes.push({
        notation: value,
        output: roll.output,
        total: roll.total,
        dice: diceForRoll(value, parsed, roll),
      });
    }
  } finally {
    generator.engine = previousEngine;
  }
  const renderedDice = outcomes.reduce(
    (total, outcome) => total + outcome.dice.length,
    0,
  );
  if (renderedDice > MAX_RENDERED_DICE) {
    return {
      version: 1,
      seed: request.seed,
      outcomes: [],
      errors: [
        {
          code: "TOO_MANY_DICE",
          message: `Roll result exceeds the ${MAX_RENDERED_DICE} dice limit`,
        },
      ],
    };
  }
  return { version: 1, seed: request.seed, outcomes, errors };
}
