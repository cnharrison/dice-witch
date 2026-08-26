import {
  parseAppearanceDieRequest,
  parseD10AppearanceRequest,
  type AppearanceCompositionOptions,
  type AppearanceDieRequest,
  type AppearanceFontId,
} from "../appearance";
import {
  composeFacetedAppearanceSvg,
  type FacetedAppearanceGeometry,
  type FacetedFaceLayout,
} from "../facetedAppearance";
import {
  composeFacetedAppearanceSvgV3,
  type FacetedAppearanceRequestV3,
} from "../facetedAppearanceV3";
import {
  getD8FaceValues,
  type D8FaceValues,
} from "./d8FaceValues";
import { getAppearanceDigitProjectionScale } from "../appearanceFontMetrics";
import {
  resolveFacetLabelFrame,
  type FacetLabelFrame,
} from "../facetProjection";
import type { ValidationInput } from "../validationBoundary";

export type D4AppearanceRequest = AppearanceDieRequest;
export type D8AppearanceRequest = AppearanceDieRequest;
export type D10AppearanceRequest = AppearanceDieRequest;
export type D12AppearanceRequest = AppearanceDieRequest;
export type D4AppearanceRequestV3 = FacetedAppearanceRequestV3;
export type D8AppearanceRequestV3 = FacetedAppearanceRequestV3;
export type D10AppearanceRequestV3 = FacetedAppearanceRequestV3;
export type D12AppearanceRequestV3 = FacetedAppearanceRequestV3;

export type D4LabelSlot = "result" | "left" | "right";
export type D8LabelSlot = "result" | "left" | "right" | "bottom";
export type D10LabelSlot =
  | "result"
  | "upper-left"
  | "upper-right"
  | "lower-left"
  | "lower-right";
export type D12LabelSlot =
  | "result"
  | "upper-left"
  | "upper-right"
  | "left"
  | "right"
  | "bottom";

export type D4VisibleFaceValues = Record<D4LabelSlot, number>;
export type D8VisibleFaceValues = D8FaceValues;
export type D10VisibleFaceValues = Record<D10LabelSlot, number>;
export type D12VisibleFaceValues = Record<D12LabelSlot, number>;

type VertexDrivenFaceLayout<Slot extends string> = {
  slot: Slot;
  role: "result" | "neighbor";
  points: string;
  frame: FacetLabelFrame;
  fontSize: { singleDigit: number; doubleDigit: number };
  shade: { color: "#000000" | "#ffffff"; opacity: number } | null;
};

function roundedProjection(value: number): number {
  return Number(value.toFixed(3));
}

function resolveVertexDrivenFace<Slot extends string>(
  { frame, ...face }: VertexDrivenFaceLayout<Slot>,
  fontScale: { x: number; y: number },
): FacetedFaceLayout<Slot> {
  const resolved = resolveFacetLabelFrame(face.points, frame);
  return {
    ...face,
    x: Math.round(resolved.x),
    y: Math.round(resolved.y),
    matrix: {
      a: roundedProjection(resolved.a * fontScale.x),
      b: roundedProjection(resolved.b * fontScale.x),
      c: roundedProjection(resolved.c * fontScale.y),
      d: roundedProjection(resolved.d * fontScale.y),
    },
  };
}

function scaleProjectedFace<Slot extends string>(
  face: FacetedFaceLayout<Slot>,
  fontScale: { x: number; y: number },
): FacetedFaceLayout<Slot> {
  if (!("matrix" in face)) return face;
  const scaleMatrix = ({ a, b, c, d }: typeof face.matrix) => ({
    a: roundedProjection(a * fontScale.x),
    b: roundedProjection(b * fontScale.x),
    c: roundedProjection(c * fontScale.y),
    d: roundedProjection(d * fontScale.y),
  });
  const matrix = scaleMatrix(face.matrix);
  if (face.doubleDigitPlacement === undefined) {
    return { ...face, matrix };
  }
  return {
    ...face,
    matrix,
    doubleDigitPlacement: {
      ...face.doubleDigitPlacement,
      matrix: scaleMatrix(face.doubleDigitPlacement.matrix),
    },
  };
}

