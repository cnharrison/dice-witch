import sharp from "sharp";
import { Icon } from "../../../../shared/types";
import { DiceService } from "..";

export async function generateIcon(
  this: DiceService,
  iconType: Icon | null
): Promise<Buffer | undefined> {
  try {
    const image = this.icons.get(iconType) || this.icons.get(null);
    if (!image) return undefined;

    const svgWithXmlDeclaration = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>${image}`;
    let imageBuffer = Buffer.from(svgWithXmlDeclaration);

    let attachment;
    try {
      const sharpInstance = sharp(imageBuffer, { limitInputPixels: 256 * 256 })
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

    return attachment;
  } catch (err) {
    console.error(`Error generating icon for: ${iconType}`, err);
    return undefined;
  }
}