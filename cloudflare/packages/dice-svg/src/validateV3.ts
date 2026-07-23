import { APPEARANCE_BORDER_COLOR } from "./appearance";
import {
  APPEARANCE_FONT_IDS,
  PATTERN_NAMES_V3,
  type AppearanceFontId,
  type IconName,
  type PatternNameV3,
  type RenderAppearanceV3,
  type RenderDieV3,
  type RenderGradientScopeV3,
  type RenderLightingDirectionV3,
  type RenderLightingStrengthV3,
  type RenderLightingV3,
  type RenderLinearDirectionV3,
  type RenderRequestV3,
  type RenderSurfaceV3,
  type RenderTargetV3,
} from "./types";

const APPEARANCE_FONTS: ReadonlySet<unknown> = new Set(APPEARANCE_FONT_IDS);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const REQUEST_KEYS = ["groups", "version"] as const;
const DIE_KEYS = ["appearance", "icons", "result", "target"] as const;
const OTHER_DIE_KEYS = [...DIE_KEYS, "sides"] as const;
const APPEARANCE_KEYS = [
  "effect",
  "fontId",
  "lighting",
  "outlineColor",
  "requiresLocalSeparation",
  "surface",
  "textColor",
] as const;
const TARGETS = new Set<RenderTargetV3>([
  "d4",
  "d6",
  "d8",
  "d10",
  "d10-original",
  "d12",
  "d20",
  "percentile",
  "fudge",
  "other",
]);
const TARGET_SIDES: Partial<Record<RenderTargetV3, number>> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  "d10-original": 10,
  d12: 12,
  d20: 20,
};
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
const PATTERN_NAMES: ReadonlySet<string> = new Set(PATTERN_NAMES_V3);
const GRADIENT_SCOPES = new Set<RenderGradientScopeV3>([
  "repeated",
  "die-wide",
]);
const LINEAR_DIRECTIONS = new Set<RenderLinearDirectionV3>([
  "top-to-bottom",
  "upper-right-to-lower-left",
  "right-to-left",
  "lower-right-to-upper-left",
  "bottom-to-top",
  "lower-left-to-upper-right",
  "left-to-right",
  "upper-left-to-lower-right",
]);
const LIGHTING_STRENGTHS = new Set<RenderLightingStrengthV3>([
  "gentle",
  "subtle",
  "strong",
]);
const LIGHTING_DIRECTIONS = new Set<RenderLightingDirectionV3>([
  "top",
  "upper-left",
  "upper-right",
  "left",
  "right",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

function parseColor(value: unknown, path: string): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new Error(`${path} must be a six-digit hex color`);
  }
  return value.toLowerCase();
}

function parseOutlineColor(value: unknown, path: string): "#000000" {
  if (parseColor(value, path) !== APPEARANCE_BORDER_COLOR) {
    throw new Error(`${path} must be ${APPEARANCE_BORDER_COLOR}`);
  }
  return APPEARANCE_BORDER_COLOR;
}

function parseTextColor(
  value: unknown,
  path: string,
): RenderAppearanceV3["textColor"] {
  const color = parseColor(value, path);
  if (color !== "#111111" && color !== "#faf9f6") {
    throw new Error(`${path} is not supported`);
  }
  return color;
}

function isPatternName(value: unknown): value is PatternNameV3 {
  return typeof value === "string" && PATTERN_NAMES.has(value);
}

function parseSurface(value: unknown, path: string): RenderSurfaceV3 {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(`${path} is invalid`);
  }
  if (value.type === "solid") {
    if (!hasExactKeys(value, ["color", "type"])) {
      throw new Error(`${path} is invalid`);
    }
    return { type: "solid", color: parseColor(value.color, `${path}.color`) };
  }
  if (value.type === "gradient") {
    if (!hasExactKeys(value, ["colors", "direction", "scope", "type"])) {
      throw new Error(`${path} is invalid`);
    }
    if (
      !Array.isArray(value.colors) ||
      value.colors.length < 2 ||
      value.colors.length > 6
    ) {
      throw new Error(`${path}.colors must contain from two through six colors`);
    }
    if (
      typeof value.scope !== "string" ||
      !GRADIENT_SCOPES.has(value.scope as RenderGradientScopeV3) ||
      typeof value.direction !== "string" ||
      !LINEAR_DIRECTIONS.has(value.direction as RenderLinearDirectionV3)
    ) {
      throw new Error(`${path} is invalid`);
    }
    const colors = value.colors.map((color, index) =>
      parseColor(color, `${path}.colors[${String(index)}]`),
    );
    const first = colors[0];
    const second = colors[1];
    if (first === undefined || second === undefined) {
      throw new Error(`${path}.colors must contain from two through six colors`);
    }
    return {
      type: "gradient",
      colors: [first, second, ...colors.slice(2)],
      scope: value.scope as RenderGradientScopeV3,
      direction: value.direction as RenderLinearDirectionV3,
    };
  }
  if (value.type === "pattern") {
    if (
      !hasExactKeys(value, [
        "pattern",
        "primaryColor",
        "secondaryColor",
        "type",
      ]) ||
      !isPatternName(value.pattern)
    ) {
      throw new Error(`${path} is invalid`);
    }
    return {
      type: "pattern",
      pattern: value.pattern,
      primaryColor: parseColor(
        value.primaryColor,
        `${path}.primaryColor`,
      ),
      secondaryColor: parseColor(
        value.secondaryColor,
        `${path}.secondaryColor`,
      ),
    };
  }
  throw new Error(`${path} is invalid`);
}

