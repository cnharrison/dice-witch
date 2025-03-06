import Canvas, { Canvas as CanvasType, Image } from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import { DiceArray, Die } from "../../../../shared/types";
import { DiceService } from "..";
import generateLinearGradientFill from "../../images/generateDice/fills/generateLinearGradientFill";
import { getRandomPatternFill } from "../../images/generateDice/fills/generatePatternFills";

export async function generateDiceAttachment(
  this: DiceService,
  diceArray: DiceArray
): Promise<{ attachment: AttachmentBuilder; canvas: CanvasType } | undefined> {
  try {
    const shouldHaveIcon = diceArray.some(group => group.some(die => !!die.icon?.length));
    const paginatedArray = this.paginateDiceArray(diceArray);
    const canvasHeight = this.getCanvasHeight(paginatedArray, shouldHaveIcon);
    const canvasWidth = this.getCanvasWidth(paginatedArray);
    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");

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
          return;
        }

        try {
          const image = await Canvas.loadImage(toLoad as Buffer);
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
            await this.drawIcon(die.icon, die.iconSpacing, ctx, index, outerIndex);
          }
          
        } catch (imgErr) {
          console.error("Image loading error:", imgErr);
        }
      } catch (err) {
        console.error("Die generation error:", err);
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
    
    return { attachment, canvas };
  } catch (error) {
    return undefined;
  }
}