import { PatternFillObject } from "../../../../../shared/types";

const generateGradientId = (color1: string, color2: string): string => {
  return `linearGradient_${color1.replace('#', '')}_${color2.replace('#', '')}`;
};

const generateLinearGradientFill = (color1: string, color2: string): PatternFillObject => {
  const id = generateGradientId(color1, color2);
  
  const gradient: PatternFillObject = {
    string: `<linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${color1}"/>
            <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>`,
    name: id,
  };
  
  return gradient;
};

export default generateLinearGradientFill;
