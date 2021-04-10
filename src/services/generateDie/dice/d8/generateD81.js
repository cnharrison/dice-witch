const generateD81 = (fill, outline, viewBoxW = "400", viewBoxH = "400") => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}">
  <g>
      <path fill="${fill}" d="M53.7 276.7l142-246c2-3.5 7-3.5 9 0l142 246c2 3.5-.5 7.8-4.5 7.8H58.3c-4.1 0-6.6-4.3-4.6-7.8zm296.4-167.4L208.8 27.8c-2.3-1.3-4.9 1.3-3.6 3.6l141.3 244.8c1.3 2.3 4.9 1.4 4.9-1.3V111.6c0-.9-.5-1.8-1.3-2.3zm-299.9 0l141.3-81.6c2.3-1.3 4.9 1.3 3.6 3.6L53.8 276.1c-1.3 2.3-4.9 1.4-4.9-1.3V111.6c0-.9.5-1.8 1.3-2.3zm3.5 177.9l142 84.5c2 1.2 7 1.2 9 0l142-84.5c2-1.2-.5-2.7-4.5-2.7H58.3c-4.1 0-6.6 1.5-4.6 2.7z"/>
      <path fill="none" stroke="${outline}" stroke-width="12" stroke-miterlimit="10" d="M53.7 276.7l142-246c2-3.5 7-3.5 9 0l142 246c2 3.5-.5 7.8-4.5 7.8H58.3c-4.1 0-6.6-4.3-4.6-7.8zm296.4-167.4L208.8 27.8c-2.3-1.3-4.9 1.3-3.6 3.6l141.3 244.8c1.3 2.3 4.9 1.4 4.9-1.3V111.6c0-.9-.5-1.8-1.3-2.3zm-299.9 0l141.3-81.6c2.3-1.3 4.9 1.3 3.6 3.6L53.8 276.1c-1.3 2.3-4.9 1.4-4.9-1.3V111.6c0-.9.5-1.8 1.3-2.3zm3.5 177.9l142 84.5c2 1.2 7 1.2 9 0l142-84.5c2-1.2-.5-2.7-4.5-2.7H58.3c-4.1 0-6.6 1.5-4.6 2.7z"/>
  </g>
  <g>
      <path d="M179.7 168.1v-20.8h37.1V239h-23.4v-71h-13.7z"/>
      <path d="M195.1 341.9c1.5.9 3.6 1.3 6.3 1.3 4.1 0 7.1-1.1 8.8-3.2 1.8-2.2 2.6-5.5 2.4-10-1.2 1.7-3.3 3-6.3 3.9-3 .9-6.4 1.4-10.3 1.4-7.1 0-12.8-1.2-16.9-3.7-4.1-2.4-6.2-5.9-6.2-10.5 0-2.9 1-5.4 3.1-7.6 2.1-2.2 5.1-3.9 9.2-5.2 4-1.2 8.9-1.8 14.5-1.8 11.1 0 18.7 1.9 22.9 5.8 4.2 3.9 6.3 9.2 6.3 16.1 0 7.9-2.3 13.7-6.8 17.5-4.5 3.7-11.8 5.6-22 5.6-8 0-14.1-1.3-18.2-3.8-4.1-2.6-6.5-5.8-7-9.7h17.2c.6 1.7 1.6 3 3 3.9zm13.4-24.7c-1.9-1.2-4.6-1.7-8.1-1.7-3.2 0-5.7.5-7.6 1.5s-2.7 2.5-2.7 4.4c0 1.9.9 3.4 2.8 4.4 1.9 1 4.4 1.5 7.6 1.5 3.1 0 5.6-.5 7.7-1.5s3.1-2.4 3.1-4.2c0-1.8-1-3.3-2.8-4.4z"/>
      <path d="M81.6 114.6l9.5-9 29.3 6.9-.1 19.8-29 27.4v9.1l-9.9 9.4v-9.1l-8.6 8.2.1-18.6 8.6-8.2.1-35.9zm25.6 13L91.4 124l-.1 18.7 15.9-15.1z"/>
      <path d="M288.6 135.9c-2.4-4.4-4.3-9.3-5.7-14.7-1.5-5.4-2.2-10.9-2.2-16.6 0-5.7.8-9.7 2.2-12.2 1.5-2.4 3.4-3.4 5.8-3 2.4.4 4.9 2 7.6 4.7 2.9 3 5.5 6.4 7.5 10.3 2.1 3.9 3.7 8.1 4.7 12.6 2.8-5.3 7.5-4.6 14.1 2.1 3.8 3.8 7 8.4 9.7 13.6 2.7 5.2 4.7 10.6 6.1 16.2 1.4 5.6 2.1 11.1 2 16.3 0 5.2-.7 9.2-2.1 12-1.4 2.8-3.5 4.1-6.2 3.8-2.7-.3-6-2.3-9.7-6.2-6.6-6.7-11.3-15.6-14.1-26.5-1.1 2.3-2.7 3.3-4.8 3-2.1-.3-4.6-2-7.5-5-2.6-2.5-5.1-6.1-7.4-10.4zm14.8-1.7c1.1-.5 1.7-2.1 1.7-4.8 0-2.7-.5-5.5-1.7-8.2-1.1-2.8-2.8-5.2-4.9-7.4-2.1-2.1-3.8-3-5-2.6-1.2.4-1.8 2-1.8 4.6 0 2.7.6 5.4 1.8 8.3 1.2 2.9 2.9 5.4 5 7.5 2.1 2.2 3.8 3 4.9 2.6zm24 25.7c1.4-.6 2.1-2.5 2.1-5.9 0-3.4-.7-6.7-2-10-1.4-3.3-3.2-6.2-5.6-8.6-2.4-2.4-4.2-3.3-5.6-2.6-1.3.7-2 2.6-2 5.8 0 3.2.7 6.5 2 9.9 1.3 3.4 3.2 6.3 5.5 8.7 2.4 2.4 4.2 3.3 5.6 2.7z"/>
      <path d="M231.4 304h-60.5c-1.6 0-2.9-1.4-2.9-3.2v-3.3c0-1.7 1.3-3.2 2.9-3.2h60.5c1.6 0 2.9 1.4 2.9 3.2v3.3c0 1.8-1.3 3.2-2.9 3.2z"/>
  </g>
</svg>
`;

module.exports = generateD81;
