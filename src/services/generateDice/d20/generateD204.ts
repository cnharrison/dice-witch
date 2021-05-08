const generateD204 = (
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
        <path d="M271.8 335.9v-15.3l34.6-47.4H326V320h9.1v15.9H326v13.9h-18.5v-13.9h-35.7zm37.2-41.5L290.4 320H309v-25.6z"/>
        <path d="M260.3 101.4l-17.1 2.4-2.1 6.8c1-.9 2.3-1.8 3.7-2.4s2.9-1.1 4.4-1.3c2.6-.4 4.6 0 6 1 1.4 1 2.2 2.5 2.4 4.6.2 2-.1 4.3-.9 6.8-1.4 4.7-3.8 8.6-7.1 11.6s-7.2 4.8-11.6 5.5c-3.1.4-5.6.2-7.6-.6-1.9-.8-3.2-2.2-3.7-4.1-.6-1.9-.4-4.2.4-6.9l10.8-1.5c-.2 1-.1 1.8.3 2.4.4.6 1.2.9 2.4.7 1.3-.2 2.4-.8 3.4-1.8.9-1 1.6-2.3 2.1-3.9.5-1.5.5-2.6 0-3.3-.5-.7-1.3-1-2.6-.8-1 .1-1.8.5-2.6 1.1-.8.6-1.3 1.2-1.7 2l-10.8 1.5 8-26.3 27.1-3.8-3.2 10.3z"/>
        <path d="M333.6 100.8L332.4 90l17.5 2.5 4.7 41.2-11.6-1.6-3.5-30.4-5.9-.9zm43.6-4.9c2.2 1.3 3.9 2.9 5.1 4.8 1.3 1.9 2 4 2.3 6.2.3 2.7-.1 4.7-1.2 6.2-1.1 1.4-2.5 2.2-4.2 2.4v.2c5 2.5 7.8 6.1 8.3 10.9.3 2.4 0 4.5-.9 6.2-.9 1.7-2.3 2.9-4.2 3.7-1.9.7-4.3.9-7.2.5-4.7-.7-8.6-2.4-11.6-5.1-3-2.7-4.8-6.6-5.6-11.6l10.8 1.5c.3 3.4 1.9 5.3 4.8 5.7 1 .1 1.8-.1 2.3-.7.5-.6.7-1.4.6-2.5-.2-1.4-.7-2.5-1.7-3.3-1-.8-2.5-1.4-4.5-1.7l-2-.3-1.1-9.3 1.9.3c1.5.2 2.6.1 3.6-.3.9-.4 1.3-1.4 1.1-3-.1-1.2-.5-2.1-1.2-2.8-.6-.7-1.4-1.1-2.3-1.2-1-.1-1.8.2-2.2.9s-.6 1.8-.6 3l-10.7-1.5c-.4-4.5.5-7.7 2.7-9.8 2.2-2 5.5-2.7 10-2.1 3.1.5 5.6 1.3 7.7 2.7z"/>
        <path d="M180.4 464.3c-5-1.7-8.6-2.3-10.9-1.9-2.3.5-2.7 1.4-1.4 2.9.8.8 1.7 1.4 2.8 1.6 1.1.2 2.6.2 4.5-.2l7.2 8.1c-4.7.8-9.1.3-13.2-1.3s-7.6-4-10.4-7.1c-3.1-3.4-4.3-6.1-3.7-8.2.6-2.1 2.5-3.4 5.6-4.1 3.4-.7 7.5-.4 12.4 1 4.9 1.3 9.7 3.2 14.5 5.7l-9.6-10.7 8.2-1.7 19.3 21.6-7.6 1.5c-6.8-3.1-12.7-5.5-17.7-7.2zM166 449.6c-5.7 1.2-11 1.1-16.1-.2s-9.5-4.1-13.3-8.3-4.9-7.6-3.3-10.3c1.5-2.7 5.1-4.6 10.7-5.7 5.7-1.2 11-1.1 16.2.2 5.1 1.3 9.6 4.1 13.3 8.3s4.9 7.6 3.3 10.3c-1.6 2.6-5.2 4.5-10.8 5.7zm-14.7-16.4c-2.8.6-4.7 1.3-5.8 2.2-1 .9-.8 2.1.6 3.7s3.2 2.6 5.2 2.8c2 .2 4.5.1 7.3-.5s4.8-1.3 5.8-2.2c1-.9.8-2.1-.6-3.7s-3.2-2.6-5.2-2.8c-2-.2-4.4-.1-7.3.5z"/>
        <path d="M107.5 341.1c-3.2-1.4-5.7-1.4-7.5-.2-1.8 1.2-2.4 2.8-1.8 4.7.3 1.1.9 1.7 1.7 1.7.8.1 1.9-.4 3.3-1.3l3.3 10.3c-3.6 2.3-6.8 2.7-9.4 1.2s-4.5-4.2-5.8-8.2c-1.4-4.4-1.6-8.2-.6-11.4s2.7-5.7 5.1-7.4c2.7-1.9 5.6-2.4 8.9-1.5 3.2.8 6.3 2.5 9.2 5l-4.3-13.7 6.4-4.5 8.7 27.6-5.9 4.1c-4.4-2.8-8.1-5-11.3-6.4z"/>
        <path d="M486.7 335.1c-.6.2-1.1.8-1.5 1.9-.6 1.7-.4 3.5.5 5.3.9 1.8 2.4 4 4.7 6.4-.6-1.5-.9-3.2-.9-5.1 0-1.9.3-3.7.8-5.5 1.2-3.5 2.8-5.5 4.8-6 2.1-.5 4.4.7 7 3.6 1.7 1.9 3 4.1 3.9 6.7.9 2.5 1.4 5.2 1.4 8.1s-.4 5.7-1.3 8.5c-1.3 3.9-2.8 6.3-4.5 7.3s-3.7.9-5.7-.3-4.4-3.2-7-6.1c-4.5-5.1-7.6-10-9.1-14.6-1.6-4.7-1.6-9.5.1-14.5.9-2.8 2.1-4.9 3.5-6 1.4-1.2 2.9-1.6 4.5-1.4 1.6.3 3.1 1.1 4.5 2.6l-3.4 10c-.9-.7-1.7-1-2.3-.9zm11.6 20.1c.7-.2 1.3-1 1.8-2.4.4-1.3.5-2.6.3-3.8-.2-1.3-.8-2.4-1.7-3.4-.9-1-1.7-1.3-2.4-1.1-.7.2-1.3 1-1.7 2.3-.4 1.2-.5 2.5-.3 3.8.2 1.3.7 2.5 1.6 3.4.9 1 1.7 1.4 2.4 1.2z"/>
        <path d="M439.8 458.2c1-.2 1.8-.7 2.6-1.6 1.2-1.3 1.4-2.5.5-3.7-.9-1.2-2.8-2.4-5.6-3.7.6.9.7 2.1.3 3.4-.4 1.3-1.2 2.7-2.4 4-2.5 2.7-5.4 4.5-8.6 5.3-3.3.8-6.6.4-9.9-1.2-2.2-1-3.7-2.3-4.5-3.9-.9-1.6-1-3.4-.4-5.4.6-2 1.8-4.1 3.9-6.3 4-4.3 8.2-6.7 12.6-7s9.1.7 14.2 3c4 1.9 6.9 3.8 8.6 5.7 1.8 1.9 2.5 4 2.2 6.2-.3 2.2-1.7 4.7-4.2 7.4-2.9 3.2-6.1 5.2-9.6 5.9-3.5.7-6.7.5-9.8-.6l7-7.7c1 .4 2.1.4 3.1.2zm-13.3-12c-1.2.3-2.2 1-3.2 2.1-.9 1-1.4 1.9-1.3 2.8s.7 1.5 1.8 2.1c1.1.5 2.3.6 3.4.3s2.2-1 3.1-2c.9-1 1.3-1.9 1.3-2.8 0-.9-.6-1.6-1.6-2.1-1.2-.6-2.4-.7-3.5-.4z"/>
        <path d="M134.2 259.7l-13-7.5 14-24.3 57.5 33.2-8.8 15.3-44.5-25.7-5.2 9zm13.8-42c-1.5-3-2.1-6.6-1.7-10.8.4-4.1 1.9-8.5 4.6-13.2 2.7-4.7 5.8-8.2 9.2-10.6 3.4-2.4 6.8-3.7 10.2-3.9 3.4-.2 6.4.5 9.2 2.1 3 1.8 5.2 4 6.5 6.7 1.3 2.7 1.7 5.8 1.2 9.3 6.8-5.1 13.6-5.7 20.4-1.7 3.9 2.3 6.7 5.2 8.3 8.9 1.6 3.7 2.1 7.6 1.6 11.9-.6 4.3-2.1 8.7-4.6 13-2.5 4.3-5.5 7.8-8.9 10.5-3.5 2.7-7.2 4.2-11.1 4.7-4 .4-7.9-.5-11.8-2.7-6.8-3.9-9.7-10.1-8.7-18.5-2.8 2.2-5.7 3.4-8.6 3.6-3 .2-6-.5-9-2.3-3.2-1.6-5.4-3.9-6.8-7zm23.2-5c1.9-.7 3.6-2.1 4.9-4.4 1.3-2.3 1.8-4.4 1.4-6.4-.4-2-1.7-3.6-3.9-4.9-2.2-1.3-4.3-1.6-6.3-.9-2 .6-3.7 2.1-5 4.3-1.3 2.2-1.7 4.4-1.2 6.4.5 2.1 1.8 3.7 3.9 5 2.2 1.2 4.2 1.6 6.2.9zm24 15.5c2.3-.8 4.3-2.6 5.9-5.4 1.6-2.8 2.2-5.4 1.7-7.8-.5-2.4-1.9-4.3-4.4-5.8s-4.8-1.7-7.2-.8c-2.3.9-4.3 2.6-5.8 5.3-1.5 2.7-2.1 5.2-1.7 7.7.4 2.5 1.8 4.4 4.3 5.8s4.9 1.8 7.2 1z"/>
        <path d="M434.4 188.8l13-7.5 14 24.3-57.4 33.2-8.8-15.3 44.5-25.7-5.3-9zm17.4 30.2l13-7.5 14 24.3-57.4 33.2-8.8-15.3 44.5-25.7-5.3-9z"/>
        <path d="M342.6 468.3v12.1h-24v-53.6h15.1v41.5h8.9zm-32.7-31.6v10.8l-27.2 33.6h-15.5V448h-7.1v-11.3h7.1v-9.9h14.5v9.9h28.2zm-29.3 29.4l14.6-18.1h-14.6v18.1z"/>
    </g>
</svg>`;

export default generateD204;
