const generateD202 = (
  fill: string,
  outline: string,
  viewBoxW: string = "600",
  viewBoxH = "600"
) => `
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
      <path d="M310.4 296.6c0-5.8-2.5-8.8-7.6-8.8-2.9 0-4.9 1-6.3 3-1.3 2-2.1 5.1-2.2 9.3h-17.9c.4-9.2 3.2-16.1 8.3-20.8 5.1-4.6 11.6-7 19.5-7 8.2 0 14.4 2.1 18.6 6.2 4.2 4.1 6.3 9.5 6.3 16.2 0 7.3-2.8 14.5-8.5 21.6-5.6 7-12.4 13-20.2 17.8h29.9v14.8h-53.9v-13.7c22.7-16.2 34-29 34-38.6z"/>
      <path d="M217.5 109.3l3.4-11.1 17.5-2.5-13 42.4-11.6 1.6 9.6-31.3-5.9.9zm53.4-9.4l-17.1 2.4-2.1 6.8c1-.9 2.3-1.8 3.7-2.4 1.4-.7 2.9-1.1 4.4-1.3 2.6-.4 4.6 0 6 1 1.4 1 2.2 2.5 2.4 4.6.2 2-.1 4.3-.9 6.8-1.4 4.7-3.8 8.6-7.1 11.6s-7.2 4.8-11.6 5.5c-3.1.4-5.6.2-7.6-.6-1.9-.8-3.2-2.2-3.7-4.1-.6-1.9-.4-4.2.4-6.9l10.8-1.5c-.2 1-.1 1.8.3 2.4.4.6 1.2.9 2.4.7 1.3-.2 2.4-.8 3.4-1.8.9-1 1.6-2.3 2.1-3.9.5-1.5.5-2.6 0-3.3-.5-.7-1.3-1-2.6-.8-1 .1-1.8.5-2.6 1.1-.8.6-1.3 1.2-1.7 2l-10.8 1.5 8-26.3 27.1-3.8-3.2 10.3z"/>
      <path d="M374.4 104.7l-17.1-2.4.8 6.6c.7-.7 1.6-1.2 2.8-1.5 1.2-.3 2.6-.3 4.1-.1 2.6.4 4.9 1.3 6.8 2.8 1.9 1.5 3.4 3.3 4.5 5.5s1.8 4.5 2.1 7c.5 4.6-.3 8-2.5 10.2-2.2 2.3-5.5 3.1-9.9 2.4-3.1-.4-5.9-1.4-8.3-2.8-2.4-1.4-4.3-3.3-5.8-5.4-1.4-2.2-2.3-4.6-2.6-7.2l10.8 1.5c.2 1 .7 1.9 1.4 2.7.7.8 1.6 1.3 2.8 1.4 1.3.2 2.2-.1 2.8-1 .5-.8.7-2 .6-3.5-.2-1.5-.7-2.6-1.5-3.5-.8-.9-1.8-1.4-3.1-1.6-1-.1-1.7 0-2.3.4s-.9.9-.9 1.6l-10.8-1.5-2.9-25.6 27.1 3.8 1.1 10.2z"/>
      <path d="M159.9 462.1c-2.3-.5-4.7-1.5-7.2-2.9-2.5-1.5-4.8-3.4-6.9-5.7-2.1-2.4-3.4-4.5-3.9-6.3-.5-1.9-.3-3.4.5-4.5s2.1-1.9 3.9-2.2c1.8-.4 3.8-.4 5.7.1 2 .4 3.9 1.2 5.7 2.3-.9-3.5.8-5.7 5-6.5 2.5-.5 5.2-.4 7.9.2 2.7.7 5.3 1.8 7.8 3.4 2.5 1.6 4.7 3.5 6.6 5.6 1.9 2.1 3.2 4.2 3.9 6.2.7 2 .6 3.6-.3 5.1s-2.6 2.4-5.1 2.9c-4.2.9-8.6-.1-13.3-2.8.4 1.4.2 2.6-.5 3.6s-2 1.6-3.8 2c-1.7 0-3.7 0-6-.5zm2.5-9.7c.2-.6-.1-1.4-.9-2.2-.8-.8-1.7-1.5-2.8-1.8-1.1-.4-2.2-.4-3.4-.2-1.2.2-1.9.7-2.1 1.3-.2.7 0 1.4.8 2.2.7.8 1.7 1.4 2.8 1.8 1.2.4 2.3.5 3.5.2 1.2-.2 1.9-.7 2.1-1.3zm15.6-2.5c.2-.8-.2-1.8-1.2-2.9-1-1.1-2.2-1.9-3.5-2.4-1.4-.5-2.7-.6-3.9-.3-1.3.3-2 .8-2.2 1.7s.2 1.8 1.2 2.9c1 1.1 2.1 1.9 3.5 2.4s2.7.6 4 .4c1.1-.4 1.9-1 2.1-1.8z"/>
      <path d="M108.2 371.7l-7.4 5.2-5.4-16.9 28.5-19.9 3.5 11.1-21.1 14.7 1.9 5.8zm-.4-26.3c-4.4 3.1-8.3 4.3-11.7 3.5-3.4-.7-5.9-3.8-7.6-9.2-1.7-5.4-1.6-10.2.2-14.6s4.9-8.1 9.3-11.2c4.4-3.1 8.3-4.3 11.8-3.5 3.4.7 6 3.8 7.7 9.2s1.6 10.2-.2 14.6c-1.9 4.3-5 8.1-9.5 11.2zm-6.6-21c-2.2 1.5-3.8 3.1-4.8 4.6-1 1.5-1.2 3.4-.5 5.5s1.7 3.1 3.1 2.9c1.4-.1 3.2-1 5.4-2.5 2.2-1.6 3.8-3.1 4.8-4.6 1-1.5 1.2-3.4.5-5.5s-1.7-3.1-3.1-2.9c-1.3.1-3.1 1-5.4 2.5z"/>
      <path d="M507.2 324.1l6.4 7.3-5.5 16.8-24.6-27.8 3.6-11.1 18.2 20.5 1.9-5.7zm-3.8 29.6c.7 2.2 1.1 4.8 1 7.7s-.5 5.8-1.5 8.8c-1 3-2.2 5.2-3.5 6.6-1.4 1.4-2.8 2-4.1 1.8-1.4-.1-2.7-.9-3.9-2.2-1.3-1.4-2.2-3.1-2.8-5-.6-1.9-.9-3.9-.9-6.1-2.6 2.5-5.3 2.2-8.1-1.1-1.7-1.9-3-4.3-3.8-7-.8-2.7-1.1-5.5-1-8.5.1-3 .6-5.8 1.5-8.5s2-4.9 3.4-6.5c1.4-1.6 2.9-2.3 4.5-2.3s3.3 1 5.1 3c2.9 3.2 4.3 7.5 4.3 12.9 1-1 2.2-1.5 3.3-1.4 1.2.1 2.4.9 3.7 2.3 1.1 1.5 2.1 3.3 2.8 5.5zm-19.5-9.6c-.8.2-1.4 1-1.9 2.5-.5 1.4-.6 2.9-.3 4.3s.8 2.6 1.7 3.6c.9 1 1.7 1.4 2.5 1.1s1.4-1.1 1.9-2.5.5-2.8.3-4.2c-.2-1.4-.8-2.6-1.7-3.6-.9-1-1.8-1.4-2.5-1.2zm9.9 12.3c-.6.2-1.1.8-1.5 1.9s-.4 2.2-.2 3.3.7 2.2 1.5 3.1c.8.9 1.5 1.3 2.2 1.1.7-.1 1.2-.7 1.5-1.8.3-1 .4-2.2.1-3.3-.2-1.2-.8-2.2-1.6-3.1-.6-1-1.4-1.3-2-1.2z"/>
      <path d="M459.6 433.7l8.2 3.9-12 13-31.5-14.7 7.9-8.6 23.3 10.9 4.1-4.5zm-33.8 8.9l7.3 3.4 7.4 22-8.1 8.9-19-8.9-3 3.3-7.6-3.5 3-3.3-5.3-2.5 7.6-8.3 5.3 2.5 12.4-13.6zm3.6 21.9l-3.6-10.1-5.4 5.9 9 4.2z"/>
      <path d="M136.1 256.4l-13-7.5 14-24.3 57.5 33.2-8.8 15.3-44.5-25.7-5.2 9zm38.3-56.9c-4.4-2.6-7.8-1.8-10.1 2.2-1.3 2.3-1.5 4.4-.6 6.3.9 1.9 2.9 3.9 6.1 5.8l-8.2 14.2c-6.8-4.4-10.8-9.6-11.9-15.7-1.2-6.1 0-12.3 3.6-18.5 3.8-6.5 8.2-10.5 13.2-12 5.1-1.5 10.1-.8 15.1 2.1 5.6 3.2 9.7 8.6 12.5 16.2 2.8 7.6 4.2 15.5 4.3 23.9l13.7-23.7 11.2 6.5-24.7 42.8-10.4-6c-2-25.3-6.5-39.9-13.8-44.1z"/>
      <path d="M427.3 176.5l13-7.5 14 24.3-57.5 33.2-8.8-15.3 44.5-25.7-5.2-9zm29.5 32.9c3.4.2 6.8 1.5 10.2 3.9 3.4 2.4 6.4 5.9 9.1 10.5 2.7 4.7 4.3 9.1 4.6 13.3.4 4.1-.2 7.7-1.7 10.7-1.5 3-3.6 5.3-6.4 6.9-3 1.8-6 2.5-9 2.3-3-.2-5.9-1.4-8.6-3.6 1 8.4-1.9 14.6-8.7 18.5-3.9 2.3-7.8 3.2-11.8 2.7-4-.4-7.7-2-11.1-4.6-3.4-2.7-6.4-6.2-8.9-10.5s-4-8.6-4.6-13c-.6-4.3-.1-8.3 1.5-12 1.6-3.6 4.4-6.6 8.3-8.9 6.8-3.9 13.6-3.4 20.4 1.7-.5-3.5-.1-6.6 1.2-9.3 1.3-2.7 3.5-4.9 6.5-6.7 2.6-1.4 5.6-2.1 9-1.9zm-32.7 35.7c-.5 2.4.1 5 1.7 7.8 1.6 2.8 3.6 4.6 5.9 5.4 2.3.8 4.7.5 7.2-.9 2.4-1.4 3.9-3.3 4.3-5.8.4-2.5-.1-5-1.7-7.7-1.5-2.7-3.5-4.4-5.8-5.3-2.3-.9-4.7-.6-7.2.8s-3.9 3.3-4.4 5.7zm25.4-13.1c-.4 2 .1 4.1 1.4 6.4 1.3 2.3 2.9 3.7 4.9 4.4 1.9.7 4 .3 6.2-.9 2.2-1.3 3.5-2.9 3.9-5 .5-2.1.1-4.2-1.2-6.4s-2.9-3.6-5-4.3c-2-.6-4.1-.3-6.3.9-2.1 1.3-3.5 2.9-3.9 4.9z"/>
      <path d="M321.6 464.5c0 4.1 2 6.2 6 6.2 2.2 0 3.9-.7 4.9-2.1s1.6-3.6 1.7-6.6h14c-.3 6.5-2.5 11.4-6.6 14.7-4 3.3-9.1 4.9-15.3 4.9-6.4 0-11.3-1.5-14.6-4.4-3.3-2.9-4.9-6.7-4.9-11.4 0-5.2 2.2-10.3 6.6-15.3 4.4-5 9.7-9.2 15.9-12.6h-23.5v-10.5h42.4v9.7c-17.7 11.5-26.6 20.6-26.6 27.4zM300 454.2c0 8.3-1.9 14.9-5.6 19.8-3.8 4.9-9.8 7.3-18 7.3s-14.2-2.4-18-7.3c-3.8-4.9-5.7-11.5-5.7-19.8 0-8.4 1.9-15 5.7-19.9 3.8-4.9 9.8-7.4 18-7.4s14.2 2.5 18 7.4c3.8 4.9 5.6 11.5 5.6 19.9zm-32.9 0c0 4.8.6 8.5 1.9 11 1.3 2.6 3.7 3.8 7.4 3.8 3.8 0 6.3-1.3 7.6-3.9 1.3-2.6 1.9-6.2 1.9-11s-.6-8.5-1.9-11.1c-1.3-2.6-3.8-3.9-7.6-3.9-3.7 0-6.2 1.3-7.4 3.9-1.3 2.7-1.9 6.4-1.9 11.2z"/>
  </g>
</svg>`;

export default generateD202;