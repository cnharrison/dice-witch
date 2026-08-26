import { z } from "zod";
import { APPEARANCE_BORDER_COLOR } from "./appearance";
import {
  type IconName,
  type RenderAppearanceFillV2,
  type RenderAppearanceV2,
  type RenderDieV2,
  type RenderRequestV2,
  type RenderTargetV2,
} from "./types";
import {
  appearanceFontSchema,
  booleanValueSchema,
  hasExactKeys,
  iconNameSchema,
  isBoundaryRecord,
  numberValueSchema,
  patternNameV1V2Schema,
  stringValueSchema,
  type ValidationInput,
} from "./validationBoundary";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const REQUEST_KEYS = ["groups", "version"] as const;
const DIE_KEYS = ["appearance", "icons", "result", "target"] as const;
const OTHER_DIE_KEYS = [...DIE_KEYS, "sides"] as const;
const APPEARANCE_KEYS = [
  "effect",
  "fill",
  "fontId",
  "outlineColor",
  "primaryColor",
  "requiresLocalSeparation",
  "secondaryColor",
  "textColor",
] as const;
const targetSchema = z.enum([
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "percentile",
  "fudge",
  "other",
] satisfies readonly RenderTargetV2[]);
const FIXED_TARGET_SIDES = new Map<RenderTargetV2, number>([
  ["d4", 4],
  ["d6", 6],
  ["d8", 8],
  ["d10", 10],
  ["d12", 12],
  ["d20", 20],
]);
function parseColor(value: ValidationInput, path: string): string {
  const parsed = stringValueSchema.safeParse(value);
  if (!parsed.success || !HEX_COLOR.test(parsed.data)) {
    throw new Error(`${path} must be a six-digit hex color`);
  }
  return parsed.data.toLowerCase();
}

function parseOutlineColor(
  value: ValidationInput,
  path: string,
): "#000000" {
  if (parseColor(value, path) !== APPEARANCE_BORDER_COLOR) {
    throw new Error(`${path} must be ${APPEARANCE_BORDER_COLOR}`);
  }
  return APPEARANCE_BORDER_COLOR;
}

function parseFill(
  value: ValidationInput,
  path: string,
): RenderAppearanceFillV2 {
  if (!isBoundaryRecord(value)) {
    throw new Error(`${path} is invalid`);
  }
  const fillType = stringValueSchema.safeParse(value.type);
  if (!fillType.success) {
    throw new Error(`${path} is invalid`);
  }
  if (
    (fillType.data === "solid" || fillType.data === "gradient") &&
    hasExactKeys(value, ["type"])
  ) {
    return { type: fillType.data };
  }
  if (fillType.data === "pattern" && hasExactKeys(value, ["pattern", "type"])) {
    const pattern = patternNameV1V2Schema.safeParse(value.pattern);
    if (pattern.success) {
      return { type: "pattern", pattern: pattern.data };
    }
  }
  throw new Error(`${path} is invalid`);
}

function parseAppearance(
  value: ValidationInput,
  path: string,
): RenderAppearanceV2 {
  if (!isBoundaryRecord(value) || !hasExactKeys(value, APPEARANCE_KEYS)) {
    throw new Error(`${path} has invalid fields`);
  }
  const fontId = appearanceFontSchema.safeParse(value.fontId);
  if (!fontId.success) {
    throw new Error(`${path}.fontId is not supported`);
  }
  if (
    value.effect !== null &&
    value.effect !== "critical-success" &&
    value.effect !== "critical-failure"
  ) {
    throw new Error(`${path}.effect is not supported`);
  }
  const requiresLocalSeparation = booleanValueSchema.safeParse(
    value.requiresLocalSeparation,
  );
  if (!requiresLocalSeparation.success) {
    throw new Error(`${path}.requiresLocalSeparation must be a boolean`);
  }
  return {
    primaryColor: parseColor(value.primaryColor, `${path}.primaryColor`),
    secondaryColor: parseColor(value.secondaryColor, `${path}.secondaryColor`),
    textColor: parseColor(value.textColor, `${path}.textColor`),
    outlineColor: parseOutlineColor(value.outlineColor, `${path}.outlineColor`),
    fill: parseFill(value.fill, `${path}.fill`),
    fontId: fontId.data,
    effect: value.effect,
    requiresLocalSeparation: requiresLocalSeparation.data,
  };
}

