import randomColor from "randomcolor";
import Canvas, { Image } from "canvas";
import Discord from "discord.js";
import generateIcon from "./generateIcon";
import generateDie from "./generateDie";
import { MessageAttachment } from "discord.js";
import { Icon, Die } from "../types";

const maxRowLength = 10;
const defaultDiceDimension = 100;
const defaultIconDimension = 25;

const drawIcon = async (
  iconArray: Icon[] | null | undefined,
  ctx: CanvasDrawImage,
  diceIndex: number,
  diceOuterIndex: number
) => {
  const getIconSpacing = (iarr: Icon[]) => {
    switch (iarr.length) {
      case 1:
        return 0.375;
      case 2:
        return 0.26;
      case 3:
        return 0.19;
      default:
        return 0.19;
    }
  };
  if (iconArray) {
    let iconImage;
    const promiseArray = iconArray.map(async (icon: Icon, index: number) => {
      const iconToLoad = await generateIcon(icon);
      iconImage = await Canvas.loadImage(iconToLoad as Buffer);
      ctx.drawImage(
        iconImage,
        defaultDiceDimension * diceIndex +
        defaultDiceDimension * (getIconSpacing(iconArray) * (index + 1)),
        diceOuterIndex * defaultDiceDimension +
        defaultDiceDimension +
        diceOuterIndex * defaultIconDimension,
        defaultIconDimension,
        defaultIconDimension
      );
    });
    await Promise.all(promiseArray);
  }
};

const getCanvasWidth = (diceArray: Die[][]) => {
  const isSingleGroup = diceArray.length === 1;
  const onlyGroupLength = diceArray[0].length;
  const isFirstShorterOrEqualToMax = onlyGroupLength <= maxRowLength;
  const longestDiceGroupIndex = diceArray.reduce(
    (acc, cur, curidx, arr) => (cur.length > arr[acc].length ? curidx : acc),
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

const paginateDiceArray = (diceArray: Die[][]): Die[][] => {
  const paginateDiceGroup = (diceArray: Die[]) =>
    Array(Math.ceil(diceArray.length / maxRowLength))
      .fill(undefined)
      .map((_, index: number) => index * maxRowLength)
      .map((begin: number) => diceArray.slice(begin, begin + maxRowLength));

  const newArray = diceArray.reduce(
    (acc: Die[][], cur: Die[]) =>
      cur.length > maxRowLength
        ? acc.concat(paginateDiceGroup(cur))
        : acc.concat([cur]),
    []
  );
  return newArray;
};

async function generateDiceAttachment(diceArray: Die[][]) {
  try {
    const shouldHaveIcon = diceArray
      .map((diceGroup) => diceGroup.some((dice) => !!dice.icon?.length))
      .some((bool) => bool === true);

    const paginatedArray = paginateDiceArray(diceArray);
    const canvasWidth: number = getCanvasWidth(paginatedArray as Die[][]);

    const canvas = Canvas.createCanvas(
      canvasWidth,
      shouldHaveIcon
        ? defaultDiceDimension * paginatedArray.length +
        defaultIconDimension * paginatedArray.length
        : defaultDiceDimension * paginatedArray.length
    );

    const ctx: CanvasDrawImage = canvas.getContext("2d");
    const outerPromiseArray = paginatedArray.map((array, outerIndex) =>
      array.map(async (die: Die, index: number) => {
        const { icon: iconArray } = die;
        const toLoad: Buffer | null = await generateDie(
          die.sides,
          die.rolled,
          randomColor({ luminosity: "light" }),
          "#000000"
        );
        const image = await Canvas.loadImage(toLoad as Buffer);

        ctx.drawImage(
          image,
          defaultDiceDimension * index,
          shouldHaveIcon
            ? outerIndex * defaultDiceDimension +
            outerIndex * defaultIconDimension
            : outerIndex * defaultDiceDimension,
          defaultDiceDimension,
          defaultDiceDimension
        );
        if (shouldHaveIcon) {
          await drawIcon(iconArray, ctx, index, outerIndex);
        }
      })
    );

    await Promise.all(outerPromiseArray.map(Promise.all, Promise));

    const attachment: MessageAttachment = new Discord.MessageAttachment(
      canvas.toBuffer("image/png", { compressionLevel: 0 }),
      "currentDice.png"
    );
    return attachment;
  } catch (err) {
    console.error(err);
    return null;
  }
}

module.exports = generateDiceAttachment;
