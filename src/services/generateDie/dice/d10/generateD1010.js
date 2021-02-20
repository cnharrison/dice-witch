const generateD1010 = (fill, outline, viewBoxW = "500", viewBoxH = "500") => {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}">
  <g>
    
      <g fill="${fill}">
          <path d="M138.8 247.3L244.2 41.6c1.4-2.8-2-5.5-4.4-3.5L27 220.2c-.8.7-1.3 1.7-1.3 2.7v61.4c0 2.5 2.5 4.2 4.8 3.4L136.8 249c.9-.3 1.6-.9 2-1.7zm224.2 0L257.9 42.1c-1.5-2.9 2.1-5.8 4.6-3.6l212.3 181.7c.8.7 1.3 1.7 1.3 2.7v61.4c0 2.5-2.5 4.2-4.8 3.4L365 249c-.9-.3-1.6-.9-2-1.7z"/>
          <path d="M140.8 243.4L245.4 39.3c2.3-4.4 8.6-4.4 10.9 0l104.6 204.1c1.5 2.9.4 6.5-2.4 8.1l-104.6 60.3a6.05 6.05 0 01-6.1 0l-104.6-60.3c-2.9-1.7-3.9-5.2-2.4-8.1z"/>
          <path d="M246.4 471.9L26.7 291c-1.6-1.4-1.2-4 .9-4.7l109.2-37.1c.7-.2 1.5-.2 2.2.2l110.4 62.9c.8.5 1.4 1.4 1.4 2.4v155.1c0 2.3-2.7 3.6-4.4 2.1zm9.2 0L475.3 291c1.6-1.4 1.2-4-.9-4.7l-109.2-37.1c-.7-.2-1.5-.2-2.2.2l-110.4 62.9c-.8.5-1.4 1.4-1.4 2.4v155.1c0 2.3 2.7 3.6 4.4 2.1z"/>
      </g>
      <g fill="none" stroke="${outline}" stroke-width="12" stroke-miterlimit="10">
          <path d="M138.8 247.3L244.2 41.6c1.4-2.8-2-5.5-4.4-3.5L27 220.2c-.8.7-1.3 1.7-1.3 2.7v61.4c0 2.5 2.5 4.2 4.8 3.4L136.8 249c.9-.3 1.6-.9 2-1.7zm224.2 0L257.9 42.1c-1.5-2.9 2.1-5.8 4.6-3.6l212.3 181.7c.8.7 1.3 1.7 1.3 2.7v61.4c0 2.5-2.5 4.2-4.8 3.4L365 249c-.9-.3-1.6-.9-2-1.7z"/>
          <path d="M140.8 243.4L245.4 39.3c2.3-4.4 8.6-4.4 10.9 0l104.6 204.1c1.5 2.9.4 6.5-2.4 8.1l-104.6 60.3a6.05 6.05 0 01-6.1 0l-104.6-60.3c-2.9-1.7-3.9-5.2-2.4-8.1z"/>
          <path d="M246.4 471.9L26.7 291c-1.6-1.4-1.2-4 .9-4.7l109.2-37.1c.7-.2 1.5-.2 2.2.2l110.4 62.9c.8.5 1.4 1.4 1.4 2.4v155.1c0 2.3-2.7 3.6-4.4 2.1zm9.2 0L475.3 291c1.6-1.4 1.2-4-.9-4.7l-109.2-37.1c-.7-.2-1.5-.2-2.2.2l-110.4 62.9c-.8.5-1.4 1.4-1.4 2.4v155.1c0 2.3 2.7 3.6 4.4 2.1z"/>
      </g>
  </g>
  <g>
      <path d="M201.7 178.6v-17.7h31.6v78.2h-19.9v-60.5h-11.7zm42.8 20.5c0-12.2 2.5-21.8 7.4-28.9 4.9-7.1 12.8-10.7 23.7-10.7 10.8 0 18.6 3.6 23.6 10.7s7.5 16.8 7.5 28.9c0 12.2-2.5 21.9-7.5 29.1-5 7.2-12.8 10.7-23.6 10.7s-18.7-3.6-23.7-10.7c-4.9-7.1-7.4-16.8-7.4-29.1zm43.4 0c0-7-.8-12.4-2.5-16.1-1.7-3.7-4.9-5.6-9.8-5.6s-8.3 1.9-10 5.6c-1.7 3.8-2.5 9.1-2.5 16 0 7 .8 12.4 2.5 16.2 1.7 3.8 5 5.7 10 5.7 4.9 0 8.1-1.9 9.8-5.7 1.7-3.7 2.5-9.1 2.5-16.1z"/>
      <path d="M151.7 362.1h24.8l-5.4-13.8c-.5 1.5-1.5 2.7-3.1 3.6-1.6.9-3.6 1.3-5.8 1.3-3.7 0-7.2-1-10.5-3s-6.2-4.7-8.7-8.1c-2.5-3.4-4.6-7.2-6.2-11.3-2.9-7.5-3.6-13.4-1.9-17.7 1.7-4.3 5.6-6.5 11.7-6.5 4.2 0 8.1.9 11.9 2.7 3.8 1.8 7.2 4.4 10.1 7.7 3 3.3 5.3 7.1 7.1 11.4h-13c-1.1-2.2-2.5-4-4.3-5.4-1.7-1.4-3.6-2.1-5.6-2.1-2.3 0-3.7.9-4.2 2.8-.4 1.9 0 4.3 1.2 7.4 1.2 3 2.7 5.2 4.6 6.8 1.9 1.6 3.9 2.4 6.2 2.4 1.7 0 3-.5 3.7-1.4.8-.9 1.1-2.1.9-3.6H178l16.2 41.3h-36.9l-5.6-14.5z"/>
      <path d="M329.3 354c-1.3 5.3-.1 7.9 3.6 7.9 2.1 0 3.8-.9 5.2-2.7 1.4-1.8 2.6-4.6 3.7-8.4h13c-2.4 8.3-6 14.5-10.8 18.7-4.8 4.2-10 6.3-15.8 6.3-6 0-10-1.9-12.1-5.6-2.1-3.7-2.4-8.6-.9-14.6 1.7-6.6 5.3-13.1 11-19.4 5.7-6.3 11.9-11.7 18.7-16.1h-21.8l3.3-13.3h39.3l-3.1 12.3c-20 14.7-31.2 26.3-33.3 34.9z"/>
      <path d="M98.8 187.2L106 176l40.1-19.3 10.1 8.9-22.1 34.3 4.7 4.1-7.5 11.7-4.7-4.1-6.6 10.2-9.5-8.3 6.6-10.2-18.3-16.1zm38.7-13.8l-21.6 10.4 9.5 8.4 12.1-18.8z"/>
      <path d="M345.8 173.4c-.6-2.8-.3-5.7 1-8.6 1.3-2.9 3.6-5.5 7-7.9 3.4-2.4 6.9-3.8 10.4-4.3 3.5-.4 6.8-.1 9.8 1.1 3 1.2 5.5 2.8 7.6 5.1 2.3 2.5 3.6 4.9 4.2 7.4.5 2.5.2 4.9-1.1 7.3 7.1-1.1 13.2 1.1 18.2 6.6 2.9 3.2 4.6 6.4 5.2 9.7.6 3.3.1 6.4-1.4 9.4-1.5 2.9-3.8 5.5-7 7.8-3.2 2.2-6.6 3.6-10.2 4.3-3.6.6-7.3.3-10.8-.9-3.6-1.2-6.8-3.4-9.7-6.6-5.1-5.5-6.2-11.2-3.4-17-2.9.5-5.7.3-8.4-.7s-5.1-2.7-7.4-5.2c-2.1-2.1-3.4-4.7-4-7.5zm21.4 5.3c1.8.3 3.6-.2 5.3-1.3 1.7-1.2 2.5-2.6 2.7-4.2.1-1.6-.7-3.3-2.3-5.1-1.6-1.8-3.4-2.8-5.3-3.1-1.9-.3-3.7.1-5.3 1.2s-2.5 2.6-2.5 4.3c-.1 1.7.7 3.4 2.3 5.2 1.5 1.7 3.3 2.7 5.1 3zm17.6 20.7c2.2.3 4.4-.2 6.4-1.7 2-1.4 3.1-3.1 3.3-5.1.1-2-.7-3.9-2.5-5.9s-3.9-3.1-6.1-3.4c-2.3-.3-4.4.3-6.3 1.6-2 1.4-3 3-3.2 5-.2 2 .6 4 2.4 5.9s3.7 3.3 6 3.6z"/>
  </g>
</svg>
        `;
};

module.exports = generateD1010;
