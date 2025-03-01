const generateLinearGradientFill = (color1: string, color2: string) => {
  const id = `linearGradient_${Math.random().toString(36).substring(2, 9)}`;
  return {
    string: `<linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${color1}"/>
            <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>`,
    name: id,
  };
};

export default generateLinearGradientFill;
