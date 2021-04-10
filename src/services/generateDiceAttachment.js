const randomColor = require("randomcolor");
const Canvas = require("canvas");
const Discord = require("discord.js");
const generateIcon = require("./generateIcon");
const generateDie = require("./generateDie/generateDie");

const maxRowLength = 10;
const defaultDiceDimension = 100;
const defaultIconDimension = 25;

const drawIcon = async function (
  iconArray,
  ctx,
  Canvas,
  diceIndex,
  diceOuterIndex
) {
  const getIconSpacing = (iconArray) => {
    switch (iconArray.length) {
      case 1:
        return 0.37;
      case 2:
        return 0.25;
      default:
        return 0.25;
    }
  };
  if (iconArray) {
    let iconImage;
    const promiseArray = iconArray.map(async (icon, index) => {
      const iconToLoad = await generateIcon(icon);
      iconImage = await Canvas.loadImage(iconToLoad);
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

const getCanvasWidth = function (diceArray) {
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
      return null;
  }
};

const paginateDiceArray = function (diceArray) {
  const paginateDiceGroup = (diceArray) =>
    Array(Math.ceil(diceArray.length / maxRowLength))
      .fill()
      .map((_, index) => index * maxRowLength)
      .map((begin) => diceArray.slice(begin, begin + maxRowLength));

  const newArray = diceArray.reduce(
    (acc, cur) =>
      cur.length > maxRowLength
        ? acc.concat(paginateDiceGroup(cur))
        : acc.concat([cur]),
    []
  );

  return newArray;
};

async function generateDiceAttachment(diceArray) {
  try {
    const shouldHaveIcon = diceArray
      .map((diceGroup) => diceGroup.some((dice) => !!dice.icon?.length))
      .some((bool) => bool === true);

    const paginatedArray = paginateDiceArray(diceArray);
    const canvasWidth = getCanvasWidth(paginatedArray);

    const canvas = Canvas.createCanvas(
      canvasWidth,
      shouldHaveIcon
        ? defaultDiceDimension * paginatedArray.length +
            defaultIconDimension * paginatedArray.length
        : defaultDiceDimension * paginatedArray.length
    );

    const ctx = canvas.getContext("2d");
    const outerPromiseArray = paginatedArray.map((array, outerIndex) =>
      array.map(async (dice, index) => {
        const { icon: iconArray } = dice;
        let image;
        const toLoad = await generateDie(
          dice.sides,
          dice.rolled,
          randomColor({ luminosity: "light" }),
          "#000000"
        );
        image = await Canvas.loadImage(toLoad);

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
          await drawIcon(iconArray, ctx, Canvas, index, outerIndex);
        }
      })
    );

    await Promise.all(outerPromiseArray.map(Promise.all, Promise));

    const attachment = new Discord.MessageAttachment(
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
