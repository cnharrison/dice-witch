import {
  PATTERN_NAMES_V1_V2,
  type IconName,
  type PatternNameV1V2,
  type RenderDie,
  type RenderFill,
  type RenderRequest,
} from "./types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ICON_NAMES = new Set<IconName>([
  "trashcan",
  "explosion",
  "recycle",
  "chevronUp",
  "chevronDown",
  "target-success",
  "critical-success",
  "critical-failure",
  "penetrate",
  "unique",
  "blank",
]);
const PATTERN_NAMES: ReadonlySet<string> = new Set(PATTERN_NAMES_V1_V2);

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function parseColor(value: unknown, path: string): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new Error(`${path} must be a six-digit hex color`);
  }
  return value;
}

function parseSides(value: unknown, path: string): RenderDie["sides"] {
  if (value === "%" || value === "F") {
    return value;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 999) {
    throw new Error(`${path} must be an integer from 1 through 999, %, or F`);
  }
  return value;
}

function parseRolled(value: unknown, sides: RenderDie["sides"], path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${path} must be a safe integer`);
  }
  const rolled = value;
  if (sides === "F" && ![-1, 0, 1].includes(rolled)) {
    throw new Error(`${path} must be -1, 0, or 1 for Fudge dice`);
  }
  if (sides === "%" && (rolled < 0 || rolled > 90 || rolled % 10 !== 0)) {
    throw new Error(`${path} must be a multiple of 10 from 0 through 90 for percentile dice`);
  }
  if (
    typeof sides === "number" &&
    rolled < 1 &&
    !(sides === 10 && rolled === 0)
  ) {
    throw new Error(`${path} must be positive, except d10 may use zero`);
  }
  return rolled;
}

function parseIcons(value: unknown, path: string): IconName[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error(`${path} must be an array containing at most three icons`);
  }
  return value.map((icon, index) => {
    if (typeof icon !== "string" || !ICON_NAMES.has(icon as IconName)) {
      throw new Error(`${path}[${index}] is not a supported icon`);
    }
    return icon as IconName;
  });
}

function parseFill(value: unknown, path: string): RenderFill {
  assertRecord(value, path);
  if (value.type === "gradient") {
    return { type: "gradient" };
  }
  if (
    value.type === "pattern" &&
    typeof value.pattern === "string" &&
    PATTERN_NAMES.has(value.pattern)
  ) {
    return { type: "pattern", pattern: value.pattern as PatternNameV1V2 };
  }
  throw new Error(`${path} must select gradient or a supported pattern`);
}

function parseDie(value: unknown, path: string): RenderDie {
  assertRecord(value, path);
  const sides = parseSides(value.sides, `${path}.sides`);
  return {
    sides,
    rolled: parseRolled(value.rolled, sides, `${path}.rolled`),
    color: parseColor(value.color, `${path}.color`),
    secondaryColor: parseColor(value.secondaryColor, `${path}.secondaryColor`),
    textColor: parseColor(value.textColor, `${path}.textColor`),
    outlineColor: parseColor(value.outlineColor, `${path}.outlineColor`),
    icons: parseIcons(value.icons, `${path}.icons`),
    fill: parseFill(value.fill, `${path}.fill`),
  };
}

export function validateRenderRequest(value: unknown): RenderRequest {
  assertRecord(value, "Render request");
  if (value.version !== 1) {
    throw new Error("Render request version must be 1");
  }
  if (!Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error("Render request groups must be a non-empty array");
  }

  let diceCount = 0;
  const groups = value.groups.map((group, groupIndex) => {
    if (!Array.isArray(group) || group.length === 0) {
      throw new Error(`Render request groups[${groupIndex}] must be a non-empty array`);
    }
    diceCount += group.length;
    if (diceCount > 50) {
      throw new Error("Render request exceeds 50 dice");
    }
    return group.map((die, dieIndex) =>
      parseDie(die, `Render request groups[${groupIndex}][${dieIndex}]`),
    );
  });

  return { version: 1, groups };
}
