const generateD2016 = (
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
  <path d="M251.6 291.3v-17.1h30.6v75.7h-19.3v-58.5h-11.3zm76.7-3.2c-1.5-1.6-3.5-2.4-6.3-2.4-4.1 0-7.1 1.9-8.8 5.7-1.7 3.8-2.6 9.7-2.4 17.6 1.2-2.9 3.3-5.2 6.3-6.9 3-1.7 6.4-2.5 10.3-2.5 7.1 0 12.8 2.2 16.9 6.5 4.1 4.3 6.2 10.5 6.2 18.6 0 5.1-1 9.6-3.1 13.5-2.1 3.9-5.1 7-9.1 9.1-4 2.2-8.9 3.3-14.5 3.3-11.1 0-18.7-3.4-22.9-10.3-4.2-6.8-6.3-16.3-6.3-28.5 0-14 2.2-24.3 6.7-30.9 4.5-6.6 11.8-9.9 21.9-9.9 8 0 14.1 2.3 18.2 6.8s6.5 10.3 7 17.2h-17.1c-.5-3.1-1.5-5.4-3-6.9zM315 331.8c1.9 2 4.6 3 8.1 3 3.2 0 5.7-.9 7.5-2.7 1.8-1.8 2.7-4.4 2.7-7.8 0-3.4-.9-6-2.8-7.9-1.9-1.8-4.4-2.7-7.6-2.7-3.1 0-5.6.9-7.7 2.6-2.1 1.7-3.1 4.2-3.1 7.4.1 3.4 1.1 6 2.9 8.1z"/>
  <path d="M237 126.8c.4.6 1.2.9 2.4.7 1.8-.2 3.3-1.3 4.5-3.3 1.2-1.9 2.4-4.8 3.5-8.6-1.1 1.4-2.4 2.7-4.1 3.7-1.7 1-3.4 1.6-5.3 1.9-3.7.5-6.2-.3-7.6-2.4-1.4-2.1-1.4-5.4-.1-9.8.9-2.9 2.2-5.5 4.1-7.9 1.8-2.4 4-4.3 6.5-5.8s5.2-2.5 8.2-2.9c4-.6 6.9-.1 8.6 1.4 1.7 1.5 2.5 3.7 2.5 6.7-.1 3-.8 6.7-2.1 11.1-2.4 7.7-5.2 13.7-8.6 18-3.4 4.2-7.7 6.7-12.9 7.5-3 .4-5.3.1-7-.8-1.7-1-2.8-2.4-3.3-4.3s-.4-4.1.2-6.5l10.3-1.5c-.3 1.2-.2 2.2.2 2.8zm12.4-23.6c-.5-.7-1.5-1-3-.8-1.3.2-2.5.7-3.6 1.6-1 .9-1.8 2.1-2.3 3.7-.5 1.5-.4 2.6.2 3.3.6.7 1.5 1 2.9.8 1.3-.2 2.5-.7 3.5-1.6 1.1-.9 1.9-2.1 2.3-3.5.5-1.6.5-2.7 0-3.5z"/>
  <path d="M333.9 100.8L332.7 90l17.5 2.5 4.7 41.2-11.6-1.6-3.5-30.4-5.9-.9zm37.5 25.6c.7.8 1.7 1.3 2.8 1.4 1.8.2 2.9-.5 3.3-2.2s.5-4.4 0-8.1c-.5 1.2-1.4 2.1-2.7 2.7-1.3.6-2.9.7-4.8.5-3.7-.5-6.7-2.1-9.1-4.7-2.4-2.6-3.9-6.1-4.4-10.5-.3-2.8 0-5.2.9-7.2s2.3-3.4 4.3-4.3c2-.9 4.5-1.1 7.4-.7 4 .6 7.3 1.9 9.8 3.9 2.5 2.1 4.3 4.7 5.5 7.8 1.2 3.1 2.1 6.8 2.6 11.2.9 7.5.4 13-1.3 16.6-1.8 3.5-5.2 4.9-10.4 4.2-3-.4-5.6-1.4-7.8-2.9-2.3-1.5-4.1-3.4-5.4-5.6-1.4-2.2-2.2-4.5-2.7-6.8l10.3 1.5c.4 1.3 1 2.5 1.7 3.2zm2.8-21.4c-.9-.9-2-1.5-3.5-1.7-1.3-.2-2.4 0-3.1.7-.7.6-1 1.7-.8 3.2.2 1.4.7 2.6 1.6 3.5.9.9 2 1.5 3.4 1.6 1.3.2 2.3-.1 3-.7.8-.7 1.1-1.7.9-3.1-.1-1.4-.6-2.6-1.5-3.5z"/>
  <path d="M180.4 464.3c-5-1.7-8.6-2.3-10.9-1.9-2.3.5-2.7 1.4-1.4 2.9.8.8 1.7 1.4 2.8 1.6 1.1.2 2.6.2 4.5-.2l7.2 8.1c-4.7.8-9.1.3-13.2-1.3s-7.6-4-10.4-7.1c-3.1-3.4-4.3-6.1-3.7-8.2.6-2.1 2.5-3.4 5.6-4.1 3.4-.7 7.5-.4 12.4 1 4.9 1.3 9.7 3.2 14.5 5.7l-9.6-10.7 8.2-1.7 19.3 21.6-7.6 1.5c-6.8-3.1-12.7-5.5-17.7-7.2zM166 449.6c-5.7 1.2-11 1.1-16.1-.2s-9.5-4.1-13.3-8.3-4.9-7.6-3.3-10.3c1.5-2.7 5.1-4.6 10.7-5.7 5.7-1.2 11-1.1 16.2.2 5.1 1.3 9.6 4.1 13.3 8.3s4.9 7.6 3.3 10.3c-1.6 2.6-5.2 4.5-10.8 5.7zm-14.7-16.4c-2.8.6-4.7 1.3-5.8 2.2-1 .9-.8 2.1.6 3.7s3.2 2.6 5.2 2.8c2 .2 4.5.1 7.3-.5s4.8-1.3 5.8-2.2c1-.9.8-2.1-.6-3.7s-3.2-2.6-5.2-2.8c-2-.2-4.4-.1-7.3.5z"/>
  <path d="M108.5 372.6l-7.4 5.2-5.3-16.9 28.5-19.9 3.5 11.1-21.1 14.7 1.8 5.8zm9.2-33.7l-6.6 4.6-22.8-4.6-3.6-11.5 17.2-12-1.3-4.2 6.8-4.8 1.3 4.2 4.8-3.4L117 318l-4.8 3.4 5.5 17.5zM96.9 331l10.6 1.9-2.4-7.6-8.2 5.7z"/>
  <path d="M506 327.9l6.4 7.3-5.5 16.8-24.6-27.8 3.6-11.1 18.2 20.5 1.9-5.7zm-13.6 48.4l-15.5-35.8 3.6-10.9 14.6 35 4.9-15 5.8 6.6-8.4 25.8-5-5.7z"/>
  <path d="M458.9 434.4l8.2 3.9-12 13-31.5-14.7 7.9-8.6 23.3 10.9 4.1-4.5zm-22.6 13.5c4.9 2.3 7.9 5.1 8.9 8.4 1.1 3.3-.3 7-4.1 11.2-3.8 4.2-8.1 6.5-12.7 7.2-4.7.6-9.5-.2-14.3-2.5-4.9-2.3-7.9-5.1-8.9-8.4s.3-7.1 4.1-11.2c3.8-4.2 8-6.5 12.7-7.2 4.7-.6 9.5.2 14.3 2.5zm-14.8 16.2c2.4 1.1 4.6 1.7 6.4 1.8 1.8.1 3.5-.7 5-2.3 1.5-1.6 1.8-3 1-4.2s-2.5-2.3-4.9-3.5c-2.5-1.2-4.6-1.8-6.4-1.9-1.8-.1-3.5.7-5 2.3-1.5 1.6-1.8 3-1 4.2.8 1.2 2.5 2.4 4.9 3.6z"/>
  <path d="M158.6 211.8c-1.9.5-3.4 1.8-4.7 3.9-1.9 3.3-1.8 6.5.3 9.5 2.1 3.1 6.2 6.3 12.3 9.6-1.7-2.2-2.5-4.9-2.4-8 .1-3.1 1-6.2 2.8-9.3 3.3-5.7 7.5-9.2 12.7-10.6 5.2-1.4 10.8-.3 16.9 3.2 3.8 2.2 6.8 5 8.8 8.4 2 3.4 3 7.1 2.8 11.3-.2 4.2-1.6 8.5-4.2 12.9-5.1 8.8-11.2 13.3-18.3 13.7-7.1.3-15.3-2.2-24.5-7.5-10.6-6.1-17.4-12.4-20.4-18.9-3-6.5-2.1-13.7 2.5-21.8 3.7-6.3 8.2-10.2 13.5-11.5 5.3-1.3 10.7-.6 16.2 2l-7.8 13.6c-2.4-.8-4.6-1-6.5-.5zm27.1 29.7c2.4-.6 4.4-2.3 6-5.1 1.5-2.5 1.9-4.9 1.4-7.2-.5-2.2-2.1-4.1-4.7-5.6s-5-1.9-7.3-1.2c-2.2.7-4.1 2.3-5.6 4.8-1.4 2.4-1.9 4.9-1.5 7.3.4 2.4 1.8 4.3 4.2 5.7 2.7 1.5 5.1 1.9 7.5 1.3z"/>
  <path d="M471 221.1c.4 3.8-.2 7.2-1.7 10.1-1.5 2.9-3.8 5.3-6.8 7.1-3.7 2.2-7.3 2.9-10.8 2.2-3.4-.7-6.3-2.4-8.7-5l-.4.2c2.1 9.1-.3 15.7-7.2 19.7-3.3 1.9-6.7 2.8-10.2 2.7-3.5-.1-6.8-1.3-10-3.5s-6-5.4-8.5-9.7c-4-6.9-5.5-13.3-4.6-19.3.9-5.9 4.6-11 11.1-15.2l8.2 14.2c-2.5 1.6-4.1 3.5-4.7 5.7-.7 2.2-.3 4.6 1.2 7.2 1.2 2.1 2.8 3.4 4.7 3.9 1.9.5 3.8.2 5.7-.8 4.7-2.7 5-7.7.9-14.8l-1.6-2.7 11.3-6.5 1.5 2.6c3.6 6.5 7.6 8.4 12.1 5.8 2-1.1 3.1-2.5 3.6-4.3.4-1.7.1-3.5-1-5.4-1.2-2-2.8-3.3-4.8-3.7-2-.4-4.2-.1-6.5 1l-8.2-14.2c6.2-3.2 12-3.9 17.4-2.1 5.4 1.8 10 6 13.8 12.6 2.4 4.4 3.8 8.4 4.2 12.2z"/>
  <path d="M319.3 475.7c-1.6 2.3-4 4.1-7.3 5.5-3.2 1.4-7.1 2.1-11.7 2.1-4.7 0-8.6-.7-11.8-2.1-3.2-1.4-5.6-3.3-7.2-5.5s-2.4-4.7-2.4-7.3c0-2.8.7-5.2 2.2-7.2 1.5-2 3.6-3.5 6.4-4.6-6.7-2.7-10-7.2-10-13.6 0-3.6 1-6.8 3-9.4 2-2.6 4.8-4.6 8.2-5.9 3.4-1.3 7.3-2 11.6-2s8.1.7 11.6 2 6.2 3.3 8.2 5.9c2 2.6 3 5.7 3 9.4 0 6.4-3.3 10.9-10 13.6 2.8 1.1 4.9 2.6 6.4 4.6 1.5 2 2.2 4.4 2.2 7.2.1 2.6-.7 5-2.4 7.3zm-12.5-37.3c-1.6-1.3-3.8-2-6.5-2s-4.9.7-6.5 2c-1.6 1.3-2.4 3.1-2.4 5.4 0 2.3.8 4.1 2.5 5.3s3.8 1.9 6.4 1.9c2.6 0 4.8-.6 6.4-1.9 1.7-1.3 2.5-3.1 2.5-5.3 0-2.3-.8-4.1-2.4-5.4zm-1.1 23.1c-1.3-1.1-3.1-1.6-5.3-1.6-2.2 0-4 .5-5.3 1.6-1.3 1.1-2 2.7-2 4.7s.7 3.6 2 4.8c1.3 1.2 3.1 1.7 5.3 1.7 2.2 0 4-.6 5.3-1.7 1.3-1.2 2-2.8 2-4.8-.1-2.1-.7-3.7-2-4.7z"/>
  </g>
  </svg>
`;

export default generateD2016;