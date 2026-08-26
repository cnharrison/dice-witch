import generateLinearGradientFill from "./fills/generateLinearGradientFill";
import patternFills from "./fills/generatePatternFills";
import { getAppearanceLabelBaselineShift } from "./appearanceFontMetrics";
import {
  type AppearanceFontId,
  type PatternNameV1V2,
} from "./types";
import {
  appearanceFontSchema,
  fudgeResultSchema,
  hasExactKeys,
  isBoundaryRecord,
  numberValueSchema,
  patternNameV1V2Schema,
  percentileResultSchema,
  stringValueSchema,
  type BoundaryRecord,
  type ValidationInput,
} from "./validationBoundary";

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
type AppearanceSurfaceFill = {
  definition: string;
  value: string;
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
type AppearanceFontStyle = {
  family: string;
  weight: number;
  inkStrokeWidth: number;
};

const FONT_STYLES = {
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
} satisfies Record<AppearanceFontId, AppearanceFontStyle>;

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

function parseColor(value: ValidationInput, name: string): string {
  const parsed = stringValueSchema.safeParse(value);
  if (!parsed.success || !HEX_COLOR.test(parsed.data)) {
    throw new Error(`${name} must be a six-digit hex color`);
  }
  return parsed.data.toLowerCase();
}

function parseOutlineColor(
  value: ValidationInput,
  dieName: string,
): typeof APPEARANCE_BORDER_COLOR {
  if (parseColor(value, `${dieName} outline color`) !== APPEARANCE_BORDER_COLOR) {
    throw new Error(`${dieName} outline color must be ${APPEARANCE_BORDER_COLOR}`);
  }
  return APPEARANCE_BORDER_COLOR;
}

function parseFill(value: ValidationInput, dieName: string): AppearanceFill {
  if (!isBoundaryRecord(value)) {
    throw new Error(`${dieName} appearance fill is invalid`);
  }
  const fillType = stringValueSchema.safeParse(value.type);
  if (!fillType.success) {
    throw new Error(`${dieName} appearance fill is invalid`);
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
  throw new Error(`${dieName} appearance fill is invalid`);
}

function parseAppearanceStyle(
  value: BoundaryRecord,
  dieName: string,
): AppearanceStyle {
  const fontId = appearanceFontSchema.safeParse(value.fontId);
  if (!fontId.success) {
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
    fontId: fontId.data,
    effect: value.effect,
  };
}

function parseExactAppearanceRecord(
  value: ValidationInput,
  dieName: string,
  keys: readonly string[],
): BoundaryRecord {
  if (!isBoundaryRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error(`${dieName} appearance request has invalid fields`);
  }
  return value;
}

export function parseAppearanceDieRequest(
  value: ValidationInput,
  sides: number,
): AppearanceDieRequest {
  const dieName = `D${String(sides)}`;
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  const result = numberValueSchema.safeParse(record.result);
  if (
    !result.success ||
    !Number.isInteger(result.data) ||
    result.data < 1 ||
    result.data > sides
  ) {
    throw new Error(
      `${dieName} appearance result must be from 1 through ${String(sides)}`,
    );
  }
  return {
    result: result.data,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parseD10AppearanceRequest(
  value: ValidationInput,
): AppearanceDieRequest {
  const dieName = "D10";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  const result = numberValueSchema.safeParse(record.result);
  if (
    !result.success ||
    !Number.isInteger(result.data) ||
    result.data < 0 ||
    result.data > 10
  ) {
    throw new Error("D10 appearance result must be from 0 through 10");
  }
  return {
    result: result.data,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parsePercentileAppearanceRequest(
  value: ValidationInput,
): PercentileAppearanceRequest {
  const dieName = "Percentile";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  const result = percentileResultSchema.safeParse(record.result);
  if (!result.success) {
    throw new Error(
      "Percentile appearance result must be a multiple of 10 from 0 through 90",
    );
  }
  return {
    result: result.data,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parseFudgeAppearanceRequest(
  value: ValidationInput,
): FudgeAppearanceRequest {
  const dieName = "Fudge";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    APPEARANCE_REQUEST_KEYS,
  );
  const result = fudgeResultSchema.safeParse(record.result);
  if (!result.success) {
    throw new Error("Fudge appearance result must be -1, 0, or 1");
  }
  return {
    result: result.data,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function parseOtherAppearanceRequest(
  value: ValidationInput,
): OtherAppearanceRequest {
  const dieName = "Other";
  const record = parseExactAppearanceRecord(
    value,
    dieName,
    OTHER_APPEARANCE_REQUEST_KEYS,
  );
  const sides = numberValueSchema.safeParse(record.sides);
  if (
    !sides.success ||
    !Number.isInteger(sides.data) ||
    sides.data < 1 ||
    sides.data > 999
  ) {
    throw new Error("Other appearance sides must be from 1 through 999");
  }
  const result = numberValueSchema.safeParse(record.result);
  if (
    !result.success ||
    !Number.isInteger(result.data) ||
    result.data < 1 ||
    result.data > sides.data
  ) {
    throw new Error(
      `Other appearance result must be from 1 through ${String(sides.data)}`,
    );
  }
  return {
    sides: sides.data,
    result: result.data,
    ...parseAppearanceStyle(record, dieName),
  };
}

export function getAppearanceFontStyle(
  fontId: AppearanceFontId,
): AppearanceFontStyle {
  return FONT_STYLES[fontId];
}

export function createAppearanceSurfaceFill(request: AppearanceStyle) {
  if (request.fill.type === "solid") {
    return {
      definition: "",
      value: request.primaryColor,
    } satisfies AppearanceSurfaceFill;
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
  return {
    definition: definition.string,
    value: `url(#${definition.name})`,
  } satisfies AppearanceSurfaceFill;
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
