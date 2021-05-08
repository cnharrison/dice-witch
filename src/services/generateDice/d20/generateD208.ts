const generateD208 = (
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
      <path d="M278.8 280.9c2.1-3.2 5.2-5.8 9.3-7.8 4.1-2 9.1-3 14.9-3 5.9 0 10.9 1 15 3s7.2 4.6 9.2 7.8c2 3.2 3 6.6 3 10.3 0 4-.9 7.4-2.8 10.2-1.9 2.8-4.6 5-8.1 6.5 8.5 3.8 12.7 10.2 12.7 19.2 0 5.1-1.3 9.5-3.9 13.2-2.6 3.7-6 6.5-10.4 8.3-4.4 1.9-9.3 2.8-14.8 2.8-5.4 0-10.3-.9-14.8-2.8-4.4-1.9-7.9-4.7-10.5-8.3-2.6-3.7-3.9-8.1-3.9-13.2 0-9 4.2-15.4 12.7-19.2-3.6-1.5-6.3-3.7-8.1-6.5-1.9-2.8-2.8-6.2-2.8-10.2.2-3.7 1.2-7.1 3.3-10.3zm15.9 52.6c2 1.9 4.8 2.8 8.3 2.8 3.5 0 6.3-.9 8.3-2.8 2-1.9 3-4.4 3-7.6s-1.1-5.7-3.2-7.5c-2.1-1.8-4.8-2.7-8.2-2.7-3.4 0-6.1.9-8.2 2.7-2.1 1.8-3.2 4.3-3.2 7.5s1.2 5.8 3.2 7.6zm1.5-32.6c1.7 1.5 3.9 2.3 6.8 2.3s5.1-.8 6.8-2.3c1.7-1.5 2.5-3.8 2.5-6.7 0-2.9-.9-5.1-2.6-6.7-1.7-1.6-4-2.5-6.7-2.5s-5 .8-6.7 2.5c-1.7 1.6-2.6 3.9-2.6 6.7 0 3 .8 5.2 2.5 6.7z"/>
      <path d="M256.5 92.7c1.7.8 2.8 2 3.3 3.7.5 1.7.4 3.6-.3 5.9-.8 2.8-2.2 5-3.9 6.9-1.8 1.8-3.6 3.1-5.5 3.8l-.1.2c4.2 1.2 5.6 4.2 4.1 9.2-.8 2.5-2 4.8-3.7 6.9-1.7 2.1-3.7 3.8-6.1 5.1-2.4 1.3-5 2.2-7.8 2.6-4.7.7-8.1 0-10-2.1-2-2.1-2.3-5.6-.8-10.7l10.8-1.5c-1.1 3.5-.3 5 2.6 4.6 1-.1 1.9-.6 2.8-1.4.8-.8 1.4-1.7 1.8-2.9.4-1.4.3-2.4-.4-3-.7-.6-2.1-.7-4.1-.5l-2 .3 2.9-9.5 1.9-.3c1.5-.2 2.8-.6 3.9-1.3 1.1-.7 2-1.8 2.5-3.5.4-1.2.4-2.1 0-2.7-.4-.5-1-.7-2-.6-1 .1-2 .7-2.8 1.6-.8.9-1.4 2.1-1.9 3.4l-10.7 1.5c1.6-4.6 3.9-8.4 7.2-11.2s7-4.5 11.5-5.1c2.8-.4 5.1-.2 6.8.6z"/>
      <path d="M336.4 101.2l-1.2-10.8 17.5 2.5 4.7 41.2-11.6-1.6-3.5-30.4-5.9-.9zm48.2 4l-10.1 31.3-11.4-1.6 10.5-29.9-15.6-2.2-1.1-9.8 26.8 3.8.9 8.4z"/>
      <path d="M177.2 473l-9.5 1.9-11.8-13.2 36.4-7.5 7.8 8.7-26.9 5.5 4 4.6zm5-21.7l-8.4 1.7-34-8.5-8-9 22-4.5-3-3.3 8.7-1.8 3 3.3 6.2-1.3 7.5 8.4-6.2 1.3 12.2 13.7zm-31.9-10.4l15.8 3.8-5.3-6-10.5 2.2z"/>
      <path d="M97.2 343.2c-.3.9-.3 2 .1 3.1.5 1.7 1.5 2.5 3 2.3 1.5-.2 3.5-1.2 6-3-1.1 0-2.1-.5-3.1-1.5s-1.7-2.4-2.3-4.1c-1.1-3.5-1.2-6.9-.2-10.1 1-3.2 2.9-5.9 5.9-8 2-1.4 3.9-2 5.7-1.9 1.8.1 3.5.8 4.9 2.3 1.5 1.5 2.6 3.7 3.5 6.5 1.8 5.6 1.7 10.4-.2 14.4s-5.1 7.6-9.7 10.8c-3.6 2.5-6.7 4.1-9.2 4.6-2.6.6-4.7.2-6.5-1.2-1.8-1.4-3.2-3.8-4.3-7.3-1.3-4.1-1.4-7.9-.3-11.3 1.1-3.4 2.9-6.1 5.5-8.2l3.1 9.9c-1 .8-1.6 1.7-1.9 2.7zm17-5.6c.3-1.2.3-2.4-.2-3.8-.4-1.3-1-2.1-1.7-2.5-.8-.4-1.7-.2-2.7.5-1 .7-1.7 1.6-2 2.8-.3 1.1-.2 2.3.2 3.6.4 1.3 1 2.1 1.8 2.5.8.4 1.7.3 2.6-.4 1-.6 1.7-1.5 2-2.7z"/>
      <path d="M506.5 326.4l6.4 7.3-5.5 16.8-24.6-27.8 3.6-11.1 18.2 20.5 1.9-5.7zm-17.2 26.1c1 5.2 2.3 8.6 3.9 10.4 1.5 1.7 2.6 1.6 3.2-.3.4-1.1.3-2.2 0-3.2-.4-1.1-1.2-2.3-2.4-3.8l3.4-10.3c3 3.7 4.8 7.7 5.5 12.1.6 4.4.3 8.6-1 12.5-1.4 4.3-3.2 6.8-5.3 7.3s-4.2-.4-6.3-2.8c-2.3-2.6-4.1-6.3-5.4-11.3-1.3-4.9-2.1-10.1-2.3-15.4l-4.5 13.7-5.5-6.2 9-27.5 5.1 5.8c.7 7.5 1.6 13.8 2.6 19z"/>
      <path d="M432.8 450.3c.4 3.5 1.6 5.7 3.6 6.6 2 .9 3.6.6 5-.8.8-.8 1-1.6.6-2.3-.3-.7-1.3-1.4-2.8-2.2l7.3-8c3.8 2 5.7 4.5 5.8 7.5 0 3-1.3 6-4.2 9.1-3.1 3.4-6.3 5.4-9.5 6.2-3.3.8-6.3.5-9-.7-2.9-1.4-4.8-3.7-5.7-6.9-.9-3.2-1-6.7-.2-10.5l-9.7 10.6-7.1-3.3 19.6-21.4 6.5 3.1c-.5 5.2-.6 9.5-.2 13z"/>
      <path d="M134.6 259l-13-7.5 14-24.3 57.5 33.2-8.8 15.3-44.5-25.7-5.2 9zm32.8-62.4c-1.9.5-3.4 1.8-4.7 3.9-1.9 3.3-1.8 6.5.3 9.5 2.1 3.1 6.2 6.3 12.3 9.6-1.7-2.2-2.5-4.9-2.4-8 .1-3.1 1-6.2 2.8-9.3 3.3-5.7 7.5-9.2 12.7-10.6 5.2-1.4 10.8-.3 16.9 3.2 3.8 2.2 6.8 5 8.8 8.4 2 3.4 2.9 7.1 2.8 11.3-.2 4.2-1.6 8.5-4.2 12.9-5.1 8.8-11.2 13.3-18.3 13.7-7.1.3-15.3-2.2-24.5-7.5-10.6-6.1-17.4-12.4-20.4-18.9-3-6.5-2.1-13.7 2.5-21.8 3.7-6.3 8.2-10.2 13.5-11.5 5.3-1.3 10.7-.6 16.2 2l-7.8 13.6c-2.4-.7-4.7-.9-6.5-.5zm27.1 29.8c2.4-.6 4.4-2.3 6-5.1 1.5-2.5 1.9-4.9 1.4-7.2-.5-2.2-2.1-4.1-4.7-5.6s-5-1.9-7.3-1.2c-2.2.7-4.1 2.3-5.6 4.8-1.4 2.4-1.9 4.9-1.5 7.3.4 2.4 1.8 4.3 4.2 5.7 2.6 1.4 5.1 1.9 7.5 1.3z"/>
      <path d="M427.3 176.6l13-7.5 14 24.3-57.5 33.2-8.8-15.3 44.5-25.7-5.2-9zm3.9 41.6c8.9-5.2 17.1-7.4 24.5-6.6 7.4.8 13.5 5.3 18.3 13.7 4.8 8.3 5.7 15.8 2.6 22.7-3 6.8-9 12.8-17.9 18-9 5.2-17.2 7.4-24.7 6.6-7.5-.8-13.6-5.3-18.4-13.6-4.8-8.3-5.7-15.9-2.6-22.7 3.2-6.9 9.2-12.9 18.2-18.1zm19.2 33.3c5.1-3 8.7-5.9 10.7-8.7 2-2.9 1.9-6.2-.2-9.9-2.2-3.8-5-5.5-8.6-5.3-3.5.3-7.8 1.9-12.9 4.9-5.1 3-8.7 5.9-10.8 8.8-2 2.9-2 6.3.2 10.1 2.2 3.7 5 5.4 8.5 5.1 3.6-.4 8-2 13.1-5z"/>
      <path d="M321.6 464.5c0 4.1 2 6.2 6 6.2 2.2 0 3.9-.7 4.9-2.1s1.6-3.6 1.7-6.6h14c-.3 6.5-2.5 11.4-6.6 14.7-4 3.3-9.1 4.9-15.3 4.9-6.4 0-11.3-1.5-14.6-4.4-3.3-2.9-4.9-6.7-4.9-11.4 0-5.2 2.2-10.3 6.6-15.3 4.4-5 9.7-9.2 15.9-12.6h-23.5v-10.5h42.4v9.7c-17.7 11.5-26.6 20.6-26.6 27.4zM300 454.2c0 8.3-1.9 14.9-5.6 19.8-3.8 4.9-9.8 7.3-18 7.3s-14.2-2.4-18-7.3c-3.8-4.9-5.7-11.5-5.7-19.8 0-8.4 1.9-15 5.7-19.9 3.8-4.9 9.8-7.4 18-7.4s14.2 2.5 18 7.4c3.8 4.9 5.6 11.5 5.6 19.9zm-32.9 0c0 4.8.6 8.5 1.9 11 1.3 2.6 3.7 3.8 7.4 3.8 3.8 0 6.3-1.3 7.6-3.9 1.3-2.6 1.9-6.2 1.9-11s-.6-8.5-1.9-11.1c-1.3-2.6-3.8-3.9-7.6-3.9-3.7 0-6.2 1.3-7.4 3.9-1.3 2.7-1.9 6.4-1.9 11.2z"/>
  </g>
</svg>`;

export default generateD208;
