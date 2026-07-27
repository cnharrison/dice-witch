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
  physicalFace?: number;
  appearanceGroupIdentity?: string;
  appearanceDieIdentity?: string;
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
  stableAppearanceIdentities?: boolean;
  preserveOutOfRangePhysicalFaces?: boolean;
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

type AppearanceIdentityV4 = {
  group: string;
  die: string;
};

function identityFields(
  identity: AppearanceIdentityV4 | undefined,
  component?: string,
): Pick<RollDie, "appearanceGroupIdentity" | "appearanceDieIdentity"> {
  return identity === undefined
    ? {}
    : {
        appearanceGroupIdentity: identity.group,
        appearanceDieIdentity:
          component === undefined ? identity.die : `${identity.die}:${component}`,
      };
}

function percentileDice(
  value: number,
  modifiers: string[],
  identity?: AppearanceIdentityV4,
  physicalValue?: number,
): RollDie[] {
  const physicalTens = physicalValue === undefined
    ? undefined
    : physicalValue === 100
      ? 0
      : Math.floor(physicalValue / 10) * 10;
  const physicalOnes = physicalValue === undefined
    ? undefined
    : physicalValue % 10 === 0
      ? 10
      : physicalValue % 10;
  return [
    {
      sides: "%",
      rolled: value === 100 ? 0 : Math.floor(value / 10) * 10,
      modifiers,
      ...(physicalTens === undefined ? {} : { physicalFace: physicalTens }),
      ...identityFields(identity, "percentile"),
    },
    {
      sides: 10,
      rolled: value % 10,
      modifiers: [],
      ...(physicalOnes === undefined ? {} : { physicalFace: physicalOnes }),
      ...identityFields(identity, "ones"),
    },
  ];
}

function physicalDice(
  definition: Dice.StandardDice,
  result: Results.RollResult,
  identity?: AppearanceIdentityV4,
  preserveOutOfRangePhysicalFaces = false,
): RollDie[] {
  const modifiers = [...result.modifiers];
  if (definition instanceof Dice.FudgeDice) {
    const physicalFace =
      preserveOutOfRangePhysicalFaces &&
        (result.value < -1 || result.value > 1)
        ? result.initialValue
        : undefined;
    return [
      {
        sides: "F",
        rolled: result.value,
        modifiers,
        ...(physicalFace === undefined ? {} : { physicalFace }),
        ...identityFields(identity),
      },
    ];
  }
  if (definition instanceof Dice.PercentileDice || definition.sides === 100) {
    const physicalValue =
      preserveOutOfRangePhysicalFaces &&
        (result.value < 1 || result.value > 100)
        ? result.initialValue
        : undefined;
    return percentileDice(result.value, modifiers, identity, physicalValue);
  }
  if (typeof definition.sides !== "number") {
    throw new Error("Roll result contains unsupported die sides");
  }
  const physicalFace =
    result.value < 1 ||
      (preserveOutOfRangePhysicalFaces && result.value > definition.sides)
      ? result.initialValue
      : undefined;
  if (
    physicalFace !== undefined &&
    (!Number.isSafeInteger(physicalFace) ||
      physicalFace < 1 ||
      physicalFace > definition.sides)
  ) {
    throw new Error("Roll result contains an invalid physical face");
  }
  return [
    {
      sides: definition.sides,
      rolled: result.value,
      modifiers,
      ...(physicalFace === undefined ? {} : { physicalFace }),
      ...identityFields(identity),
    },
  ];
}

function definitionKind(definition: Dice.StandardDice): string {
  return definition instanceof Dice.FudgeDice
    ? "fudge"
    : definition instanceof Dice.PercentileDice || definition.sides === 100
      ? "percentile"
      : String(definition.sides);
}

function definitionIdentity(
  definitions: readonly Dice.StandardDice[],
  definitionIndex: number,
): string {
  const definition = definitions[definitionIndex];
  if (definition === undefined) {
    throw new Error("Roll die definition is missing");
  }
  return `${definitionKind(definition)}:0`;
}

function definitionDieOffset(
  definitions: readonly Dice.StandardDice[],
  definitionIndex: number,
): number {
  const definition = definitions[definitionIndex];
  if (definition === undefined) {
    throw new Error("Roll die definition is missing");
  }
  const kind = definitionKind(definition);
  return definitions
    .slice(0, definitionIndex)
    .filter((candidate) => definitionKind(candidate) === kind)
    .reduce((total, candidate) => total + candidate.qty, 0);
}

function resultAppearanceIdentities(
  definition: Dice.StandardDice,
  group: Results.RollResults,
  appearanceGroupIdentity: string,
  definitionId: string,
  dieOffset: number,
): AppearanceIdentityV4[] {
  const identities: AppearanceIdentityV4[] = [];
  let resultIndex = 0;
  for (let dieIndex = 0; dieIndex < definition.qty; dieIndex += 1) {
    let result = group.rolls[resultIndex];
    if (result === undefined) {
      throw new Error("Roll result is missing an original die");
    }
    const die = `${appearanceGroupIdentity}:definition:${definitionId}:die:${String(dieOffset + dieIndex)}`;
    identities.push({ group: appearanceGroupIdentity, die });
    let generatedIndex = 0;
    while (
      result.modifiers.has("explode") &&
      !result.modifiers.has("compound")
    ) {
      resultIndex += 1;
      result = group.rolls[resultIndex];
      if (result === undefined) {
        throw new Error("Exploding roll result is missing its generated die");
      }
      identities.push({
        group: appearanceGroupIdentity,
        die: `${die}:generated:${String(generatedIndex)}`,
      });
      generatedIndex += 1;
    }
    resultIndex += 1;
  }
  if (resultIndex !== group.rolls.length) {
    throw new Error("Roll result contains unmatched generated dice");
  }
  return identities;
}

