const generateDPercent10 = (
  fill: string,
  outline: string,
  viewBoxW: string = "462.52",
  viewBoxH: string = "448.62"
): string => `
<svg viewBox="0 0 ${viewBoxW} ${viewBoxH}">
    <defs>
        <style>
            .outline{fill:#fff;stroke:${outline};stroke-miterlimit:10;stroke-width:12px}
            .text{fill:#000;stroke:#000}
        </style>
    </defs>
    <g>
        <path class="outline" d="M138.77 247.31 244.17 41.6a2.88 2.88 0 0 0-4.43-3.5L27 220.17a3.6 3.6 0 0 0-1.25 2.72v61.42a3.58 3.58 0 0 0 4.8 3.36L136.81 249a3.65 3.65 0 0 0 1.96-1.69Z" transform="translate(-19.74 -29.93)"/>
        <path class="outline" d="M363 247.31 257.9 42.15a3 3 0 0 1 4.62-3.65l212.27 181.67a3.6 3.6 0 0 1 1.25 2.72v61.42a3.57 3.57 0 0 1-4.8 3.36L365 249a3.58 3.58 0 0 1-2-1.69Z" transform="translate(-19.74 -29.93)"/>
        <path class="outline" d="M140.78 243.37 245.36 39.26a6.12 6.12 0 0 1 10.9 0l104.58 204.11a6.12 6.12 0 0 1-2.39 8.1l-104.58 60.27a6.14 6.14 0 0 1-6.12 0l-104.57-60.27a6.14 6.14 0 0 1-2.4-8.1Z" transform="translate(-19.74 -29.93)"/>
        <path class="outline" d="M246.37 471.92 26.73 291a2.72 2.72 0 0 1 .86-4.67l109.22-37a2.7 2.7 0 0 1 2.22.21l110.41 62.89a2.71 2.71 0 0 1 1.37 2.36v155.03a2.71 2.71 0 0 1-4.44 2.1Z" transform="translate(-19.74 -29.93)"/>
        <path class="outline" d="M255.63 471.92 475.27 291a2.72 2.72 0 0 0-.86-4.67l-109.22-37a2.7 2.7 0 0 0-2.22.21l-110.41 62.83a2.71 2.71 0 0 0-1.37 2.36v155.09a2.71 2.71 0 0 0 4.44 2.1Z" transform="translate(-19.74 -29.93)"/>
    </g>
    <g>
        <g transform="translate(187.31 210.62)">
            <path class="text" d="M2.6-54.982v-15.31h26.672V0h-17.14v-54.982z"/>
            <path class="text" d="M40.538-36.109q0-16.562 6.355-26.094 6.452-9.533 20.703-9.533 14.25 0 20.606 9.533 6.451 9.532 6.451 26.094 0 16.755-6.451 26.287Q81.846-.289 67.596-.289q-14.251 0-20.703-9.533-6.355-9.532-6.355-26.287zm37.938 0q0-9.725-2.118-14.925-2.118-5.296-8.762-5.296t-8.763 5.296q-2.118 5.2-2.118 14.925 0 6.548.77 10.881.77 4.237 3.081 6.933 2.408 2.6 7.03 2.6 4.621 0 6.932-2.6 2.408-2.696 3.178-6.933.77-4.333.77-10.88z"/>
        </g>
        <g transform="matrix(.59 .3 -.61 .79 60.63 169.1)">
            <path class="text" d="M34.487-40.629 17.547 0H5.737l17.142-39.347H1.89V-49.2h32.598Z"/>
            <path class="text" d="M39.144-25.309q0-11.608 4.455-18.29 4.521-6.681 14.51-6.681 9.988 0 14.443 6.681 4.522 6.682 4.522 18.29 0 11.744-4.522 18.425Q68.097-.202 58.109-.202q-9.989 0-14.51-6.682-4.455-6.681-4.455-18.425zm26.591 0q0-6.816-1.485-10.46-1.484-3.713-6.141-3.713t-6.142 3.712q-1.484 3.645-1.484 10.461 0 4.59.54 7.627.54 2.97 2.16 4.859 1.686 1.822 4.926 1.822t4.86-1.822q1.686-1.89 2.226-4.86.54-3.036.54-7.626z"/>
        </g>
        <g transform="matrix(.72 -.34 .51 .86 347.72 194.62)">
            <path class="text" d="M33.395-34.709h-18.64v8.244q1.196-1.314 3.346-2.15 2.15-.837 4.66-.837 4.48 0 7.408 2.031 2.987 2.031 4.36 5.257 1.375 3.226 1.375 6.99 0 6.99-3.943 11.112Q28.018 0 20.849 0q-4.779 0-8.304-1.613-3.524-1.673-5.436-4.6-1.912-2.927-2.09-6.75h9.976q.358 1.851 1.732 3.106 1.374 1.195 3.764 1.195 2.808 0 4.182-1.792 1.374-1.793 1.374-4.78 0-2.927-1.434-4.48-1.434-1.553-4.182-1.553-2.031 0-3.345 1.015-1.315.956-1.733 2.569H5.496V-43.67h27.899Z"/>
            <path class="text" d="M41.52-22.403q0-10.275 3.942-16.189 4.003-5.914 12.844-5.914 8.842 0 12.785 5.914 4.002 5.914 4.002 16.19 0 10.394-4.002 16.309Q67.148-.18 58.306-.18q-8.841 0-12.844-5.914-3.943-5.915-3.943-16.31zm23.537 0q0-6.033-1.314-9.26-1.315-3.285-5.437-3.285t-5.436 3.286q-1.314 3.226-1.314 9.26 0 4.062.478 6.75.477 2.629 1.911 4.301 1.494 1.613 4.361 1.613 2.868 0 4.301-1.613 1.494-1.672 1.972-4.3.478-2.69.478-6.752z"/>
        </g>
        <g transform="matrix(-.97 0 .26 -.97 363.49 287.06)">
            <path class="text" d="M3.443-28.691q0-13.16 5.05-20.734Q13.619-57 24.943-57q11.323 0 16.372 7.575 5.127 7.574 5.127 20.734 0 13.312-5.127 20.887Q36.265-.23 24.942-.23T8.492-7.804q-5.049-7.575-5.049-20.887Zm30.145 0q0-7.728-1.683-11.86-1.684-4.207-6.963-4.207T17.98-40.55q-1.683 4.131-1.683 11.859 0 5.202.612 8.645.612 3.367 2.448 5.51 1.913 2.065 5.585 2.065 3.673 0 5.509-2.066 1.913-2.142 2.525-5.509.612-3.443.612-8.645z"/>
            <path class="text" d="M53.327-28.691q0-13.16 5.05-20.734Q63.503-57 74.827-57 86.15-57 91.2-49.425q5.126 7.574 5.126 20.734 0 13.312-5.126 20.887Q86.15-.23 74.827-.23q-11.324 0-16.45-7.574-5.05-7.575-5.05-20.887zm30.145 0q0-7.728-1.683-11.86-1.683-4.207-6.962-4.207-5.28 0-6.963 4.208-1.683 4.131-1.683 11.859 0 5.202.612 8.645.612 3.367 2.448 5.51 1.913 2.065 5.586 2.065 3.672 0 5.508-2.066 1.913-2.142 2.525-5.509.612-3.443.612-8.645z"/>
        </g>
        <g transform="matrix(-.96 0 -.3 -.96 189.4 287.03)">
            <path class="text" d="M3.017-10.598q2.63-2.089 2.398-1.934 7.581-6.266 11.914-10.29 4.41-4.022 7.426-8.431 3.017-4.41 3.017-8.587 0-3.172-1.47-4.951-1.47-1.78-4.41-1.78-2.939 0-4.64 2.244-1.625 2.166-1.625 6.189H2.862q.155-6.576 2.785-10.986 2.708-4.41 7.04-6.498 4.41-2.089 9.747-2.089 9.206 0 13.848 4.72Q41-48.274 41-40.692q0 8.277-5.647 15.394-5.648 7.04-14.39 13.77h20.888V-.774H3.017Z"/>
            <path class="text" d="M47.654-29.01q0-13.306 5.105-20.965 5.184-7.658 16.633-7.658 11.45 0 16.555 7.658 5.183 7.66 5.183 20.965 0 13.46-5.183 21.12Q80.84-.233 69.392-.233q-11.45 0-16.633-7.659-5.105-7.658-5.105-21.119Zm30.48 0q0-7.813-1.702-11.99-1.702-4.256-7.04-4.256T62.352-41Q60.65-36.823 60.65-29.01q0 5.26.62 8.742.618 3.404 2.475 5.57 1.934 2.088 5.647 2.088t5.57-2.088q1.934-2.166 2.553-5.57.619-3.482.619-8.742z"/>
        </g>
    </g>
</svg>
`;

export default generateDPercent10;
