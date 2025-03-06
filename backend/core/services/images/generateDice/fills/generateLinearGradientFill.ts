import { PatternFillObject } from "../../../../../shared/types";

const gradientCache = new Map<string, PatternFillObject>();
const MAX_GRADIENT_CACHE_SIZE = 25;

const generateGradientId = (color1: string, color2: string): string => {
  return `linearGradient_${color1.replace('#', '')}_${color2.replace('#', '')}`;
};

const cleanupGradientCache = () => {
  if (gradientCache.size > MAX_GRADIENT_CACHE_SIZE) {
    const keysToDelete = Array.from(gradientCache.keys()).slice(0, gradientCache.size - MAX_GRADIENT_CACHE_SIZE);
    for (const key of keysToDelete) {
      gradientCache.delete(key);
    }
  }
  
  if (Math.random() < 0.05) {
    gradientCache.clear();
  }
};

const generateLinearGradientFill = (color1: string, color2: string) => {
  const cacheKey = generateGradientId(color1, color2);
  
  if (gradientCache.has(cacheKey)) {
    return gradientCache.get(cacheKey)!;
  }
  
  const id = cacheKey;
  const gradient = {
    string: `<linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${color1}"/>
            <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>`,
    name: id,
  };
  
  gradientCache.set(cacheKey, gradient);
  cleanupGradientCache();
  
  return gradient;
};

export default generateLinearGradientFill;
