import { GenerateDieProps } from "../../../types";

const getFaces = (result: number) => {
  const faces = [
    ` <path class="text" d="M179.7 168.1v-20.8h37.1V239h-23.4v-71h-13.7z"/>
  <path class="text" d="M195.1 341.9c1.5.9 3.6 1.3 6.3 1.3 4.1 0 7.1-1.1 8.8-3.2 1.8-2.2 2.6-5.5 2.4-10-1.2 1.7-3.3 3-6.3 3.9-3 .9-6.4 1.4-10.3 1.4-7.1 0-12.8-1.2-16.9-3.7-4.1-2.4-6.2-5.9-6.2-10.5 0-2.9 1-5.4 3.1-7.6 2.1-2.2 5.1-3.9 9.2-5.2 4-1.2 8.9-1.8 14.5-1.8 11.1 0 18.7 1.9 22.9 5.8 4.2 3.9 6.3 9.2 6.3 16.1 0 7.9-2.3 13.7-6.8 17.5-4.5 3.7-11.8 5.6-22 5.6-8 0-14.1-1.3-18.2-3.8-4.1-2.6-6.5-5.8-7-9.7h17.2c.6 1.7 1.6 3 3 3.9zm13.4-24.7c-1.9-1.2-4.6-1.7-8.1-1.7-3.2 0-5.7.5-7.6 1.5s-2.7 2.5-2.7 4.4c0 1.9.9 3.4 2.8 4.4 1.9 1 4.4 1.5 7.6 1.5 3.1 0 5.6-.5 7.7-1.5s3.1-2.4 3.1-4.2c0-1.8-1-3.3-2.8-4.4z"/>
  <path class="text" d="M81.6 114.6l9.5-9 29.3 6.9-.1 19.8-29 27.4v9.1l-9.9 9.4v-9.1l-8.6 8.2.1-18.6 8.6-8.2.1-35.9zm25.6 13L91.4 124l-.1 18.7 15.9-15.1z"/>
  <path class="text" d="M288.6 135.9c-2.4-4.4-4.3-9.3-5.7-14.7-1.5-5.4-2.2-10.9-2.2-16.6 0-5.7.8-9.7 2.2-12.2 1.5-2.4 3.4-3.4 5.8-3 2.4.4 4.9 2 7.6 4.7 2.9 3 5.5 6.4 7.5 10.3 2.1 3.9 3.7 8.1 4.7 12.6 2.8-5.3 7.5-4.6 14.1 2.1 3.8 3.8 7 8.4 9.7 13.6 2.7 5.2 4.7 10.6 6.1 16.2 1.4 5.6 2.1 11.1 2 16.3 0 5.2-.7 9.2-2.1 12-1.4 2.8-3.5 4.1-6.2 3.8-2.7-.3-6-2.3-9.7-6.2-6.6-6.7-11.3-15.6-14.1-26.5-1.1 2.3-2.7 3.3-4.8 3-2.1-.3-4.6-2-7.5-5-2.6-2.5-5.1-6.1-7.4-10.4zm14.8-1.7c1.1-.5 1.7-2.1 1.7-4.8 0-2.7-.5-5.5-1.7-8.2-1.1-2.8-2.8-5.2-4.9-7.4-2.1-2.1-3.8-3-5-2.6-1.2.4-1.8 2-1.8 4.6 0 2.7.6 5.4 1.8 8.3 1.2 2.9 2.9 5.4 5 7.5 2.1 2.2 3.8 3 4.9 2.6zm24 25.7c1.4-.6 2.1-2.5 2.1-5.9 0-3.4-.7-6.7-2-10-1.4-3.3-3.2-6.2-5.6-8.6-2.4-2.4-4.2-3.3-5.6-2.6-1.3.7-2 2.6-2 5.8 0 3.2.7 6.5 2 9.9 1.3 3.4 3.2 6.3 5.5 8.7 2.4 2.4 4.2 3.3 5.6 2.7z"/>
  <path class="text" d="M231.4 304h-60.5c-1.6 0-2.9-1.4-2.9-3.2v-3.3c0-1.7 1.3-3.2 2.9-3.2h60.5c1.6 0 2.9 1.4 2.9 3.2v3.3c0 1.8-1.3 3.2-2.9 3.2z"/>
  `,
    `<path class="text" d="M210.3 174.6c0-7.1-3.1-10.6-9.2-10.6-3.5 0-6 1.2-7.6 3.6-1.6 2.4-2.5 6.2-2.7 11.3h-21.7c.5-11.2 3.9-19.5 10.1-25.2 6.2-5.6 14.1-8.4 23.6-8.4 9.9 0 17.4 2.5 22.5 7.5 5.1 5 7.6 11.5 7.6 19.6 0 8.9-3.4 17.6-10.2 26.1-6.8 8.5-15 15.7-24.5 21.6h36.2V238H169v-16.6c27.6-19.6 41.3-35.3 41.3-46.8z"/>
  <path class="text" d="M175.4 336.3h34.1v-9.9c-1.5 1.1-3.6 2-6.3 2.6-2.7.6-5.6.9-8.7.9-5.1 0-9.3-.7-12.8-2.2-3.4-1.5-6-3.4-7.6-5.8-1.6-2.4-2.5-5.1-2.5-8.1 0-5.4 2.3-9.6 7-12.7 4.6-3.1 11.2-4.7 19.6-4.7 5.7 0 10.7.7 14.9 2 4.2 1.3 7.5 3.1 9.8 5.5 2.3 2.4 3.5 5.1 3.6 8.2h-17.9c-.4-1.6-1.3-2.9-2.9-3.9-1.6-1-3.8-1.5-6.6-1.5-3.2 0-5.6.7-7.2 2-1.6 1.3-2.4 3.1-2.4 5.3 0 2.1.9 3.8 2.6 4.9 1.7 1.2 4.1 1.7 7.2 1.7 2.4 0 4.3-.3 5.9-1 1.6-.7 2.6-1.5 3.2-2.6h17.8v29.6h-50.7v-10.3z"/>
  <path class="text" d="M111.8 142.8l-38.9 9.7.1-19 37.6-8.1.1-32.2 9.8-9.2-.1 50.9-8.6 7.9z"/>
  <path class="text" d="M283.3 94.2c1.4-2.3 3.2-3.2 5.5-2.7s5 2.2 7.9 5.2c3.6 3.7 6.5 7.8 8.7 12.5 2.2 4.7 3.6 9.1 4.2 13.3l.4.4c2.3-7 6.8-7.2 13.5-.4 3.2 3.3 6.1 7.1 8.5 11.5 2.5 4.4 4.4 9.2 5.8 14.3 1.4 5.1 2.1 10.2 2.1 15.3 0 8.3-1.6 13.4-4.8 15.1-3.2 1.7-8-.5-14.4-6.7v-17.1c2.5 2.4 4.4 3.4 5.8 3.2 1.4-.2 2.1-1.9 2.1-5 0-2.5-.6-5.1-1.7-7.8-1.2-2.6-2.6-4.9-4.5-6.8-4.6-4.6-6.9-2.6-6.9 6v3.3l-11-11.1v-3.2c.1-7.6-2-13.6-6.4-18.1-1.9-1.9-3.4-2.7-4.4-2.4-1 .3-1.5 1.6-1.6 3.8 0 2.5.6 5.1 1.9 7.8 1.3 2.7 3 5.3 5.2 7.7v17.1c-5.9-6.3-10.4-13.3-13.5-20.9-3.1-7.6-4.7-15.5-4.7-23.5.2-4.9.9-8.6 2.3-10.8z"/>
  `,
    `<path class="text" d="M217.8 146.6c4.6 2.2 8.1 5.2 10.4 9.1 2.4 3.8 3.6 8.2 3.6 13 0 6-1.5 10.8-4.6 14.4-3.1 3.6-6.9 5.9-11.5 6.9v.6c11.8 3.8 17.8 11.2 17.8 22.2 0 5.3-1.2 10-3.6 14.1-2.4 4.1-5.9 7.3-10.6 9.6-4.6 2.3-10.2 3.4-16.7 3.4-10.6 0-18.9-2.6-25.1-7.8-6.2-5.2-9.5-13.1-10.1-23.7h21.7c.2 4.1 1.3 7.3 3.4 9.6s5.1 3.5 9.1 3.5c3.2 0 5.7-1 7.6-2.9 1.9-1.9 2.8-4.4 2.8-7.4 0-7.5-5.4-11.3-16.3-11.3h-4.2v-18h4c9.8.2 14.7-3.3 14.7-10.5 0-3.1-.8-5.5-2.5-7.2-1.7-1.7-4-2.5-6.8-2.5-3.1 0-5.6 1.1-7.4 3.2-1.8 2.1-2.9 5-3.1 8.5h-21.7c.4-9.7 3.5-17.1 9.1-22.3 5.6-5.2 13.5-7.8 23.6-7.8 6.3 0 11.8 1.1 16.4 3.3z"/>
  <path class="text" d="M225.7 341.1c-2.1 2.1-5.2 3.8-9.3 5.1-4.1 1.3-9.1 1.9-15 1.9s-11-.6-15.1-1.9c-4.1-1.3-7.2-3-9.2-5.1s-3.1-4.3-3.1-6.6c0-2.6.9-4.8 2.8-6.6 1.9-1.8 4.6-3.2 8.1-4.2-8.5-2.4-12.8-6.6-12.8-12.4 0-3.3 1.3-6.2 3.9-8.5s6.1-4.2 10.5-5.4c4.4-1.2 9.3-1.8 14.9-1.8 5.4 0 10.4.6 14.8 1.8 4.4 1.2 7.9 3 10.5 5.4s3.9 5.2 3.9 8.5c0 5.8-4.3 9.9-12.8 12.4 3.6 1 6.3 2.4 8.1 4.2 1.9 1.8 2.8 4 2.8 6.6.1 2.3-.9 4.6-3 6.6zm-15.9-34c-2-1.2-4.8-1.8-8.3-1.8-3.5 0-6.3.6-8.3 1.8-2 1.2-3.1 2.8-3.1 4.9 0 2.1 1.1 3.7 3.2 4.9 2.1 1.2 4.8 1.8 8.2 1.8 3.4 0 6.1-.6 8.2-1.8 2.1-1.2 3.2-2.8 3.2-4.9-.1-2.1-1.1-3.7-3.1-4.9zm-1.5 21.1c-1.7-1-3.9-1.5-6.8-1.5s-5.1.5-6.8 1.5c-1.7 1-2.5 2.4-2.5 4.3 0 1.8.9 3.3 2.6 4.4 1.7 1.1 4 1.6 6.8 1.6s5-.5 6.8-1.6 2.6-2.5 2.6-4.4c-.2-1.9-1.1-3.4-2.7-4.3z"/>
  <path class="text" d="M105.8 130.4c3.6-3.4 5.5-7.7 5.5-12.8 0-2.9-.6-4.4-1.8-4.5-1.2-.2-3.2.9-5.8 3.3l.1-17.9c5.7-5 10-6.2 12.9-3.8 2.9 2.4 4.3 7.6 4.3 15.5 0 8.2-1.3 15.7-3.9 22.3-2.6 6.6-5.9 11.9-10 15.8-4.6 4.3-9 5.7-13.4 4.2-4.3-1.5-8-4.8-11-9.9l-.1 30-9.2 8.7.2-54.2 8.5-8c9.9 13 17.8 16.9 23.7 11.3z"/>
  <path class="text" d="M289.9 111.9c-.9.5-1.4 2-1.4 4.6 0 4 1.1 7.9 3.4 11.8 2.3 3.9 5.8 8.1 10.6 12.6-1.8-2.9-3.1-6.2-4.1-10-1-3.8-1.5-7.6-1.5-11.4 0-6.8 1.3-11 3.9-12.4 2.6-1.4 6.3.2 11.2 4.9 3.1 3 5.8 6.6 8.1 10.9 2.4 4.3 4.2 9 5.5 14.1 1.3 5.1 1.9 10.4 1.9 15.8 0 10.6-2.1 15.9-6.2 16-4.1 0-9.9-3.5-17.2-10.6-8.4-8.2-14.6-16.4-18.6-24.5-4-8.2-5.9-17.1-5.9-26.8 0-7.7 1.4-12.2 4.1-13.5 2.7-1.3 6.2-.2 10.4 3.4v16.4c-1.8-1.4-3.2-1.8-4.2-1.3zm26.3 38.4c1.2-.6 1.8-2.6 1.9-6 0-3.1-.5-6-1.6-8.8-1.1-2.8-2.6-5.2-4.7-7.2s-3.6-2.6-4.7-1.9c-1.1.7-1.7 2.6-1.7 5.7 0 2.9.5 5.9 1.6 8.9 1 3 2.5 5.5 4.5 7.3 1.9 1.9 3.5 2.6 4.7 2z"/>
  <path class="text" d="M333.7 181.3l-.3-.1c-1.6-.6-2.6-2.1-2.6-3.7v-42.3c0-2.8 2.7-4.7 5.3-3.7l.3.1c1.6.6 2.6 2.1 2.6 3.7v42.3c0 2.7-2.7 4.6-5.3 3.7z"/>
    `,
    `<path class="text" d="M154.5 222.2v-18.6l41.9-57.5h23.9v56.7h11v19.3h-11V239h-22.4v-16.9h-43.4zm45.2-50.4l-22.6 31h22.6v-31z"/>
  <path class="text" d="M176 337.2l27.1-40.6h19l-27.4 39.2h32.2V346H176v-8.8z"/>
  <path class="text" d="M110.9 144.2l.1-34.2-9.5 9c1.1.5 1.9 1.8 2.5 3.9.6 2.1.9 4.8.9 7.9 0 5.1-.7 10-2.1 14.8-1.4 4.8-3.3 9.1-5.6 12.9-2.4 3.9-4.9 7.1-7.8 9.8-5.1 4.9-9.2 6.4-12.2 4.5-3-1.8-4.4-7-4.4-15.4 0-5.7.7-11.3 1.9-16.7 1.3-5.4 3-10.3 5.3-14.8 2.3-4.4 4.9-8.1 7.8-11.1l-.1 17.9c-1.5 1.8-2.7 3.9-3.7 6.5-1 2.5-1.5 5.2-1.5 8 0 3.2.6 5 1.9 5.4 1.3.4 3-.4 5.1-2.4 2-1.9 3.6-4.3 4.7-7 1.1-2.8 1.7-5.7 1.7-8.8 0-2.4-.3-4-.9-5-.6-1-1.5-1.3-2.5-.9v-17.8L121 83.9l-.1 50.8-10 9.5z"/>
  <path class="text" d="M296.2 137.5l-12.6-12.8.1-29.3 55.7 56.5-.1 18.5-43.1-43.7v10.8z"/>`,
    ` <path class="text" d="M232.9 164.6h-41.3v18.6c1.8-2.1 4.3-3.7 7.6-4.9 3.2-1.2 6.8-1.8 10.6-1.8 6.1 0 11.3 1.4 15.4 4.1 4.2 2.7 7.2 6.4 9.2 11 2 4.6 3 9.6 3 15.2 0 10-2.8 18-8.4 23.8-5.6 5.8-13.5 8.8-23.7 8.8-6.9 0-12.9-1.2-18-3.7s-9-5.9-11.8-10.3c-2.8-4.4-4.2-9.5-4.4-15.3h21.7c.4 2.9 1.6 5.4 3.6 7.3 1.9 1.9 4.6 2.9 8 2.9 3.9 0 6.8-1.3 8.8-3.8 1.9-2.5 2.9-5.8 2.9-10 0-4-1-7-3.1-9.2-2.1-2.2-5-3.2-8.7-3.2-2.9 0-5.2.6-7.1 1.9-1.9 1.3-3.2 2.9-3.9 4.9h-21.5v-55.5h61.4v19.2z"/>
  <path class="text" d="M194 331c0 3.8 2.5 5.7 7.6 5.7 2.9 0 5-.6 6.3-1.9 1.3-1.3 2.1-3.3 2.2-6H228c-.4 6-3.2 10.4-8.4 13.4-5.1 3-11.7 4.5-19.5 4.5-8.2 0-14.4-1.3-18.6-4-4.2-2.7-6.3-6.2-6.3-10.4 0-4.8 2.8-9.4 8.5-13.9 5.6-4.5 12.4-8.4 20.3-11.5h-29.9v-9.5h54v8.9C205.4 316.4 194 324.8 194 331z"/>
  <path class="text" d="M115.7 89.4c2 .2 3.6 1.8 4.8 4.7 1.2 2.9 1.8 7.4 1.8 13.2 0 5.9-.7 11.6-1.9 16.9-1.3 5.3-2.9 9.9-4.9 13.8-2 3.9-4.1 7-6.4 9.1-2.5 2.3-4.6 3.4-6.3 3.2-1.7-.2-3.1-1.7-4-4.4-2.4 10.7-6.3 18.7-11.9 24-3.2 3-5.9 4.3-8.2 3.9-2.3-.4-4-2.3-5.1-5.6-1.2-3.3-1.7-7.7-1.7-13.2 0-5.4.6-10.9 1.8-16.5 1.2-5.5 2.9-10.7 5.2-15.4 2.3-4.7 5-8.6 8.2-11.6 5.6-5.3 9.5-4.8 11.8 1.6.9-4.5 2.3-8.4 4-12 1.8-3.5 3.9-6.4 6.3-8.8 2.4-2.1 4.5-3.1 6.5-2.9zM83 136.2c-1.2 3.1-1.7 6.4-1.8 10 0 3.5.6 5.7 1.7 6.7s2.7.5 4.7-1.4 3.6-4.4 4.7-7.6c1.1-3.2 1.7-6.5 1.7-9.8 0-3.4-.5-5.6-1.7-6.6-1.1-1-2.7-.6-4.7 1.3-1.9 1.8-3.5 4.3-4.6 7.4zm20.2-17.6c-1 2.6-1.4 5.3-1.4 8.2 0 2.9.5 4.7 1.4 5.5.9.8 2.3.3 4.1-1.4 1.8-1.7 3.2-3.9 4.2-6.5 1-2.7 1.5-5.4 1.5-8.2 0-2.8-.5-4.6-1.5-5.3-1-.8-2.4-.3-4.2 1.4-1.8 1.6-3.2 3.7-4.1 6.3z"/>
  <path class="text" d="M329.1 183.7l-11.3-11.4-34.8-68.6.1-18.9 34.5 34.9V111l11.7 11.9v8.7l10.2 10.4v17.8l-10.2-10.4-.2 34.3zm-30.5-66.8l18.8 37V136l-18.8-19.1z"/>
  `,
    `  <path class="text" d="M209 164.2c-1.8-1.9-4.3-2.9-7.6-2.9-5 0-8.6 2.3-10.7 6.9-2.1 4.6-3.1 11.7-2.9 21.3 1.5-3.5 4-6.3 7.6-8.4 3.6-2 7.8-3 12.5-3 8.6 0 15.5 2.6 20.5 7.8 5 5.2 7.5 12.7 7.5 22.5 0 6.1-1.3 11.6-3.8 16.3-2.5 4.8-6.2 8.5-11.1 11.1-4.9 2.6-10.7 4-17.6 4-13.4 0-22.7-4.2-27.8-12.5-5.1-8.3-7.7-19.8-7.7-34.5 0-16.9 2.7-29.4 8.2-37.4 5.4-8 14.3-12 26.6-12 9.7 0 17 2.7 22.1 8.2 5 5.5 7.8 12.4 8.4 20.8h-20.8c-.5-3.5-1.6-6.3-3.4-8.2zm-16.2 53c2.2 2.5 5.5 3.7 9.9 3.7 3.9 0 6.9-1.1 9.1-3.2 2.2-2.2 3.3-5.3 3.3-9.5s-1.1-7.3-3.4-9.5-5.3-3.3-9.2-3.3c-3.7 0-6.8 1.1-9.3 3.2-2.5 2.1-3.8 5.1-3.8 9 .1 3.9 1.2 7.1 3.4 9.6z"/>
  <path class="text" d="M219.3 334.4v11.1h-30.7v-48.9h19.3v37.9h11.4z"/>
  <path class="text" d="M120.1 123c-1.1 4.9-2.7 9.2-4.7 13-2 3.8-4.2 6.9-6.7 9.3-3.1 2.9-5.5 3.9-7.4 3.2-1.9-.8-3-2.8-3.5-6.2l-.3.3c-2 11.7-5.8 20.1-11.4 25.5-2.7 2.6-5.1 3.8-7.2 3.8-2.1 0-3.7-1.4-4.9-4.1-1.2-2.7-1.7-6.8-1.7-12.1 0-8.7 1.4-16.9 4-24.6 2.7-7.6 6.7-14.2 12.2-19.8v17.9c-2.1 2.1-3.7 4.6-4.9 7.4-1.2 2.8-1.8 5.9-1.8 9.2 0 2.6.5 4.3 1.4 4.9 1 .6 2.2.2 3.8-1.3 3.8-3.6 5.8-10 5.8-19V127l9.2-8.7v3.3c-.1 8.2 1.7 10.5 5.3 7.1 1.6-1.5 2.8-3.4 3.7-5.6.9-2.2 1.3-4.5 1.3-6.9 0-2.6-.5-4.1-1.6-4.6s-2.5 0-4.3 1.5l.1-17.9c5-4.3 8.8-5.4 11.4-3.3 2.6 2.1 4 7.4 3.9 15.8 0 5.4-.5 10.4-1.7 15.3z"/>
  <path class="text" d="M293.2 92.8l46.2 72.9-.1 18.2-44.6-71.6-.1 30.8-11.6-11.8.1-48.6 10.1 10.1z"/>
  <path class="text" d="M234.8 263.7h-65c-2.9 0-5.2-2.3-5.2-5.2v-2c0-2.9 2.3-5.2 5.2-5.2h65c2.9 0 5.2 2.3 5.2 5.2v2c0 2.9-2.3 5.2-5.2 5.2z"/>
  <path class="text" d="M208.9 164c-1.8-1.9-4.3-2.9-7.6-2.9-5 0-8.6 2.3-10.7 6.9-2.1 4.6-3.1 11.7-2.9 21.3 1.5-3.5 4-6.3 7.6-8.4 3.6-2 7.8-3 12.5-3 8.6 0 15.5 2.6 20.5 7.8 5 5.2 7.5 12.7 7.5 22.5 0 6.1-1.3 11.6-3.8 16.3-2.5 4.8-6.2 8.5-11.1 11.1-4.9 2.6-10.7 4-17.6 4-13.4 0-22.7-4.2-27.8-12.5-5.1-8.3-7.7-19.8-7.7-34.5 0-16.9 2.7-29.4 8.2-37.4 5.4-8 14.3-12 26.6-12 9.7 0 17 2.7 22.1 8.2 5 5.5 7.8 12.4 8.4 20.8h-20.8c-.5-3.4-1.7-6.2-3.4-8.2zm-16.2 53c2.2 2.5 5.5 3.7 9.9 3.7 3.9 0 6.9-1.1 9.1-3.2 2.2-2.2 3.3-5.3 3.3-9.5s-1.1-7.3-3.4-9.5-5.3-3.3-9.2-3.3c-3.7 0-6.8 1.1-9.3 3.2-2.5 2.1-3.8 5.1-3.8 9 0 4 1.2 7.2 3.4 9.6z"/>
  <path class="text" d="M237.9 264.1h-71.5c-3.1 0-5.7-2.5-5.7-5.7v-2.2c0-3.1 2.5-5.7 5.7-5.7h71.5c3.1 0 5.7 2.5 5.7 5.7v2.2c0 3.2-2.5 5.7-5.7 5.7z"/>
  `,
    `  <path class="text" d="M232.1 162.9L199.3 239h-23l33.2-73.6h-38.9v-19.1h61.5v16.6z"/>
  <path class="text" d="M232.7 305.6v9.9l-34.6 30.7h-19.7V316h-9.1v-10.3h9.1v-9h18.5v9h35.8zm-37.3 26.8l18.7-16.5h-18.7v16.5z"/>
  <path class="text" d="M111.2 124.2c1-2.4 1.5-4.9 1.5-7.7 0-4.2-1.2-6-3.5-5.5-2.4.5-6 3.1-10.9 7.9 1.8-.5 3.2.2 4.3 2.2 1 2 1.5 5 1.5 8.9 0 7.2-1.4 14.1-4.1 20.8-2.7 6.7-6.5 12.4-11.5 17.1-3.1 3-5.9 4.6-8.4 4.8-2.4.2-4.3-1.1-5.6-3.8-1.3-2.8-2-7-2-12.6 0-11.1 2.2-20.8 6.4-29 4.3-8.2 10.1-15.9 17.7-23 8.7-8.2 15-12 19.1-11.3 4.1.6 6.1 6 6.1 16.2 0 8-1.4 15.4-4.3 22.3-2.8 6.8-6.4 12.5-10.7 17.1v-17.2c1.9-2.5 3.4-4.8 4.4-7.2zm-27.1 12.3c-1.3 3.1-1.9 6.4-1.9 10 0 3.2.5 5.2 1.6 6 1.1.8 2.7.2 4.8-1.8 2.1-2 3.8-4.5 4.9-7.4 1.1-2.9 1.7-6 1.7-9.2 0-3.1-.5-5.1-1.6-6.2-1.1-1.1-2.6-.6-4.6 1.2-2 1.8-3.7 4.3-4.9 7.4z"/>
  <path class="text" d="M300.2 117.3c-4.3-4.4-6.5-4.1-6.5.7 0 2.7.7 5.5 2.2 8.2 1.5 2.8 3.8 5.8 6.9 9.1v17.1c-6.8-7.3-11.9-15.1-15.3-23.5-3.4-8.4-5.1-16.3-5.1-23.9 0-7.9 1.6-12.3 4.6-13.2 3.1-.9 7 1.1 11.9 6.1 5.4 5.5 10.7 13.6 15.9 24.2 5.2 10.7 9.5 21.6 13.1 32.7l.1-28.6 10.9 11-.1 51.7-10.1-10.2c-12-33.8-21.4-54.3-28.5-61.4z"/>
  <path class="text" d="M65.3 184.3l.3-.1c1.6-.6 2.6-2.1 2.6-3.7v-42.3c0-2.8-2.7-4.7-5.3-3.7l-.3.1c-1.6.6-2.6 2.1-2.6 3.7v42.3c0 2.7 2.7 4.6 5.3 3.7z"/>
  `,
    `  <path class="text" d="M172 155.5c2.5-3.9 6.2-7 11.2-9.5 5-2.4 11-3.6 18.1-3.6 7.2 0 13.3 1.2 18.2 3.6 5 2.4 8.7 5.6 11.2 9.5 2.5 3.9 3.7 8 3.7 12.5 0 4.8-1.1 9-3.4 12.4-2.2 3.4-5.5 6-9.9 7.8 10.3 4.6 15.4 12.3 15.4 23.2 0 6.2-1.6 11.6-4.7 16-3.1 4.5-7.3 7.8-12.6 10.1s-11.3 3.4-18 3.4c-6.6 0-12.5-1.1-17.9-3.4-5.4-2.3-9.6-5.7-12.7-10.1-3.1-4.5-4.7-9.8-4.7-16 0-10.9 5.1-18.6 15.4-23.2-4.3-1.8-7.6-4.4-9.9-7.8-2.3-3.4-3.4-7.5-3.4-12.4.3-4.5 1.5-8.6 4-12.5zm19.3 63.8c2.5 2.3 5.8 3.4 10.1 3.4 4.2 0 7.6-1.1 10.1-3.4 2.5-2.2 3.7-5.3 3.7-9.2s-1.3-6.9-3.8-9.1c-2.6-2.2-5.9-3.3-9.9-3.3-4.1 0-7.4 1.1-9.9 3.3-2.6 2.2-3.8 5.3-3.8 9.1s1 7 3.5 9.2zm1.8-39.5c2 1.9 4.8 2.8 8.2 2.8 3.5 0 6.2-.9 8.2-2.8 2-1.9 3-4.6 3-8.1s-1-6.2-3.1-8.2c-2.1-2-4.8-3-8.2-3-3.4 0-6.1 1-8.2 3-2.1 2-3.1 4.7-3.1 8.2.1 3.6 1.2 6.3 3.2 8.1z"/>
  <path class="text" d="M187.8 345.9c-3.8-1.2-6.7-2.8-8.6-4.8-2-2.1-2.9-4.4-2.9-7 0-3.2 1.3-5.7 3.8-7.7 2.5-1.9 5.7-3.2 9.5-3.7v-.3c-9.8-2-14.7-6-14.7-11.8 0-2.8 1-5.3 3-7.5s4.9-3.9 8.7-5.1c3.8-1.2 8.4-1.8 13.8-1.8 8.7 0 15.6 1.4 20.7 4.2 5.1 2.8 7.9 7 8.3 12.7h-17.9c-.1-2.2-1.1-3.9-2.8-5.1-1.7-1.2-4.2-1.9-7.5-1.9-2.6 0-4.7.5-6.3 1.5-1.5 1-2.3 2.3-2.3 3.9 0 4 4.5 6 13.5 6h3.4v9.6h-3.3c-8.1-.1-12.1 1.8-12.1 5.6 0 1.7.7 2.9 2.1 3.8 1.4.9 3.3 1.3 5.6 1.3 2.6 0 4.6-.6 6.1-1.7s2.4-2.6 2.6-4.5h17.9c-.4 5.2-2.9 9.1-7.5 11.9-4.6 2.8-11.2 4.2-19.5 4.2-5.2-.1-9.8-.7-13.6-1.8z"/>
  <path class="text" d="M109.2 101.9l10.6-10-.1 30.7L72.8 167l.1-19.3 36.3-34.3v-11.5z"/>
  <path class="text" d="M294.2 93.3l-.1 32.6 11.3 11.4c-1.3-2.7-2.2-5.7-2.9-9-.7-3.3-1-6.4-1-9.4 0-4.9.9-8.1 2.5-9.7 1.7-1.6 3.9-1.8 6.7-.5 2.8 1.3 5.9 3.6 9.2 7 6.1 6.2 10.9 13.3 14.4 21.3s5.3 16.1 5.3 24.2c0 5.5-.8 9.5-2.3 12-1.5 2.5-3.6 3.5-6.3 3-2.7-.5-5.8-2.5-9.3-5.9v-17.1c1.8 1.5 3.3 2 4.4 1.7 1.2-.4 1.7-1.9 1.8-4.6 0-3.1-.7-6.2-2.3-9.2-1.5-3.1-3.5-5.9-6.1-8.5-2.4-2.5-4.3-3.5-5.6-3.2-1.3.3-2 1.9-2 4.9 0 2.3.4 4.5 1.1 6.8.8 2.3 1.7 4.3 2.9 6.1v17L282.2 130l.1-48.5 11.9 11.8z"/>`,
  ];
  return `<g>${faces[result - 1]}</g>`;
};

