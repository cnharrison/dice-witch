const generateD61 = (fill, outline, viewBoxW = "300", viewBoxH = "300") => {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxW} ${viewBoxH}">
    <g>
        <g fill="${fill}">
            <path d="M208.3 255H59.9c-7.4 0-13.4-6-13.4-13.4V93.1c0-7.4 6-13.4 13.4-13.4h148.4c7.4 0 13.4 6 13.4 13.4v148.4c.1 7.5-6 13.5-13.4 13.5z"/>
            <path d="M224.4 246.3l29.4-32.2c1.5-1.6 2.7-8.6 2.7-15.6V58.9c0-7-1.2-11.4-2.7-9.7l-29.4 32.2c-1.5 1.6-2.7 8.6-2.7 15.6v139.7c.1 6.8 1.3 11.2 2.7 9.6zm-18-166.4H64.9c-7.1 0-11.5-1.2-9.9-2.6l31.8-28.7c1.6-1.4 8.6-2.6 15.7-2.6h141.4c7.1 0 11.5 1.2 9.9 2.6L222 77.3c-1.5 1.4-8.6 2.6-15.6 2.6z"/>
        </g>
        <g fill="none" stroke="${outline}" stroke-width="12" stroke-miterlimit="10">
            <path d="M208.3 255H59.9c-7.4 0-13.4-6-13.4-13.4V93.1c0-7.4 6-13.4 13.4-13.4h148.4c7.4 0 13.4 6 13.4 13.4v148.4c.1 7.5-6 13.5-13.4 13.5z"/>
            <path d="M224.4 246.3l29.4-32.2c1.5-1.6 2.7-8.6 2.7-15.6V58.9c0-7-1.2-11.4-2.7-9.7l-29.4 32.2c-1.5 1.6-2.7 8.6-2.7 15.6v139.7c.1 6.8 1.3 11.2 2.7 9.6zm-18-166.4H64.9c-7.1 0-11.5-1.2-9.9-2.6l31.8-28.7c1.6-1.4 8.6-2.6 15.7-2.6h141.4c7.1 0 11.5 1.2 9.9 2.6L222 77.3c-1.5 1.4-8.6 2.6-15.6 2.6z"/>
        </g>
    </g>
    <g>
        <path d="M112.7 143.7v-18.1h32.4v80.1h-20.4v-62h-12z"/>
        <path d="M173.7 55c3 .4 5 .8 6.1 1.5 1.1.6 1.3 1.3.5 2.1-1 1-2.8 1.7-5.6 2.3-2.8.6-5.9.9-9.4 1.1l-.1.1c7.9.6 11 1.8 9.3 3.5-.8.8-2.5 1.6-4.9 2.3-2.4.7-5.5 1.2-9.2 1.5-3.7.4-7.9.5-12.6.5-7.6 0-13.2-.4-16.9-1.2s-4.8-2.1-3.5-3.8H143c-.5.7-.2 1.2.9 1.5s3.1.6 6 .6c2.3 0 4.3-.2 5.9-.5 1.6-.3 2.7-.7 3.2-1.2 1.2-1.2-2.1-1.8-10-1.8h-3l2.9-2.9h2.9c7 0 11.1-.5 12.3-1.7.5-.5.3-.9-.7-1.2-.9-.3-2.5-.4-4.5-.4-2.2 0-4.2.2-5.8.5-1.7.3-2.9.8-3.6 1.4h-15.6c1.9-1.5 5.2-2.7 10.1-3.6 4.9-.8 11-1.2 18.3-1.2 4.6.1 8.4.3 11.4.6z"/>
        <path d="M242 136.9c0-4.7-.8-6.5-2.3-5.5-.9.6-1.5 1.8-1.9 3.6-.4 1.9-.6 4.5-.7 7.9l-5.4 3.6c.1-7.4 1-13.5 2.5-18.2 1.5-4.7 3.5-7.9 5.9-9.4 2.5-1.6 4.3-1.2 5.6 1.2 1.3 2.5 1.9 6.3 1.9 11.6 0 5.9-.8 12.1-2.5 18.9-1.7 6.7-3.7 12.8-6.1 18.3l9-6v11.8l-16.2 10.8v-10.9c6.8-17.5 10.2-30.1 10.2-37.7z"/>
    </g>
</svg>
          `;
};

module.exports = generateD61;
