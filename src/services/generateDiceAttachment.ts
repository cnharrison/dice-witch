import Discord, { AttachmentBuilder } from "discord.js";
import Canvas, { CanvasRenderingContext2D, Image, Canvas as CanvasType } from "canvas";
import generateIcon from "./generateIcon";
import generateDie from "./generateDie";
import { Icon, Die, DiceArray } from "../types";
import generateLinearGradientFill from "./generateDice/fills/generateLinearGradientFill";

const maxRowLength = 10;
const defaultDiceDimension = 100;
const defaultIconDimension = 25;

const getIconWidth = (index: number, diceIndex: number, iconSpacing: number) =>
  defaultDiceDimension * (diceIndex + iconSpacing * (index + 1));

const getIconHeight = (diceOuterIndex: number) =>
  diceOuterIndex * (defaultDiceDimension + defaultIconDimension) + defaultDiceDimension;

const drawIcon = async (
  iconArray: Icon[] | null | undefined,
  iconSpacing: number,
  ctx: CanvasRenderingContext2D,
  diceIndex: number,
  diceOuterIndex: number
): Promise<void> => {
  if (!iconArray) return;

  await Promise.all(iconArray.map(async (icon, index) => {
    try {
      const iconToLoad = await generateIcon(icon);
      const iconWidth = getIconWidth(index, diceIndex, iconSpacing);
      const iconHeight = getIconHeight(diceOuterIndex);
      const iconImage = await Canvas.loadImage(iconToLoad as Buffer);
      ctx.drawImage(
        iconImage,
        iconWidth,
        iconHeight,
        defaultIconDimension,
        defaultIconDimension
      );
    } catch (error) {
      console.error(`Error loading icon: ${icon}`, error);
    }
  }));
};

const getCanvasHeight = (paginatedArray: DiceArray, shouldHaveIcon: boolean) =>
  shouldHaveIcon
    ? defaultDiceDimension * paginatedArray.length +
    defaultIconDimension * paginatedArray.length
    : defaultDiceDimension * paginatedArray.length;

const getCanvasWidth = (diceArray: DiceArray) => {
  const groupLength = diceArray.length === 1
    ? diceArray[0].length
    : Math.max(...diceArray.map(group => group.length));

  return defaultDiceDimension * Math.min(groupLength, maxRowLength);
};

const getDiceWidth = (index: number) => defaultDiceDimension * index;

const getDiceHeight = (outerIndex: number, shouldHaveIcon: boolean) =>
  outerIndex * defaultDiceDimension + (shouldHaveIcon ? outerIndex * defaultIconDimension : 0);

const paginateDiceArray = (diceArray: DiceArray): DiceArray => {
  const paginateDiceGroup = (group: Die[]) =>
    Array.from({ length: Math.ceil(group.length / maxRowLength) }, (_, index) =>
      group.slice(index * maxRowLength, (index + 1) * maxRowLength)
    );

  return diceArray.flatMap(group =>
    group.length > maxRowLength ? paginateDiceGroup(group) : [group]
  );
};

const generateDiceAttachment = async (
  diceArray: DiceArray
): Promise<{ attachment: AttachmentBuilder; canvas: CanvasType } | undefined> => {
  try {
    const shouldHaveIcon = diceArray.some(group => group.some(die => !!die.icon?.length));
    const paginatedArray = paginateDiceArray(diceArray);
    const canvasHeight = getCanvasHeight(paginatedArray, shouldHaveIcon);
    const canvasWidth = getCanvasWidth(paginatedArray);
    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
    const ctx: CanvasRenderingContext2D = canvas.getContext("2d");

    const drawDice = async (die: Die, index: number, outerIndex: number) => {
      const toLoad = await generateDie(
        die.sides,
        die.rolled,
        die.textColor.hex(),
        "#000000",
        undefined,
        generateLinearGradientFill(die.color.hex(), die.secondaryColor.hex())
      );
      const image = await Canvas.loadImage(toLoad as Buffer);
      const diceWidth = getDiceWidth(index);
      const diceHeight = getDiceHeight(outerIndex, shouldHaveIcon);
      ctx.drawImage(image, diceWidth, diceHeight, defaultDiceDimension, defaultDiceDimension);
      if (shouldHaveIcon && die.iconSpacing) {
        await drawIcon(die.icon, die.iconSpacing, ctx, index, outerIndex);
      }
    };

    await Promise.all(
      paginatedArray.map((array, outerIndex) =>
        Promise.all(array.map((die, index) => drawDice(die, index, outerIndex)))
      )
    );

    const attachment = new Discord.AttachmentBuilder(
      canvas.toBuffer("image/png", { compressionLevel: 0 }),
      { name: "currentDice.png" }
    );
    return { attachment, canvas };
  } catch (err) {
    console.error("Error generating dice attachment:", err);
    return undefined;
  }
};

export default generateDiceAttachment;