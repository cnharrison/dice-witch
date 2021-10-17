const generateLinearGradientFill = (color1: string, color2: string) => {
  const name = "linearGradient";
  return {
    string: `<linearGradient id="${name}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${color1}"/>
            <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>`,
    name,
  };
};

export default generateLinearGradientFill;
