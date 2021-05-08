const generateD101 = (
  fill: string,
  outline: string,
  viewBoxW: string = "500",
  viewBoxH: string = "500"
): string => `
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
        <path d="M232.3 178.6v-17.7H264v78.2h-19.9v-60.5h-11.8z"/>
        <path d="M166.1 362.4c1.6 1.4 3.4 2.1 5.4 2.1 3 0 4.5-1.7 4.4-5.2-.1-3.4-1.6-8.7-4.5-15.9.2 2.6-.6 4.7-2.1 6.2-1.6 1.5-3.8 2.3-6.6 2.3-5.2 0-10.1-1.9-14.6-5.8s-8.2-9.5-11.1-16.7c-1.8-4.6-2.6-8.6-2.5-12.1.1-3.5 1.3-6.3 3.4-8.2 2.2-2 5.3-2.9 9.4-2.9 8.1 0 14.8 3.1 20.3 9.3 5.5 6.2 10.4 14.7 14.7 25.6 5 12.6 7 21.9 6 27.8-.9 5.9-5.1 8.9-12.5 8.9-5.8 0-11-2-15.7-6.1s-8.3-9.2-11.2-15.5h12.5c1.6 2.7 3.1 4.8 4.7 6.2zm-5.7-39.4c-2.1-1.8-4.4-2.7-7-2.7-2.3 0-3.9.8-4.6 2.4s-.4 4 .8 7c1.2 3.1 2.8 5.4 4.8 7.1 2 1.6 4.2 2.5 6.5 2.5 2.2 0 3.8-.8 4.7-2.4.9-1.6.8-3.8-.4-6.7-1.2-3-2.8-5.4-4.8-7.2z"/>
        <path d="M329.3 354c-1.3 5.3-.1 7.9 3.6 7.9 2.1 0 3.8-.9 5.2-2.7 1.4-1.8 2.6-4.6 3.7-8.4h13c-2.4 8.3-6 14.5-10.8 18.7-4.8 4.2-10 6.3-15.8 6.3-6 0-10-1.9-12.1-5.6-2.1-3.7-2.4-8.6-.9-14.6 1.7-6.6 5.3-13.1 11-19.4 5.7-6.3 11.9-11.7 18.7-16.1h-21.8l3.3-13.3h39.3l-3.1 12.3c-20 14.7-31.2 26.3-33.3 34.9z"/>
        <path d="M151 176.7l-49.6 33.9-8.2-8.5 48.4-32.2-13.9-14.4 9.5-11.6 21.9 22.8-8.1 10z"/>
        <path d="M363.6 153.5c3.2-.4 6.3 0 9.3 1.1 2.9 1.2 5.5 3 7.8 5.4 2.8 3 4.3 6 4.5 8.9.2 2.9-.5 5.3-2.3 7.3l.3.3c7.5-2 13.8-.3 18.9 5.3 2.5 2.7 4.1 5.5 4.8 8.4.8 2.9.6 5.7-.6 8.4s-3.3 5.2-6.4 7.3c-5.1 3.5-10.3 5-15.7 4.5-5.4-.6-10.7-3.5-15.9-8.7l10.4-7.3c2 2 4 3.3 6.1 3.7 2.1.5 4.1.1 6-1.3 1.5-1.1 2.3-2.4 2.3-4s-.7-3.2-2.1-4.7c-3.5-3.8-7.9-3.9-13.1-.3l-2 1.4-8.4-9.2 1.9-1.3c4.8-3.2 5.5-6.6 2.1-10.3-1.5-1.6-3-2.5-4.6-2.8-1.6-.3-3.1 0-4.5 1-1.5 1-2.2 2.4-2.1 4.1.1 1.7.9 3.5 2.5 5.4l-10.4 7.3c-4.3-5.1-6.3-9.9-6-14.4.3-4.5 2.9-8.5 7.7-11.9 3.1-1.9 6.3-3.2 9.5-3.6z"/>
        <path d="M167.6 301.8h-44.3c-1.5 0-3.1-1.4-3.5-3.2l-.8-3.2c-.4-1.7.4-3.2 1.9-3.2h44.3c1.5 0 3.1 1.4 3.5 3.2l.8 3.2c.4 1.8-.4 3.2-1.9 3.2z"/>
    </g>
</svg>
`;

export default generateD101;