const D4_GEOMETRY: FacetedAppearanceGeometry<D4LabelSlot> = {
  die: "d4",
  silhouette: "300,45 530,500 70,500",
  faces: [
    {
      slot: "result",
      role: "result",
      points: "70,500 530,500 300,275",
      x: 300,
      y: 406,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      fontSize: { singleDigit: 130, doubleDigit: 108 },
      shade: null,
    },
    {
      slot: "left",
      role: "neighbor",
      points: "300,45 300,275 70,500",
      x: 250,
      y: 235,
      rotation: -22,
      scaleX: 0.8,
      scaleY: 1,
      fontSize: { singleDigit: 64, doubleDigit: 52 },
      shade: { color: "#ffffff", opacity: 0.1 },
    },
    {
      slot: "right",
      role: "neighbor",
      points: "300,45 530,500 300,275",
      x: 350,
      y: 235,
      rotation: 22,
      scaleX: 0.8,
      scaleY: 1,
      fontSize: { singleDigit: 64, doubleDigit: 52 },
      shade: { color: "#000000", opacity: 0.14 },
    },
  ],
};

const D8_FACES: readonly VertexDrivenFaceLayout<D8LabelSlot>[] = [
  {
    slot: "result",
    role: "result",
    points: "300,42 520,426 80,426",
    frame: {
      anchor: [0.323, 0.3385, 0.3385],
      xAxis: {
        from: [0.323, 0.224863636, 0.452136364],
        to: [0.323, 0.452136364, 0.224863636],
        sourceLength: 100,
      },
      yAxis: {
        from: [0.453208333, 0.273395833, 0.273395833],
        to: [0.192791667, 0.403604167, 0.403604167],
        sourceLength: 100,
      },
    },
    fontSize: { singleDigit: 210, doubleDigit: 170 },
    shade: null,
  },
  {
    slot: "left",
    role: "neighbor",
    points: "300,42 80,426 74,166",
    frame: {
      anchor: [0.267, 0.293, 0.44],
      xAxis: {
        from: [0.271756126, 0.136328426, 0.591915448],
        to: [0.262243874, 0.449671574, 0.288084552],
        sourceLength: 100,
      },
      yAxis: {
        from: [0.381411954, 0.254672943, 0.363915103],
        to: [0.152588046, 0.331327057, 0.516084897],
        sourceLength: 100,
      },
    },
    fontSize: { singleDigit: 210, doubleDigit: 170 },
    shade: { color: "#ffffff", opacity: 0.1 },
  },
  {
    slot: "right",
    role: "neighbor",
    points: "300,42 526,166 520,426",
    frame: {
      anchor: [0.223, 0.502, 0.275],
      xAxis: {
        from: [0.219440553, 0.354971248, 0.425588198],
        to: [0.226559447, 0.649028752, 0.124411802],
        sourceLength: 100,
      },
      yAxis: {
        from: [0.358843581, 0.419805801, 0.221350618],
        to: [0.087156419, 0.584194199, 0.328649382],
        sourceLength: 100,
      },
    },
    fontSize: { singleDigit: 210, doubleDigit: 170 },
    shade: { color: "#000000", opacity: 0.14 },
  },
  {
    slot: "bottom",
    role: "neighbor",
    points: "80,426 520,426 300,558",
    frame: {
      anchor: [0.316, 0.3205, 0.3635],
      xAxis: {
        from: [0.22208149, 0.414655416, 0.363263094],
        to: [0.40991851, 0.226344584, 0.363736906],
        sourceLength: 100,
      },
      yAxis: {
        from: [0.214998883, 0.219665451, 0.565335666],
        to: [0.417001117, 0.421334549, 0.161664334],
        sourceLength: 100,
      },
    },
    fontSize: { singleDigit: 210, doubleDigit: 170 },
    shade: { color: "#000000", opacity: 0.18 },
  },
];

function createD8Geometry(
  fontId: AppearanceFontId,
): FacetedAppearanceGeometry<D8LabelSlot> {
  const fontScale = getAppearanceDigitProjectionScale(fontId);
  return {
    die: "d8",
    silhouette: "300,42 526,166 520,426 300,558 80,426 74,166",
    faces: D8_FACES.map((face) =>
      resolveVertexDrivenFace(face, fontScale),
    ),
  };
}

const D10_RESULT_FACE: FacetedFaceLayout<D10LabelSlot> = {
  slot: "result",
  role: "result",
  points: "300,45 434,292 300,375 166,292",
  x: 298,
  y: 251,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  fontSize: { singleDigit: 134, doubleDigit: 115 },
  shade: null,
};

