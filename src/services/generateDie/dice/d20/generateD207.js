const generateD207 = (fill, outline, viewBoxW = "600", viewBoxH = "600") => {
  return `
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
        <path d="M328.4 287l-27.1 62.8h-18.9l27.4-60.7h-32.1v-15.7h50.7V287z"/>
        <path d="M219.9 108.9l3.4-11.1 17.5-2.5-13 42.4-11.6 1.6 9.6-31.3-5.9.9zm31.3 6c4.1-3.8 6.6-7.1 7.4-9.8.8-2.6.2-3.8-1.8-3.5-1.1.2-2.1.7-2.9 1.7-.8 1-1.5 2.5-2.2 4.7l-10.7 1.5c1.8-5.3 4.6-9.5 8.1-12.5 3.6-3 7.4-4.8 11.6-5.4 4.5-.6 7.5.1 9 2.2s1.6 5 .5 8.6c-1.2 3.9-3.7 7.9-7.4 11.9-3.8 4-7.9 7.6-12.6 10.6l14.3-2-2.9 9.5-28.7 4 2.7-8.8c6.2-4.6 11.5-8.9 15.6-12.7z"/>
        <path d="M332.4 100.6l-1.2-10.8 17.5 2.5 4.7 41.2-11.6-1.6-3.5-30.4-5.9-.9zm23.7 12.6c-.7-6.4 0-11.3 2.2-14.7 2.2-3.4 6.1-4.7 11.7-3.9 5.6.8 9.9 3.2 13 7.4 3.1 4.1 5 9.4 5.7 15.8.7 6.4 0 11.3-2.2 14.7-2.2 3.4-6.1 4.7-11.7 3.9-5.6-.8-9.9-3.2-13-7.4-3-4.1-4.9-9.4-5.7-15.8zm21.8 3c-.4-3.2-1-5.7-1.9-7.5-.9-1.8-2.5-2.9-4.7-3.2s-3.5.4-4.1 2c-.5 1.6-.6 4.1-.2 7.2.4 3.2 1 5.8 1.9 7.6.9 1.8 2.5 2.9 4.7 3.2s3.5-.4 4.1-2c.4-1.6.5-4 .2-7.3z"/>
        <path d="M175.7 471.4l-9.5 1.9-11.8-13.2 36.4-7.5 7.8 8.7-26.9 5.5 4 4.6zm-40.2-31.8c-.5-1.7-.3-3.1.6-4.2.9-1.1 2.3-1.9 4.2-2.3 2.4-.5 4.7-.4 7 .3s4.2 1.6 5.8 2.9h.2c-1.7-3.9-.4-6.3 3.9-7.2 2.2-.4 4.4-.4 6.8.1 2.4.5 4.7 1.4 7 2.7 2.3 1.3 4.4 3.1 6.3 5.2 3.2 3.5 4.6 6.6 4.4 9-.3 2.5-2.5 4.2-6.8 5.2l-7.3-8.1c3-.6 3.6-1.9 1.6-4.1-.7-.8-1.5-1.3-2.5-1.7-1-.3-2-.4-3-.2-1.2.3-1.8.8-1.8 1.6s.7 2 2 3.5l1.3 1.5-8.2 1.7-1.3-1.4c-1-1.1-2-2-3.2-2.6-1.1-.6-2.4-.8-3.8-.5-1.1.2-1.7.6-1.8 1.1-.2.5.1 1.1.7 1.9.7.8 1.6 1.3 2.7 1.6 1.1.3 2.2.3 3.4.1l7.2 8.1c-4.1.7-8 .3-11.8-1.1-3.8-1.4-7.1-3.8-10.1-7.1-1.8-2.3-3-4.2-3.5-6z"/>
        <path d="M94.1 331.9l5.2 16.4 4.6-3.2c-.8-.4-1.6-1-2.3-2-.7-1-1.3-2.2-1.8-3.7-.8-2.5-1-4.9-.7-7.3.3-2.3 1.1-4.4 2.2-6.2 1.2-1.8 2.6-3.3 4.3-4.5 3.2-2.2 6-2.8 8.6-1.6 2.5 1.1 4.5 3.8 5.9 8.1.9 3 1.4 5.9 1.3 8.6-.1 2.7-.6 5.2-1.7 7.3-1 2.1-2.5 3.8-4.3 5.1l-3.3-10.4c.6-.6 1.1-1.3 1.4-2.2.3-.9.3-1.9-.1-3.1-.4-1.3-1-2-1.8-2.2-.8-.2-1.8.1-2.8.8-1 .7-1.7 1.6-2 2.7-.3 1.1-.3 2.2.1 3.4.3.9.7 1.6 1.2 2 .5.4 1 .5 1.6.2l3.3 10.4-17.7 12.3-8.2-26.1 7-4.8z"/>
        <path d="M502.8 365.7c-1.3 1.3-2.6 1.8-4 1.6-1.4-.2-2.7-1-4.1-2.5-1.6-1.8-2.7-3.9-3.2-6.2-.6-2.3-.7-4.5-.4-6.4l-.1-.2c-2.6 3.4-5.3 3.5-8.2.2-1.5-1.6-2.6-3.6-3.4-5.9-.8-2.3-1.1-4.8-1.1-7.4s.5-5.3 1.4-8.1c1.5-4.5 3.4-7.3 5.6-8.3 2.3-1 4.9.1 7.9 3.3l-3.4 10.3c-2-2.3-3.4-2.1-4.4.6-.3 1-.4 2-.2 3s.6 1.9 1.3 2.7c.8.9 1.6 1.2 2.3.8.7-.4 1.4-1.6 2-3.5l.6-1.9 5.5 6.2-.6 1.8c-.5 1.4-.7 2.7-.7 4 0 1.3.5 2.5 1.4 3.5.7.8 1.3 1.1 1.9 1 .5-.1 1-.6 1.2-1.5.3-1 .3-2.1 0-3.1-.3-1.1-.9-2.1-1.6-3l3.4-10.3c2.6 3.2 4.3 6.7 5 10.7.7 4 .3 8.1-1.1 12.4-.6 3-1.7 5-3 6.2z"/>
        <path d="M457.9 435.5l8.2 3.9-12 13-31.5-14.7 7.9-8.6 23.3 10.9 4.1-4.5zm-39.7 18.8c-1 .2-1.9.8-2.7 1.7-1.2 1.3-1.3 2.5-.4 3.7.9 1.1 2.8 2.3 5.7 3.6-.6-.9-.7-2.1-.3-3.4.4-1.3 1.2-2.7 2.4-4.1 2.5-2.7 5.4-4.5 8.6-5.3s6.5-.4 9.9 1.2c2.2 1 3.7 2.3 4.5 3.9.9 1.6 1 3.4.4 5.4-.6 2-1.8 4.1-3.9 6.3-2.8 3-5.6 5-8.5 6.1-2.9 1.1-5.8 1.4-8.7 1-2.9-.4-6-1.4-9.3-2.9-5.8-2.7-9.3-5.5-10.8-8.5-1.4-3-.4-6.4 3.2-10.3 2-2.2 4.2-3.9 6.6-5 2.4-1.1 4.7-1.8 7.1-1.9 2.3-.1 4.4.2 6.3.9l-7.1 7.7c-1-.3-2.1-.4-3-.1zm13.3 11.9c1.1-.3 2.2-1 3.2-2 .9-1 1.4-1.9 1.3-2.8 0-.9-.6-1.6-1.8-2.1-1.1-.5-2.2-.6-3.4-.3-1.2.3-2.2 1-3.1 2-.9.9-1.3 1.9-1.3 2.8 0 .9.6 1.6 1.6 2.1 1.2.5 2.4.6 3.5.3z"/>
        <path d="M134.3 259.6l-13-7.5 14-24.3 57.5 33.2-8.8 15.3-44.5-25.7-5.2 9zm42.4-78.5l-15.6 27 11.6 6.7c-.6-1.9-.7-4.2-.2-6.7s1.5-5.1 2.9-7.6c2.3-4 5.1-6.9 8.4-8.6s6.7-2.4 10.4-2.1c3.6.4 7.2 1.5 10.6 3.5 6.3 3.6 10.2 8.3 11.7 14.1 1.5 5.8.4 12-3.5 18.7-2.6 4.5-5.7 8-9.1 10.5-3.5 2.5-7.1 3.8-10.9 4-3.8.2-7.6-.7-11.3-2.6l8.2-14.2c2 .8 4 .9 5.9.3 1.9-.6 3.5-2 4.8-4.2 1.5-2.5 1.8-4.9 1-7.1-.8-2.2-2.6-4-5.2-5.5-2.5-1.4-4.8-1.9-6.9-1.3-2.1.6-3.9 2.1-5.3 4.5-1.1 1.9-1.6 3.7-1.5 5.4.1 1.7.6 3.1 1.6 4.3l-8.1 14.1-34.8-20.1 23.2-40.2 12.1 7.1z"/>
        <path d="M430.6 182.3l13-7.5 14 24.3-57.5 33.2-8.8-15.3 44.5-25.7-5.2-9zm44.3 69.2l-60.1 6-8.7-15 58.6-4.9-14.7-25.4 11.9-6.9 23.3 40.3-10.3 5.9z"/>
        <path d="M314.3 468.3v12.1h-24v-53.6h15.1v41.5h8.9z"/>
    </g>
</svg>`;
};

module.exports = generateD207;
