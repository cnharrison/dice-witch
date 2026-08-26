import {
  APPEARANCE_BORDER_COLOR,
  composeAppearanceTypographyCss,
  composeEngravedLabel,
  composeEngravedNumber,
  createAppearanceSurfaceFill,
  CRITICAL_GLOW_FILTER,
  ENGRAVED_NUMBER_FILTER,
  getCriticalEffectColor,
  getLocalSeparationColor,
  parseFudgeAppearanceRequest,
  parseOtherAppearanceRequest,
  parsePercentileAppearanceRequest,
  type AppearanceCompositionOptions,
  type AppearanceFontId,
  type FudgeResult,
  type OtherAppearanceRequest,
  type PercentileResult,
} from "../appearance";
import {
  composeFacetedAppearanceSvg,
  type FacetedAppearanceGeometry,
  type FacetedFaceValue,
} from "../facetedAppearance";
import {
  composeFacetedAppearanceSvgV3,
  type FacetedAppearanceRequestV3,
} from "../facetedAppearanceV3";
import { createOtherAppearanceTreatmentV3 } from "../appearanceV3";
import {
  composeAppearanceLayerStackV3,
  resolveFacetLightingOpacityV3,
} from "../lightingV3";
import type {
  RenderAppearanceV3,
  RenderLightingStrengthV3,
} from "../types";
import {
  D10_APPEARANCE_GEOMETRY,
  type D10LabelSlot,
} from "./generatePolyhedralAppearance";
import type { ValidationInput } from "../validationBoundary";

export type {
  FudgeAppearanceRequest,
  FudgeResult,
  OtherAppearanceRequest,
  PercentileAppearanceRequest,
  PercentileResult,
} from "../appearance";

export type PercentileLabelSlot = D10LabelSlot;
export type PercentileVisibleFaceValues = Record<
  PercentileLabelSlot,
  PercentileResult
>;
export type FudgeLabelSlot = "result" | "top" | "right";
export type FudgeVisibleFaceValues = Record<FudgeLabelSlot, FudgeResult>;
export type PercentileAppearanceRequestV3 = FacetedAppearanceRequestV3;
export type FudgeAppearanceRequestV3 = FacetedAppearanceRequestV3;
export type OtherAppearanceRequestV3 = RenderAppearanceV3 & {
  sides: number;
  result: number;
};

const PERCENTILE_LABEL_LAYOUT = {
  result: {
    x: 300,
    y: 250,
    rotation: 0,
    scaleX: 1,
    scaleY: 0.95,
    fontSize: { singleDigit: 128, doubleDigit: 128 },
  },
  "upper-left": {
    x: 145,
    y: 238,
    rotation: 30,
    scaleX: 0.9,
    fontSize: { singleDigit: 70, doubleDigit: 70 },
  },
  "upper-right": {
    x: 455,
    y: 238,
    rotation: -28,
    scaleX: 0.9,
    fontSize: { singleDigit: 68, doubleDigit: 68 },
  },
  "lower-left": {
    x: 210,
    y: 400,
    rotation: 176,
    scaleX: 1.19,
    scaleY: 0.97,
    fontSize: { singleDigit: 84, doubleDigit: 84 },
  },
  "lower-right": {
    x: 389,
    y: 399,
    rotation: -174,
    scaleX: 1,
    scaleY: 0.97,
    fontSize: { singleDigit: 90, doubleDigit: 90 },
  },
} as const;

const PERCENTILE_GEOMETRY: FacetedAppearanceGeometry<PercentileLabelSlot> = {
  ...D10_APPEARANCE_GEOMETRY,
  die: "percentile",
  faces: D10_APPEARANCE_GEOMETRY.faces.map((face) => ({
    ...face,
    ...PERCENTILE_LABEL_LAYOUT[face.slot],
  })),
};

const PERCENTILE_FONT_WIDTH_SCALE = {
  "liberation-sans": 1,
  "new-rocker": 1,
  "stencil-ops": 0.85,
  "creeping-horror": 1,
  "special-elite": 1,
  "luckiest-guy": 1,
  "fontdiner-swanky": 0.85,
  syncopate: 0.75,
} satisfies Record<AppearanceFontId, number>;

