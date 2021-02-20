const generateD127 = (fill, outline, viewBoxW = "500", viewBoxH = "500") => {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}">
  <g>

      <g fill="${fill}">
          <path d="M167.9 360.5l-48.8-150.1c-.7-2.1.1-4.4 1.9-5.7L248.6 112c1.8-1.3 4.2-1.3 6 0l127.7 92.8c1.8 1.3 2.6 3.6 1.9 5.7l-48.8 150.1c-.7 2.1-2.7 3.5-4.9 3.5H172.8c-2.3 0-4.2-1.4-4.9-3.6z"/>
          <path d="M50.9 189.4l-1.1 124.3c0 .8.2 1.6.7 2.2l71.8 100.7c1.5 2.1 4.5 2.1 6.1.1l39.6-51.6c.8-1 1-2.3.6-3.5l-49.9-153.5c-.4-1.1-1.3-2-2.4-2.4l-60.5-19.9c-2.4-.7-4.9 1.1-4.9 3.6zm401.9 0l1.1 124.3c0 .8-.2 1.6-.7 2.2l-71.8 100.7c-1.5 2.1-4.5 2.1-6.1.1l-39.6-51.6c-.8-1-1-2.3-.6-3.5L385 208.2c.4-1.1 1.3-2 2.4-2.4l60.5-19.9c2.4-.8 4.9 1 4.9 3.5z"/>
          <path d="M372.1 422.9l-117.9 39.4c-.8.3-1.6.3-2.3 0l-118-37.2c-2.4-.8-3.4-3.7-2-5.7l36.9-53.6c.7-1 1.9-1.6 3.1-1.6l161.4.1c1.2 0 2.3.6 3 1.5l37.6 51.4c1.6 1.9.6 4.9-1.8 5.7zm76.1-243.3L376 78.4c-.5-.6-1.1-1.1-1.9-1.4L256.8 37.8c-2.4-.8-6.6.9-6.7 3.5v65.1c0 1.2.5 2.4 1.6 3.2l130.6 94.9c1 .7 2.2.9 3.4.5l60.6-19.4c2.4-1 3.4-3.9 1.9-6z"/>
          <path d="M53.6 179.6l72.2-101.2c.5-.6 1.1-1.1 1.9-1.4L245 37.8c2.4-.8 6.6.9 6.7 3.5v65.1c0 1.2-.5 2.4-1.6 3.2l-130.6 94.9c-1 .7-2.2.9-3.4.5l-60.6-19.4c-2.4-1-3.3-3.9-1.9-6z"/>
      </g>
      <g fill="none" stroke="${outline}" stroke-width="12" stroke-miterlimit="10">
          <path d="M167.9 360.5l-48.8-150.1c-.7-2.1.1-4.4 1.9-5.7L248.6 112c1.8-1.3 4.2-1.3 6 0l127.7 92.8c1.8 1.3 2.6 3.6 1.9 5.7l-48.8 150.1c-.7 2.1-2.7 3.5-4.9 3.5H172.8c-2.3 0-4.2-1.4-4.9-3.6z"/>
          <path d="M50.9 189.4l-1.1 124.3c0 .8.2 1.6.7 2.2l71.8 100.7c1.5 2.1 4.5 2.1 6.1.1l39.6-51.6c.8-1 1-2.3.6-3.5l-49.9-153.5c-.4-1.1-1.3-2-2.4-2.4l-60.5-19.9c-2.4-.7-4.9 1.1-4.9 3.6zm401.9 0l1.1 124.3c0 .8-.2 1.6-.7 2.2l-71.8 100.7c-1.5 2.1-4.5 2.1-6.1.1l-39.6-51.6c-.8-1-1-2.3-.6-3.5L385 208.2c.4-1.1 1.3-2 2.4-2.4l60.5-19.9c2.4-.8 4.9 1 4.9 3.5z"/>
          <path d="M372.1 422.9l-117.9 39.4c-.8.3-1.6.3-2.3 0l-118-37.2c-2.4-.8-3.4-3.7-2-5.7l36.9-53.6c.7-1 1.9-1.6 3.1-1.6l161.4.1c1.2 0 2.3.6 3 1.5l37.6 51.4c1.6 1.9.6 4.9-1.8 5.7zm76.1-243.3L376 78.4c-.5-.6-1.1-1.1-1.9-1.4L256.8 37.8c-2.4-.8-6.6.9-6.7 3.5v65.1c0 1.2.5 2.4 1.6 3.2l130.6 94.9c1 .7 2.2.9 3.4.5l60.6-19.4c2.4-1 3.4-3.9 1.9-6z"/>
          <path d="M53.6 179.6l72.2-101.2c.5-.6 1.1-1.1 1.9-1.4L245 37.8c2.4-.8 6.6.9 6.7 3.5v65.1c0 1.2-.5 2.4-1.6 3.2l-130.6 94.9c-1 .7-2.2.9-3.4.5l-60.6-19.4c-2.4-1-3.3-3.9-1.9-6z"/>
      </g>
  </g>
  <g>
      <path d="M281 225.1l-31.8 73.7H227l32.1-71.2h-37.7v-18.5H281v16z"/>
      <path d="M98.4 352.4l-10.3 3.3-8.6-26.5 45.5-14.8 5.4 16.7-35.2 11.4 3.2 9.9zm.3-39.7c-7.1 2.3-13.4 2.1-18.8-.7-5.5-2.8-9.7-8.7-12.6-17.8-2.9-9-3-16.3-.2-21.8s7.7-9.4 14.8-11.7c7.1-2.3 13.4-2.1 19 .7 5.5 2.8 9.7 8.7 12.7 17.7 2.9 9.1 3 16.3.2 21.8-3 5.6-7.9 9.5-15.1 11.8zM87 276.4c-4.1 1.3-7 3-8.7 5.1-1.7 2.1-1.9 5.2-.6 9.2 1.3 4.1 3.3 6.6 6 7.3 2.6.7 6 .4 10-.9 4.1-1.3 7-3.1 8.7-5.2 1.7-2.1 2-5.3.6-9.4-1.3-4.1-3.3-6.4-6-7.1-2.6-.6-6-.3-10 1z"/>
      <path d="M252.6 394c-3.8 0-6.4 1.2-7.9 3.6-1.5 2.4-2.2 6.1-2.1 11.2 1.1-1.8 3-3.3 5.7-4.4 2.7-1.1 5.8-1.6 9.4-1.6 6.5 0 11.6 1.4 15.4 4.1s5.6 6.6 5.6 11.7c0 3.2-.9 6-2.8 8.5s-4.7 4.4-8.3 5.8c-3.7 1.4-8.1 2.1-13.2 2.1-6.9 0-12.4-1-16.2-3-3.9-2-6.6-4.8-8.1-8.3-1.5-3.5-2.2-7.7-2.2-12.6 0-8.7 1.9-15.2 5.7-19.7 3.8-4.4 10.2-6.7 19.1-6.7 4.9 0 9.2.7 12.7 2.1 3.5 1.4 6.3 3.2 8.2 5.5 1.9 2.3 3 4.8 3.3 7.6h-15.6c-1.1-3.9-3.9-5.9-8.7-5.9zm-6.3 29.1c1.7 1.3 4.2 1.9 7.4 1.9 2.9 0 5.2-.6 6.9-1.7 1.7-1.1 2.5-2.8 2.5-4.9 0-2.2-.8-3.8-2.5-5-1.7-1.2-4-1.7-6.9-1.7-2.8 0-5.1.6-7 1.7-1.9 1.1-2.8 2.7-2.8 4.7-.1 2.1.7 3.7 2.4 5z"/>
      <path d="M429.6 283.8c1.3 2.4 2 5.6 2.1 9.5 0 3.9-.8 8.4-2.4 13.5-1.7 5.1-3.7 9.3-6 12.4-2.4 3.2-4.8 5.3-7.3 6.4-2.5 1.1-4.8 1.3-7 .6-2.4-.8-4.2-2.2-5.4-4.4-1.2-2.2-1.7-4.9-1.6-8.3-4.7 6.6-9.7 9-15.1 7.3-3.1-1-5.4-3-6.9-5.9-1.5-2.9-2.2-6.5-2.1-10.7.1-4.2.9-8.6 2.5-13.4 1.5-4.7 3.5-8.8 5.9-12.2 2.4-3.5 5-5.9 8-7.4s5.9-1.8 9-.7c5.4 1.8 8 6.7 7.9 14.8 1.9-2.8 4-4.7 6.2-5.8 2.2-1.1 4.5-1.2 6.9-.4 2.2.7 4 2.3 5.3 4.7zm-36.1 3.5c-1.7 1.4-3 3.6-4 6.6-1 3-1.2 5.6-.7 7.7.5 2.1 1.8 3.5 3.7 4.1 1.9.6 3.7.2 5.4-1.3 1.7-1.5 3-3.6 3.9-6.5.9-2.9 1.2-5.4.7-7.6-.5-2.2-1.7-3.6-3.6-4.2-1.9-.6-3.7-.2-5.4 1.2zm19.2 7.6c-1.4 1.1-2.5 3-3.3 5.4-.8 2.5-1 4.6-.5 6.3.5 1.7 1.6 2.9 3.3 3.5 1.7.6 3.3.3 4.8-.9s2.6-2.9 3.4-5.3c.8-2.4.9-4.5.4-6.3-.5-1.8-1.6-3-3.3-3.5-1.8-.6-3.4-.3-4.8.8z"/>
      <path d="M319.3 82.8l6.4-8.8 22.5 16.4-28.1 38.7-14.2-10.3 21.8-29.9-8.4-6.1zm52.9 42.6c2.2-3 1.4-5.8-2.3-8.5-2.1-1.5-4-2.1-5.7-1.8-1.7.3-3.4 1.5-5.1 3.6l-13.1-9.6c3.7-4.5 8.4-6.5 13.9-6.2 5.5.4 11.1 2.7 16.9 6.9 6 4.4 9.8 8.8 11.3 13.1 1.5 4.3 1.1 8.2-1.4 11.6-2.7 3.8-7.5 5.9-14.2 6.5-6.8.6-13.9 0-21.5-1.7l22 16-5.5 7.6-39.8-28.9 5.1-7c22.7 3.8 35.8 3.3 39.4-1.6z"/>
      <path d="M119.9 125l-6.4-8.8L136 99.8l28.1 38.7-14.1 10.4-21.8-29.9-8.3 6zm28-20.3l-6.4-8.8L164 79.5l28.1 38.7-14.1 10.3-21.8-29.9-8.3 6.1z"/>
      <path d="M277.9 382.5h-51c-1.7 0-3.1-1.4-3.1-3.1v-1.8c0-1.7 1.4-3.1 3.1-3.1h51c1.7 0 3.1 1.4 3.1 3.1v1.8c0 1.7-1.4 3.1-3.1 3.1z"/>
  </g>
</svg>
                  `;
};

module.exports = generateD127;
