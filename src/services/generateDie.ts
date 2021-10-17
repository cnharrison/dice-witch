// @ts-nocheck
import {
  DiceFaceData,
  DiceTypes,
  DiceFaces,
  PatternFillObject,
} from "../types";
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
) => {
  const dice: DiceFaceData = {
    20: generateD20({
      result: number,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    }),
    12: generateD12({
      result: number,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    }),
    10: generateD10({
      result: number,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    }),

    8: generateD8({
      result: number,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    }),

    6: generateD6({
      result: number,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    }),

    4: generateD4({
      result: number,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    }),

    "%": generateDPercent({
      result: number,
      textColor,
      outlineColor,
      solidFill,
      patternFill,
      borderWidth,
      width,
      height,
    }),
  };
  const image = dice[sides];

  try {
    const attachment = await sharp(new (Buffer as any).from(image))
      .png()
      .toBuffer();
    return attachment;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export default generateDie;
