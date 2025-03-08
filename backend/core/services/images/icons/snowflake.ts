export default `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <circle cx="256" cy="256" r="240" fill="#4a86e8" stroke="#2c5aa0" stroke-width="16"/>
  
  <!-- Bold, well-defined snowflake -->
  <g fill="white" stroke="none">
    <!-- Main vertical arm -->
    <path d="M256 76v60l-30-30l15-15l-15-15l30-30l30 30l-15 15l15 15l-30 30v-60z"/>
    <path d="M256 436v-60l30 30l-15 15l15 15l-30 30l-30-30l15-15l-15-15l30-30v60z"/>
    
    <!-- Main horizontal arm -->
    <path d="M76 256h60l-30 30l-15-15l-15 15l-30-30l30-30l15 15l15-15l-30-30h60z"/>
    <path d="M436 256h-60l30-30l15 15l15-15l30 30l-30 30l-15-15l-15 15l30 30h-60z"/>
    
    <!-- Top-right diagonal arm -->
    <path d="M362 150l-42.4 42.4l-9.5-41.7l20.3-5l-5-20.3l41.7-9.6l9.6 41.7l-20.4 5l5 20.3l-9.6 41.7l-41.7-9.5l5-20.4l-20.3-5l9.5-41.7l42.4 42.4z"/>
    
    <!-- Top-left diagonal arm -->
    <path d="M150 150l42.4 42.4l9.5-41.7l-20.3-5l5-20.3l-41.7-9.6l-9.6 41.7l20.4 5l-5 20.3l9.6 41.7l41.7-9.5l-5-20.4l20.3-5l-9.5-41.7l-42.4 42.4z"/>
    
    <!-- Bottom-right diagonal arm -->
    <path d="M362 362l-42.4-42.4l-9.5 41.7l20.3 5l-5 20.3l41.7 9.6l9.6-41.7l-20.4-5l5-20.3l-9.6-41.7l-41.7 9.5l5 20.4l-20.3 5l9.5 41.7l42.4-42.4z"/>
    
    <!-- Bottom-left diagonal arm -->
    <path d="M150 362l42.4-42.4l9.5 41.7l-20.3 5l5 20.3l-41.7 9.6l-9.6-41.7l20.4-5l-5-20.3l9.6-41.7l41.7 9.5l-5 20.4l20.3 5l-9.5 41.7l-42.4-42.4z"/>
    
    <!-- Center circle -->
    <circle cx="256" cy="256" r="40" fill="white" stroke="#4a86e8" stroke-width="12"/>
  </g>
</svg>
`;