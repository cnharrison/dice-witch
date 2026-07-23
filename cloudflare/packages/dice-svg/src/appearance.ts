import generateLinearGradientFill from "./fills/generateLinearGradientFill";
import patternFills from "./fills/generatePatternFills";
import { getAppearanceLabelBaselineShift } from "./appearanceFontMetrics";
import {
  PATTERN_NAMES_V1_V2,
  type AppearanceFontId,
  type PatternNameV1V2,
} from "./types";

export type { AppearanceFontId } from "./types";
export type AppearanceEffect =
  | "critical-success"
  | "critical-failure"
  | null;
export type AppearanceFill =
  | { type: "solid" }
  | { type: "gradient" }
  | { type: "pattern"; pattern: PatternNameV1V2 };

export const APPEARANCE_BORDER_COLOR = "#000000" as const;

export type AppearanceStyle = {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  outlineColor: typeof APPEARANCE_BORDER_COLOR;
  fill: AppearanceFill;
  fontId: AppearanceFontId;
  effect: AppearanceEffect;
};

export type AppearanceDieRequest = AppearanceStyle & { result: number };
export type PercentileResult = 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90;
export type PercentileAppearanceRequest = AppearanceStyle & {
  result: PercentileResult;
};
export type FudgeResult = -1 | 0 | 1;
export type FudgeAppearanceRequest = AppearanceStyle & { result: FudgeResult };
export type OtherAppearanceRequest = AppearanceStyle & {
  sides: number;
  result: number;
};
export type AppearanceCompositionOptions = {
  localSeparation: boolean;
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const APPEARANCE_REQUEST_KEYS = [
  "effect",
  "fill",
  "fontId",
  "outlineColor",
  "primaryColor",
  "result",
  "secondaryColor",
  "textColor",
] as const;
const OTHER_APPEARANCE_REQUEST_KEYS = [
  ...APPEARANCE_REQUEST_KEYS,
  "sides",
] as const;
const PATTERN_NAMES: ReadonlySet<string> = new Set(PATTERN_NAMES_V1_V2);
type AppearanceFontStyle = {
  family: string;
  weight: number;
  inkStrokeWidth: number;
};

const FONT_STYLES: Record<AppearanceFontId, AppearanceFontStyle> = {
  "liberation-sans": {
    family: "Liberation Sans",
    weight: 700,
    inkStrokeWidth: 4,
  },
  "new-rocker": { family: "New Rocker", weight: 400, inkStrokeWidth: 5 },
  "stencil-ops": {
    family: "Dice Witch Stencil Ops",
    weight: 400,
    inkStrokeWidth: 4,
  },
  "creeping-horror": {
    family: "Dice Witch Creeping Horror",
    weight: 400,
    inkStrokeWidth: 4,
  },
  "special-elite": {
    family: "Special Elite",
    weight: 400,
    inkStrokeWidth: 5,
  },
  "luckiest-guy": {
    family: "Luckiest Guy",
    weight: 400,
    inkStrokeWidth: 3,
  },
  "fontdiner-swanky": {
    family: "Fontdiner Swanky",
    weight: 400,
    inkStrokeWidth: 4,
  },
  syncopate: { family: "Syncopate", weight: 700, inkStrokeWidth: 4 },
};

export const CRITICAL_GLOW_FILTER = `<filter id="critical-glow" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="14"/>
    </filter>`;

export const ENGRAVED_NUMBER_FILTER = `<filter id="engraved-number" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="shadow-blur"/>
      <feOffset in="shadow-blur" dx="3.5" dy="3.5" result="shadow-offset"/>
      <feComposite in="SourceAlpha" in2="shadow-offset" operator="out" result="shadow-mask"/>
      <feFlood flood-color="#000000" flood-opacity="0.75" result="shadow-color"/>
      <feComposite in="shadow-color" in2="shadow-mask" operator="in" result="inner-shadow"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="highlight-blur"/>
      <feOffset in="highlight-blur" dx="-3" dy="-3" result="highlight-offset"/>
      <feComposite in="SourceAlpha" in2="highlight-offset" operator="out" result="highlight-mask"/>
      <feFlood flood-color="#ffffff" flood-opacity="0.75" result="highlight-color"/>
      <feComposite in="highlight-color" in2="highlight-mask" operator="in" result="inner-highlight"/>
      <feMerge>
        <feMergeNode in="SourceGraphic"/>
        <feMergeNode in="inner-shadow"/>
        <feMergeNode in="inner-highlight"/>
      </feMerge>
    </filter>`;

export function getLocalSeparationColor(
  textColor: string,
): "#000000" | "#ffffff" {
  const red = Number.parseInt(textColor.slice(1, 3), 16);
  const green = Number.parseInt(textColor.slice(3, 5), 16);
  const blue = Number.parseInt(textColor.slice(5, 7), 16);
  const brightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return brightness >= 128 ? "#000000" : "#ffffff";
}

export function composeLocalSeparationPolygon(
  points: string,
  textColor: string,
): string {
  return `<polygon data-local-separation="true" points="${points}" fill="${getLocalSeparationColor(textColor)}" opacity="0.6" pointer-events="none"/>`;
}

export function composeFacetBorder(points: string): string {
  return `<polygon points="${points}" fill="none" stroke="${APPEARANCE_BORDER_COLOR}" stroke-width="3" stroke-linejoin="round"/>`;
}

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

function parseColor(value: unknown, name: string): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new Error(`${name} must be a six-digit hex color`);
  }
  return value.toLowerCase();
}

