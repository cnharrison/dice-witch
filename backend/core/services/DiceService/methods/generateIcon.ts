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

    let imageBuffer = Buffer.from(image);

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