export const D10_APPEARANCE_GEOMETRY: FacetedAppearanceGeometry<D10LabelSlot> = {
  die: "d10",
  silhouette: "300,45 570,266 570,345 300,566 30,345 30,266",
  faces: [
    D10_RESULT_FACE,
    {
      slot: "upper-left",
      role: "neighbor",
      points: "300,45 166,292 30,345 30,266",
      x: 150,
      y: 240,
      rotation: -42,
      scaleX: 0.78,
      scaleY: 1,
      fontSize: { singleDigit: 82, doubleDigit: 68 },
      shade: { color: "#ffffff", opacity: 0.1 },
    },
    {
      slot: "upper-right",
      role: "neighbor",
      points: "300,45 570,266 570,345 434,292",
      x: 450,
      y: 240,
      rotation: 42,
      scaleX: 0.78,
      scaleY: 1,
      fontSize: { singleDigit: 76, doubleDigit: 64 },
      shade: { color: "#000000", opacity: 0.12 },
    },
    {
      slot: "lower-left",
      role: "neighbor",
      points: "30,345 166,292 300,375 300,566",
      x: 224,
      y: 432,
      rotation: 62,
      scaleX: 0.8,
      scaleY: 1,
      fontSize: { singleDigit: 102, doubleDigit: 82 },
      shade: { color: "#000000", opacity: 0.08 },
    },
    {
      slot: "lower-right",
      role: "neighbor",
      points: "300,375 434,292 570,345 300,566",
      x: 373,
      y: 431,
      rotation: -62,
      scaleX: 0.8,
      scaleY: 1,
      fontSize: { singleDigit: 102, doubleDigit: 82 },
      shade: { color: "#000000", opacity: 0.18 },
    },
  ],
};

// Affine-fit the neighboring labels to the original renderer's hardcoded paths.
const D10_ORIGINAL_FACES: readonly FacetedFaceLayout<D10LabelSlot>[] = [
  D10_RESULT_FACE,
  {
    slot: "upper-left",
    role: "neighbor",
    points: "300,45 166,292 30,345 30,266",
    x: 143,
    y: 227,
    matrix: { a: 0.416, b: 0.435, c: -0.582, d: 0.712 },
    doubleDigitPlacement: {
      x: 155,
      y: 222,
      matrix: { a: 0.282, b: 0.345, c: -0.576, d: 0.712 },
    },
    fontSize: { singleDigit: 134, doubleDigit: 134 },
    shade: { color: "#ffffff", opacity: 0.1 },
  },
  {
    slot: "upper-right",
    role: "neighbor",
    points: "300,45 570,266 570,345 434,292",
    x: 457,
    y: 227,
    matrix: { a: 0.562, b: -0.391, c: 0.548, d: 0.599 },
    doubleDigitPlacement: {
      x: 457,
      y: 228,
      matrix: { a: 0.437, b: -0.256, c: 0.559, d: 0.582 },
    },
    fontSize: { singleDigit: 134, doubleDigit: 134 },
    shade: { color: "#000000", opacity: 0.12 },
  },
  {
    slot: "lower-left",
    role: "neighbor",
    points: "30,345 166,292 300,375 300,566",
    x: 193,
    y: 399,
    matrix: { a: -0.703, b: 0, c: -0.345, d: -0.87 },
    doubleDigitPlacement: {
      x: 197,
      y: 399,
      matrix: { a: -0.706, b: 0, c: -0.345, d: -0.87 },
    },
    fontSize: { singleDigit: 134, doubleDigit: 134 },
    shade: { color: "#000000", opacity: 0.08 },
  },
  {
    slot: "lower-right",
    role: "neighbor",
    points: "300,375 434,292 570,345 300,566",
    x: 410,
    y: 399,
    matrix: { a: -0.703, b: 0, c: 0.215, d: -0.87 },
    doubleDigitPlacement: {
      x: 404,
      y: 399,
      matrix: { a: -0.706, b: 0, c: 0.215, d: -0.87 },
    },
    fontSize: { singleDigit: 134, doubleDigit: 134 },
    shade: { color: "#000000", opacity: 0.18 },
  },
];

function createOriginalD10Geometry(
  fontId: AppearanceFontId,
): FacetedAppearanceGeometry<D10LabelSlot> {
  const fontScale = getAppearanceDigitProjectionScale(fontId);
  return {
    die: "d10",
    silhouette: D10_APPEARANCE_GEOMETRY.silhouette,
    faces: D10_ORIGINAL_FACES.map((face) =>
      scaleProjectedFace(face, fontScale),
    ),
  };
}

