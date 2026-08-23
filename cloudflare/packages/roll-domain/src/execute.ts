import {
  DiceRoll,
  NumberGenerator,
  Results,
} from "@dice-roller/rpg-dice-roller";
import {
  MAX_NOTATION_EXPRESSIONS,
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
} from "./constants";
import {
  MAX_RENDERED_DICE,
  analyzeRollExpressions,
  checkRollAnalysis,
  type RollAnalysis,
  type RollDieDefinition,
  type RollLimitResult,
} from "./limits";
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
      code: "INVALID_NOTATION" | "NON_FINITE_TOTAL" | "TOTAL_TOO_LARGE";
      notation: string;
    };

export type RollExecutionRequest = {
  notation: readonly string[];
  repetitions?: number;
  seed: number;
  stableAppearanceIdentities?: boolean;
  preserveOutOfRangePhysicalFaces?: boolean;
};

export type AnalyzedRollExecutionRequest = Omit<
  RollExecutionRequest,
  "notation"
> & {
  analysis: RollAnalysis;
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

function validateAnalysis(analysis: RollAnalysis): void {
  if (analysis.expressions.length > MAX_NOTATION_EXPRESSIONS) {
    throw new Error(
      `Roll request cannot contain more than ${MAX_NOTATION_EXPRESSIONS} notation expressions`,
    );
  }
  const notationLength = analysis.expressions.reduce(
    (length, { notation }) => length + notation.length,
    Math.max(0, analysis.expressions.length - 1),
  );
  if (notationLength > MAX_NOTATION_LENGTH) {
    throw new Error(
      `Roll notation must not exceed ${MAX_NOTATION_LENGTH} characters`,
    );
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
  definition: RollDieDefinition,
  result: Results.RollResult,
  identity?: AppearanceIdentityV4,
  preserveOutOfRangePhysicalFaces = false,
): RollDie[] {
  const modifiers = [...result.modifiers];
  if (definition.kind === "fudge") {
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
  if (definition.kind === "percentile") {
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

function definitionKind(definition: RollDieDefinition): string {
  return definition.kind === "standard"
    ? String(definition.sides)
    : definition.kind;
}

function definitionIdentity(
  definitions: readonly RollDieDefinition[],
  definitionIndex: number,
): string {
  const definition = definitions[definitionIndex];
  if (definition === undefined) {
    throw new Error("Roll die definition is missing");
  }
  return `${definitionKind(definition)}:0`;
}

function definitionDieOffset(
  definitions: readonly RollDieDefinition[],
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
  definition: RollDieDefinition,
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
  definitions: readonly RollDieDefinition[],
  roll: DiceRoll,
  appearanceGroupIdentity?: string,
  preserveOutOfRangePhysicalFaces = false,
): RollDie[] {
  const resultGroups: Results.RollResults[] = [];
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
  result: Exclude<RollLimitResult, { allowed: true }>,
): RollExecutionResult {
  return {
    version: 1,
    seed,
    outcomes: [],
    errors: [{ code: result.code, message: result.message }],
  };
}

function previewDiceForDefinition(
  definition: RollDieDefinition,
  definitions: readonly RollDieDefinition[],
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
    if (definition.kind === "fudge") {
      return [
        {
          sides: "F" as const,
          rolled: 0,
          modifiers: [],
          ...identityFields(identity),
        },
      ];
    }
    if (definition.kind === "percentile") {
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
  const { notation, ...options } = request;
  return prepareAnalyzedRollAppearance({
    ...options,
    analysis: analyzeRollExpressions(notation),
  });
}

export function prepareAnalyzedRollAppearance(
  request: AnalyzedRollExecutionRequest,
): RollExecutionResult {
  validateSeed(request.seed);
  const { analysis } = request;
  validateAnalysis(analysis);
  const repetitions = normalizeRepetitions(request.repetitions);
  const limits = checkRollAnalysis(analysis, repetitions);
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
    for (const [expressionIndex, expression] of analysis.expressions.entries()) {
      if (!expression.valid) {
        errors.push({
          code: "INVALID_NOTATION",
          notation: expression.notation,
        });
        continue;
      }
      const { definitions } = expression;
      const appearanceGroupIdentity = `expression:${String(expressionIndex)}:repeat:${String(repetitionIndex)}`;
      outcomes.push({
        notation: expression.notation,
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
  const { notation, ...options } = request;
  return executeAnalyzedRoll({
    ...options,
    analysis: analyzeRollExpressions(notation),
  });
}

export function executeAnalyzedRoll(
  request: AnalyzedRollExecutionRequest,
): RollExecutionResult {
  validateSeed(request.seed);
  const { analysis } = request;
  validateAnalysis(analysis);
  const repetitions = normalizeRepetitions(request.repetitions);
  const limits = checkRollAnalysis(analysis, repetitions);
  if (!limits.allowed) return limitError(request.seed, limits);
  if (!limits.containsDice) {
    return {
      version: 1,
      seed: request.seed,
      outcomes: [],
      errors: [{ code: "NO_DICE", message: "Roll notation contains no dice" }],
    };
  }

  const repeatedExpressions = Array.from(
    { length: repetitions },
    (_, repetitionIndex) =>
      analysis.expressions.map((expression, expressionIndex) => ({
        expression,
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
    for (const { expression, appearanceGroupIdentity } of repeatedExpressions) {
      if (!expression.valid) {
        errors.push({
          code: "INVALID_NOTATION",
          notation: expression.notation,
        });
        continue;
      }
      let roll: DiceRoll;
      try {
        roll = new DiceRoll(expression.notation);
      } catch {
        errors.push({
          code: "INVALID_NOTATION",
          notation: expression.notation,
        });
        continue;
      }
      if (!Number.isFinite(roll.total)) {
        errors.push({
          code: "NON_FINITE_TOTAL",
          notation: expression.notation,
        });
        continue;
      }
      outcomes.push({
        notation: expression.notation,
        output: roll.output,
        total: roll.total,
        dice: diceForRoll(
          expression.notation,
          expression.definitions,
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
