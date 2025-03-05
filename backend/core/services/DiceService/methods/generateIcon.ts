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
    
    let attachment;
    try {
      attachment = await sharp(imageBuffer, { limitInputPixels: 256 * 256 })
        .webp({
          lossless: false,
          quality: 90,
          smartSubsample: true,
          effort: 4
        })
        .toBuffer();
    } finally {
    }
    
    if (this.iconCache.size < this.MAX_ICON_CACHE_SIZE) {
      this.iconCache.set(iconType, attachment);
    } else {
      this.cleanupIconCache();
      if (this.iconCache.size < this.MAX_ICON_CACHE_SIZE) {
        this.iconCache.set(iconType, attachment);
      }
    }
    
    return attachment;
  } catch (err) {
    return undefined;
  }
}