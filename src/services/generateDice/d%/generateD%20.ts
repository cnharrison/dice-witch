const generateDPercent20 = (
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
        <g transform="translate(172.31 210.62)">
            <path class="text" d="M3.755-13.192q3.274-2.6 2.985-2.407 9.437-7.8 14.829-12.807 5.488-5.007 9.244-10.495 3.755-5.489 3.755-10.688 0-3.948-1.83-6.163-1.829-2.215-5.488-2.215-3.659 0-5.777 2.793-2.022 2.696-2.022 7.703H3.563q.192-8.185 3.466-13.673 3.37-5.489 8.763-8.089 5.488-2.6 12.132-2.6 11.459 0 17.236 5.874 5.874 5.874 5.874 15.31 0 10.303-7.03 19.162-7.029 8.763-17.91 17.14h25.999V-.963H3.755Z"/>
            <path class="text" d="M59.315-36.109q0-16.562 6.355-26.094 6.451-9.533 20.702-9.533 14.251 0 20.606 9.533 6.452 9.532 6.452 26.094 0 16.755-6.452 26.287-6.355 9.533-20.606 9.533-14.25 0-20.702-9.533-6.355-9.532-6.355-26.287zm37.938 0q0-9.725-2.119-14.925-2.118-5.296-8.762-5.296t-8.762 5.296q-2.119 5.2-2.119 14.925 0 6.548.77 10.881.77 4.237 3.082 6.933 2.407 2.6 7.029 2.6t6.933-2.6q2.407-2.696 3.177-6.933.77-4.333.77-10.88z"/>
        </g>
        <g transform="matrix(.59 .3 -.61 .79 56.63 169.1)">
            <path class="text" d="M3.037-25.309q0-11.608 4.454-18.29 4.522-6.681 14.51-6.681 9.99 0 14.444 6.681 4.521 6.682 4.521 18.29 0 11.744-4.521 18.425Q31.99-.202 22.002-.202q-9.989 0-14.51-6.682-4.455-6.681-4.455-18.425Zm26.591 0q0-6.816-1.485-10.46-1.484-3.713-6.141-3.713T15.86-35.77q-1.485 3.645-1.485 10.461 0 4.59.54 7.627.54 2.97 2.16 4.859 1.687 1.822 4.927 1.822 3.24 0 4.859-1.822 1.687-1.89 2.227-4.86.54-3.036.54-7.626z"/>
            <path class="text" d="M47.04-25.309q0-11.608 4.455-18.29 4.522-6.681 14.51-6.681 9.989 0 14.443 6.681 4.522 6.682 4.522 18.29 0 11.744-4.522 18.425Q75.994-.202 66.005-.202q-9.988 0-14.51-6.682-4.455-6.681-4.455-18.425zm26.591 0q0-6.816-1.484-10.46-1.485-3.713-6.142-3.713t-6.141 3.712q-1.485 3.645-1.485 10.461 0 4.59.54 7.627.54 2.97 2.16 4.859 1.687 1.822 4.926 1.822 3.24 0 4.86-1.822 1.687-1.89 2.227-4.86.54-3.036.54-7.626z"/>
        </g>
        <g transform="matrix(.72 -.34 .51 .86 347.72 194.62)">
            <path class="text" d="M9.857-23.418q-5.615-2.987-5.615-9.38 0-3.225 1.672-5.854 1.673-2.688 5.078-4.241 3.405-1.613 8.364-1.613 4.958 0 8.304 1.613 3.405 1.553 5.078 4.241 1.672 2.629 1.672 5.855 0 3.226-1.553 5.615-1.493 2.39-4.062 3.764 3.226 1.553 4.958 4.301 1.733 2.689 1.733 6.333 0 4.241-2.151 7.348-2.15 3.046-5.855 4.66Q23.836.835 19.356.835T11.17-.777Q7.527-2.39 5.377-5.437q-2.151-3.106-2.151-7.347 0-3.704 1.732-6.393 1.733-2.748 4.9-4.241zm14.636-7.826q0-2.45-1.433-3.764-1.374-1.374-3.704-1.374t-3.764 1.374q-1.374 1.374-1.374 3.824 0 2.33 1.434 3.704 1.434 1.314 3.704 1.314 2.27 0 3.704-1.374 1.433-1.374 1.433-3.704zm-5.137 12.247q-2.808 0-4.54 1.553-1.733 1.493-1.733 4.182 0 2.509 1.673 4.122 1.732 1.613 4.6 1.613 2.867 0 4.48-1.613 1.673-1.613 1.673-4.122 0-2.629-1.732-4.182-1.673-1.553-4.421-1.553z"/>
            <path class="text" d="M41.4-22.403q0-10.275 3.943-16.189 4.002-5.914 12.844-5.914 8.841 0 12.784 5.914 4.003 5.914 4.003 16.19 0 10.394-4.003 16.309Q67.028-.18 58.187-.18q-8.842 0-12.844-5.914-3.943-5.915-3.943-16.31zm23.537 0q0-6.033-1.314-9.26-1.314-3.285-5.436-3.285t-5.437 3.286q-1.314 3.226-1.314 9.26 0 4.062.478 6.75.478 2.629 1.912 4.301 1.493 1.613 4.36 1.613 2.868 0 4.302-1.613 1.493-1.672 1.971-4.3.478-2.69.478-6.752z"/>
        </g>
        <g transform="matrix(-.97 0 .26 -.97 357.49 287.06)">
            <path class="text" d="M39.097-46.059 19.893 0H6.503l19.434-44.605H2.142v-11.17h36.955Z"/>
            <path class="text" d="M44.376-28.691q0-13.16 5.05-20.734Q54.551-57 65.875-57q11.323 0 16.372 7.575 5.126 7.574 5.126 20.734 0 13.312-5.126 20.887Q77.198-.23 65.875-.23t-16.45-7.574q-5.05-7.575-5.05-20.887zm30.145 0q0-7.728-1.683-11.86-1.684-4.207-6.963-4.207-5.28 0-6.962 4.208-1.684 4.131-1.684 11.859 0 5.202.613 8.645.612 3.367 2.448 5.51 1.913 2.065 5.585 2.065 3.673 0 5.509-2.066 1.913-2.142 2.525-5.509.612-3.443.612-8.645z"/>
        </g>
        <g transform="matrix(-.96 0 -.3 -.96 177.4 287.03)">
            <path class="text" d="M2.089-44.173v-12.3h21.428V0H9.747v-44.173z"/>
            <path class="text" d="M32.569-29.01q0-13.306 5.105-20.965 5.183-7.658 16.633-7.658 11.449 0 16.555 7.658 5.183 7.66 5.183 20.965 0 13.46-5.183 21.12Q65.756-.233 54.307-.233q-11.45 0-16.633-7.659-5.105-7.658-5.105-21.119Zm30.48 0q0-7.813-1.703-11.99-1.701-4.256-7.04-4.256-5.337 0-7.04 4.255-1.701 4.178-1.701 11.991 0 5.26.619 8.742.619 3.404 2.475 5.57 1.934 2.088 5.648 2.088 3.713 0 5.57-2.088 1.934-2.166 2.552-5.57.62-3.482.62-8.742z"/>
        </g>
    </g>
</svg>
`;

export default generateDPercent20;