function isLightingStrength(
  value: unknown,
): value is RenderLightingStrengthV3 {
  return (
    typeof value === "string" &&
    LIGHTING_STRENGTHS.has(value as RenderLightingStrengthV3)
  );
}

function isLightingDirection(
  value: unknown,
): value is RenderLightingDirectionV3 {
  return (
    typeof value === "string" &&
    LIGHTING_DIRECTIONS.has(value as RenderLightingDirectionV3)
  );
}

function parseLighting(value: unknown, path: string): RenderLightingV3 {
  if (!isRecord(value) || typeof value.mode !== "string") {
    throw new Error(`${path} is invalid`);
  }
  if (value.mode === "none" && hasExactKeys(value, ["mode"])) {
    return { mode: "none" };
  }
  if (
    value.mode === "facet" &&
    hasExactKeys(value, ["mode", "strength"]) &&
    isLightingStrength(value.strength)
  ) {
    return { mode: "facet", strength: value.strength };
  }
  if (
    (value.mode === "directional" || value.mode === "combined") &&
    hasExactKeys(value, ["direction", "mode", "strength"]) &&
    isLightingStrength(value.strength) &&
    isLightingDirection(value.direction)
  ) {
    return {
      mode: value.mode,
      strength: value.strength,
      direction: value.direction,
    };
  }
  throw new Error(`${path} is invalid`);
}

function isAppearanceFontId(value: unknown): value is AppearanceFontId {
  return typeof value === "string" && APPEARANCE_FONTS.has(value);
}

function parseAppearance(value: unknown, path: string): RenderAppearanceV3 {
  if (!isRecord(value) || !hasExactKeys(value, APPEARANCE_KEYS)) {
    throw new Error(`${path} has invalid fields`);
  }
  if (!isAppearanceFontId(value.fontId)) {
    throw new Error(`${path}.fontId is not supported`);
  }
  if (
    value.effect !== null &&
    value.effect !== "critical-success" &&
    value.effect !== "critical-failure"
  ) {
    throw new Error(`${path}.effect is not supported`);
  }
  if (typeof value.requiresLocalSeparation !== "boolean") {
    throw new Error(`${path}.requiresLocalSeparation must be a boolean`);
  }
  return {
    surface: parseSurface(value.surface, `${path}.surface`),
    lighting: parseLighting(value.lighting, `${path}.lighting`),
    textColor: parseTextColor(value.textColor, `${path}.textColor`),
    outlineColor: parseOutlineColor(
      value.outlineColor,
      `${path}.outlineColor`,
    ),
    fontId: value.fontId,
    effect: value.effect,
    requiresLocalSeparation: value.requiresLocalSeparation,
  };
}

function parseIcons(value: unknown, path: string): IconName[] {
  if (!Array.isArray(value) || value.length > 3) {
    throw new Error(`${path} must contain at most three icons`);
  }
  return value.map((icon, index) => {
    if (typeof icon !== "string" || !ICON_NAMES.has(icon as IconName)) {
      throw new Error(`${path}[${String(index)}] is not supported`);
    }
    return icon as IconName;
  });
}

function parseTarget(value: unknown, path: string): RenderTargetV3 {
  if (typeof value !== "string" || !TARGETS.has(value as RenderTargetV3)) {
    throw new Error(`${path}.target is not supported`);
  }
  return value as RenderTargetV3;
}

function parseOtherSides(value: unknown, path: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 999
  ) {
    throw new Error(`${path}.sides must be from 1 through 999`);
  }
  return value;
}

function parseResult(
  value: unknown,
  target: RenderTargetV3,
  sides: number | undefined,
  path: string,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${path}.result must be an integer`);
  }
  const fixedSides = TARGET_SIDES[target];
  const minimumFixedResult =
    target === "d10" || target === "d10-original" ? 0 : 1;
  if (
    fixedSides !== undefined &&
    (value < minimumFixedResult || value > fixedSides)
  ) {
    throw new Error(
      `${path}.result must be from ${String(minimumFixedResult)} through ${String(fixedSides)}`,
    );
  }
  if (
    target === "percentile" &&
    (value < 0 || value > 90 || value % 10 !== 0)
  ) {
    throw new Error(
      `${path}.result must be a multiple of 10 from 0 through 90`,
    );
  }
  if (target === "fudge" && ![-1, 0, 1].includes(value)) {
    throw new Error(`${path}.result must be -1, 0, or 1`);
  }
  if (target === "other") {
    if (sides === undefined) {
      throw new Error(`${path}.sides is required for Other dice`);
    }
    if (value < 1 || value > sides) {
      throw new Error(`${path}.result must be from 1 through ${String(sides)}`);
    }
  }
  return value;
}

function parseDie(value: unknown, path: string): RenderDieV3 {
  if (!isRecord(value)) {
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

export function validateRenderRequestV3(value: unknown): RenderRequestV3 {
  if (!isRecord(value) || !hasExactKeys(value, REQUEST_KEYS)) {
    throw new Error("Render request V3 has invalid fields");
  }
  if (value.version !== 3) {
    throw new Error("Render request version must be 3");
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
  return { version: 3, groups };
}