function diceForRoll(
  notation: string,
  parsed: unknown,
  roll: DiceRoll,
  appearanceGroupIdentity?: string,
  preserveOutOfRangePhysicalFaces = false,
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
    if (appearanceGroupIdentity === undefined) {
      return group.rolls.flatMap((result) =>
        physicalDice(
          definition,
          result,
          undefined,
          preserveOutOfRangePhysicalFaces,
        ),
      );
    }
    const identities = resultAppearanceIdentities(
      definition,
      group,
      appearanceGroupIdentity,
      definitionIdentity(definitions, index),
      definitionDieOffset(definitions, index),
    );
    return group.rolls.flatMap((result, resultIndex) =>
      physicalDice(
        definition,
        result,
        identities[resultIndex],
        preserveOutOfRangePhysicalFaces,
      ),
    );
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

function previewDiceForDefinition(
  definition: Dice.StandardDice,
  definitions: readonly Dice.StandardDice[],
  definitionIndex: number,
  appearanceGroupIdentity: string,
): RollDie[] {
  const definitionId = definitionIdentity(definitions, definitionIndex);
  const dieOffset = definitionDieOffset(definitions, definitionIndex);
  return Array.from({ length: definition.qty }, (_, dieIndex) => {
    const identity = {
      group: appearanceGroupIdentity,
      die: `${appearanceGroupIdentity}:definition:${definitionId}:die:${String(dieOffset + dieIndex)}`,
    };
    if (definition instanceof Dice.FudgeDice) {
      return [
        {
          sides: "F" as const,
          rolled: 0,
          modifiers: [],
          ...identityFields(identity),
        },
      ];
    }
    if (definition instanceof Dice.PercentileDice || definition.sides === 100) {
      return percentileDice(100, [], identity);
    }
    if (typeof definition.sides !== "number") {
      throw new Error("Roll preview contains unsupported die sides");
    }
    return [
      {
        sides: definition.sides,
        rolled: 1,
        modifiers: [],
        ...identityFields(identity),
      },
    ];
  }).flat();
}

export function prepareRollAppearance(
  request: RollExecutionRequest,
): RollExecutionResult {
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

  const outcomes: RollOutcome[] = [];
  const errors: RollExecutionError[] = [];
  for (let repetitionIndex = 0; repetitionIndex < repetitions; repetitionIndex += 1) {
    for (const [expressionIndex, value] of notation.entries()) {
      let parsed: unknown;
      try {
        parsed = Parser.parse(value) as unknown;
      } catch {
        errors.push({ code: "INVALID_NOTATION", notation: value });
        continue;
      }
      const definitions: Dice.StandardDice[] = [];
      collectDiceDefinitions(parsed, definitions);
      const appearanceGroupIdentity = `expression:${String(expressionIndex)}:repeat:${String(repetitionIndex)}`;
      outcomes.push({
        notation: value,
        output: "",
        total: 0,
        dice: definitions.flatMap((definition, definitionIndex) =>
          previewDiceForDefinition(
            definition,
            definitions,
            definitionIndex,
            appearanceGroupIdentity,
          ),
        ),
      });
    }
  }
  const renderedDice = outcomes.reduce(
    (total, outcome) => total + outcome.dice.length,
    0,
  );
  if (renderedDice > MAX_RENDERED_DICE) {
    return limitError(request.seed, {
      allowed: false,
      containsDice: true,
      code: "TOO_MANY_DICE",
      message: `Roll result exceeds the ${MAX_RENDERED_DICE} dice limit`,
    });
  }
  return { version: 1, seed: request.seed, outcomes, errors };
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
    (_, repetitionIndex) =>
      notation.map((value, expressionIndex) => ({
        value,
        appearanceGroupIdentity: request.stableAppearanceIdentities
          ? `expression:${String(expressionIndex)}:repeat:${String(repetitionIndex)}`
          : undefined,
      })),
  ).flat();
  const outcomes: RollOutcome[] = [];
  const errors: RollExecutionError[] = [];
  const generator = NumberGenerator.generator;
  const previousEngine = generator.engine as RandomEngine;
  generator.engine = seededEngine(request.seed);
  try {
    for (const { value, appearanceGroupIdentity } of repeatedNotation) {
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
        dice: diceForRoll(
          value,
          parsed,
          roll,
          appearanceGroupIdentity,
          request.preserveOutOfRangePhysicalFaces,
        ),
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

export type RenderableRollOutcome = {
  outcome: RollOutcome;
  outcomeIndex: number;
};

export function renderableRollOutcomes(
  result: RollExecutionResult,
): RenderableRollOutcome[] {
  return result.outcomes.flatMap((outcome, outcomeIndex) =>
    outcome.dice.length === 0 ? [] : [{ outcome, outcomeIndex }],
  );
}
