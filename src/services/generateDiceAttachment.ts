import Discord, { AttachmentBuilder } from "discord.js";
import Canvas, { CanvasRenderingContext2D, Image } from "canvas";
import generateIcon from "./generateIcon";
import generateDie from "./generateDie";
import { Icon, Die, DiceArray } from "../types";
import generateLinearGradientFill from "./generateDice/fills/generateLinearGradientFill";

const maxRowLength = 10;
const defaultDiceDimension = 100;
const defaultIconDimension = 25;

const getIconWidth = (index: number, diceIndex: number, iconSpacing: number) =>
  defaultDiceDimension * diceIndex +
  defaultDiceDimension * iconSpacing * (index + 1);

const getIconHeight = (diceOuterIndex: number) =>
  diceOuterIndex * defaultDiceDimension +
  defaultDiceDimension +
  diceOuterIndex * defaultIconDimension;

const drawIcon = async (
  iconArray: Icon[] | null | undefined,
  iconSpacing: number,
  ctx: CanvasRenderingContext2D,
  diceIndex: number,
  diceOuterIndex: number
) => {
  if (iconArray) {
    let iconImage: Image;
    const promiseArray = iconArray.map(async (icon: Icon, index: number) => {
      const iconToLoad = await generateIcon(icon);
      const iconWidth = getIconWidth(index, diceIndex, iconSpacing);
      const iconHeight = getIconHeight(diceOuterIndex);
      iconImage = await Canvas.loadImage(iconToLoad as Buffer);
      ctx.drawImage(
        iconImage,
        iconWidth,
        iconHeight,
        defaultIconDimension,
        defaultIconDimension
      );
    });
    await Promise.all(promiseArray);
  }
};

const getCanvasHeight = (paginatedArray: DiceArray, shouldHaveIcon: boolean) =>
  shouldHaveIcon
    ? defaultDiceDimension * paginatedArray.length +
      defaultIconDimension * paginatedArray.length
    : defaultDiceDimension * paginatedArray.length;

const getCanvasWidth = (diceArray: DiceArray) => {
  const isSingleGroup = diceArray.length === 1;
  const onlyGroupLength = diceArray[0].length;
  const isFirstShorterOrEqualToMax = onlyGroupLength <= maxRowLength;
  const longestDiceGroupIndex = diceArray.reduce(
    (acc: number, cur: Die[], curidx: number, arr: any) =>
      cur.length > arr[acc].length ? curidx : acc,
    0
  );
  const longestGroupLength = diceArray[longestDiceGroupIndex].length;
  const isLongestShorterOrEqualToMax = longestGroupLength <= maxRowLength;

  switch (true) {
    case isSingleGroup && isFirstShorterOrEqualToMax:
      return defaultDiceDimension * onlyGroupLength;
    case isSingleGroup && !isFirstShorterOrEqualToMax:
      return defaultDiceDimension * maxRowLength;
    case !isSingleGroup && isLongestShorterOrEqualToMax:
      return defaultDiceDimension * longestGroupLength;
    case !isSingleGroup && !isLongestShorterOrEqualToMax:
      return defaultDiceDimension * maxRowLength;
    default:
      return defaultDiceDimension * onlyGroupLength;
  }
};

const getDiceWidth = (index: number) => defaultDiceDimension * index;

const getDiceHeight = (outerIndex: number, shouldHaveIcon: boolean) =>
  shouldHaveIcon
    ? outerIndex * defaultDiceDimension + outerIndex * defaultIconDimension
    : outerIndex * defaultDiceDimension;

const paginateDiceArray = (diceArray: DiceArray): DiceArray => {
  const paginateDiceGroup = (diceArray: Die[]) =>
    Array(Math.ceil(diceArray.length / maxRowLength))
      .fill(undefined)
      .map((_, index: number) => index * maxRowLength)
      .map((begin: number) => diceArray.slice(begin, begin + maxRowLength));

  const newArray = diceArray.reduce(
    (acc: DiceArray, cur: Die[]) =>
      cur.length > maxRowLength
        ? acc.concat(paginateDiceGroup(cur))
        : acc.concat([cur]),
    []
  );
  return newArray;
};

const generateDiceAttachment = async (diceArray: DiceArray): Promise<any> => {
  try {
    const paginatedArray = paginateDiceArray(diceArray);
    const shouldHaveIcon = diceArray
      .map((diceGroup: Die[]) =>
        diceGroup.some((dice: Die) => !!dice.icon?.length)
      )
      .some((bool: boolean) => bool === true);
    const canvasHeight = getCanvasHeight(paginatedArray, shouldHaveIcon);
    const canvasWidth = getCanvasWidth(paginatedArray);
    const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);

    const ctx: CanvasRenderingContext2D = canvas.getContext("2d");
    const outerPromiseArray = paginatedArray.map(
      (array: Die[], outerIndex: number) =>
        array.map(async (die: Die, index: number) => {
          const { icon: iconArray } = die;
          const toLoad: Buffer | null = await generateDie(
            die.sides,
            die.rolled,
            die.textColor.hex(),
            "#000000",
            undefined,
            generateLinearGradientFill(
              die.color.hex(),
              die.secondaryColor.hex()
            )
          );
          const image: Image = await Canvas.loadImage(toLoad as Buffer);
          const diceWidth = getDiceWidth(index);
          const diceHeight = getDiceHeight(outerIndex, shouldHaveIcon);
          ctx.drawImage(
            image,
            diceWidth,
            diceHeight,
            defaultDiceDimension,
            defaultDiceDimension
          );
          if (shouldHaveIcon && die.iconSpacing) {
            await drawIcon(iconArray, die.iconSpacing, ctx, index, outerIndex);
          }
        })
    );

    await Promise.all(outerPromiseArray.map(Promise.all, Promise));

    const attachment: AttachmentBuilder = new Discord.AttachmentBuilder(
      canvas.toBuffer("image/png", { compressionLevel: 0 }),
      { name: "currentDice.png" }
    );
    return attachment;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export default generateDiceAttachment;
