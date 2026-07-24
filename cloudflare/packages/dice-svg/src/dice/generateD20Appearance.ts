import {
  APPEARANCE_BORDER_COLOR,
  composeAppearanceTypographyCss,
  composeCriticalGlow,
  composeEngravedNumber,
  composeFacetBorder,
  composeLocalSeparationPolygon,
  createAppearanceSurfaceFill,
  CRITICAL_GLOW_FILTER,
  ENGRAVED_NUMBER_FILTER,
  parseAppearanceDieRequest,
  type AppearanceCompositionOptions,
  type AppearanceDieRequest,
  type AppearanceFontId,
} from "../appearance";
import type {
  FacetedAppearanceGeometry,
  FacetedFaceLayout,
} from "../facetedAppearance";
import {
  composeFacetedAppearanceSvgV3,
  type FacetedAppearanceRequestV3,
} from "../facetedAppearanceV3";

export type { AppearanceFontId } from "../appearance";
export type D20AppearanceRequest = AppearanceDieRequest;
export type D20AppearanceRequestV3 = FacetedAppearanceRequestV3;

export type D20LabelSlot =
  | "result"
  | "top-left"
  | "top-right"
  | "middle-left"
  | "middle-right"
  | "outer-left"
  | "outer-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type D20VisibleFaceValues = Record<D20LabelSlot, number>;

const D20_SILHOUETTE = "300,45 515,175 520,430 300,555 80,430 85,175";

type D20FaceLayout = {
  slot: D20LabelSlot;
  points: string;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  singleDigitSize: number;
  doubleDigitSize: number;
};

const D20_FACES: readonly D20FaceLayout[] = [
  {
    slot: "result",
    points: "300,145 155,400 445,400",
    x: 303,
    y: 326,
    rotation: 0,
    scaleX: 0.9,
    scaleY: 1,
    singleDigitSize: 136,
    doubleDigitSize: 106,
  },
  {
    slot: "top-left",
    points: "300,45 85,175 300,145",
    x: 243,
    y: 124,
    rotation: -4,
    scaleX: 0.9,
    scaleY: 1,
    singleDigitSize: 52,
    doubleDigitSize: 46,
  },
  {
    slot: "top-right",
    points: "300,45 300,145 515,175",
    x: 361,
    y: 124,
    rotation: 4,
    scaleX: 0.85,
    scaleY: 1,
    singleDigitSize: 50,
    doubleDigitSize: 44,
  },
  {
    slot: "middle-left",
    points: "85,175 155,400 300,145",
    x: 178,
    y: 229,
    rotation: -62,
    scaleX: 1.05,
    scaleY: 1,
    singleDigitSize: 92,
    doubleDigitSize: 76,
  },
  {
    slot: "middle-right",
    points: "300,145 445,400 515,175",
    x: 420,
    y: 238,
    rotation: 60,
    scaleX: 1.1,
    scaleY: 1,
    singleDigitSize: 94,
    doubleDigitSize: 74,
  },
  {
    slot: "outer-left",
    points: "85,175 80,430 155,400",
    x: 112,
    y: 335,
    rotation: -102,
    scaleX: 1.3,
    scaleY: 0.94,
    singleDigitSize: 36,
    doubleDigitSize: 32,
  },
  {
    slot: "outer-right",
    points: "445,400 520,430 515,175",
    x: 488,
    y: 335,
    rotation: 110,
    scaleX: 1.37,
    scaleY: 0.68,
    singleDigitSize: 36,
    doubleDigitSize: 32,
  },
  {
    slot: "bottom-left",
    points: "80,430 300,555 155,400",
    x: 190,
    y: 465,
    rotation: -86,
    scaleX: 0.75,
    scaleY: 1,
    singleDigitSize: 37,
    doubleDigitSize: 24,
  },
  {
    slot: "bottom-center",
    points: "155,400 300,555 445,400",
    x: 303,
    y: 448,
    rotation: 180,
    scaleX: 1.05,
    scaleY: 1,
    singleDigitSize: 80,
    doubleDigitSize: 72,
  },
  {
    slot: "bottom-right",
    points: "445,400 300,555 520,430",
    x: 413,
    y: 465,
    rotation: -114,
    scaleX: 0.8,
    scaleY: 1,
    singleDigitSize: 36,
    doubleDigitSize: 24,
  },
];

const D20_SHADES: Record<
  D20LabelSlot,
  FacetedFaceLayout<D20LabelSlot>["shade"]
> = {
  result: { color: "#ffffff", opacity: 0.11 },
  "top-left": { color: "#ffffff", opacity: 0.11 },
  "top-right": { color: "#000000", opacity: 0.18 },
  "middle-left": null,
  "middle-right": { color: "#000000", opacity: 0.18 },
  "outer-left": null,
  "outer-right": null,
  "bottom-left": null,
  "bottom-center": null,
  "bottom-right": null,
};

