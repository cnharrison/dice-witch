const generateD121 = (
  fill: string,
  outline: string,
  viewBoxW: string = "500",
  viewBoxH: string = "500"
): string => `
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
        <path d="M230.3 230.1V210h35.9v88.7h-22.6V230h-13.3z"/>
        <path d="M119.3 325.4l-9.2 3-38.2-20.6-5.5-17 28.1-9.1-2.6-7.9 9.6-3.1 2.6 7.9 8.4-2.7 5.2 16-8.4 2.7 10 30.8zm-35.4-24l20.6 11.1-5.2-16.1-15.4 5z"/>
        <path d="M240.8 433.4c-3.4-1.2-6-2.7-7.8-4.7-1.8-2-2.7-4.3-2.7-6.8 0-3.1 1.2-5.6 3.5-7.5 2.3-1.9 5.2-3.1 8.6-3.6v-.3c-8.9-2-13.3-5.8-13.3-11.6 0-2.8.9-5.2 2.7-7.3 1.8-2.1 4.5-3.8 7.9-5 3.5-1.2 7.6-1.8 12.5-1.8 7.9 0 14.2 1.4 18.8 4.1 4.6 2.7 7.2 6.8 7.5 12.4h-16.2c-.1-2.1-1-3.8-2.5-5s-3.8-1.8-6.8-1.8c-2.4 0-4.3.5-5.7 1.5-1.4 1-2.1 2.3-2.1 3.9 0 3.9 4.1 5.9 12.3 5.9h3.1v9.4h-3c-7.3-.1-11 1.7-11 5.5 0 1.6.6 2.9 1.9 3.8s3 1.3 5.1 1.3c2.3 0 4.2-.6 5.5-1.7 1.4-1.1 2.1-2.6 2.3-4.4h16.2c-.3 5.1-2.6 8.9-6.8 11.6-4.2 2.7-10.1 4.1-17.7 4.1-4.8-.3-8.9-.8-12.3-2z"/>
        <path d="M411.3 308.1c3.5 1.1 6-.5 7.4-4.9.8-2.5.8-4.5 0-6s-2.5-2.8-5-3.7l5-15.5c5.4 2.2 8.8 5.9 10.1 11.3 1.3 5.3.9 11.4-1.3 18.2-2.3 7.1-5.3 12-8.9 14.8-3.7 2.8-7.5 3.6-11.5 2.3-4.4-1.4-7.9-5.3-10.6-11.5-2.6-6.2-4.3-13.2-5-21l-8.4 25.8-8.9-2.9 15.2-46.6 8.2 2.7c3.4 22.8 8 35.1 13.7 37z"/>
        <path d="M360.5 110.3c-.5-1.6-1.7-3.1-3.7-4.5-3-2.2-5.9-2.8-8.6-1.8-2.7 1-5.5 3.6-8.3 7.7 2-.8 4.4-.9 7.2-.2s5.6 2.1 8.5 4.2c5.2 3.8 8.6 7.9 10 12.3 1.4 4.4.7 8.7-2.3 12.8-1.9 2.6-4.3 4.3-7.3 5.2-3 .9-6.4.8-10.1-.2-3.8-1-7.7-3.1-11.9-6.1-8.1-5.9-12.5-11.7-13-17.5-.6-5.8 1.4-11.7 5.9-17.9 5.2-7.2 10.7-11.2 16.4-12.2 5.8-1 12.4 1.2 19.8 6.7 5.9 4.3 9.5 8.7 10.9 13.2 1.4 4.5.9 8.7-1.3 12.5l-12.6-9.2c.8-1.7.9-3.4.4-5zm-26 15.2c.6 2 2.2 4 4.8 5.9 2.4 1.7 4.5 2.6 6.5 2.7 2 .1 3.6-.8 4.9-2.5s1.6-3.6.9-5.5c-.7-1.9-2.2-3.7-4.6-5.5-2.3-1.6-4.5-2.6-6.6-2.8-2.2-.2-3.9.5-5 2.1-1.2 1.7-1.5 3.6-.9 5.6z"/>
        <path d="M165.1 90l-25 18.2 5.7 7.8c.5-1.7 1.5-3.5 3.1-5.4 1.6-1.9 3.6-3.7 5.9-5.4 3.7-2.7 7.3-4.4 10.6-5.1 3.4-.7 6.3-.5 8.9.6 2.6 1.1 4.8 2.8 6.5 5.1 3.1 4.2 3.8 8.8 2.2 13.8-1.6 4.9-5.5 9.7-11.7 14.2-4.2 3.1-8.2 5.2-12.1 6.4-3.9 1.2-7.3 1.5-10.3.9s-5.5-2.1-7.4-4.5l13.1-9.6c1.2 1.1 2.6 1.5 4.4 1.5 1.8-.1 3.7-.8 5.7-2.3 2.4-1.7 3.7-3.5 4.2-5.4.4-1.9 0-3.8-1.3-5.5-1.2-1.7-2.8-2.5-4.7-2.5-1.9 0-4 .8-6.3 2.5-1.7 1.3-3 2.6-3.8 3.9-.8 1.4-1.1 2.6-.9 3.8l-13.1 9.5-17-23.4L159 82l6.1 8z"/>
        <path d="M344.6 163.1l-37.5-28.2c-1.8-1.4-2.2-4-.8-5.8l1.1-1.5c1.4-1.8 4-2.2 5.8-.8l37.5 28.2c1.8 1.4 2.2 4 .8 5.8l-1.1 1.5c-1.3 1.8-3.9 2.2-5.8.8z"/>
    </g>
</svg>
`;

export default generateD121;
