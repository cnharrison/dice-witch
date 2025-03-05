import sharp from "sharp";
import { Icon } from "../../../../shared/types";
import { DiceService } from "..";

export async function generateIcon(
  this: DiceService,
  iconType: Icon | null
): Promise<Buffer | undefined> {
  try {
    if (this.iconCache.has(iconType)) {
      return this.iconCache.get(iconType);
    }
    
    const image = this.icons.get(iconType) || this.icons.get(null);
    if (!image) return undefined;

    const imageBuffer = Buffer.from(image);
    const attachment = await sharp(imageBuffer, { limitInputPixels: 256 * 256 })
      .webp({
        lossless: true,
        quality: 100,
        smartSubsample: true
      })
      .toBuffer();
      
    this.iconCache.set(iconType, attachment);
    this.cleanupIconCache();
    
    return attachment;
  } catch (err) {
    return undefined;
  }
}