const D12_GEOMETRY: FacetedAppearanceGeometry<D12LabelSlot> = {
  die: "d12",
  silhouette:
    "300,45 450,94 540,215 540,376 450,500 300,555 150,500 60,376 60,215 150,94",
  faces: [
    {
      slot: "result",
      role: "result",
      points: "300,134 458,246 402,433 202,433 143,246",
      x: 298,
      y: 316,
      rotation: 0,
      scaleX: 0.83,
      scaleY: 1,
      fontSize: { singleDigit: 185, doubleDigit: 155 },
      shade: null,
    },
    {
      slot: "upper-left",
      role: "neighbor",
      points: "300,45 300,134 143,246 60,215 150,94",
      x: 182,
      y: 139,
      rotation: -36,
      scaleX: 0.9,
      scaleY: 1,
      fontSize: { singleDigit: 72, doubleDigit: 54 },
      shade: { color: "#ffffff", opacity: 0.12 },
    },
    {
      slot: "upper-right",
      role: "neighbor",
      points: "300,45 450,94 540,215 458,246 300,134",
      x: 411,
      y: 146,
      rotation: 36,
      scaleX: 1.4,
      scaleY: 1,
      fontSize: { singleDigit: 86, doubleDigit: 62 },
      shade: { color: "#ffffff", opacity: 0.04 },
    },
    {
      slot: "left",
      role: "neighbor",
      points: "60,215 143,246 202,433 150,500 60,376",
      x: 121,
      y: 358,
      rotation: -110,
      scaleX: 1.4,
      scaleY: 1,
      fontSize: { singleDigit: 82, doubleDigit: 68 },
      shade: { color: "#000000", opacity: 0.08 },
    },
    {
      slot: "right",
      role: "neighbor",
      points: "458,246 540,215 540,376 450,500 402,433",
      x: 478,
      y: 355,
      rotation: 104,
      scaleX: 1.5,
      scaleY: 1,
      fontSize: { singleDigit: 82, doubleDigit: 66 },
      shade: { color: "#000000", opacity: 0.16 },
    },
    {
      slot: "bottom",
      role: "neighbor",
      points: "202,433 402,433 450,500 300,555 150,500",
      x: 302,
      y: 484,
      rotation: 180,
      scaleX: 1,
      scaleY: 0.7,
      fontSize: { singleDigit: 127, doubleDigit: 100 },
      shade: { color: "#000000", opacity: 0.2 },
    },
  ],
};

function validateResult(result: number, sides: number): void {
  if (!Number.isInteger(result) || result < 1 || result > sides) {
    throw new Error(
      `D${String(sides)} appearance result must be from 1 through ${String(sides)}`,
    );
  }
}

function offsetValue(result: number, sides: number, offset: number): number {
  return ((result - 1 + offset) % sides) + 1;
}

export function getD4VisibleFaceValues(result: number) {
  validateResult(result, 4);
  return {
    result,
    left: offsetValue(result, 4, 1),
    right: offsetValue(result, 4, 2),
  } satisfies D4VisibleFaceValues;
}

export function getD8VisibleFaceValues(result: number): D8VisibleFaceValues {
  return getD8FaceValues(result);
}

function validateD10Result(result: number): void {
  if (!Number.isInteger(result) || result < 0 || result > 10) {
    throw new Error("D10 appearance result must be from 0 through 10");
  }
}

export function getD10VisibleFaceValues(result: number) {
  validateD10Result(result);
  return {
    result,
    "upper-left": offsetValue(result, 10, 3),
    "upper-right": offsetValue(result, 10, 7),
    "lower-left": offsetValue(result, 10, 4),
    "lower-right": offsetValue(result, 10, 8),
  } satisfies D10VisibleFaceValues;
}

function d10FaceValues(
  result: number,
  upperLeft: number,
  upperRight: number,
  lowerLeft: number,
  lowerRight: number,
) {
  return {
    result,
    "upper-left": upperLeft,
    "upper-right": upperRight,
    "lower-left": lowerLeft,
    "lower-right": lowerRight,
  } satisfies D10VisibleFaceValues;
}

