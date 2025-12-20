import Canvas from "@napi-rs/canvas";
import { Icon } from "../../../../shared/types";
import { DiceService } from "..";

export async function drawIcon(
  this: DiceService,
  iconArray: Icon[] | null | undefined,
  iconSpacing: number,
  ctx: any, // Canvas rendering context
  diceIndex: number,
  diceOuterIndex: number
): Promise<string[]> {
  if (!iconArray) return [];

  const errors: string[] = [];
  const iconPromises = [];
  
  for (let i = 0; i < iconArray.length; i++) {
    const icon = iconArray[i];
    iconPromises.push(
      (async () => {
        try {
          const iconToLoad = await this.generateIcon(icon);
          if (!iconToLoad) return;
          
          const iconWidth = this.getIconWidth(i, diceIndex, iconSpacing);
          const iconHeight = this.getIconHeight(diceOuterIndex);
          const iconImage = await Canvas.loadImage(iconToLoad);
          
          ctx.drawImage(
            iconImage,
            iconWidth,
            iconHeight,
            this.defaultIconDimension,
            this.defaultIconDimension
          );
        } catch (error) {
          errors.push(`icon:${icon}`);
        }
      })()
    );
  }
  
  await Promise.all(iconPromises);
  return errors;
}