function createPercentileGeometry(
  fontId: AppearanceFontId,
): FacetedAppearanceGeometry<PercentileLabelSlot> {
  const widthScale = PERCENTILE_FONT_WIDTH_SCALE[fontId];
  return {
    ...PERCENTILE_GEOMETRY,
    faces: PERCENTILE_GEOMETRY.faces.map((face) => {
      if (!("scaleX" in face)) {
        throw new Error("Percentile labels require decomposed transforms");
      }
      return {
        ...face,
        scaleX: Number((face.scaleX * widthScale).toFixed(3)),
      };
    }),
  };
}

const FUDGE_GEOMETRY: FacetedAppearanceGeometry<FudgeLabelSlot> = {
  die: "fudge",
  silhouette: "174,92 512,92 512,428 444,510 93,510 93,159",
  faces: [
    {
      slot: "result",
      role: "result",
      points: "93,159 444,159 444,510 93,510",
      x: 270,
      y: 337,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      fontSize: { singleDigit: 392, doubleDigit: 392 },
      shade: null,
    },
    {
      slot: "top",
      role: "neighbor",
      points: "93,159 174,92 512,92 444,159",
      x: 317,
      y: 128,
      rotation: 0,
      scaleX: 1.4,
      scaleY: 0.28,
      fontSize: { singleDigit: 160, doubleDigit: 160 },
      shade: { color: "#ffffff", opacity: 0.12 },
    },
    {
      slot: "right",
      role: "neighbor",
      points: "444,159 512,92 512,428 444,510",
      x: 478,
      y: 308,
      rotation: 0,
      scaleX: 0.36,
      scaleY: 1,
      fontSize: { singleDigit: 184, doubleDigit: 184 },
      shade: { color: "#000000", opacity: 0.18 },
    },
  ],
};

const FUDGE_LABELS = {
  [-1]: { label: "-", dataValue: "minus" },
  0: { label: "", dataValue: "blank" },
  1: { label: "+", dataValue: "plus" },
} satisfies Record<FudgeResult, FacetedFaceValue>;

function validatePercentileResult(result: number): asserts result is PercentileResult {
  if (
    !Number.isInteger(result) ||
    result < 0 ||
    result > 90 ||
    result % 10 !== 0
  ) {
    throw new Error(
      "Percentile appearance result must be a multiple of 10 from 0 through 90",
    );
  }
}

function validateFudgeResult(result: number): asserts result is FudgeResult {
  if (!Number.isInteger(result) || ![-1, 0, 1].includes(result)) {
    throw new Error("Fudge appearance result must be -1, 0, or 1");
  }
}

const PERCENTILE_RESULTS = [
  0,
  10,
  20,
  30,
  40,
  50,
  60,
  70,
  80,
  90,
] as const satisfies readonly PercentileResult[];

function offsetPercentile(
  result: PercentileResult,
  offset: number,
): PercentileResult {
  const value = PERCENTILE_RESULTS[(result / 10 + offset) % 10];
  if (value === undefined) {
    throw new Error("Percentile appearance offset is invalid");
  }
  return value;
}

function formatPercentile(value: PercentileResult): string {
  return value === 0 ? "00" : String(value);
}

export function getPercentileVisibleFaceValues(result: number) {
  validatePercentileResult(result);
  return {
    result,
    "upper-left": offsetPercentile(result, 3),
    "upper-right": offsetPercentile(result, 7),
    "lower-left": offsetPercentile(result, 4),
    "lower-right": offsetPercentile(result, 8),
  } satisfies PercentileVisibleFaceValues;
}

export function getFudgeVisibleFaceValues(result: number) {
  validateFudgeResult(result);
  if (result === -1) {
    return { result, top: 0, right: 1 } satisfies FudgeVisibleFaceValues;
  }
  if (result === 0) {
    return { result, top: 1, right: -1 } satisfies FudgeVisibleFaceValues;
  }
  return { result, top: -1, right: 0 } satisfies FudgeVisibleFaceValues;
}

export function composePercentileAppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parsePercentileAppearanceRequest(value);
  const values = getPercentileVisibleFaceValues(request.result);
  return composeFacetedAppearanceSvg(
    request,
    createPercentileGeometry(request.fontId),
    {
      result: formatPercentile(values.result),
      "upper-left": formatPercentile(values["upper-left"]),
      "upper-right": formatPercentile(values["upper-right"]),
      "lower-left": formatPercentile(values["lower-left"]),
      "lower-right": formatPercentile(values["lower-right"]),
    },
    options.localSeparation,
  );
}

export function composePercentileAppearanceSvg(
  value: ValidationInput,
): string {
  return composePercentileAppearanceSvgWithOptions(value, {
    localSeparation: false,
  });
}

