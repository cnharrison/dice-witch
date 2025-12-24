import sharp from "sharp";
import { Icon } from "../../../../shared/types";
import { DiceService } from "..";

export async function generateIcon(
  this: DiceService,
  iconType: Icon | null
): Promise<Buffer | undefined> {
  const cached = this.iconBufferCache.get(iconType);
  if (cached) return cached;

  const image = this.icons.get(iconType) || this.icons.get(null);
  if (!image) return undefined;

  let imageBuffer: Buffer | null = null;
  let sharpInstance: ReturnType<typeof sharp> | null = null;

  try {
    const svgWithXmlDeclaration = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>${image}`;
    imageBuffer = Buffer.from(svgWithXmlDeclaration);
    sharpInstance = sharp(imageBuffer, { limitInputPixels: 1024 * 1024 });
    sharpInstance.webp({
      lossless: false,
      quality: 85,
      smartSubsample: true,
      effort: 3
    });

    const attachment = await sharpInstance.toBuffer();
    this.iconBufferCache.set(iconType, attachment);
    return attachment;
  } catch (err) {
    console.error(`Error generating icon for: ${iconType}`, err);
    return undefined;
  } finally {
    if (sharpInstance) {
      sharpInstance.destroy();
    }
    imageBuffer = null;
  }
}