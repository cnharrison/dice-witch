import type { GenerateDieProps } from "../types";
import { getD8FaceValues, type D8FaceValues } from "./d8FaceValues";

const D8_OUTLINE =
  "M53.7 276.7l142-246c2-3.5 7-3.5 9 0l142 246c2 3.5-.5 7.8-4.5 7.8H58.3c-4.1 0-6.6-4.3-4.6-7.8zm296.4-167.4L208.8 27.8c-2.3-1.3-4.9 1.3-3.6 3.6l141.3 244.8c1.3 2.3 4.9 1.4 4.9-1.3V111.6c0-.9-.5-1.8-1.3-2.3zm-299.9 0l141.3-81.6c2.3-1.3 4.9 1.3 3.6 3.6L53.8 276.1c-1.3 2.3-4.9 1.4-4.9-1.3V111.6c0-.9.5-1.8 1.3-2.3zm3.5 177.9l142 84.5c2 1.2 7 1.2 9 0l142-84.5c2-1.2-.5-2.7-4.5-2.7H58.3c-4.1 0-6.6 1.5-4.6 2.7z";

const D8_FACE_TRANSFORMS = {
  result: "matrix(1 0 0 1 200 201.333)",
  left: "matrix(-0.002697 0.826487 -0.512543 0.483042 90.667 139.333)",
  right: "matrix(0.001982 -0.791886 0.607575 0.615869 316 140)",
  bottom: "matrix(-0.827525 0.000625 -0.000733 -0.532846 200.667 316)",
} satisfies Record<keyof D8FaceValues, string>;

function composeOrientationMark(value: number): string {
  return value === 6
    ? '<line data-orientation-mark="true" class="orientation-mark" x1="-38" x2="38" y1="56" y2="56"/>'
    : "";
}

function composeFaceLabel(
  slot: keyof D8FaceValues,
  value: number,
): string {
  return `<g data-label-slot="${slot}" data-face-value="${value}" transform="${D8_FACE_TRANSFORMS[slot]}">
    <text class="text" x="0" y="0" font-family="Liberation Sans, Arial, sans-serif" font-size="140" font-weight="700" text-anchor="middle" dominant-baseline="middle">${value}</text>
    ${composeOrientationMark(value)}
  </g>`;
}

function composeFaces(result: number): string {
  const values = getD8FaceValues(result);
  return `<g aria-label="Rolled ${result}; all visible faces are numbered">
    ${composeFaceLabel("result", values.result)}
    ${composeFaceLabel("left", values.left)}
    ${composeFaceLabel("right", values.right)}
    ${composeFaceLabel("bottom", values.bottom)}
  </g>`;
}

const generateD8 = ({
  result,
  textColor,
  outlineColor,
  solidFill,
  patternFill,
  borderWidth = "6px",
  width = "400",
  height = "400",
}: GenerateDieProps): string => `
  <svg viewBox="0 0 ${width} ${height}">
    <defs>
      ${patternFill?.string ?? ""}
      <style>
        .outline{fill:${patternFill ? `url(#${patternFill.name})` : solidFill};stroke:${outlineColor};stroke-miterlimit:10;stroke-width:${borderWidth}}
        .text{fill:${textColor};stroke:${textColor};stroke-width:1;stroke-linejoin:round;paint-order:stroke fill;text-rendering:geometricPrecision}
        .orientation-mark{stroke:${textColor};stroke-width:9;stroke-linecap:round}
      </style>
    </defs>
    <g>
      <path class="outline" d="${D8_OUTLINE}"/>
      <path class="outline" d="${D8_OUTLINE}"/>
    </g>
    ${composeFaces(result)}
  </svg>
`;

export default generateD8;