export function composeFudgeAppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parseFudgeAppearanceRequest(value);
  const values = getFudgeVisibleFaceValues(request.result);
  return composeFacetedAppearanceSvg(
    request,
    FUDGE_GEOMETRY,
    {
      result: FUDGE_LABELS[values.result],
      top: FUDGE_LABELS[values.top],
      right: FUDGE_LABELS[values.right],
    },
    options.localSeparation,
  );
}

export function composeFudgeAppearanceSvg(value: ValidationInput): string {
  return composeFudgeAppearanceSvgWithOptions(value, {
    localSeparation: false,
  });
}

export function composePercentileAppearanceSvgV3(
  request: PercentileAppearanceRequestV3,
): string {
  const values = getPercentileVisibleFaceValues(request.result);
  return composeFacetedAppearanceSvgV3(
    request,
    createPercentileGeometry(request.fontId),
    {
      result: formatPercentile(values.result),
      "upper-left": formatPercentile(values["upper-left"]),
      "upper-right": formatPercentile(values["upper-right"]),
      "lower-left": formatPercentile(values["lower-left"]),
      "lower-right": formatPercentile(values["lower-right"]),
    },
    { facetSubtleCompositor: "interleaved" },
  );
}

export function composeFudgeAppearanceSvgV3(
  request: FudgeAppearanceRequestV3,
): string {
  const values = getFudgeVisibleFaceValues(request.result);
  return composeFacetedAppearanceSvgV3(
    request,
    FUDGE_GEOMETRY,
    {
      result: FUDGE_LABELS[values.result],
      top: FUDGE_LABELS[values.top],
      right: FUDGE_LABELS[values.right],
    },
    { facetSubtleCompositor: "interleaved" },
  );
}

function composeSphereCriticalGlow(
  effect: OtherAppearanceRequest["effect"],
): string {
  const color = getCriticalEffectColor(effect);
  if (color === null) return "";
  return `<g data-effect="${effect}">
    <circle cx="300" cy="300" r="252" fill="none" stroke="${color}" stroke-width="18" opacity="0.9" filter="url(#critical-glow)"/>
    <circle cx="300" cy="300" r="252" fill="none" stroke="${color}" stroke-width="8" opacity="0.95"/>
  </g>`;
}

export function composeOtherAppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parseOtherAppearanceRequest(value);
  const fill = createAppearanceSurfaceFill(request);
  const sidesLabel = `d${String(request.sides)}`;
  const resultFontSize = request.result >= 100 ? 185 : 250;
  const separationSurface = options.localSeparation
    ? `\n    <circle data-local-separation="true" cx="300" cy="300" r="252" fill="${getLocalSeparationColor(request.textColor)}" opacity="0.6" pointer-events="none"/>`
    : "";
  const surfaceBorder = `\n    <circle cx="300" cy="300" r="252" fill="none" stroke="${APPEARANCE_BORDER_COLOR}" stroke-width="3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="150" height="150" data-die="other" data-sides="${request.sides}" data-font-id="${request.fontId}">
  <defs>
    ${fill.definition}
    ${CRITICAL_GLOW_FILTER}
    ${ENGRAVED_NUMBER_FILTER}
    <clipPath id="sphere-surface"><circle cx="300" cy="300" r="252"/></clipPath>
    <style>
      .surface{fill:${fill.value};shape-rendering:geometricPrecision}
      ${composeAppearanceTypographyCss(request)}
    </style>
  </defs>
  ${composeSphereCriticalGlow(request.effect)}
  <g>
    <circle class="surface" cx="300" cy="300" r="252"/>
    <path d="M300 90A220 220 0 0 1 480 280A252 252 0 0 0 120 280A220 220 0 0 1 300 90Z" fill="#ffffff" opacity="0.2" clip-path="url(#sphere-surface)"/>
    <ellipse cx="300" cy="405" rx="205" ry="105" fill="#000000" opacity="0.12" clip-path="url(#sphere-surface)"/>${separationSurface}${surfaceBorder}
  </g>
  <g aria-label="Rolled ${request.result} on d${request.sides}">
    <g data-label-slot="result" data-face-value="${request.result}" transform="translate(298 280)">
      ${composeEngravedNumber(request.result, "result", resultFontSize, request.fontId)}
    </g>
    <g data-sides-label="true" transform="translate(300 485)">
      ${composeEngravedLabel(sidesLabel, "neighbor", 96, request.fontId)}
    </g>
  </g>
</svg>`;
}