const D20_V3_GEOMETRY: FacetedAppearanceGeometry<D20LabelSlot> = {
  die: "d20",
  silhouette: D20_SILHOUETTE,
  faces: D20_FACES.map((face) => ({
    slot: face.slot,
    role: face.slot === "result" ? "result" : "neighbor",
    points: face.points,
    x: face.x,
    y: face.y,
    rotation: face.rotation,
    scaleX: face.scaleX,
    scaleY: face.scaleY,
    fontSize: {
      singleDigit: face.singleDigitSize,
      doubleDigit: face.doubleDigitSize,
    },
    shade: D20_SHADES[face.slot],
  })),
};

function assertD20Result(result: number): void {
  if (!Number.isInteger(result) || result < 1 || result > 20) {
    throw new Error("D20 appearance result must be from 1 through 20");
  }
}

export function getD20VisibleFaceValues(
  result: number,
): D20VisibleFaceValues {
  assertD20Result(result);
  const offset = (amount: number) => ((result - 1 + amount) % 20) + 1;
  return {
    result,
    "top-left": offset(6),
    "top-right": offset(12),
    "middle-left": offset(3),
    "middle-right": offset(15),
    "outer-left": offset(9),
    "outer-right": offset(18),
    "bottom-left": offset(5),
    "bottom-center": offset(16),
    "bottom-right": offset(11),
  };
}

export function getD20NeighborValues(result: number): [number, number, number] {
  const visible = getD20VisibleFaceValues(result);
  return [visible["top-left"], visible["top-right"], visible["bottom-center"]];
}

function label(
  value: number,
  layout: D20FaceLayout,
  fontId: AppearanceFontId,
): string {
  const face = layout.slot === "result" ? "result" : "neighbor";
  const fontSize =
    value >= 10 ? layout.doubleDigitSize : layout.singleDigitSize;
  return `<g data-label-slot="${layout.slot}" data-face-value="${value}" clip-path="url(#label-${layout.slot})">
    <g transform="translate(${layout.x} ${layout.y}) rotate(${layout.rotation}) scale(${layout.scaleX} ${layout.scaleY})">
      ${composeEngravedNumber(value, face, fontSize, fontId)}
    </g>
  </g>`;
}

function faceClipPath({ slot, points }: D20FaceLayout): string {
  return `<clipPath id="label-${slot}" clipPathUnits="userSpaceOnUse"><polygon points="${points}"/></clipPath>`;
}

function facePolygon(
  { slot, points }: D20FaceLayout,
  fill: string,
): string {
  return `<polygon class="face" fill="${fill}" data-face-surface="${slot}" points="${points}"/>`;
}

export function composeD20AppearanceSvgWithOptions(
  value: unknown,
  options: AppearanceCompositionOptions,
): string {
  const request = parseAppearanceDieRequest(value, 20);
  const fill = createAppearanceSurfaceFill(request);
  const visibleFaces = getD20VisibleFaceValues(request.result);
  const separationSurfaces = options.localSeparation
    ? `\n    ${D20_FACES.map(({ points }) => composeLocalSeparationPolygon(points, request.textColor)).join("\n    ")}`
    : "";
  const facetBorders = D20_FACES.map(({ points }) =>
    composeFacetBorder(points),
  ).join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="150" height="150" data-font-id="${request.fontId}">
  <defs>
    ${fill.definition}
    ${CRITICAL_GLOW_FILTER}
    ${ENGRAVED_NUMBER_FILTER}
    ${D20_FACES.map(faceClipPath).join("\n    ")}
    <style>
      .face{shape-rendering:geometricPrecision}
      .light{fill:#ffffff;opacity:0.11;pointer-events:none}
      .dark{fill:#000000;opacity:0.18;pointer-events:none}
      ${composeAppearanceTypographyCss(request)}
    </style>
  </defs>
  ${composeCriticalGlow(request.effect, D20_SILHOUETTE)}
  <g>
    ${D20_FACES.map((face) => facePolygon(face, fill.value)).join("\n    ")}
    <polygon class="light" points="300,45 85,175 300,145"/>
    <polygon class="light" points="300,145 155,400 445,400"/>
    <polygon class="dark" points="300,45 300,145 515,175"/>
    <polygon class="dark" points="300,145 445,400 515,175"/>${separationSurfaces}
    ${facetBorders}
    <polygon points="${D20_SILHOUETTE}" fill="none" stroke="${APPEARANCE_BORDER_COLOR}" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <g aria-label="Rolled ${request.result}; all visible faces are numbered">
    ${D20_FACES.map((layout) => label(visibleFaces[layout.slot], layout, request.fontId)).join("\n    ")}
  </g>
</svg>`;
}

export function composeD20AppearanceSvg(value: unknown): string {
  return composeD20AppearanceSvgWithOptions(value, {
    localSeparation: false,
  });
}

export function composeD20AppearanceSvgV3(
  request: D20AppearanceRequestV3,
): string {
  return composeFacetedAppearanceSvgV3(
    request,
    D20_V3_GEOMETRY,
    getD20VisibleFaceValues(request.result),
    { facetSubtleCompositor: "layered" },
  );
}
