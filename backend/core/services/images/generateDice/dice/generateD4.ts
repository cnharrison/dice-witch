import { GenerateDieProps } from "../../../../../shared/types";

const getFaces = (result: number) => {
  const faces = [
    `  <path class="text" d="M139.9 95.2V84.3h19.5v48.1h-12.3V95.2h-7.2z"/>
<path class="text" d="M115.3 225.4l-8.4 4.9-37.1-4-6.3-10.9 25.8-14.9-2.9-5 8.8-5.1 2.9 5 7.7-4.4 5.9 10.2-7.7 4.4 11.3 19.8zm-34.8-7.3l20 2.1-5.9-10.2-14.1 8.1z"/>
<path class="text" d="M222.1 229.6c-2.2 1.5-4.5 2.3-6.9 2.4-2.4.1-4.7-.5-6.9-1.8-2.7-1.6-4.5-3.5-5.3-5.9-.8-2.3-.9-4.7-.1-7l-.3-.2c-4.8 4.4-9.8 5.1-14.7 2.3-2.4-1.4-4.2-3.2-5.4-5.3-1.2-2.2-1.8-4.6-1.6-7.3.2-2.7 1.1-5.5 2.8-8.5 2.8-4.8 6.1-7.9 10.1-9.4 4-1.4 8.5-.9 13.4 1.7l-5.7 9.8c-1.9-1-3.6-1.3-5.3-1-1.6.3-2.9 1.4-4 3.2-.8 1.5-1.1 2.9-.7 4.2.4 1.3 1.3 2.4 2.6 3.2 3.4 2 6.6.5 9.4-4.5l1.1-1.9 8.2 4.7-1.1 1.8c-2.6 4.4-2.3 7.5.9 9.4 1.4.8 2.7 1.1 3.9.7 1.2-.3 2.2-1.1 2.9-2.4.8-1.4 1-2.8.5-4.2-.5-1.4-1.5-2.6-3-3.6l5.7-9.8c4.3 2.7 6.9 6.1 7.8 10 .9 3.9 0 8.2-2.7 12.8-1.4 2.8-3.4 5-5.6 6.6z"/>
`,
    ` <path class="text" d="M154 98.6c0-3.7-1.6-5.6-4.8-5.6-1.8 0-3.1.6-4 1.9-.8 1.3-1.3 3.2-1.4 5.9h-11.4c.3-5.9 2-10.3 5.3-13.2 3.3-3 7.4-4.4 12.4-4.4 5.2 0 9.2 1.3 11.8 3.9 2.7 2.6 4 6.1 4 10.3 0 4.7-1.8 9.3-5.4 13.7-3.6 4.5-7.9 8.3-12.9 11.3h19v9.4h-34.3v-8.7c14.5-10.3 21.7-18.4 21.7-24.5z"/>
<path class="text" d="M65.7 215.6c-.2-2.7.3-5 1.4-7.1 1.1-2.1 2.8-3.8 5-5 2.7-1.6 5.3-2.1 7.8-1.7 2.5.4 4.5 1.6 6.1 3.4l.3-.2c-1.4-6.4.4-11 5.4-13.9 2.4-1.4 4.9-2.1 7.4-2 2.5 0 4.9.8 7.1 2.3 2.3 1.5 4.2 3.7 5.9 6.7 2.8 4.8 3.8 9.3 3 13.5-.7 4.2-3.5 7.8-8.2 10.8l-5.7-9.8c1.8-1.1 3-2.5 3.5-4.1.5-1.6.3-3.2-.8-5-.8-1.5-1.9-2.4-3.3-2.7-1.4-.3-2.7-.1-4.1.7-3.4 2-3.7 5.4-.8 10.4l1.1 1.9-8.2 4.7-1.1-1.8c-2.5-4.5-5.4-5.8-8.6-3.9-1.4.8-2.3 1.8-2.6 3-.3 1.2-.1 2.5.6 3.8.8 1.4 1.9 2.3 3.4 2.5 1.4.3 3 0 4.7-.8l5.7 9.8c-4.5 2.3-8.7 2.9-12.5 1.7-3.8-1.2-7.1-4.1-9.7-8.7-1.7-3.1-2.6-5.9-2.8-8.5z"/>
<path class="text" d="M203 184l8.4 4.9 15.1 34.1-6.3 10.9-25.7-14.9-2.9 5-8.8-5.1 2.9-5-7.7-4.4 5.9-10.27.7 4.4L203 184zm11 33.8l-8.2-18.4-5.9 10.3 14.1 8.1z"/>
`,
    ` <path class="text" d="M158.9 83.9c2.4 1.2 4.2 2.7 5.5 4.8 1.2 2 1.9 4.3 1.9 6.8 0 3.1-.8 5.7-2.4 7.6s-3.6 3.1-6 3.6v.3c6.2 2 9.3 5.9 9.3 11.6 0 2.8-.6 5.2-1.9 7.4-1.3 2.2-3.1 3.8-5.6 5-2.4 1.2-5.3 1.8-8.7 1.8-5.5 0-9.9-1.4-13.2-4.1-3.2-2.7-5-6.9-5.3-12.5h11.4c.1 2.1.7 3.8 1.8 5s2.7 1.8 4.8 1.8c1.7 0 3-.5 4-1.5s1.5-2.3 1.5-3.9c0-3.9-2.9-5.9-8.6-5.9h-2.2v-9.5h2.1c5.1.1 7.7-1.7 7.7-5.5 0-1.6-.4-2.9-1.3-3.8-.9-.9-2.1-1.3-3.6-1.3-1.6 0-2.9.6-3.9 1.7s-1.5 2.6-1.6 4.5h-11.4c.2-5.1 1.8-9 4.8-11.7 3-2.7 7.1-4.1 12.4-4.1 3.2.2 6.1.7 8.5 1.9z"/>
<path class="text" d="M80.3 211.6c-3.2 1.9-4 4.2-2.4 7 .9 1.6 2.1 2.4 3.6 2.5 1.5.1 3.5-.5 5.8-1.8l5.7 9.8c-5.2 2.7-9.9 3.4-14.1 2-4.2-1.4-7.5-4.2-10-8.5-2.6-4.5-3.4-8.6-2.5-12.2 1-3.6 3.3-6.5 6.9-8.6 4-2.3 8.9-3.1 14.6-2.2 5.7.9 11.1 2.7 16.3 5.5l-9.5-16.5 8.1-4.7 17.2 29.7-7.5 4.4c-16.2-7.3-26.9-9.4-32.2-6.4z"/>
<path class="text" d="M222.3 206.6l9.4 5.4-9.7 16.9-41.7-24.1 6.1-10.6 32.3 18.6 3.6-6.2z"/>
`,
    ` <path class="text" d="M125.4 123.6v-9.7l22-30.2h12.5v29.8h5.8v10.1h-5.8v8.9h-11.8v-8.9h-22.7zm23.7-26.5l-11.8 16.3h11.8V97.1z"/>
<path class="text" d="M79.3 211.6c-3.2 1.9-4 4.2-2.4 7 .9 1.6 2.1 2.4 3.6 2.5 1.5.1 3.5-.5 5.8-1.8l5.7 9.8c-5.2 2.7-9.9 3.4-14.1 2-4.2-1.4-7.5-4.2-10-8.5-2.6-4.5-3.4-8.6-2.5-12.2 1-3.6 3.3-6.5 6.9-8.6 4-2.3 8.9-3.1 14.6-2.2 5.7.9 11.1 2.7 16.3 5.5l-9.5-16.5 8.1-4.7 17.2 29.7-7.5 4.4c-16.2-7.3-26.9-9.4-32.2-6.4z"/>
<path class="text" d="M222.1 229.6c-2.2 1.5-4.5 2.3-6.9 2.4-2.4.1-4.7-.5-6.9-1.8-2.7-1.6-4.5-3.5-5.3-5.9-.8-2.3-.9-4.7-.1-7l-.3-.2c-4.8 4.4-9.8 5.1-14.7 2.3-2.4-1.4-4.2-3.2-5.4-5.3-1.2-2.2-1.8-4.6-1.6-7.3.2-2.7 1.1-5.5 2.8-8.5 2.8-4.8 6.1-7.9 10.1-9.4 4-1.4 8.5-.9 13.4 1.7l-5.7 9.8c-1.9-1-3.6-1.3-5.3-1-1.6.3-2.9 1.4-4 3.2-.8 1.5-1.1 2.9-.7 4.2.4 1.3 1.3 2.4 2.6 3.2 3.4 2 6.6.5 9.4-4.5l1.1-1.9 8.2 4.7-1.1 1.8c-2.6 4.4-2.3 7.5.9 9.4 1.4.8 2.7 1.1 3.9.7 1.2-.3 2.2-1.1 2.9-2.4.8-1.4 1-2.8.5-4.2-.5-1.4-1.5-2.6-3-3.6l5.7-9.8c4.3 2.7 6.9 6.1 7.8 10 .9 3.9 0 8.2-2.7 12.8-1.4 2.8-3.4 5-5.6 6.6z"/>`,
  ];
  return `<g>${faces[result - 1]}</g>`;
};

const generateD4 = ({
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
      <path class="outline" d="M38.4 233.6L143.2 52.1c3.2-5.5 11.1-5.5 14.3 0l104.8 181.5c3.2 5.5-.8 12.4-7.1 12.4H45.6c-6.4 0-10.3-6.9-7.2-12.4z"/>
      <path class="outline" d="M38.4 233.6L143.2 52.1c3.2-5.5 11.1-5.5 14.3 0l104.8 181.5c3.2 5.5-.8 12.4-7.1 12.4H45.6c-6.4 0-10.3-6.9-7.2-12.4z"/>
  </g>
  ${faces}
</svg>
`;
};

export default generateD4;
