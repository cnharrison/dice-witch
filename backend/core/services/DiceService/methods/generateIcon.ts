import sharp from "sharp";
import { Icon } from "../../../../shared/types";
import { DiceService } from "..";

export async function generateIcon(
  this: DiceService,
  iconType: Icon | null
): Promise<Buffer | undefined> {
  const cached = this.iconBufferCache.get(iconType);
  if (cached) return cached;

  try {
    const image = this.icons.get(iconType) || this.icons.get(null);
    if (!image) return undefined;

    const svgWithXmlDeclaration = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>${image}`;
    let imageBuffer = Buffer.from(svgWithXmlDeclaration);

    let attachment;
    try {
      const sharpInstance = sharp(imageBuffer, { limitInputPixels: 1024 * 1024 })
        .webp({
          lossless: false,
          quality: 85,
          smartSubsample: true,
          effort: 3
        });

      attachment = await sharpInstance.toBuffer();
      sharpInstance.destroy();
    } finally {
      imageBuffer = Buffer.alloc(0);
    }

    this.iconBufferCache.set(iconType, attachment);
    return attachment;
  } catch (err) {
    console.error(`Error generating icon for: ${iconType}`, err);
    return undefined;
  }
}