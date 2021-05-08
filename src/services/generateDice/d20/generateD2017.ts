const generateD2017 = (
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
      <path d="M257.9 291.3v-17.1h30.6v75.7h-19.3v-58.5h-11.3zm89.5-4.3l-27.1 62.8h-18.9l27.4-60.7h-32.1v-15.7h50.7V287z"/>
      <path d="M235 99.7c1.6-2 3.7-3.7 6.3-5.2 2.6-1.5 5.4-2.4 8.6-2.9 3.1-.4 5.6-.2 7.5.6 1.9.8 3 2.1 3.6 3.8.5 1.7.5 3.5-.1 5.5-.7 2.2-1.7 4.1-3.1 5.8-1.4 1.7-3.1 3.1-5 4.1 3.4 1.6 4.4 4.9 2.9 9.8-.9 3-2.4 5.6-4.4 7.9-2 2.3-4.4 4.1-7.1 5.5-2.7 1.4-5.4 2.3-8.3 2.7-2.8.4-5.3.2-7.3-.5s-3.4-2-4.2-3.9-.7-4.3.2-7.3c1.5-4.9 4.6-8.7 9.4-11.5-1.4-.6-2.3-1.7-2.8-3.1-.4-1.4-.3-3.2.3-5.3.8-2 1.9-4 3.5-6zm.8 27.2c.6.8 1.6 1.1 3.1.9 1.5-.2 2.8-.8 3.9-1.8s1.9-2.3 2.4-3.7c.5-1.5.4-2.7-.2-3.4-.6-.8-1.6-1.1-3.1-.9-1.4.2-2.7.8-3.9 1.8-1.2 1-2 2.3-2.4 3.8-.4 1.4-.4 2.5.2 3.3zm6.2-17.7c.4.6 1.2.9 2.4.7 1.1-.2 2.1-.7 3-1.5s1.6-1.9 2-3.3c.4-1.4.4-2.4-.1-3.1-.4-.7-1.2-1-2.3-.8-1.1.2-2.1.7-3 1.6-.9.9-1.6 2-2 3.4-.5 1.4-.5 2.4 0 3z"/>
      <path d="M333 100.7L331.8 90l17.5 2.5 4.7 41.2-11.6-1.6-3.5-30.4-5.9-1zm40.6 3.3c-.7-.8-1.6-1.3-2.8-1.4-1.8-.2-2.9.5-3.4 2.2-.5 1.7-.5 4.4-.1 8.1.5-1.2 1.4-2.1 2.8-2.7 1.4-.6 2.9-.7 4.7-.5 3.7.5 6.7 2.1 9.2 4.7 2.4 2.6 3.9 6.1 4.4 10.5.3 2.8 0 5.2-.9 7.2s-2.3 3.4-4.3 4.3c-2 .9-4.5 1.1-7.4.7-5.8-.8-10.1-3.3-12.8-7.3-2.7-4.1-4.4-9.4-5.2-16-.6-5.2-.6-9.4.1-12.5.7-3.1 2-5.3 4.1-6.6 2-1.3 4.9-1.6 8.5-1.1 4.3.6 7.7 2.3 10.2 5.2 2.5 2.9 4.1 6.2 4.8 10l-10.3-1.4c-.4-1.5-.9-2.6-1.6-3.4zm-2.9 21.5c.9.9 2 1.5 3.5 1.7 1.3.2 2.4 0 3-.7.7-.6.9-1.7.8-3.2-.2-1.5-.7-2.7-1.6-3.5-.9-.9-2-1.4-3.3-1.6-1.3-.2-2.3.1-3.1.7-.8.7-1.1 1.7-.9 3.1.2 1.4.7 2.6 1.6 3.5z"/>
      <path d="M176.5 472.3l-9.5 1.9-11.8-13.2 36.4-7.5 7.8 8.7-26.9 5.5 4 4.6zm-37.2-39.4l11.5 12.8 5.9-1.2c-1.2-.4-2.5-1.1-3.8-2s-2.4-1.9-3.4-3c-1.8-2-2.7-3.7-2.8-5.3-.1-1.6.5-2.9 1.7-3.9 1.3-1 3-1.8 5.2-2.2 4-.8 8-.5 12 .8 4 1.4 7.4 3.8 10.4 7.1 2.1 2.3 3.4 4.5 4 6.4.5 1.9.3 3.5-.6 4.8s-2.6 2.1-5 2.6l-7.3-8.1c.8-.3 1.3-.7 1.5-1.3.2-.6-.1-1.3-.9-2.2-.9-1-1.9-1.6-3.2-2-1.2-.3-2.5-.4-3.9-.1-1.3.3-2.1.7-2.3 1.4-.2.7.1 1.5 1 2.5.7.7 1.4 1.3 2.2 1.7.8.4 1.6.6 2.4.5l7.3 8.1-22.6 4.6-18.2-20.4 8.9-1.6z"/>
      <path d="M107.5 369.3l-7.4 5.2-5.3-16.9 28.5-19.9 3.5 11.1-21.1 14.7 1.8 5.8zm-3.2-38.4c-3.2-1.4-5.7-1.4-7.5-.2-1.8 1.2-2.4 2.8-1.8 4.7.3 1.1.9 1.7 1.7 1.7.8.1 1.9-.4 3.3-1.3l3.3 10.3c-3.6 2.3-6.8 2.7-9.4 1.2-2.6-1.4-4.5-4.2-5.8-8.2-1.4-4.4-1.6-8.2-.6-11.4 1-3.2 2.7-5.7 5.1-7.4 2.7-1.9 5.6-2.4 8.9-1.5 3.2.8 6.3 2.5 9.2 5l-4.3-13.7 6.4-4.5 8.7 27.6-5.9 4.1c-4.4-2.8-8.1-5-11.3-6.4z"/>
      <path d="M506.8 325.5l6.4 7.3-5.5 16.8-24.6-27.8 3.6-11.1 18.2 20.5 1.9-5.7zm-23.4 19.8c-.6.2-1.1.8-1.5 1.9-.6 1.7-.4 3.5.5 5.3.9 1.8 2.4 4 4.7 6.4-.6-1.5-.9-3.2-.9-5.1 0-1.9.3-3.7.8-5.5 1.2-3.5 2.8-5.5 4.8-6s4.4.7 7 3.7c1.7 1.9 3 4.1 3.9 6.7.9 2.5 1.4 5.2 1.4 8.1 0 2.8-.4 5.7-1.3 8.5-1.3 3.9-2.8 6.3-4.5 7.3-1.8 1-3.7.9-5.7-.3s-4.4-3.2-7-6.1c-4.5-5.1-7.6-10-9.1-14.6-1.6-4.7-1.6-9.5.1-14.5.9-2.8 2.1-4.9 3.5-6 1.4-1.2 2.9-1.6 4.5-1.4 1.6.3 3.1 1.1 4.5 2.6l-3.2 9.9c-1.1-.8-1.9-1.1-2.5-.9zm11.6 20.1c.7-.2 1.3-1 1.8-2.4.4-1.3.5-2.6.3-3.8-.2-1.3-.8-2.4-1.7-3.4-.9-1-1.7-1.3-2.4-1.1-.7.2-1.3 1-1.7 2.3-.4 1.2-.5 2.5-.3 3.8.2 1.3.7 2.5 1.6 3.4.9 1 1.7 1.4 2.4 1.2z"/>
      <path d="M446.4 448l8.2 3.9-12 13-31.5-14.7 7.9-8.6 23.3 10.9 4.1-4.5z"/>
      <path d="M134.2 259.7l-13-7.5 14-24.3 57.5 33.2-8.8 15.3-44.5-25.7-5.2 9zm34.1-24.2c-8.9-5.2-14.9-11.1-18-18-3-6.8-2.2-14.4 2.7-22.7 4.8-8.3 10.9-12.8 18.3-13.6 7.4-.8 15.6 1.4 24.6 6.5 9 5.2 15 11.2 18.1 18.1 3 6.9 2.2 14.4-2.6 22.7-4.8 8.3-10.9 12.9-18.4 13.6-7.5.8-15.7-1.4-24.7-6.6zm19.3-33.3c-5.1-3-9.5-4.6-12.9-4.9-3.5-.3-6.3 1.4-8.4 5.2-2.2 3.8-2.3 7.1-.3 10 2 2.9 5.6 5.8 10.7 8.8 5.1 3 9.5 4.6 13 4.9 3.5.3 6.4-1.4 8.6-5.2 2.2-3.7 2.2-7.1.2-9.9-2.2-3-5.8-5.9-10.9-8.9z"/>
      <path d="M471 221.1c.4 3.8-.2 7.2-1.7 10.1-1.5 2.9-3.8 5.3-6.8 7.1-3.7 2.2-7.3 2.9-10.8 2.2-3.4-.7-6.3-2.4-8.7-5l-.4.2c2.1 9.1-.3 15.7-7.2 19.7-3.3 1.9-6.7 2.8-10.2 2.7-3.5-.1-6.8-1.3-10-3.5s-6-5.4-8.5-9.7c-4-6.9-5.5-13.3-4.6-19.3.9-5.9 4.6-11 11.1-15.2l8.2 14.2c-2.5 1.6-4.1 3.5-4.7 5.7-.7 2.2-.3 4.6 1.2 7.2 1.2 2.1 2.8 3.4 4.7 3.9 1.9.5 3.8.2 5.7-.8 4.7-2.7 5-7.7.9-14.8l-1.6-2.7 11.3-6.5 1.5 2.6c3.6 6.5 7.6 8.4 12.1 5.8 2-1.1 3.1-2.5 3.6-4.3.4-1.7.1-3.5-1-5.4-1.2-2-2.8-3.3-4.8-3.7-2-.4-4.2-.1-6.5 1l-8.2-14.2c6.2-3.2 12-3.9 17.4-2.1 5.4 1.8 10 6 13.8 12.6 2.4 4.4 3.8 8.4 4.2 12.2z"/>
      <path d="M280.4 471.3l21.3-44.5h14.9l-21.5 43h25.2V481h-39.9v-9.7z"/>
  </g>
</svg>
  `;

export default generateD2017;