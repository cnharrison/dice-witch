import { GenerateDieProps } from "../../../../../shared/types";

const generateGeneric = (props: GenerateDieProps & {sides?: any}) => {
  const size = 100;
  const primaryColor = props.solidFill || '#f0f0f0';
  const secondaryColor = props.patternFill?.string ? props.solidFill?.replace('#', '#55') || '#aaaaaa' : '#dddddd';
  const outlineColor = props.outlineColor || '#000000';
  const textColor = props.textColor || '#000000';
  const borderWidth = props.borderWidth || 2;
  
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="surfaceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryColor}"/>
        <stop offset="100%" stop-color="${secondaryColor}"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="2" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <g filter="url(#shadow)">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-8}" fill="url(#surfaceGradient)" stroke="${outlineColor}" stroke-width="${borderWidth}" />
      <path d="M ${size/2} ${size/5} A ${size/2.5} ${size/2.5} 0 0 1 ${size*0.8} ${size/2} A ${size/2-8} ${size/2-8} 0 0 0 ${size/5} ${size/2} A ${size/2.5} ${size/2.5} 0 0 1 ${size/2} ${size/5}"
        fill="rgba(255,255,255,0.25)" stroke="none" />
    </g>
    <text x="${size/2}" y="${size/2+8}" font-family="Arial" font-size="42" font-weight="bold" fill="${textColor}" text-anchor="middle">${props.result}</text>
    <text x="${size/2}" y="${size-15}" font-family="Arial" font-size="16" font-weight="bold" fill="${textColor}" text-anchor="middle">d${props.sides || '?'}</text>
  </svg>`;
};

export default generateGeneric;