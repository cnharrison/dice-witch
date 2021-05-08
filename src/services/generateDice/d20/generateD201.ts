const generateD201 = (
  fill: string,
  outline: string,
  viewBoxW = "600",
  viewBoxH = "600"
): string => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}">
  <g>

      <g fill="${fill}">
          <path d="M157.6 402.9L295.9 553c2 2.1 6.8 2.1 8.8 0L443 402.9c2-2.1-.5-4.8-4.4-4.8H162c-3.9 0-6.3 2.7-4.4 4.8zm1.4-21.2l135.1-228c2.5-4.2-1-9.4-5.8-8.8L86.2 171.6c-3.6.5-5.9 4.2-4.8 7.6l67 201.3c1.7 4.8 8.1 5.5 10.6 1.2z"/>
          <path d="M300.3 47.5v94.1c0 1-.8 1.9-1.8 2L89.4 171.2c-2.2.3-3.2-2.7-1.3-3.8L297.2 45.7c1.4-.8 3.1.2 3.1 1.8zm0 0v94.1c0 1 .8 1.9 1.8 2l209.1 27.6c2.2.3 3.2-2.7 1.3-3.8L303.4 45.7c-1.4-.8-3.1.2-3.1 1.8zM151.2 398.6l-68.4 28.1c-.9.4-2-.3-2-1.3l-1.6-243.6c0-1.6 2.3-2 2.8-.4l70 215.5c.2.7-.1 1.4-.8 1.7z"/>
          <path d="M151.2 398.6l-67 27.5c-1.4.6-1.5 2.5-.2 3.2l205.5 123.1c1.8 1.1 3.7-1.2 2.3-2.8L153.3 399.1c-.5-.6-1.4-.8-2.1-.5zm297.3 0l67 27.5c1.4.6 1.5 2.5.2 3.2L310.3 552.5c-1.8 1.1-3.7-1.2-2.3-2.8l138.5-150.6c.5-.6 1.3-.8 2-.5zm.3 0l68.4 28.1c.9.4 2-.3 2-1.3l1.6-243.6c0-1.6-2.3-2-2.8-.4l-70 215.5c-.2.7.1 1.4.8 1.7z"/>
          <path d="M442.3 388.3l-137-236.1c-2.1-3.6.9-8.1 5-7.5l204.8 27c3.1.4 5.1 3.6 4.1 6.6l-67.8 209c-1.2 4.2-6.9 4.8-9.1 1z"/>
          <path d="M157.6 390.5L295.9 151c2-3.4 6.8-3.4 8.8 0L443 390.5c2 3.4-.5 7.6-4.4 7.6H162c-3.9 0-6.3-4.2-4.4-7.6z"/>
      </g>
      <g fill="none" stroke="${outline}" stroke-width="12" stroke-miterlimit="10">
          <path d="M157.6 402.9L295.9 553c2 2.1 6.8 2.1 8.8 0L443 402.9c2-2.1-.5-4.8-4.4-4.8H162c-3.9 0-6.3 2.7-4.4 4.8zm1.4-21.2l135.1-228c2.5-4.2-1-9.4-5.8-8.8L86.2 171.6c-3.6.5-5.9 4.2-4.8 7.6l67 201.3c1.7 4.8 8.1 5.5 10.6 1.2z"/>
          <path d="M300.3 47.5v94.1c0 1-.8 1.9-1.8 2L89.4 171.2c-2.2.3-3.2-2.7-1.3-3.8L297.2 45.7c1.4-.8 3.1.2 3.1 1.8zm0 0v94.1c0 1 .8 1.9 1.8 2l209.1 27.6c2.2.3 3.2-2.7 1.3-3.8L303.4 45.7c-1.4-.8-3.1.2-3.1 1.8zM151.2 398.6l-68.4 28.1c-.9.4-2-.3-2-1.3l-1.6-243.6c0-1.6 2.3-2 2.8-.4l70 215.5c.2.7-.1 1.4-.8 1.7z"/>
          <path d="M151.2 398.6l-67 27.5c-1.4.6-1.5 2.5-.2 3.2l205.5 123.1c1.8 1.1 3.7-1.2 2.3-2.8L153.3 399.1c-.5-.6-1.4-.8-2.1-.5zm297.3 0l67 27.5c1.4.6 1.5 2.5.2 3.2L310.3 552.5c-1.8 1.1-3.7-1.2-2.3-2.8l138.5-150.6c.5-.6 1.3-.8 2-.5zm.3 0l68.4 28.1c.9.4 2-.3 2-1.3l1.6-243.6c0-1.6-2.3-2-2.8-.4l-70 215.5c-.2.7.1 1.4.8 1.7z"/>
          <path d="M442.3 388.3l-137-236.1c-2.1-3.6.9-8.1 5-7.5l204.8 27c3.1.4 5.1 3.6 4.1 6.6l-67.8 209c-1.2 4.2-6.9 4.8-9.1 1z"/>
          <path d="M157.6 390.5L295.9 151c2-3.4 6.8-3.4 8.8 0L443 390.5c2 3.4-.5 7.6-4.4 7.6H162c-3.9 0-6.3-4.2-4.4-7.6z"/>
      </g>
  </g>
  <g>
      <path d="M285.2 291.3v-17.1h30.6v75.7h-19.3v-58.5h-11.3z"/>
      <path d="M221.5 108.7l3.4-11.1 17.5-2.5-13 42.4-11.6 1.6 9.6-31.3-5.9.9zm49.3-9.7l-24.4 36.1-11.4 1.6 24.1-34.7-15.6 2.2 3.1-10.1 26.8-3.8-2.6 8.7z"/>
      <path d="M366.7 94.4c2.2 1.3 3.9 2.9 5.1 4.8s2 4 2.3 6.2c.3 2.7-.1 4.7-1.2 6.2s-2.5 2.2-4.2 2.4v.2c5 2.5 7.8 6.1 8.3 10.9.3 2.4 0 4.5-.9 6.2-.9 1.7-2.3 2.9-4.2 3.7-1.9.7-4.3.9-7.2.5-4.7-.7-8.6-2.4-11.6-5.1-3-2.7-4.8-6.6-5.6-11.6l10.8 1.5c.3 3.4 1.9 5.3 4.8 5.7 1 .1 1.8-.1 2.3-.7.5-.6.7-1.4.6-2.5-.2-1.4-.7-2.5-1.7-3.3-1-.8-2.5-1.4-4.5-1.7l-2-.3-1.1-9.3 1.9.3c1.5.2 2.6.1 3.6-.3.9-.4 1.3-1.4 1.1-3-.1-1.2-.5-2.1-1.2-2.8-.6-.7-1.4-1.1-2.4-1.2-1-.1-1.8.2-2.2.9-.4.8-.6 1.8-.6 3l-10.7-1.5c-.4-4.5.5-7.7 2.7-9.8 2.2-2 5.5-2.7 10-2.1 3.1.5 5.6 1.3 7.8 2.7z"/>
      <path d="M146.4 440.9l11.5 12.8 5.9-1.2c-1.2-.4-2.5-1.1-3.8-2s-2.4-1.9-3.4-3c-1.8-2-2.7-3.7-2.8-5.3-.1-1.6.5-2.9 1.7-3.9 1.3-1 3-1.8 5.2-2.2 4-.8 8-.5 12 .8 4 1.4 7.4 3.8 10.4 7.1 2.1 2.3 3.4 4.5 4 6.4.5 1.9.3 3.5-.6 4.8-1 1.3-2.6 2.1-5 2.6l-7.3-8.1c.8-.3 1.3-.7 1.5-1.3.2-.6-.1-1.3-.9-2.2-.9-1-1.9-1.6-3.2-2-1.2-.3-2.5-.4-3.9-.1-1.3.3-2.1.7-2.3 1.4-.2.7.1 1.5 1 2.4.7.7 1.4 1.3 2.2 1.7s1.6.6 2.4.5l7.3 8.1-22.6 4.6-18.2-20.4 8.9-1.5z"/>
      <path d="M108.2 371.7l-7.4 5.2-5.4-16.9 28.5-19.9 3.5 11.1-21.1 14.7 1.9 5.8zm-17.3-50l5.2 16.4 4.6-3.2c-.8-.4-1.6-1-2.3-2-.7-1-1.3-2.2-1.8-3.7-.8-2.5-1-4.9-.7-7.3.3-2.3 1.1-4.4 2.2-6.2 1.2-1.8 2.6-3.3 4.3-4.5 3.2-2.2 6-2.8 8.6-1.6 2.5 1.1 4.5 3.8 5.9 8.1.9 3 1.4 5.9 1.3 8.6-.1 2.7-.6 5.2-1.7 7.3-1 2.1-2.5 3.8-4.3 5.1l-3.3-10.4c.6-.6 1.1-1.3 1.4-2.2s.3-1.9-.1-3.1c-.4-1.3-1-2-1.8-2.2-.8-.2-1.8.1-2.8.8-1 .7-1.7 1.6-2 2.7-.3 1.1-.3 2.2.1 3.4.3.9.7 1.6 1.2 2 .5.4 1 .5 1.6.2l3.3 10.4-17.7 12.3-8.2-26.1 7-4.8z"/>
      <path d="M486.7 335.1c-.6.2-1.1.8-1.5 1.9-.6 1.7-.4 3.5.5 5.3.9 1.8 2.4 4 4.7 6.4-.6-1.5-.9-3.2-.9-5.1 0-1.9.3-3.7.8-5.5 1.2-3.5 2.8-5.5 4.8-6 2.1-.5 4.4.7 7 3.6 1.7 1.9 3 4.1 3.9 6.7.9 2.5 1.4 5.2 1.4 8.1s-.4 5.7-1.3 8.5c-1.3 3.9-2.8 6.3-4.5 7.3s-3.7.9-5.7-.3-4.4-3.2-7-6.1c-4.5-5.1-7.6-10-9.1-14.6-1.6-4.7-1.6-9.5.1-14.5.9-2.8 2.1-4.9 3.5-6 1.4-1.2 2.9-1.6 4.5-1.4 1.6.3 3.1 1.1 4.5 2.6l-3.4 10c-.9-.7-1.7-1-2.3-.9zm11.6 20.1c.7-.2 1.3-1 1.8-2.4.4-1.3.5-2.6.3-3.8-.2-1.3-.8-2.4-1.7-3.4-.9-1-1.7-1.3-2.4-1.1-.7.2-1.3 1-1.7 2.3-.4 1.2-.5 2.5-.3 3.8.2 1.3.7 2.5 1.6 3.4.9 1 1.7 1.4 2.4 1.2z"/>
      <path d="M453.7 440.2l8.2 3.9-12 13-31.5-14.7 7.9-8.6 23.3 10.9 4.1-4.5zm-14.5 15.7l8.2 3.9-12 13-31.4-14.7 7.9-8.6 23.3 10.9 4-4.5z"/>
      <path d="M166.6 196.1l35.3 49-8.7 15-33.5-48.4-14.7 25.6-11.9-6.9 23.3-40.3 10.2 6z"/>
      <path d="M428.4 178.4l13-7.5 14 24.3-57.5 33.2-8.8-15.3 44.5-25.7-5.2-9zm-2 74.9c1.9 3.3 4.7 4.8 8.3 4.4 3.6-.3 8.5-2.3 14.5-5.9-2.8.3-5.5-.3-8.1-1.9-2.6-1.6-4.8-4-6.6-7.1-3.3-5.7-4.2-11.1-2.8-16.3 1.4-5.2 5.1-9.5 11.3-13.1 3.8-2.2 7.7-3.4 11.7-3.4 3.9-.1 7.6 1 11.1 3.3 3.5 2.2 6.5 5.6 9.1 10.1 3.5 6.1 5 11.5 4.5 16.3-.5 4.8-2.4 9.1-5.9 12.8-3.4 3.7-8.1 7.3-14 10.7-10.4 6-19.2 8.9-26.5 8.7-7.3-.2-13.1-4.3-17.6-12.1-2.5-4.3-3.8-8.5-3.9-12.5-.1-4 .7-7.7 2.5-11s4.3-6 7.5-8.1l7.8 13.6c-4.4 3.4-5.3 7.3-2.9 11.5zm38.1-14.8c.7-2.4.2-5-1.4-7.8-1.5-2.5-3.3-4.2-5.5-4.8-2.2-.7-4.6-.2-7.2 1.3-2.6 1.5-4.2 3.4-4.7 5.7-.5 2.3-.1 4.7 1.4 7.2 1.4 2.4 3.2 4.1 5.5 5 2.3.9 4.6.6 7.1-.8 2.6-1.5 4.2-3.4 4.8-5.8z"/>
      <path d="M339.8 468.3v12.1h-24v-53.6h15.1v41.5h8.9zm-65.1 12.6c-3-1.3-5.2-3.1-6.8-5.3-1.5-2.2-2.3-4.8-2.3-7.6 0-3.5 1-6.3 3-8.4 2-2.1 4.5-3.5 7.4-4v-.4c-7.7-2.2-11.5-6.5-11.5-13 0-3.1.8-5.8 2.4-8.2 1.6-2.4 3.9-4.3 6.9-5.6 3-1.3 6.6-2 10.8-2 6.8 0 12.3 1.5 16.3 4.5s6.2 7.7 6.5 13.9h-14c-.1-2.4-.8-4.2-2.2-5.6-1.3-1.4-3.3-2-5.9-2-2.1 0-3.7.6-4.9 1.7-1.2 1.1-1.8 2.6-1.8 4.3 0 4.4 3.5 6.6 10.6 6.6h2.7v10.5h-2.6c-6.3-.1-9.5 1.9-9.5 6.1 0 1.8.5 3.2 1.6 4.2s2.6 1.5 4.4 1.5c2 0 3.6-.6 4.8-1.9 1.2-1.2 1.8-2.9 2-5h14c-.3 5.7-2.2 10-5.9 13-3.6 3-8.7 4.5-15.3 4.5-4.2.1-7.7-.6-10.7-1.8z"/>
  </g>
</svg>
    `;

export default generateD201;