const ORIGINAL_D10_VISIBLE_FACE_VALUES: readonly D10VisibleFaceValues[] = [
  d10FaceValues(0, 4, 8, 5, 2),
  d10FaceValues(1, 7, 3, 9, 2),
  d10FaceValues(2, 8, 6, 3, 1),
  d10FaceValues(3, 1, 9, 2, 8),
  d10FaceValues(4, 6, 10, 7, 5),
  d10FaceValues(5, 9, 7, 10, 4),
  d10FaceValues(6, 2, 4, 1, 7),
  d10FaceValues(7, 5, 1, 4, 9),
  d10FaceValues(8, 10, 2, 6, 3),
  d10FaceValues(9, 3, 5, 8, 10),
  d10FaceValues(10, 4, 8, 5, 2),
];

export function getOriginalD10VisibleFaceValues(result: number) {
  validateD10Result(result);
  const values = ORIGINAL_D10_VISIBLE_FACE_VALUES[result];
  if (values === undefined) {
    throw new Error("D10 appearance result must be from 0 through 10");
  }
  return { ...values };
}

export function getD12VisibleFaceValues(result: number) {
  validateResult(result, 12);
  return {
    result,
    "upper-left": offsetValue(result, 12, 4),
    "upper-right": offsetValue(result, 12, 8),
    left: offsetValue(result, 12, 1),
    right: offsetValue(result, 12, 5),
    bottom: offsetValue(result, 12, 9),
  } satisfies D12VisibleFaceValues;
}

export function composeD4AppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parseAppearanceDieRequest(value, 4);
  return composeFacetedAppearanceSvg(
    request,
    D4_GEOMETRY,
    getD4VisibleFaceValues(request.result),
    options.localSeparation,
  );
}

export function composeD4AppearanceSvg(value: ValidationInput): string {
  return composeD4AppearanceSvgWithOptions(value, { localSeparation: false });
}

export function composeD8AppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parseAppearanceDieRequest(value, 8);
  return composeFacetedAppearanceSvg(
    request,
    createD8Geometry(request.fontId),
    getD8VisibleFaceValues(request.result),
    options.localSeparation,
  );
}

export function composeD8AppearanceSvg(value: ValidationInput): string {
  return composeD8AppearanceSvgWithOptions(value, { localSeparation: false });
}

export function composeD10AppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parseD10AppearanceRequest(value);
  return composeFacetedAppearanceSvg(
    request,
    D10_APPEARANCE_GEOMETRY,
    getD10VisibleFaceValues(request.result),
    options.localSeparation,
  );
}

export function composeD10AppearanceSvg(value: ValidationInput): string {
  return composeD10AppearanceSvgWithOptions(value, {
    localSeparation: false,
  });
}

export function composeD12AppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parseAppearanceDieRequest(value, 12);
  return composeFacetedAppearanceSvg(
    request,
    D12_GEOMETRY,
    getD12VisibleFaceValues(request.result),
    options.localSeparation,
  );
}

export function composeD12AppearanceSvg(value: ValidationInput): string {
  return composeD12AppearanceSvgWithOptions(value, {
    localSeparation: false,
  });
}

export function composeD4AppearanceSvgV3(
  request: D4AppearanceRequestV3,
): string {
  return composeFacetedAppearanceSvgV3(
    request,
    D4_GEOMETRY,
    getD4VisibleFaceValues(request.result),
    { facetSubtleCompositor: "interleaved" },
  );
}

export function composeD8AppearanceSvgV3(
  request: D8AppearanceRequestV3,
): string {
  return composeFacetedAppearanceSvgV3(
    request,
    createD8Geometry(request.fontId),
    getD8VisibleFaceValues(request.result),
    { facetSubtleCompositor: "interleaved" },
  );
}

export function composeD10AppearanceSvgV3(
  request: D10AppearanceRequestV3,
): string {
  return composeFacetedAppearanceSvgV3(
    request,
    D10_APPEARANCE_GEOMETRY,
    getD10VisibleFaceValues(request.result),
    { facetSubtleCompositor: "interleaved" },
  );
}

export function composeOriginalD10AppearanceSvgV3(
  request: D10AppearanceRequestV3,
): string {
  return composeFacetedAppearanceSvgV3(
    request,
    createOriginalD10Geometry(request.fontId),
    getOriginalD10VisibleFaceValues(request.result),
    { facetSubtleCompositor: "interleaved" },
  );
}

export function composeD12AppearanceSvgV3(
  request: D12AppearanceRequestV3,
): string {
  return composeFacetedAppearanceSvgV3(
    request,
    D12_GEOMETRY,
    getD12VisibleFaceValues(request.result),
    { facetSubtleCompositor: "interleaved" },
  );
}
