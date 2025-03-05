import sharp from "sharp";
import { DiceFaceData, DiceFaces, PatternFillObject } from "../../../../shared/types";
import { DiceService } from "..";
import {
  generateD10,
  generateD12,
  generateD20,
  generateD4,
  generateD6,
  generateD8,
  generateDPercent,
  generateGeneric,
} from "../../images/generateDice/dice";
import generateLinearGradientFill from "../../images/generateDice/fills/generateLinearGradientFill";
import { getRandomPatternFill } from "../../images/generateDice/fills/generatePatternFills";

export async function generateDie(
  this: DiceService,
  {
    sides,
    rolled,
    textColor,
    outlineColor,
    solidFill,
    patternFill,
    borderWidth,
    width,
    height
  }: {
    sides: any;
    rolled: DiceFaces;
    textColor?: string;
    outlineColor?: string;
    solidFill?: string;
    patternFill?: PatternFillObject;
    borderWidth?: string;
    width?: string;
    height?: string;
  }
): Promise<Buffer | undefined> {
  const textColorStr = textColor || 'default';
  const outlineColorStr = outlineColor || 'default';
  const solidFillStr = solidFill || 'default';
  const patternFillName = patternFill?.name || 'default';
  
  const cacheKey = `dice_${sides}_${rolled}_${textColorStr}_${outlineColorStr}_${solidFillStr}_${patternFillName}`;
  if (this.diceCache.has(cacheKey)) {
    return this.diceCache.get(cacheKey);
  }
  
  if (!patternFill) {
    if (this.shouldUsePatternFill()) {
      patternFill = getRandomPatternFill(solidFill || '#ffffff', outlineColor || '#000000');
    } else {
      patternFill = generateLinearGradientFill(solidFill || '#ffffff', outlineColor || '#000000');
    }
  }

  const props = {
    result: rolled,
    sides: sides,
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

  let image = dice[sides as keyof DiceFaceData];

  if (!image) {
    image = generateGeneric(props);
  }

  try {
    const imageBuffer = Buffer.from(image);
    const needsResize = sides === 20; // Only resize d20

    let options = {
      lossless: true,
      quality: 100,
      smartSubsample: true
    };

    let attachment;
    if (needsResize) {
      attachment = await sharp(imageBuffer, { limitInputPixels: 1920 * 1080 })
        .resize({
          width: this.defaultDiceDimension,
          height: this.defaultDiceDimension,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp(options)
        .toBuffer();
    } else {
      attachment = await sharp(imageBuffer, { limitInputPixels: 1920 * 1080 })
        .webp(options)
        .toBuffer();
    }
    
    this.diceCache.set(cacheKey, attachment);
    this.cleanupDiceCache();

    return attachment;
  } catch (err) {
    return undefined;
  }
}