import { GenerateDieProps } from "../../../../../shared/types";

const getFaces = (result: number) => {
  const faces = [
    // -1: minus symbol (horizontal bar)
    `<path class="text" d="M85 155 L185 155 L185 180 L85 180 Z"/>`,
    // 0: blank (no symbol)
    ``,
    // +1: plus symbol (cross)
    `<path class="text" d="M122 105 L148 105 L148 142 L185 142 L185 168 L148 168 L148 205 L122 205 L122 168 L85 168 L85 142 L122 142 Z"/>`,
  ];
  // Map -1,0,+1 to array indices 0,1,2
  const index = result + 1;
  return `<g>${faces[index] || ""}</g>`;
};

const generateDF = ({
  result,
  textColor,
  outlineColor,
  solidFill,
  patternFill,
  borderWidth = "6px",
  width = "300",
  height = "300",
}: GenerateDieProps) => {
  const faces = getFaces(result);
  return `
    <svg viewBox="0 0 ${width} ${height}">
      <defs>
   ${patternFill?.string ?? ""}
      <style>
      .outline{fill:${
        patternFill ? `url(#${patternFill.name})` : solidFill
      };stroke:${outlineColor};stroke-miterlimit:10;stroke-width:${borderWidth}}
    .text{fill:${textColor};stroke:${textColor}}
      </style>
      </defs>
    <g>
        <g>
            <path class="outline" d="M208.3 255H59.9c-7.4 0-13.4-6-13.4-13.4V93.1c0-7.4 6-13.4 13.4-13.4h148.4c7.4 0 13.4 6 13.4 13.4v148.4c.1 7.5-6 13.5-13.4 13.5z"/>
            <path class="outline" d="M224.4 246.3l29.4-32.2c1.5-1.6 2.7-8.6 2.7-15.6V58.9c0-7-1.2-11.4-2.7-9.7l-29.4 32.2c-1.5 1.6-2.7 8.6-2.7 15.6v139.7c.1 6.8 1.3 11.2 2.7 9.6zm-18-166.4H64.9c-7.1 0-11.5-1.2-9.9-2.6l31.8-28.7c1.6-1.4 8.6-2.6 15.7-2.6h141.4c7.1 0 11.5 1.2 9.9 2.6L222 77.3c-1.5 1.4-8.6 2.6-15.6 2.6z"/>
        </g>
        <g>
            <path class="outline" d="M208.3 255H59.9c-7.4 0-13.4-6-13.4-13.4V93.1c0-7.4 6-13.4 13.4-13.4h148.4c7.4 0 13.4 6 13.4 13.4v148.4c.1 7.5-6 13.5-13.4 13.5z"/>
            <path class="outline" d="M224.4 246.3l29.4-32.2c1.5-1.6 2.7-8.6 2.7-15.6V58.9c0-7-1.2-11.4-2.7-9.7l-29.4 32.2c-1.5 1.6-2.7 8.6-2.7 15.6v139.7c.1 6.8 1.3 11.2 2.7 9.6zm-18-166.4H64.9c-7.1 0-11.5-1.2-9.9-2.6l31.8-28.7c1.6-1.4 8.6-2.6 15.7-2.6h141.4c7.1 0 11.5 1.2 9.9 2.6L222 77.3c-1.5 1.4-8.6 2.6-15.6 2.6z"/>
        </g>
    </g>
${faces}
</svg>
`;
};

export default generateDF;