function parseOutlineColor(
  value: unknown,
  dieName: string,
): typeof APPEARANCE_BORDER_COLOR {
  if (parseColor(value, `${dieName} outline color`) !== APPEARANCE_BORDER_COLOR) {
    throw new Error(`${dieName} outline color must be ${APPEARANCE_BORDER_COLOR}`);
  }
  return APPEARANCE_BORDER_COLOR;
}

function isAppearanceFontId(value: unknown): value is AppearanceFontId {
  return typeof value === "string" && Object.hasOwn(FONT_STYLES, value);
}

function parseFill(value: unknown, dieName: string): AppearanceFill {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(`${dieName} appearance fill is invalid`);
  }
  if (
    (value.type === "solid" || value.type === "gradient") &&
    hasExactKeys(value, ["type"])
  ) {
    return { type: value.type };
  }
  if (
    value.type === "pattern" &&
    hasExactKeys(value, ["pattern", "type"]) &&
    typeof value.pattern === "string" &&
    PATTERN_NAMES.has(value.pattern)
  ) {
    return { type: "pattern", pattern: value.pattern as PatternNameV1V2 };
  }
  throw new Error(`${dieName} appearance fill is invalid`);
}

function parseAppearanceStyle(
  value: Record<string, unknown>,
  dieName: string,
): AppearanceStyle {
  if (!isAppearanceFontId(value.fontId)) {
    throw new Error(`${dieName} appearance font is not supported`);
  }
  if (
    value.effect !== null &&
    value.effect !== "critical-success" &&
    value.effect !== "critical-failure"
  ) {
    throw new Error(`${dieName} appearance effect is not supported`);
  }
  return {
    primaryColor: parseColor(value.primaryColor, `${dieName} primary color`),
    secondaryColor: parseColor(
      value.secondaryColor,
      `${dieName} secondary color`,
    ),
    textColor: parseColor(value.textColor, `${dieName} text color`),
    outlineColor: parseOutlineColor(value.outlineColor, dieName),
    fill: parseFill(value.fill, dieName),
    fontId: value.fontId,
    effect: value.effect,
  };
}

function parseExactAppearanceRecord(
  value: unknown,
  dieName: string,
  keys: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error(`${dieName} appearance request has invalid fields`);
  }
  return value;
}

