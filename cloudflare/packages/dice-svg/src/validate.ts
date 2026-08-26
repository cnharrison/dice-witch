import { z } from "zod";
import {
  type IconName,
  type RenderDie,
  type RenderFill,
  type RenderRequest,
} from "./types";
import {
  iconNameSchema,
  isBoundaryRecord,
  numberValueSchema,
  patternNameV1V2Schema,
  stringValueSchema,
  type BoundaryRecord,
  type ValidationInput,
} from "./validationBoundary";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const specialSidesSchema = z.enum(["%", "F"]);

function requireRecord(value: ValidationInput, path: string): BoundaryRecord {
  if (!isBoundaryRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

function parseColor(value: ValidationInput, path: string): string {
  const parsed = stringValueSchema.safeParse(value);
  if (!parsed.success || !HEX_COLOR.test(parsed.data)) {
    throw new Error(`${path} must be a six-digit hex color`);
  }
  return parsed.data;
}

function parseSides(
  value: ValidationInput,
  path: string,
): RenderDie["sides"] {
  const specialSides = specialSidesSchema.safeParse(value);
  if (specialSides.success) return specialSides.data;
  const numericSides = numberValueSchema.safeParse(value);
  if (
    !numericSides.success ||
    !Number.isInteger(numericSides.data) ||
    numericSides.data < 1 ||
    numericSides.data > 999
  ) {
    throw new Error(`${path} must be an integer from 1 through 999, %, or F`);
  }
  return numericSides.data;
}

function parseRolled(
  value: ValidationInput,
  sides: RenderDie["sides"],
  path: string,
): number {
  const parsed = numberValueSchema.safeParse(value);
  if (!parsed.success || !Number.isSafeInteger(parsed.data)) {
    throw new Error(`${path} must be a safe integer`);
  }
  const rolled = parsed.data;
  if (sides === "F" && ![-1, 0, 1].includes(rolled)) {
    throw new Error(`${path} must be -1, 0, or 1 for Fudge dice`);
  }
  if (sides === "%" && (rolled < 0 || rolled > 90 || rolled % 10 !== 0)) {
    throw new Error(`${path} must be a multiple of 10 from 0 through 90 for percentile dice`);
  }
  if (
    sides !== "%" &&
    sides !== "F" &&
    rolled < 1 &&
    !(sides === 10 && rolled === 0)
  ) {
    throw new Error(`${path} must be positive, except d10 may use zero`);
  }
  return rolled;
}

function parseIcons(value: ValidationInput, path: string): IconName[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error(`${path} must be an array containing at most three icons`);
  }
  return value.map((icon, index) => {
    const parsed = iconNameSchema.safeParse(icon);
    if (!parsed.success) {
      throw new Error(`${path}[${String(index)}] is not a supported icon`);
    }
    return parsed.data;
  });
}

function parseFill(value: ValidationInput, path: string): RenderFill {
  const record = requireRecord(value, path);
  if (record.type === "gradient") {
    return { type: "gradient" };
  }
  if (record.type === "pattern") {
    const pattern = patternNameV1V2Schema.safeParse(record.pattern);
    if (pattern.success) {
      return { type: "pattern", pattern: pattern.data };
    }
  }
  throw new Error(`${path} must select gradient or a supported pattern`);
}

function parseDie(value: ValidationInput, path: string): RenderDie {
  const record = requireRecord(value, path);
  const sides = parseSides(record.sides, `${path}.sides`);
  return {
    sides,
    rolled: parseRolled(record.rolled, sides, `${path}.rolled`),
    color: parseColor(record.color, `${path}.color`),
    secondaryColor: parseColor(record.secondaryColor, `${path}.secondaryColor`),
    textColor: parseColor(record.textColor, `${path}.textColor`),
    outlineColor: parseColor(record.outlineColor, `${path}.outlineColor`),
    icons: parseIcons(record.icons, `${path}.icons`),
    fill: parseFill(record.fill, `${path}.fill`),
  };
}

export function validateRenderRequest(value: ValidationInput): RenderRequest {
  const request = requireRecord(value, "Render request");
  if (request.version !== 1) {
    throw new Error("Render request version must be 1");
  }
  if (!Array.isArray(request.groups) || request.groups.length === 0) {
    throw new Error("Render request groups must be a non-empty array");
  }

  let diceCount = 0;
  const groups = request.groups.map((group, groupIndex) => {
    if (!Array.isArray(group) || group.length === 0) {
      throw new Error(`Render request groups[${String(groupIndex)}] must be a non-empty array`);
    }
    diceCount += group.length;
    if (diceCount > 50) {
      throw new Error("Render request exceeds 50 dice");
    }
    return group.map((die, dieIndex) =>
      parseDie(
        die,
        `Render request groups[${String(groupIndex)}][${String(dieIndex)}]`,
      ),
    );
  });

  return { version: 1, groups };
}
