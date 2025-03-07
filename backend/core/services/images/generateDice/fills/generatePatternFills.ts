import { PatternFillObject } from "../../../../../shared/types";

const generatePatternId = (patternType: string, color1: string, color2: string): string => {
  return `pattern_${patternType}_${color1.replace('#', '')}_${color2.replace('#', '')}`;
};

const patternFills: Record<string, (color1: string, color2: string) => PatternFillObject> = {
  checkerboard: (color1: string, color2: string) => {
    const patternType = 'checkerboard';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="scale(0.75)">
        <rect width="10" height="10" fill="${color1}"/>
        <rect x="10" width="10" height="10" fill="${color2}"/>
        <rect y="10" width="10" height="10" fill="${color2}"/>
        <rect x="10" y="10" width="10" height="10" fill="${color1}"/>
      </pattern>`
    };
  },

  dots: (color1: string, color2: string) => {
    const patternType = 'dots';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="scale(0.75)">
        <rect width="20" height="20" fill="${color1}"/>
        <circle cx="5" cy="5" r="3" fill="${color2}"/>
        <circle cx="15" cy="15" r="3" fill="${color2}"/>
      </pattern>`
    };
  },

  stripes: (color1: string, color2: string) => {
    const patternType = 'stripes';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="scale(0.75)">
        <rect width="20" height="20" fill="${color1}"/>
        <rect width="20" height="4" fill="${color2}"/>
        <rect y="8" width="20" height="4" fill="${color2}"/>
        <rect y="16" width="20" height="4" fill="${color2}"/>
      </pattern>`
    };
  },

  stars: (color1: string, color2: string) => {
    const patternType = 'stars';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="60" height="60" patternTransform="scale(0.25)">
        <rect width="60" height="60" fill="${color1}"/>
        <path d="M30 10L33.66 21.17L45.31 21.17L35.82 28.09L39.49 39.27L30 32.34L20.51 39.27L24.18 28.09L14.69 21.17L26.34 21.17L30 10Z" fill="${color2}"/>
      </pattern>`
    };
  },

  zigzag: (color1: string, color2: string) => {
    const patternType = 'zigzag';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="40" height="20" patternTransform="scale(0.5)">
        <rect width="40" height="20" fill="${color1}"/>
        <path d="M0 0L10 10L20 0L30 10L40 0L40 5L30 15L20 5L10 15L0 5Z" fill="${color2}"/>
      </pattern>`
    };
  },

  triangles: (color1: string, color2: string) => {
    const patternType = 'triangles';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="30" height="30" patternTransform="scale(0.5)">
        <rect width="30" height="30" fill="${color1}"/>
        <polygon points="15,5 25,25 5,25" fill="${color2}"/>
      </pattern>`
    };
  },

  honeycomb: (color1: string, color2: string) => {
    const patternType = 'honeycomb';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="30" height="52" patternTransform="scale(0.3)">
        <rect width="30" height="52" fill="${color1}"/>
        <path d="M0,13 L15,0 L30,13 L30,39 L15,52 L0,39 Z" fill="none" stroke="${color2}" stroke-width="2"/>
        <path d="M0,65 L15,52 L30,65" stroke="${color2}" stroke-width="2"/>
        <path d="M0,-13 L15,0 L30,-13" stroke="${color2}" stroke-width="2"/>
      </pattern>`
    };
  },

  circuit: (color1: string, color2: string) => {
    const patternType = 'circuit';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="50" height="50" patternTransform="scale(0.3)">
        <rect width="50" height="50" fill="${color1}"/>
        <rect x="20" y="0" width="2" height="50" fill="${color2}"/>
        <rect x="0" y="20" width="50" height="2" fill="${color2}"/>
        <circle cx="20" cy="20" r="4" fill="${color2}"/>
        <circle cx="30" cy="30" r="2" fill="${color2}"/>
        <circle cx="10" cy="30" r="2" fill="${color2}"/>
        <circle cx="30" cy="10" r="2" fill="${color2}"/>
      </pattern>`
    };
  },

  crosshatch: (color1: string, color2: string) => {
    const patternType = 'crosshatch';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="20" height="20" patternTransform="scale(0.75)">
        <rect width="20" height="20" fill="${color1}"/>
        <path d="M0 0L20 20M20 0L0 20" stroke="${color2}" stroke-width="2"/>
      </pattern>`
    };
  },

  swirl: (color1: string, color2: string) => {
    const patternType = 'swirl';
    const id = generatePatternId(patternType, color1, color2);
    
    return {
      name: id,
      string: `<pattern id="${id}" patternUnits="userSpaceOnUse" width="50" height="50" patternTransform="scale(0.3)">
        <rect width="50" height="50" fill="${color1}"/>
        <path d="M25,25 m-15,0 a15,15 0 1,1 30,0 a15,15 0 1,1 -30,0 M25,25 m-10,0 a10,10 0 1,0 20,0 a10,10 0 1,0 -20,0 M25,25 m-5,0 a5,5 0 1,1 10,0 a5,5 0 1,1 -10,0" 
          stroke="${color2}" stroke-width="2" fill="none"/>
      </pattern>`
    };
  }
};

export const getRandomPatternFill = (color1: string, color2: string): PatternFillObject => {
  const patternKeys = Object.keys(patternFills);
  const randomPattern = patternKeys[Math.floor(Math.random() * patternKeys.length)];
  return patternFills[randomPattern](color1, color2);
};

export default patternFills;