export function parseAppearanceDieRequest(
  value: unknown,
  sides: number,
): AppearanceDieRequest {
  const dieName = `D${String(sides)}`;
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  if (
    typeof record.result !== "number" ||
    !Number.isInteger(record.result) ||
    record.result < 1 ||
    record.result > sides
  ) {
    throw new Error(
      `${dieName} appearance result must be from 1 through ${String(sides)}`,
    );
  }
  return {
    result: record.result,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parseD10AppearanceRequest(
  value: unknown,
): AppearanceDieRequest {
  const dieName = "D10";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  if (
    typeof record.result !== "number" ||
    !Number.isInteger(record.result) ||
    record.result < 0 ||
    record.result > 10
  ) {
    throw new Error("D10 appearance result must be from 0 through 10");
  }
  return {
    result: record.result,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parsePercentileAppearanceRequest(
  value: unknown,
): PercentileAppearanceRequest {
  const dieName = "Percentile";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  if (
    typeof record.result !== "number" ||
    !Number.isInteger(record.result) ||
    record.result < 0 ||
    record.result > 90 ||
    record.result % 10 !== 0
  ) {
    throw new Error(
      "Percentile appearance result must be a multiple of 10 from 0 through 90",
    );
  }
  return {
    result: record.result as PercentileResult,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parseFudgeAppearanceRequest(
  value: unknown,
): FudgeAppearanceRequest {
  const dieName = "Fudge";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  if (
    typeof record.result !== "number" ||
    !Number.isInteger(record.result) ||
    ![-1, 0, 1].includes(record.result)
  ) {
    throw new Error("Fudge appearance result must be -1, 0, or 1");
  }
  return {
    result: record.result as FudgeResult,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parseOtherAppearanceRequest(
  value: unknown,
): OtherAppearanceRequest {
  const dieName = "Other";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    OTHER_APPEARANCE_REQUEST_KEYS,
  );
  if (
    typeof record.sides !== "number" ||
    !Number.isInteger(record.sides) ||
    record.sides < 1 ||
    record.sides > 999
  ) {
    throw new Error("Other appearance sides must be from 1 through 999");
  }
  if (
    typeof record.result !== "number" ||
    !Number.isInteger(record.result) ||
    record.result < 1 ||
    record.result > record.sides
  ) {
    throw new Error(
      `Other appearance result must be from 1 through ${String(record.sides)}`,
    );
  }
  return {
    sides: record.sides,
    result: record.result,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function getAppearanceFontStyle(
  fontId: AppearanceFontId,
): AppearanceFontStyle {
  return FONT_STYLES[fontId];
}

export function createAppearanceSurfaceFill(
  request: AppearanceStyle,
): { definition: string; value: string } {
  if (request.fill.type === "solid") {
    return { definition: "", value: request.primaryColor };
  }
  const definition =
    request.fill.type === "gradient"
      ? generateLinearGradientFill(
          request.primaryColor,
          request.secondaryColor,
        )
      : patternFills[request.fill.pattern](
          request.primaryColor,
          request.secondaryColor,
        );
  return { definition: definition.string, value: `url(#${definition.name})` };
}

function composeOrientationMark(value: string, fontSize: number): string {
  if (value !== "6" && value !== "9") return "";
  const halfWidth = fontSize * 0.2;
  const y = Number((fontSize * 0.36).toFixed(2));
  return `<line data-orientation-mark="true" class="engraving-mark-ink" x1="${-halfWidth}" x2="${halfWidth}" y1="${y}" y2="${y}"/>`;
}

export function composeEngravedLabel(
  value: string,
  face: "result" | "neighbor",
  fontSize: number,
  fontId: AppearanceFontId,
): string {
  const baselineShift = getAppearanceLabelBaselineShift(
    fontId,
    value,
    fontSize,
  );
  const dy = baselineShift === 0 ? "" : ` dy="${baselineShift}"`;
  const textAttributes = `x="0" y="0"${dy} font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle"`;
  return `<text class="engraving-text engraving-ink" data-face="${face}" ${textAttributes}>${value}</text>
      ${composeOrientationMark(value, fontSize)}`;
}

export function composeEngravedNumber(
  value: number,
  face: "result" | "neighbor",
  fontSize: number,
  fontId: AppearanceFontId,
): string {
  return composeEngravedLabel(String(value), face, fontSize, fontId);
}

export function composeAppearanceTypographyCss(
  request: Pick<AppearanceStyle, "fontId" | "textColor">,
): string {
  const font = getAppearanceFontStyle(request.fontId);
  return `.engraving-text{font-family:"${font.family}";font-weight:${font.weight};stroke:${request.textColor};stroke-width:${font.inkStrokeWidth};stroke-linejoin:round;paint-order:stroke fill;text-rendering:optimizeLegibility}
      .engraving-ink{fill:${request.textColor};filter:url(#engraved-number)}
      .engraving-mark-ink{stroke:${request.textColor};stroke-width:4;filter:url(#engraved-number)}`;
}

export function getCriticalEffectColor(
  effect: AppearanceEffect,
): "#ffcc00" | "#ff3333" | null {
  if (effect === null) return null;
  return effect === "critical-success" ? "#ffcc00" : "#ff3333";
}

export function composeCriticalGlow(
  effect: AppearanceEffect,
  silhouettePoints: string,
): string {
  const color = getCriticalEffectColor(effect);
  if (color === null) return "";
  return `<g data-effect="${effect}">
    <polygon points="${silhouettePoints}" fill="none" stroke="${color}" stroke-width="18" opacity="0.9" filter="url(#critical-glow)"/>
    <polygon points="${silhouettePoints}" fill="none" stroke="${color}" stroke-width="8" opacity="0.95"/>
  </g>`;
}