const generateD8 = ({
  result,
  textColor,
  outlineColor,
  solidFill,
  patternFill,
  borderWidth = "6px",
  viewBoxW = "400",
  viewBoxH = "400",
}: GenerateDieProps) => {
  const faces = getFaces(result);
  return `
  <svg viewBox="0 0 ${viewBoxW} ${viewBoxH}">
    <defs>
 ${patternFill?.string ?? ""}
    <style>
    .outline{fill:${`url(#${patternFill?.name})` ?? solidFill
    };stroke:${outlineColor};stroke-miterlimit:10;stroke-width:${borderWidth}}
  .text{fill:${textColor};stroke:${textColor}}
    </style>
    </defs>
  <g>
      <path class="outline" d="M53.7 276.7l142-246c2-3.5 7-3.5 9 0l142 246c2 3.5-.5 7.8-4.5 7.8H58.3c-4.1 0-6.6-4.3-4.6-7.8zm296.4-167.4L208.8 27.8c-2.3-1.3-4.9 1.3-3.6 3.6l141.3 244.8c1.3 2.3 4.9 1.4 4.9-1.3V111.6c0-.9-.5-1.8-1.3-2.3zm-299.9 0l141.3-81.6c2.3-1.3 4.9 1.3 3.6 3.6L53.8 276.1c-1.3 2.3-4.9 1.4-4.9-1.3V111.6c0-.9.5-1.8 1.3-2.3zm3.5 177.9l142 84.5c2 1.2 7 1.2 9 0l142-84.5c2-1.2-.5-2.7-4.5-2.7H58.3c-4.1 0-6.6 1.5-4.6 2.7z"/>
      <path class="outline" d="M53.7 276.7l142-246c2-3.5 7-3.5 9 0l142 246c2 3.5-.5 7.8-4.5 7.8H58.3c-4.1 0-6.6-4.3-4.6-7.8zm296.4-167.4L208.8 27.8c-2.3-1.3-4.9 1.3-3.6 3.6l141.3 244.8c1.3 2.3 4.9 1.4 4.9-1.3V111.6c0-.9-.5-1.8-1.3-2.3zm-299.9 0l141.3-81.6c2.3-1.3 4.9 1.3 3.6 3.6L53.8 276.1c-1.3 2.3-4.9 1.4-4.9-1.3V111.6c0-.9.5-1.8 1.3-2.3zm3.5 177.9l142 84.5c2 1.2 7 1.2 9 0l142-84.5c2-1.2-.5-2.7-4.5-2.7H58.3c-4.1 0-6.6 1.5-4.6 2.7z"/>
  </g>
${faces}
</svg>
`;
};

export default generateD8;
