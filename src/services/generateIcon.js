const sharp = require("sharp");

const trashcan = `
<svg>
    <g class="fa-group">
        <path class="fa-secondary" fill="#777" d="M32 464a48 48 0 0 0 48 48h288a48 48 0 0 0 48-48V96H32zm272-288a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0zm-96 0a16 16 0 0 1 32 0v224a16 16 0 0 1-32 0z" opacity=".4"/>
        <path class="fa-primary" fill="#d8d8d8" d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM128 160a16 16 0 0 0-16 16v224a16 16 0 0 0 32 0V176a16 16 0 0 0-16-16zm96 0a16 16 0 0 0-16 16v224a16 16 0 0 0 32 0V176a16 16 0 0 0-16-16zm96 0a16 16 0 0 0-16 16v224a16 16 0 0 0 32 0V176a16 16 0 0 0-16-16z"/>
    </g>
</svg>
`;

const explosion = `
<svg>
    <path d="M94.632 36.003 300.171 193.53l41.846-148.914 59.076 151.375 163.693-141.53-88.616 183.374 140.308-4.923L525.4 347.367l121.846 78.764-145.23 2.462 128 153.836-183.385-84.918-19.692 164.913-89.846-132.915-125.539 171.066 12.308-214.14-171.077 34.46 107.077-140.3-87.384-142.76 121.846 23.384L94.632 36.003z" style="fill:red;stroke:none"/>
    <path d="m160.199 118.798 154.324 118.277 31.419-111.808 44.357 113.656L513.204 132.66l-66.535 137.68 105.347-3.696-68.383 85.935 91.485 59.139-109.043 1.848 96.106 115.505-137.69-63.759-14.786 123.821-67.46-99.796-94.257 128.442 9.24-160.783L128.78 482.87l80.397-105.34-65.611-107.19 91.485 17.558-74.851-169.1z" style="fill:#ff8000;stroke:none"/>
    <path d="m226.237 204.21 99.102 75.954 20.176-71.8L374 281.35l78.926-68.24-42.727 88.416 67.65-2.374-43.913 55.185 58.75 37.977-70.025 1.187 61.716 74.174-88.42-40.944-9.495 79.514-43.32-64.086-60.53 82.481 5.934-103.25-82.486 16.615 51.628-67.646-42.133-68.833 58.75 11.274-48.068-108.59z" style="fill:#ff0;stroke:none"/>
    <path d="M-57.96 305.26a30.912 30.912 0 1 1-61.825 0 30.912 30.912 0 1 1 61.824 0z" transform="translate(435.349 54.097)" style="fill:#000;fill-opacity:1;stroke:none"/>
</svg>
`;

const recycle = `
<svg>
    <path fill="#026921" d="M184.561 261.903c3.232 13.997-12.123 24.635-24.068 17.168l-40.736-25.455-50.867 81.402C55.606 356.273 70.96 384 96.012 384H148c6.627 0 12 5.373 12 12v40c0 6.627-5.373 12-12 12H96.115c-75.334 0-121.302-83.048-81.408-146.88l50.822-81.388-40.725-25.448c-12.081-7.547-8.966-25.961 4.879-29.158l110.237-25.45c8.611-1.988 17.201 3.381 19.189 11.99l25.452 110.237zm98.561-182.915 41.289 66.076-40.74 25.457c-12.051 7.528-9 25.953 4.879 29.158l110.237 25.45c8.672 1.999 17.215-3.438 19.189-11.99l25.45-110.237c3.197-13.844-11.99-24.719-24.068-17.168l-40.687 25.424-41.263-66.082c-37.521-60.033-125.209-60.171-162.816 0l-17.963 28.766c-3.51 5.62-1.8 13.021 3.82 16.533l33.919 21.195c5.62 3.512 13.024 1.803 16.536-3.817l17.961-28.743c12.712-20.341 41.973-19.676 54.257-.022zM497.288 301.12l-27.515-44.065c-3.511-5.623-10.916-7.334-16.538-3.821l-33.861 21.159c-5.62 3.512-7.33 10.915-3.818 16.536l27.564 44.112c13.257 21.211-2.057 48.96-27.136 48.96H320V336.02c0-14.213-17.242-21.383-27.313-11.313l-80 79.981c-6.249 6.248-6.249 16.379 0 22.627l80 79.989C302.689 517.308 320 510.3 320 495.989V448h95.88c75.274 0 121.335-82.997 81.408-146.88z"/>
</svg>
`;

const plus = `
<svg>
    <path fill="#66ff00" d="M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/>
</svg>
`;

