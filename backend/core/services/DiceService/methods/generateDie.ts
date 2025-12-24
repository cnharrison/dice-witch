import sharp from "sharp";
import { DiceFaces, GenerateDieProps, PatternFillObject } from "../../../../shared/types";
import { DiceService } from "..";
import {
  generateD10,
  generateD12,
  generateD20,
  generateD4,
  generateD6,
  generateD8,
  generateDF,
  generateDPercent,
  generateGeneric,
} from "../../images/generateDice/dice";
import generateLinearGradientFill from "../../images/generateDice/fills/generateLinearGradientFill";
import { getRandomPatternFill } from "../../images/generateDice/fills/generatePatternFills";

const diceGenerators: Record<string | number, (props: GenerateDieProps) => string> = {
  20: generateD20,
  12: generateD12,
  10: generateD10,
  8: generateD8,
  6: generateD6,
  4: generateD4,
  "%": generateDPercent,
  "F": generateDF,
};

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
  if (!patternFill) {
    if (this.shouldUsePatternFill()) {
      patternFill = getRandomPatternFill(solidFill || '#ffffff', outlineColor || '#000000');
    } else {
      patternFill = generateLinearGradientFill(solidFill || '#ffffff', outlineColor || '#000000');
    }
  }

  let displayValue = rolled;
  if (typeof sides === 'number' && rolled > sides) {
    displayValue = ((rolled - 1) % sides) + 1;
  }

  const props: GenerateDieProps & { sides?: any } = {
    result: displayValue,
    sides,
    textColor,
    outlineColor,
    solidFill,
    patternFill,
    borderWidth,
    width,
    height,
  };

  const generator = diceGenerators[sides] || generateGeneric;
  const image = generator(props);

  let imageBuffer: Buffer | null = null;
  let sharpInstance: ReturnType<typeof sharp> | null = null;

  try {
    imageBuffer = Buffer.from(image);
    sharpInstance = sharp(imageBuffer, { limitInputPixels: 1920 * 1080 });
    sharpInstance.webp({
      lossless: false,
      quality: 85,
      smartSubsample: true,
      effort: 3
    });

    const attachment = await sharpInstance.toBuffer();
    return attachment;
  } catch (err) {
    return undefined;
  } finally {
    if (sharpInstance) {
      sharpInstance.destroy();
    }
    imageBuffer = null;
  }
}