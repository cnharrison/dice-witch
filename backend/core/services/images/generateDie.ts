import {
  DiceFaceData,
  DiceTypes,
  DiceFaces,
  PatternFillObject,
} from "../../../shared/types";
import sharp from "sharp";
import {
  generateD4,
  generateD6,
  generateD8,
  generateD10,
  generateD12,
  generateD20,
  generateDPercent,
} from "./generateDice/dice";

const generateDie = async (
  sides: DiceTypes,
  number: DiceFaces,
  textColor?: string,
  outlineColor?: string,
  solidFill?: string,
  patternFill?: PatternFillObject,
  borderWidth?: string,
  width?: string,
  height?: string
): Promise<Buffer | undefined> => {
  const props = {
    result: number,
    textColor,
    outlineColor,
    solidFill,
    patternFill,
    borderWidth,
    width,
    height,
  };

  const dice: DiceFaceData = {
    20: generateD20(props),
    12: generateD12(props),
    10: generateD10(props),
    8: generateD8(props),
    6: generateD6(props),
    4: generateD4(props),
    "%": generateDPercent(props),
  };

  const image = dice[sides];

  if (!image) {
    console.error("Failed to generate image");
    return undefined;
  }

  try {
    const attachment = await sharp(Buffer.from(image)).png().toBuffer();
    return attachment;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};

export default generateDie;