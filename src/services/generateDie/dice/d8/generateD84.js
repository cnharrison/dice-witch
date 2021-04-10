const generateD84 = (fill, outline, viewBoxW = "400", viewBoxH = "400") => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}">
  <g>
      <path fill="${fill}" d="M53.7 276.7l142-246c2-3.5 7-3.5 9 0l142 246c2 3.5-.5 7.8-4.5 7.8H58.3c-4.1 0-6.6-4.3-4.6-7.8zm296.4-167.4L208.8 27.8c-2.3-1.3-4.9 1.3-3.6 3.6l141.3 244.8c1.3 2.3 4.9 1.4 4.9-1.3V111.6c0-.9-.5-1.8-1.3-2.3zm-299.9 0l141.3-81.6c2.3-1.3 4.9 1.3 3.6 3.6L53.8 276.1c-1.3 2.3-4.9 1.4-4.9-1.3V111.6c0-.9.5-1.8 1.3-2.3zm3.5 177.9l142 84.5c2 1.2 7 1.2 9 0l142-84.5c2-1.2-.5-2.7-4.5-2.7H58.3c-4.1 0-6.6 1.5-4.6 2.7z"/>
      <path fill="none" stroke="${outline}" stroke-width="12" stroke-miterlimit="10" d="M53.7 276.7l142-246c2-3.5 7-3.5 9 0l142 246c2 3.5-.5 7.8-4.5 7.8H58.3c-4.1 0-6.6-4.3-4.6-7.8zm296.4-167.4L208.8 27.8c-2.3-1.3-4.9 1.3-3.6 3.6l141.3 244.8c1.3 2.3 4.9 1.4 4.9-1.3V111.6c0-.9-.5-1.8-1.3-2.3zm-299.9 0l141.3-81.6c2.3-1.3 4.9 1.3 3.6 3.6L53.8 276.1c-1.3 2.3-4.9 1.4-4.9-1.3V111.6c0-.9.5-1.8 1.3-2.3zm3.5 177.9l142 84.5c2 1.2 7 1.2 9 0l142-84.5c2-1.2-.5-2.7-4.5-2.7H58.3c-4.1 0-6.6 1.5-4.6 2.7z"/>
  </g>
  <g>
      <path d="M154.5 222.2v-18.6l41.9-57.5h23.9v56.7h11v19.3h-11V239h-22.4v-16.9h-43.4zm45.2-50.4l-22.6 31h22.6v-31z"/>
      <path d="M176 337.2l27.1-40.6h19l-27.4 39.2h32.2V346H176v-8.8z"/>
      <path d="M110.9 144.2l.1-34.2-9.5 9c1.1.5 1.9 1.8 2.5 3.9.6 2.1.9 4.8.9 7.9 0 5.1-.7 10-2.1 14.8-1.4 4.8-3.3 9.1-5.6 12.9-2.4 3.9-4.9 7.1-7.8 9.8-5.1 4.9-9.2 6.4-12.2 4.5-3-1.8-4.4-7-4.4-15.4 0-5.7.7-11.3 1.9-16.7 1.3-5.4 3-10.3 5.3-14.8 2.3-4.4 4.9-8.1 7.8-11.1l-.1 17.9c-1.5 1.8-2.7 3.9-3.7 6.5-1 2.5-1.5 5.2-1.5 8 0 3.2.6 5 1.9 5.4 1.3.4 3-.4 5.1-2.4 2-1.9 3.6-4.3 4.7-7 1.1-2.8 1.7-5.7 1.7-8.8 0-2.4-.3-4-.9-5-.6-1-1.5-1.3-2.5-.9v-17.8L121 83.9l-.1 50.8-10 9.5z"/>
      <path d="M296.2 137.5l-12.6-12.8.1-29.3 55.7 56.5-.1 18.5-43.1-43.7v10.8z"/>
  </g>
</svg>
`;

module.exports = generateD84;
