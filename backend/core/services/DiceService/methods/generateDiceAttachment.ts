import { Image, createCanvas, loadImage, clearAllCache } from "@napi-rs/canvas";
import { AttachmentBuilder } from "discord.js";
import { DiceArray, Die } from "../../../../shared/types";
import { DiceService } from "..";
import generateLinearGradientFill from "../../images/generateDice/fills/generateLinearGradientFill";
import { getRandomPatternFill } from "../../images/generateDice/fills/generatePatternFills";
import { CONFIG } from "../../../../config";

let rollCount = 0;
const CACHE_CLEAR_INTERVAL = 100;

type CanvasPoolItem = { canvas: ReturnType<typeof createCanvas>; ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>; busy: boolean };
type CanvasPoolState = { items: CanvasPoolItem[]; waiters: ((item: CanvasPoolItem) => void)[] };

const DEFAULT_POOL_SIZE = 3;
const POOL_SIZE = Math.max(1, Number.isFinite(CONFIG.dice.canvasPoolSize)
  ? CONFIG.dice.canvasPoolSize
  : DEFAULT_POOL_SIZE);

const getPoolState = (service: DiceService): CanvasPoolState => {
  if (!(service as any)._canvasPool) {
    const items: CanvasPoolItem[] = Array.from({ length: POOL_SIZE }, () => {
      const canvas = createCanvas(1, 1);
      return { canvas, ctx: canvas.getContext("2d"), busy: false };
    });
    (service as any)._canvasPool = { items, waiters: [] };
  }
  return (service as any)._canvasPool as CanvasPoolState;
};

const acquireCanvas = (service: DiceService): Promise<CanvasPoolItem> => {
  const pool = getPoolState(service);
  const available = pool.items.find(item => !item.busy);
  if (available) {
    available.busy = true;
    return Promise.resolve(available);
  }

  return new Promise((resolve) => {
    pool.waiters.push((item) => resolve(item));
  });
};

const releaseCanvas = (service: DiceService, item: CanvasPoolItem) => {
  const pool = getPoolState(service);
  const waiter = pool.waiters.shift();
  if (waiter) {
    waiter(item);
    return;
  }
  item.busy = false;
};

export async function generateDiceAttachment(
  this: DiceService,
  diceArray: DiceArray,
  attachmentName: string = "currentDice.webp"
): Promise<{ attachment: AttachmentBuilder; errors?: string[] } | undefined> {
  const poolItem = await acquireCanvas(this);
  try {
    const errors: string[] = [];
    const shouldHaveIcon = diceArray.some(group => group.some(die => !!die.icon?.length));
    const paginatedArray = this.paginateDiceArray(diceArray);
    const canvasHeight = this.getCanvasHeight(paginatedArray, shouldHaveIcon);
    const canvasWidth = this.getCanvasWidth(paginatedArray);
    const canvas = poolItem.canvas;
    const ctx = poolItem.ctx;

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

    const processChunks = async (chunks: Die[][]) => {
      for (let outerIndex = 0; outerIndex < chunks.length; outerIndex += 1) {
        const array = chunks[outerIndex];
        for (let index = 0; index < array.length; index += 1) {
          await drawDice(array[index], index, outerIndex);
        }
        if (outerIndex + 1 < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    };
    
    await processChunks(paginatedArray);

    const canvasBuffer = canvas.toBuffer('image/webp');
    
    const attachment = new AttachmentBuilder(
      canvasBuffer,
      { name: attachmentName }
    );
    
    rollCount++;
    if (rollCount >= CACHE_CLEAR_INTERVAL) {
      clearAllCache();
      rollCount = 0;
    }

    return { attachment, errors: errors.length ? errors : undefined };
  } catch (error) {
    return undefined;
  } finally {
    releaseCanvas(this, poolItem);
  }
}