const minus = `
<svg aria-hidden="true" data-prefix="fas" data-icon="minus" class="svg-inline--fa fa-minus fa-w-14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
    <path fill="#ce2029" d="M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z"/>
</svg>
`;

const bullseye = `
<svg>
    <g class="fa-group">
        <path class="fa-secondary" fill="#ce2029" d="M248 320a64.07 64.07 0 0 1-64-64c0-28.95 19.45-53.19 45.88-61.07L285 139.79l-2.12-6.38c-11.15-3.17-22.7-5.41-34.88-5.41a128 128 0 1 0 128 128c0-12.18-2.24-23.73-5.42-34.89l-6.37-2.11-55.14 55.14A63.85 63.85 0 0 1 248 320zm236.43-138.9-35.5 35.5a52.13 52.13 0 0 1-19.17 12.07c15.9 101.19-53.24 196.1-154.43 212s-196.1-53.25-212-154.43 53.25-196.1 154.43-212a185.71 185.71 0 0 1 57.88.05 52 52 0 0 1 11.76-19.22l35.5-35.5A247.87 247.87 0 0 0 248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248a247.87 247.87 0 0 0-11.57-74.9z" opacity=".4"/>
        <path class="fa-primary" fill="#87ceeb" d="M310 77.7 373.68 14a20.56 20.56 0 0 1 34 8l18.55 55.65 55.66 18.55a20.56 20.56 0 0 1 8 34L426.3 194a20.58 20.58 0 0 1-21 5l-49.7-16.57L265 273a24 24 0 0 1-34-34l90.59-90.59L305 98.71a20.58 20.58 0 0 1 5-21.01z"/>
    </g>
</svg>
`;

const star = `
<svg>
    <path fill="#FFD700" d="M259.3 17.8 194 150.2 47.9 171.5c-26.2 3.8-36.7 36.1-17.7 54.6l105.7 103-25 145.5c-4.5 26.3 23.2 46 46.4 33.7L288 439.6l130.7 68.7c23.2 12.2 50.9-7.4 46.4-33.7l-25-145.5 105.7-103c19-18.5 8.5-50.8-17.7-54.6L382 150.2 316.7 17.8c-11.7-23.6-45.6-23.9-57.4 0z"/>
</svg>
`;

const dizzyFace = `
<svg >
    <path fill="#ce2029" d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-33.8-217.9c7.8-7.8 7.8-20.5 0-28.3L196.3 192l17.9-17.9c7.8-7.8 7.8-20.5 0-28.3-7.8-7.8-20.5-7.8-28.3 0L168 163.7l-17.8-17.8c-7.8-7.8-20.5-7.8-28.3 0-7.8 7.8-7.8 20.5 0 28.3l17.9 17.9-17.9 17.9c-7.8 7.8-7.8 20.5 0 28.3 7.8 7.8 20.5 7.8 28.3 0l17.8-17.8 17.8 17.8c7.9 7.7 20.5 7.7 28.4-.2zm160-92.2c-7.8-7.8-20.5-7.8-28.3 0L328 163.7l-17.8-17.8c-7.8-7.8-20.5-7.8-28.3 0-7.8 7.8-7.8 20.5 0 28.3l17.9 17.9-17.9 17.9c-7.8 7.8-7.8 20.5 0 28.3 7.8 7.8 20.5 7.8 28.3 0l17.8-17.8 17.8 17.8c7.8 7.8 20.5 7.8 28.3 0 7.8-7.8 7.8-20.5 0-28.3l-17.8-18 17.9-17.9c7.7-7.8 7.7-20.4 0-28.2zM248 272c-35.3 0-64 28.7-64 64s28.7 64 64 64 64-28.7 64-64-28.7-64-64-64z"/>
</svg>
`;

const blank = `
<svg height="100" width="100">
</svg>
`;

const generateIcon = async (iconType) => {
  try {
    let image;
    switch (iconType) {
      case "trashcan":
        image = trashcan;
        break;
      case "explosion":
        image = explosion;
        break;
      case "recycle":
        image = recycle;
        break;
      case "plus":
        image = plus;
        break;
      case "minus":
        image = minus;
        break;
      case "bullseye":
        image = bullseye;
        break;
      case "star":
        image = star;
        break;
      case "dizzyFace":
        image = dizzyFace;
        break;
      default:
        image = blank;
        break;
    }
    const attachment = await sharp(new Buffer.from(image)).png().toBuffer();
    return attachment;
  } catch (err) {
    console.error(err);
  }
};

module.exports = generateIcon;
