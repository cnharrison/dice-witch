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
import type { ValidationInput } from "../validationBoundary";

export type D6AppearanceRequest = AppearanceDieRequest;
export type D6AppearanceRequestV3 = FacetedAppearanceRequestV3;
export type D6LabelSlot = "result" | "top" | "right";
export type D6VisibleFaceValues = Record<D6LabelSlot, number>;

type D6FaceLayout = {
  slot: D6LabelSlot;
  points: string;
  x: number;
  y: number;
  fontSize: number;
  scaleX: number;
  scaleY: number;
};

const D6_SILHOUETTE = "174,92 512,92 512,428 444,510 93,510 93,159";
const D6_FACES: readonly D6FaceLayout[] = [
  {
    slot: "result",
    points: "93,159 444,159 444,510 93,510",
    x: 270,
    y: 346,
    fontSize: 240,
    scaleX: 1,
    scaleY: 1,
  },
  {
    slot: "top",
    points: "93,159 174,92 512,92 444,159",
    x: 315,
    y: 128,
    fontSize: 160,
    scaleX: 1.4,
    scaleY: 0.28,
  },
  {
    slot: "right",
    points: "444,159 512,92 512,428 444,510",
    x: 478,
    y: 307,
    fontSize: 184,
    scaleX: 0.36,
    scaleY: 1,
  },
];

const D6_SHADES = {
  result: null,
  top: { color: "#ffffff", opacity: 0.12 },
  right: { color: "#000000", opacity: 0.18 },
} satisfies Record<
  D6LabelSlot,
  FacetedFaceLayout<D6LabelSlot>["shade"]
>;

const D6_V3_GEOMETRY: FacetedAppearanceGeometry<D6LabelSlot> = {
  die: "d6",
  silhouette: D6_SILHOUETTE,
  faces: D6_FACES.map((face) => ({
    slot: face.slot,
    role: face.slot === "result" ? "result" : "neighbor",
    points: face.points,
    x: face.x,
    y: face.y,
    rotation: 0,
    scaleX: face.scaleX,
    scaleY: face.scaleY,
    fontSize: {
      singleDigit: face.fontSize,
      doubleDigit: face.fontSize,
    },
    shade: D6_SHADES[face.slot],
  })),
};

const D6_VISIBLE_VALUES: readonly D6VisibleFaceValues[] = [
  { result: 1, top: 3, right: 2 },
  { result: 2, top: 6, right: 4 },
  { result: 3, top: 6, right: 2 },
  { result: 4, top: 1, right: 2 },
  { result: 5, top: 1, right: 4 },
  { result: 6, top: 5, right: 4 },
];

export function getD6VisibleFaceValues(result: number) {
  if (!Number.isInteger(result) || result < 1 || result > 6) {
    throw new Error("D6 appearance result must be from 1 through 6");
  }
  const values = D6_VISIBLE_VALUES[result - 1];
  if (values === undefined) {
    throw new Error("D6 appearance face mapping is missing");
  }
  return { ...values } satisfies D6VisibleFaceValues;
}

function faceClipPath({ slot, points }: D6FaceLayout): string {
  return `<clipPath id="label-${slot}" clipPathUnits="userSpaceOnUse"><polygon points="${points}"/></clipPath>`;
}

function facePolygon(
  { slot, points }: D6FaceLayout,
  fill: string,
): string {
  return `<polygon class="face" fill="${fill}" data-face-surface="${slot}" points="${points}"/>`;
}

function label(
  value: number,
  layout: D6FaceLayout,
  fontId: AppearanceFontId,
): string {
  const face = layout.slot === "result" ? "result" : "neighbor";
  return `<g data-label-slot="${layout.slot}" data-face-value="${value}" clip-path="url(#label-${layout.slot})">
    <g transform="translate(${layout.x} ${layout.y}) scale(${layout.scaleX} ${layout.scaleY})">
      ${composeEngravedNumber(value, face, layout.fontSize, fontId)}
    </g>
  </g>`;
}

export function composeD6AppearanceSvgWithOptions(
  value: ValidationInput,
  options: AppearanceCompositionOptions,
): string {
  const request = parseAppearanceDieRequest(value, 6);
  const fill = createAppearanceSurfaceFill(request);
  const visibleFaces = getD6VisibleFaceValues(request.result);
  const separationSurfaces = options.localSeparation
    ? `\n    ${D6_FACES.map(({ points }) => composeLocalSeparationPolygon(points, request.textColor)).join("\n    ")}`
    : "";
  const facetBorders = D6_FACES.map(({ points }) => composeFacetBorder(points)).join(
    "\n    ",
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="150" height="150" data-font-id="${request.fontId}">
  <defs>
    ${fill.definition}
    ${CRITICAL_GLOW_FILTER}
    ${ENGRAVED_NUMBER_FILTER}
    ${D6_FACES.map(faceClipPath).join("\n    ")}
    <style>
      .face{shape-rendering:geometricPrecision}
      .light{fill:#ffffff;opacity:0.12;pointer-events:none}
      .dark{fill:#000000;opacity:0.18;pointer-events:none}
      ${composeAppearanceTypographyCss(request)}
    </style>
  </defs>
  ${composeCriticalGlow(request.effect, D6_SILHOUETTE)}
  <g>
    ${D6_FACES.map((face) => facePolygon(face, fill.value)).join("\n    ")}
    <polygon class="light" points="93,159 174,92 512,92 444,159"/>
    <polygon class="dark" points="444,159 512,92 512,428 444,510"/>${separationSurfaces}
    ${facetBorders}
    <polygon points="${D6_SILHOUETTE}" fill="none" stroke="${APPEARANCE_BORDER_COLOR}" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <g aria-label="Rolled ${request.result}; all visible faces are numbered">
    ${D6_FACES.map((layout) => label(visibleFaces[layout.slot], layout, request.fontId)).join("\n    ")}
  </g>
</svg>`;
}

export function composeD6AppearanceSvg(value: ValidationInput): string {
  return composeD6AppearanceSvgWithOptions(value, { localSeparation: false });
}

export function composeD6AppearanceSvgV3(
  request: D6AppearanceRequestV3,
): string {
  return composeFacetedAppearanceSvgV3(
    request,
    D6_V3_GEOMETRY,
    getD6VisibleFaceValues(request.result),
    { facetSubtleCompositor: "layered" },
  );
}
