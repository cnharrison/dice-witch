import { GenerateDieProps } from "../../../../../shared/types";

const getFaces = (result: number) => {
  const faces = [
    `<path class="text" d="M112.7 143.7v-18.1h32.4v80.1h-20.4v-62h-12z"/>
    <path class="text" d="M173.7 55c3 .4 5 .8 6.1 1.5 1.1.6 1.3 1.3.5 2.1-1 1-2.8 1.7-5.6 2.3-2.8.6-5.9.9-9.4 1.1l-.1.1c7.9.6 11 1.8 9.3 3.5-.8.8-2.5 1.6-4.9 2.3-2.4.7-5.5 1.2-9.2 1.5-3.7.4-7.9.5-12.6.5-7.6 0-13.2-.4-16.9-1.2s-4.8-2.1-3.5-3.8H143c-.5.7-.2 1.2.9 1.5s3.1.6 6 .6c2.3 0 4.3-.2 5.9-.5 1.6-.3 2.7-.7 3.2-1.2 1.2-1.2-2.1-1.8-10-1.8h-3l2.9-2.9h2.9c7 0 11.1-.5 12.3-1.7.5-.5.3-.9-.7-1.2-.9-.3-2.5-.4-4.5-.4-2.2 0-4.2.2-5.8.5-1.7.3-2.9.8-3.6 1.4h-15.6c1.9-1.5 5.2-2.7 10.1-3.6 4.9-.8 11-1.2 18.3-1.2 4.6.1 8.4.3 11.4.6z"/>
    <path class="text" d="M242 136.9c0-4.7-.8-6.5-2.3-5.5-.9.6-1.5 1.8-1.9 3.6-.4 1.9-.6 4.5-.7 7.9l-5.4 3.6c.1-7.4 1-13.5 2.5-18.2 1.5-4.7 3.5-7.9 5.9-9.4 2.5-1.6 4.3-1.2 5.6 1.2 1.3 2.5 1.9 6.3 1.9 11.6 0 5.9-.8 12.1-2.5 18.9-1.7 6.7-3.7 12.8-6.1 18.3l9-6v11.8l-16.2 10.8v-10.9c6.8-17.5 10.2-30.1 10.2-37.7z"/>
    `,
    `<path class="text" d="M139.4 149.4c0-6.2-2.7-9.3-8-9.3-3 0-5.2 1.1-6.6 3.2-1.4 2.1-2.2 5.4-2.3 9.9h-18.9c.5-9.7 3.4-17.1 8.8-22 5.4-4.9 12.3-7.4 20.6-7.4 8.7 0 15.2 2.2 19.7 6.6 4.4 4.4 6.6 10.1 6.6 17.1 0 7.8-3 15.4-9 22.8s-13.1 13.7-21.4 18.9h31.6v15.6h-57.1v-14.5c24-17.2 36-30.8 36-40.9z"/>
    <path class="text" d="M165.6 57.8c-1-.3-2.6-.5-5-.5-3.6 0-6.6.4-8.8 1.1s-4.1 1.9-5.5 3.4c1.6-.6 3.9-1 6.8-1.3 2.9-.3 6.1-.5 9.5-.5 6.2 0 10.8.4 13.5 1.3 2.8.8 3.4 2 1.8 3.6-1 1-2.8 1.9-5.3 2.6-2.6.8-5.8 1.4-9.8 1.8-3.9.4-8.4.6-13.3.6-9.7 0-15.7-.7-18-2-2.4-1.3-2.4-3.2 0-5.5 2.7-2.7 6.7-4.7 11.9-6 5.2-1.3 12.3-1.9 21.1-1.9 7 0 11.9.4 14.6 1.3 2.7.9 3.7 2 2.8 3.3h-15c.1-.5-.3-1-1.3-1.3zm-20.2 8.5c1.2.4 3.4.6 6.5.6 2.8 0 5.2-.2 7.1-.5 1.9-.3 3.2-.9 3.9-1.5.7-.7.4-1.2-.9-1.5-1.3-.4-3.3-.5-6.1-.5-2.7 0-5.1.2-7.3.5-2.1.3-3.5.8-4.2 1.4-.5.6-.2 1.1 1 1.5z"/>
    <path class="text" d="M230.1 174.8v-12.2l10-44.7 5.7-3.9v37.3l2.6-1.8v12.7l-2.6 1.8v11l-5.4 3.7v-11.1l-10.3 7.2zm10.8-40.6l-5.4 24.1 5.4-3.7v-20.4z"/>
    `,
    ` <path class="text" d="M148.1 125c4 1.9 7 4.6 9.1 7.9 2.1 3.4 3.1 7.2 3.1 11.4 0 5.2-1.3 9.4-4 12.6-2.7 3.2-6 5.2-10 6v.6c10.4 3.3 15.5 9.8 15.5 19.4 0 4.6-1.1 8.7-3.2 12.3-2.1 3.6-5.2 6.4-9.2 8.4-4 2-8.9 3-14.6 3-9.2 0-16.5-2.3-21.9-6.8-5.4-4.5-8.3-11.4-8.8-20.7H123c.2 3.6 1.1 6.3 2.9 8.4s4.5 3.1 7.9 3.1c2.8 0 5-.8 6.6-2.5 1.6-1.7 2.4-3.8 2.4-6.5 0-6.6-4.8-9.9-14.3-9.9h-3.6v-15.8h3.5c8.5.2 12.8-2.9 12.8-9.2 0-2.7-.7-4.8-2.2-6.3-1.5-1.5-3.5-2.2-5.9-2.2-2.7 0-4.9.9-6.5 2.8-1.6 1.9-2.5 4.3-2.7 7.4H105c.4-8.5 3-15 7.9-19.5s11.8-6.8 20.6-6.8c5.8 0 10.6.9 14.6 2.9z"/>
    <path class="text" d="M165.6 57.8c-1-.3-2.6-.5-5-.5-3.6 0-6.6.4-8.8 1.1s-4.1 1.9-5.5 3.4c1.6-.6 3.9-1 6.8-1.3 2.9-.3 6.1-.5 9.5-.5 6.2 0 10.8.4 13.5 1.3 2.8.8 3.4 2 1.8 3.6-1 1-2.8 1.9-5.3 2.6-2.6.8-5.8 1.4-9.8 1.8-3.9.4-8.4.6-13.3.6-9.7 0-15.7-.7-18-2-2.4-1.3-2.4-3.2 0-5.5 2.7-2.7 6.7-4.7 11.9-6 5.2-1.3 12.3-1.9 21.1-1.9 7 0 11.9.4 14.6 1.3 2.7.9 3.7 2 2.8 3.3h-15c.1-.5-.3-1-1.3-1.3zm-20.2 8.5c1.2.4 3.4.6 6.5.6 2.8 0 5.2-.2 7.1-.5 1.9-.3 3.2-.9 3.9-1.5.7-.7.4-1.2-.9-1.5-1.3-.4-3.3-.5-6.1-.5-2.7 0-5.1.2-7.3.5-2.1.3-3.5.8-4.2 1.4-.5.6-.2 1.1 1 1.5z"/>
    <path class="text" d="M242 136.9c0-4.7-.8-6.5-2.3-5.5-.9.6-1.5 1.8-1.9 3.6-.4 1.9-.6 4.5-.7 7.9l-5.4 3.6c.1-7.4 1-13.5 2.5-18.2 1.5-4.7 3.5-7.9 5.9-9.4 2.5-1.6 4.3-1.2 5.6 1.2 1.3 2.5 1.9 6.3 1.9 11.6 0 5.9-.8 12.1-2.5 18.9-1.7 6.7-3.7 12.8-6.1 18.3l9-6v11.8l-16.2 10.8v-10.9c6.8-17.5 10.2-30.1 10.2-37.7z"/>
    `,
    ` <path class="text" d="M97.5 191v-16.2l36.6-50.2H155v49.5h9.6V191H155v14.7h-19.6V191H97.5zm39.4-44l-19.7 27.1h19.7V147z"/>
    <path class="text" d="M139.1 58.5l3.3-3.3h26.8l-14.7 14.7h-16.9L149 58.5h-9.9z"/>
    <path class="text" d="M242 136.9c0-4.7-.8-6.5-2.3-5.5-.9.6-1.5 1.8-1.9 3.6-.4 1.9-.6 4.5-.7 7.9l-5.4 3.6c.1-7.4 1-13.5 2.5-18.2 1.5-4.7 3.5-7.9 5.9-9.4 2.5-1.6 4.3-1.2 5.6 1.2 1.3 2.5 1.9 6.3 1.9 11.6 0 5.9-.8 12.1-2.5 18.9-1.7 6.7-3.7 12.8-6.1 18.3l9-6v11.8l-16.2 10.8v-10.9c6.8-17.5 10.2-30.1 10.2-37.7z"/>
    `,
    ` <path class="text" d="M163.4 140.6h-36v16.2c1.6-1.8 3.8-3.2 6.6-4.2s5.9-1.5 9.2-1.5c5.4 0 9.9 1.2 13.5 3.6 3.6 2.4 6.3 5.6 8 9.6 1.7 4 2.6 8.4 2.6 13.3 0 8.8-2.5 15.7-7.4 20.8-4.9 5.1-11.8 7.6-20.7 7.6-6 0-11.3-1.1-15.8-3.2-4.5-2.2-7.9-5.2-10.3-9-2.4-3.9-3.7-8.3-3.9-13.4h18.9c.4 2.6 1.4 4.7 3.1 6.3 1.7 1.7 4 2.5 7 2.5 3.4 0 5.9-1.1 7.6-3.3 1.7-2.2 2.6-5.1 2.6-8.7 0-3.5-.9-6.2-2.7-8-1.8-1.9-4.3-2.8-7.6-2.8-2.5 0-4.6.5-6.2 1.6-1.7 1.1-2.8 2.5-3.4 4.2h-18.8v-48.5h53.6v16.9z"/>
    <path class="text" d="M139.1 58.5l3.3-3.3h26.8l-14.7 14.7h-16.9L149 58.5h-9.9z"/>
    <path class="text" d="M230.1 174.8v-12.2l9.9-44.7 5.6-3.9v37.3l2.6-1.8v12.7l-2.6 1.8v11l-5.3 3.7v-11.1l-10.2 7.2zm10.6-40.6l-5.3 24.1 5.3-3.7v-20.4z"/>
    `,
    `  <path class="text" d="M141.7 140.3c-1.5-1.7-3.8-2.5-6.6-2.5-4.4 0-7.5 2-9.3 6.1-1.9 4-2.7 10.3-2.5 18.6 1.3-3.1 3.5-5.5 6.6-7.3 3.1-1.8 6.8-2.7 10.9-2.7 7.6 0 13.5 2.3 17.9 6.9 4.4 4.6 6.6 11.1 6.6 19.7 0 5.4-1.1 10.1-3.3 14.3-2.2 4.2-5.4 7.4-9.7 9.7-4.3 2.3-9.4 3.5-15.4 3.5-11.7 0-19.8-3.6-24.3-10.9-4.5-7.3-6.7-17.3-6.7-30.1 0-14.8 2.4-25.7 7.1-32.7 4.8-7 12.5-10.5 23.2-10.5 8.5 0 14.9 2.4 19.3 7.2 4.4 4.8 6.8 10.9 7.4 18.2h-18.1c-.5-3.4-1.5-5.8-3.1-7.5zm-14.1 46.3c2 2.2 4.8 3.2 8.6 3.2 3.4 0 6.1-.9 8-2.8 1.9-1.9 2.9-4.6 2.9-8.3 0-3.6-1-6.4-2.9-8.3-2-1.9-4.6-2.9-8-2.9-3.2 0-6 .9-8.2 2.8-2.2 1.9-3.3 4.5-3.3 7.9 0 3.4.9 6.2 2.9 8.4z"/>
    <path class="text" d="M183.4 57.9h-29.8l-3 3c1.6-.3 3.7-.6 6.3-.8 2.5-.2 5.2-.3 7.9-.3 4.4 0 7.9.2 10.5.7 2.6.4 4.2 1 4.9 1.8.7.7.6 1.5-.3 2.4-1.6 1.6-4.9 2.9-9.9 3.8-5 .9-11.2 1.4-18.5 1.4-5 0-9.1-.2-12.4-.6-3.3-.4-5.6-.9-6.9-1.6-1.3-.7-1.5-1.5-.7-2.4h15.6c-.2.5.3.9 1.4 1.2 1.1.3 2.9.5 5.3.5 2.8 0 5.1-.2 6.9-.6 1.8-.4 3-.9 3.7-1.6.6-.6.4-1.1-.8-1.5-1.2-.3-3.1-.5-5.8-.5-2.1 0-3.9.1-5.5.3-1.6.2-2.8.5-3.6.8h-15.5l8.9-8.9h44.3l-3 2.9z"/>
    <path class="text" d="M230.1 174.8v-12.2l9.9-44.7 5.6-3.9v37.3l2.6-1.8v12.7l-2.6 1.8v11l-5.3 3.7v-11.1l-10.2 7.2zm10.6-40.6l-5.3 24.1 5.3-3.7v-20.4z"/>`,
  ];
  return `<g>${faces[result - 1]}</g>`;
};

const generateD6 = ({
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

export default generateD6;
