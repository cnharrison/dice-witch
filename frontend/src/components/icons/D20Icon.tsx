import * as React from "react";

export function D20Icon({ 
  className, 
  darkMode = true, 
  glowColor = '#ff00ff',
  disabled = false,
  shouldGlow = false
}: { 
  className?: string; 
  darkMode?: boolean; 
  glowColor?: string;
  disabled?: boolean;
  shouldGlow?: boolean;
}) {
  // Always make the icon visible, even when disabled
  const strokeColor = disabled 
    ? (darkMode ? '#555555' : '#666666') 
    : (darkMode ? "white" : "black");
  
  // Use a slightly lighter fill color for better visibility
  const fillColor = disabled 
    ? (darkMode ? '#3a3a3a' : '#aaa69c') // more visible cream color in light mode
    : (darkMode ? "white" : "black");
  
  return (
    <svg 
      viewBox="0 0 127 127" 
      className={className}
      style={!disabled && shouldGlow ? {
        filter: `drop-shadow(0 0 5px ${glowColor})`,
        transition: 'filter 0.3s ease'
      } : undefined}
    >
      <g transform="translate(0,-169.99998)">
        <path
          stroke={strokeColor}
          fill={fillColor}
          strokeWidth={disabled ? 1 : 3}
          d="m 63.049616,175.859 c -0.163326,0.005 -0.29398,0.0478 -0.402648,0.13623 l -0.01994,-0.016 -51.446383,28.90233 c 0,6.8e-4 -0.02008,0.006 -0.02008,0.016 l -0.02271,0.0159 v 6.8e-4 c -0.174674,0.11307 -0.352066,0.37683 -0.529229,0.89603 l -0.279468,56.12502 c 0.199626,0.63735 0.447567,0.92328 0.723859,1.01625 l 51.179633,28.36853 c 0.438495,0.13623 0.93301,0.42384 1.195464,0.15854 v -0.005 c 8.561594,-4.73649 21.372844,-11.82424 32.059113,-17.73657 5.356975,-2.96368 10.175495,-5.62981 13.649285,-7.55182 1.73695,-0.96184 3.13794,-1.73535 4.10145,-2.26889 0.48183,-0.26769 0.85384,-0.47165 1.1045,-0.61027 0.0542,-0.0238 0.0797,-0.0478 0.12253,-0.0717 0.0661,0.006 0.14516,-0.0239 0.24889,-0.13624 v 0 0 c 0.12476,-0.13624 0.29374,-0.4079 0.53561,-0.90966 l -0.13838,-56.37907 -0.0223,-6.8e-4 c 0,-0.22706 -0.13839,-0.50112 -0.5122,-0.89603 L 63.627737,175.98686 c -0.229373,-0.0909 -0.418744,-0.13624 -0.578004,-0.13624 z m 1.122196,2.81272 46.179058,26.2162 -46.188879,2.01659 z m -2.104881,0.006 -0.495463,28.17224 -46.150929,-1.96672 z m -48.760705,28.29564 9.425502,0.40153 38.016454,1.79893 -25.038039,47.76732 z m 99.119934,6.8e-4 -22.606437,50.32202 -25.158518,-48.10902 35.262817,-1.66732 z m -49.717465,2.97432 25.271501,48.21171 -50.46895,-0.0238 z m -50.046099,0.65568 2.864753,6.38953 18.485796,41.5298 -21.600416,2.26165 z m 100.396454,0.0238 0.12253,50.41393 -3.55763,-0.37205 -18.191818,-1.90321 z m -25.365286,49.86571 -24.793799,28.45086 -24.83694,-28.4338 z m 2.722269,0.25176 20.420937,2.13688 c -0.8223,0.45571 -1.55365,0.85971 -2.69507,1.49038 -3.47356,1.92137 -8.29276,4.58789 -13.649736,7.55166 -8.894258,4.92068 -18.525538,10.24926 -26.68258,14.76212 z m -55.081862,0.016 22.486448,25.74369 -43.009098,-23.83936 z"
        />
      </g>
    </svg>
  );
}