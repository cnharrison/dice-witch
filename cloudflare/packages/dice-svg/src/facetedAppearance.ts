import {
  APPEARANCE_BORDER_COLOR,
  composeAppearanceTypographyCss,
  composeCriticalGlow,
  composeEngravedLabel,
  composeFacetBorder,
  composeLocalSeparationPolygon,
  createAppearanceSurfaceFill,
  CRITICAL_GLOW_FILTER,
  ENGRAVED_NUMBER_FILTER,
  type AppearanceDieRequest,
  type AppearanceFontId,
} from "./appearance";

export type FacetedFaceValue =
  | string
  | number
  | { label: string; dataValue: string };

type FacetedFaceMatrix = { a: number; b: number; c: number; d: number };

type FacetedFacePlacement =
  | {
      x: number;
      y: number;
      rotation: number;
      scaleX: number;
      scaleY: number;
    }
  | {
      x: number;
      y: number;
      matrix: FacetedFaceMatrix;
      doubleDigitPlacement?: {
        x: number;
        y: number;
        matrix: FacetedFaceMatrix;
      };
    };

export type FacetedFaceLayout<Slot extends string> = {
  slot: Slot;
  role: "result" | "neighbor";
  points: string;
  fontSize: { singleDigit: number; doubleDigit: number };
  shade: { color: "#000000" | "#ffffff"; opacity: number } | null;
} & FacetedFacePlacement;

export type FacetedAppearanceGeometry<Slot extends string> = {
  die: `d${number}` | "percentile" | "fudge";
  silhouette: string;
  faces: readonly FacetedFaceLayout<Slot>[];
};

export function faceClipPath<Slot extends string>({
  slot,
  points,
}: FacetedFaceLayout<Slot>): string {
  return `<clipPath id="label-${slot}" clipPathUnits="userSpaceOnUse"><polygon points="${points}"/></clipPath>`;
}

function faceSurface<Slot extends string>(
  { slot, points, shade }: FacetedFaceLayout<Slot>,
  fill: string,
  localSeparation: boolean,
  textColor: string,
): string {
  const shadeOverlay =
    shade === null
      ? ""
      : `\n    <polygon points="${points}" fill="${shade.color}" opacity="${shade.opacity}" pointer-events="none"/>`;
  const separationOverlay = localSeparation
    ? `\n    ${composeLocalSeparationPolygon(points, textColor)}`
    : "";
  return `<polygon class="face" fill="${fill}" data-face-surface="${slot}" points="${points}"/>${shadeOverlay}${separationOverlay}`;
}

function faceTransform<Slot extends string>(
  layout: FacetedFaceLayout<Slot>,
  isDoubleDigit: boolean,
): string {
  if ("matrix" in layout) {
    const placement =
      isDoubleDigit && layout.doubleDigitPlacement !== undefined
        ? layout.doubleDigitPlacement
        : layout;
    const { a, b, c, d } = placement.matrix;
    return `matrix(${a} ${b} ${c} ${d} ${placement.x} ${placement.y})`;
  }
  return `translate(${layout.x} ${layout.y}) rotate(${layout.rotation}) scale(${layout.scaleX} ${layout.scaleY})`;
}

export function faceLabel<Slot extends string>(
  value: FacetedFaceValue,
  layout: FacetedFaceLayout<Slot>,
  fontId: AppearanceFontId,
): string {
  const label = typeof value === "object" ? value.label : String(value);
  const dataValue =
    typeof value === "object" ? value.dataValue : String(value);
  const isDoubleDigit = label.length > 1;
  const fontSize = isDoubleDigit
    ? layout.fontSize.doubleDigit
    : layout.fontSize.singleDigit;
  return `<g data-label-slot="${layout.slot}" data-face-value="${dataValue}" clip-path="url(#label-${layout.slot})">
    <g transform="${faceTransform(layout, isDoubleDigit)}">
      ${composeEngravedLabel(label, layout.role, fontSize, fontId)}
    </g>
  </g>`;
}

export function composeFacetedAppearanceSvg<Slot extends string>(
  request: AppearanceDieRequest,
  geometry: FacetedAppearanceGeometry<Slot>,
  visibleFaces: Readonly<Record<Slot, FacetedFaceValue>>,
  localSeparation: boolean,
): string {
  const fill = createAppearanceSurfaceFill(request);
  const facetBorders = geometry.faces
    .map(({ points }) => composeFacetBorder(points))
    .join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="150" height="150" data-die="${geometry.die}" data-font-id="${request.fontId}">
  <defs>
    ${fill.definition}
    ${CRITICAL_GLOW_FILTER}
    ${ENGRAVED_NUMBER_FILTER}
    ${geometry.faces.map(faceClipPath).join("\n    ")}
    <style>
      .face{shape-rendering:geometricPrecision}
      ${composeAppearanceTypographyCss(request)}
    </style>
  </defs>
  ${composeCriticalGlow(request.effect, geometry.silhouette)}
  <g>
    ${geometry.faces.map((layout) => faceSurface(layout, fill.value, localSeparation, request.textColor)).join("\n    ")}
    ${facetBorders}
    <polygon points="${geometry.silhouette}" fill="none" stroke="${APPEARANCE_BORDER_COLOR}" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <g aria-label="Rolled ${request.result}; all visible faces are numbered">
    ${geometry.faces.map((layout) => faceLabel(visibleFaces[layout.slot], layout, request.fontId)).join("\n    ")}
  </g>
</svg>`;
}