export function composeOtherAppearanceSvg(value: ValidationInput): string {
  return composeOtherAppearanceSvgWithOptions(value, {
    localSeparation: false,
  });
}

function otherLayer(name: string, content: string): string {
  return `<g data-appearance-layer="${name}">\n    ${content}\n  </g>`;
}

function otherFormStrength(
  request: OtherAppearanceRequestV3,
): RenderLightingStrengthV3 {
  return request.lighting.mode === "facet" ||
    request.lighting.mode === "combined"
    ? request.lighting.strength
    : "subtle";
}

export function composeOtherAppearanceSvgV3(
  request: OtherAppearanceRequestV3,
): string {
  if (!Number.isInteger(request.sides) || request.sides < 1 || request.sides > 999) {
    throw new Error("Other appearance sides must be from 1 through 999");
  }
  if (
    !Number.isInteger(request.result) ||
    request.result < 1 ||
    request.result > request.sides
  ) {
    throw new Error(
      `Other appearance result must be from 1 through ${String(request.sides)}`,
    );
  }

  const treatment = createOtherAppearanceTreatmentV3(request);
  const sidesLabel = `d${String(request.sides)}`;
  const resultFontSize = request.result >= 100 ? 185 : 250;
  const formStrength = otherFormStrength(request);
  const highlightOpacity = resolveFacetLightingOpacityV3(0.2, formStrength);
  const shadowOpacity = resolveFacetLightingOpacityV3(0.12, formStrength);
  const material = otherLayer(
    "material",
    '<circle class="surface" cx="300" cy="300" r="252"/>',
  );
  const intrinsicForm = otherLayer(
    "intrinsic-form",
    `<path data-lighting-layer="intrinsic-form" d="M300 90A220 220 0 0 1 480 280A252 252 0 0 0 120 280A220 220 0 0 1 300 90Z" fill="#ffffff" opacity="${String(highlightOpacity)}" clip-path="url(#sphere-surface)"/>
    <ellipse data-lighting-layer="intrinsic-form" cx="300" cy="405" rx="205" ry="105" fill="#000000" opacity="${String(shadowOpacity)}" clip-path="url(#sphere-surface)"/>`,
  );
  const directional =
    treatment.directionalFill === null
      ? ""
      : otherLayer(
          "directional",
          `<circle data-lighting-layer="directional" cx="300" cy="300" r="252" fill="${treatment.directionalFill}" clip-path="url(#sphere-surface)" pointer-events="none"/>`,
        );
  const localSeparation = request.requiresLocalSeparation
    ? otherLayer(
        "local-separation",
        `<circle data-local-separation="true" cx="300" cy="300" r="252" fill="${getLocalSeparationColor(request.textColor)}" opacity="0.6" pointer-events="none"/>`,
      )
    : "";
  const borders = otherLayer(
    "borders",
    `<circle cx="300" cy="300" r="252" fill="none" stroke="${APPEARANCE_BORDER_COLOR}" stroke-width="3"/>`,
  );
  const labels = `<g data-appearance-layer="labels" aria-label="Rolled ${String(request.result)} on d${String(request.sides)}">
    <g data-label-slot="result" data-face-value="${String(request.result)}" transform="translate(298 280)">
      ${composeEngravedNumber(request.result, "result", resultFontSize, request.fontId)}
    </g>
    <g data-sides-label="true" transform="translate(300 485)">
      ${composeEngravedLabel(sidesLabel, "neighbor", 96, request.fontId)}
    </g>
  </g>`;
  const layers = composeAppearanceLayerStackV3({
    material,
    facet: intrinsicForm,
    directional,
    localSeparation,
    borders,
    labels,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="150" height="150" data-die="other" data-sides="${String(request.sides)}" data-font-id="${request.fontId}">
  <defs>
    ${treatment.definitions}
    ${CRITICAL_GLOW_FILTER}
    ${ENGRAVED_NUMBER_FILTER}
    <clipPath id="sphere-surface"><circle cx="300" cy="300" r="252"/></clipPath>
    <style>
      .surface{fill:${treatment.materialFill};shape-rendering:geometricPrecision}
      ${composeAppearanceTypographyCss(request)}
    </style>
  </defs>
  ${composeSphereCriticalGlow(request.effect)}
  ${layers}
</svg>`;
}
