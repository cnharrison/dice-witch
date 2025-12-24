import { Canvas, Image, SKRSContext2D, createCanvas, loadImage } from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import { DiceArray, Die } from "../../../../shared/types";
import { DiceService } from "..";
import generateLinearGradientFill from "../../images/generateDice/fills/generateLinearGradientFill";
import { getRandomPatternFill } from "../../images/generateDice/fills/generatePatternFills";

export async function generateDiceAttachment(
  this: DiceService,
  diceArray: DiceArray
): Promise<{ attachment: AttachmentBuilder; errors?: string[] } | undefined> {
  if (!(this as any)._canvasPool) {
    (this as any)._canvasPool = {
      canvas: createCanvas(1, 1),
      ctx: null as unknown as SKRSContext2D
    };
    (this as any)._canvasPool.ctx = (this as any)._canvasPool.canvas.getContext("2d");
  }

  const pool = (this as any)._canvasPool as { canvas: Canvas; ctx: SKRSContext2D };
  try {
    const errors: string[] = [];
    const shouldHaveIcon = diceArray.some(group => group.some(die => !!die.icon?.length));
    const paginatedArray = this.paginateDiceArray(diceArray);
    const canvasHeight = this.getCanvasHeight(paginatedArray, shouldHaveIcon);
    const canvasWidth = this.getCanvasWidth(paginatedArray);
    const canvas = pool.canvas;
    const ctx = pool.ctx;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawDice = async (die: Die, index: number, outerIndex: number) => {
      let toLoad = null;
      try {
        let patternFillObj;

        if (this.shouldUsePatternFill()) {
          patternFillObj = getRandomPatternFill(die.color.hex(), die.secondaryColor.hex());
        } else {
          patternFillObj = generateLinearGradientFill(die.color.hex(), die.secondaryColor.hex());
        }

        toLoad = await this.generateDie({
          sides: die.sides,
          rolled: die.rolled,
          textColor: die.textColor.hex(),
          outlineColor: "#000000",
          solidFill: die.color.hex(),
          patternFill: patternFillObj
        });

        if (!toLoad) {
          errors.push(`die:${die.sides}:${die.rolled}`);
          return;
        }

        let image: Image | null = null;
        try {
          image = await loadImage(toLoad as Buffer);
          const diceWidth = this.getDiceWidth(index);
          const diceHeight = this.getDiceHeight(outerIndex, shouldHaveIcon);
          ctx.drawImage(
            image as unknown as Image,
            diceWidth,
            diceHeight,
            this.defaultDiceDimension,
            this.defaultDiceDimension
          );

          if (shouldHaveIcon && die.iconSpacing) {
            const iconErrors = await this.drawIcon(die.icon, die.iconSpacing, ctx, index, outerIndex);
            if (iconErrors.length) {
              errors.push(...iconErrors);
            }
          }

        } catch (imgErr) {
          console.error("Image loading error:", imgErr);
          errors.push(`image:${die.sides}:${die.rolled}`);
        } finally {
          image = null;
        }
      } catch (err) {
        console.error("Die generation error:", err);
        errors.push(`die:${die.sides}:${die.rolled}`);
      } finally {
        toLoad = null;
      }
    };

    const processChunks = async (chunks: Die[][], chunkSize: number = 3) => {
      for (let i = 0; i < chunks.length; i += chunkSize) {
        const chunkGroup = chunks.slice(i, i + chunkSize);
        await Promise.all(
          chunkGroup.flatMap((array, outerIndex) => 
            array.map((die, index) => drawDice(die, index, outerIndex + i))
          )
        );
        
        if (i + chunkSize < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    };
    
    await processChunks(paginatedArray);

    const canvasBuffer = canvas.toBuffer('image/webp');
    
    const attachment = new AttachmentBuilder(
      canvasBuffer,
      { name: "currentDice.webp" }
    );
    
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      canvas.width = 1;
      canvas.height = 1;
    } catch (err) {
    }
    
    return { attachment, errors: errors.length ? errors : undefined };
  } catch (error) {
    return undefined;
  }
}