function parseIcons(value: ValidationInput, path: string): IconName[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error(`${path} must contain at most three icons`);
  }
  return value.map((icon, index) => {
    const parsed = iconNameSchema.safeParse(icon);
    if (!parsed.success) {
      throw new Error(`${path}[${String(index)}] is not supported`);
    }
    return parsed.data;
  });
}

function parseTarget(value: ValidationInput, path: string): RenderTargetV2 {
  const parsed = targetSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${path}.target is not supported`);
  }
  return parsed.data;
}

function parseOtherSides(value: ValidationInput, path: string): number {
  const parsed = numberValueSchema.safeParse(value);
  if (
    !parsed.success ||
    !Number.isInteger(parsed.data) ||
    parsed.data < 1 ||
    parsed.data > 999
  ) {
    throw new Error(`${path}.sides must be from 1 through 999`);
  }
  return parsed.data;
}

function parseResult(
  value: ValidationInput,
  target: RenderTargetV2,
  sides: number | undefined,
  path: string,
): number {
  const parsed = numberValueSchema.safeParse(value);
  if (!parsed.success || !Number.isInteger(parsed.data)) {
    throw new Error(`${path}.result must be an integer`);
  }
  const result = parsed.data;
  const fixedSides = FIXED_TARGET_SIDES.get(target);
  const minimumFixedResult = target === "d10" ? 0 : 1;
  if (
    fixedSides !== undefined &&
    (result < minimumFixedResult || result > fixedSides)
  ) {
    throw new Error(
      `${path}.result must be from ${String(minimumFixedResult)} through ${String(fixedSides)}`,
    );
  }
  if (
    target === "percentile" &&
    (result < 0 || result > 90 || result % 10 !== 0)
  ) {
    throw new Error(`${path}.result must be a multiple of 10 from 0 through 90`);
  }
  if (target === "fudge" && ![-1, 0, 1].includes(result)) {
    throw new Error(`${path}.result must be -1, 0, or 1`);
  }
  if (target === "other") {
    if (sides === undefined) {
      throw new Error(`${path}.sides is required for Other dice`);
    }
    if (result < 1 || result > sides) {
      throw new Error(`${path}.result must be from 1 through ${String(sides)}`);
    }
  }
  return result;
}

function parseDie(value: ValidationInput, path: string): RenderDieV2 {
  if (!isBoundaryRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  const target = parseTarget(value.target, path);
  if (target === "other") {
    if (!hasExactKeys(value, OTHER_DIE_KEYS)) {
      throw new Error(`${path} has invalid fields`);
    }
    const sides = parseOtherSides(value.sides, path);
    return {
      target,
      sides,
      result: parseResult(value.result, target, sides, path),
      appearance: parseAppearance(value.appearance, `${path}.appearance`),
      icons: parseIcons(value.icons, `${path}.icons`),
    };
  }
  if (!hasExactKeys(value, DIE_KEYS)) {
    throw new Error(`${path} has invalid fields`);
  }
  return {
    target,
    result: parseResult(value.result, target, undefined, path),
    appearance: parseAppearance(value.appearance, `${path}.appearance`),
    icons: parseIcons(value.icons, `${path}.icons`),
  };
}

export function validateRenderRequestV2(
  value: ValidationInput,
): RenderRequestV2 {
  if (!isBoundaryRecord(value) || !hasExactKeys(value, REQUEST_KEYS)) {
    throw new Error("Render request V2 has invalid fields");
  }
  if (value.version !== 2) {
    throw new Error("Render request version must be 2");
  }
  if (!Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error("Render request groups must be a non-empty array");
  }
  let diceCount = 0;
  const groups = value.groups.map((group, groupIndex) => {
    if (!Array.isArray(group) || group.length === 0) {
      throw new Error(
        `Render request groups[${String(groupIndex)}] must be a non-empty array`,
      );
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
  return { version: 2, groups };
}
