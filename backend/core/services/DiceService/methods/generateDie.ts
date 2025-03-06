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
    let imageBuffer = Buffer.from(image);

    let attachment;
    try {
      const sharpInstance = sharp(imageBuffer, { limitInputPixels: 1920 * 1080 })
        .webp({
          lossless: false,
          quality: 85,
          smartSubsample: true,
          effort: 3
        });

      attachment = await sharpInstance.toBuffer();

      if (typeof sharpInstance.removeAllListeners === 'function') {
        sharpInstance.removeAllListeners();
      }
    } finally {
      imageBuffer = Buffer.alloc(0);
    }

    if (this.diceCache.size < this.MAX_DICE_CACHE_SIZE) {
      this.diceCache.set(cacheKey, attachment);
    } else {
      this.cleanupDiceCache();
      if (this.diceCache.size < this.MAX_DICE_CACHE_SIZE) {
        this.diceCache.set(cacheKey, attachment);
      }
    }

    return attachment;
  } catch (err) {
    return undefined;
  }
}