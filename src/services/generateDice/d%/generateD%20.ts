const generateDPercent20 = (
  fill: string,
  outline: string,
  viewBoxW: string = "462.52",
  viewBoxH: string = "448.62"
): string => `
<svg viewBox="0 0 ${viewBoxW} ${viewBoxH}">
<defs>
    <style>
        .cls-1{fill:#fff;stroke:${outline};stroke-miterlimit:10;stroke-width:12px}
    </style>
</defs>
<g>
    <path class="cls-1" d="M138.77 247.31 244.17 41.6a2.88 2.88 0 0 0-4.43-3.5L27 220.17a3.6 3.6 0 0 0-1.25 2.72v61.42a3.58 3.58 0 0 0 4.8 3.36L136.81 249a3.65 3.65 0 0 0 1.96-1.69zM363 247.31 257.9 42.15a3 3 0 0 1 4.62-3.65l212.27 181.67a3.6 3.6 0 0 1 1.25 2.72v61.42a3.57 3.57 0 0 1-4.8 3.36L365 249a3.58 3.58 0 0 1-2-1.69z" transform="translate(-19.74 -29.93)"/>
    <path class="cls-1" d="M140.78 243.37 245.36 39.26a6.12 6.12 0 0 1 10.9 0l104.58 204.11a6.12 6.12 0 0 1-2.39 8.1l-104.58 60.27a6.14 6.14 0 0 1-6.12 0l-104.57-60.27a6.14 6.14 0 0 1-2.4-8.1z" transform="translate(-19.74 -29.93)"/>
    <path class="cls-1" d="M246.37 471.92 26.73 291a2.72 2.72 0 0 1 .86-4.67l109.22-37a2.7 2.7 0 0 1 2.22.21l110.41 62.89a2.71 2.71 0 0 1 1.37 2.36v155.03a2.71 2.71 0 0 1-4.44 2.1zM255.63 471.92 475.27 291a2.72 2.72 0 0 0-.86-4.67l-109.22-37a2.7 2.7 0 0 0-2.22.21l-110.41 62.83a2.71 2.71 0 0 0-1.37 2.36v155.09a2.71 2.71 0 0 0 4.44 2.1z" transform="translate(-19.74 -29.93)"/>
</g>
<g id="face_20" data-name="face 20">
    <text transform="translate(172.31 210.62)" style="font-family:Poppins-Bold,Poppins;font-weight:700;font-size:96.29px">20</text>
    <text transform="matrix(.59 .3 -.31 .79 56.63 169.1)" style="font-size:67.49px;font-family:Poppins-Bold,Poppins;font-weight:700">00</text>
    <text transform="matrix(.72 -.34 .51 .86 347.72 194.62)" style="font-size:59.74px;font-family:Poppins-Bold,Poppins;font-weight:700">80</text>
    <text transform="matrix(-.97 0 .26 -.97 357.49 287.06)" style="font-size:76.51px;font-family:Poppins-Bold,Poppins;font-weight:700">70</text>
    <text transform="matrix(-.96 0 -.3 -.96 190.4 287.03)" style="font-size:77.36px;font-family:Poppins-Bold,Poppins;font-weight:700">10</text>
</g>
</svg>
  `;

export default generateDPercent20;
