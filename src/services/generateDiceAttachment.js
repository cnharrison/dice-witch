const randomColor = require("randomcolor");
const Canvas = require("canvas");
const Discord = require("discord.js");
const generateIcon = require("./generateIcon");
const generateDie = require("./generateDie/generateDie");

const maxRowLength = 10;
const defaultDiceDimension = 100;
const defaultIconDimension = 30;

const getIcon = function (icon, explosion, refresh, x, blank) {
  switch (icon) {
    case "x":
      return x;
    case "explosion":
      return explosion;
    case "refresh":
      return refresh;
    default:
      return blank;
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

  const newArray = diceArray.reduce((acc, cur) => {
    return cur.length > maxRowLength
      ? acc.concat(paginateDiceGroup(cur))
      : acc.concat([cur]);
  }, []);

  return newArray;
};

async function generateDiceAttachment(diceArray) {
  try {
    const shouldHaveIcon = diceArray
      .map((diceGroup) => diceGroup.some((dice) => !!dice.icon))
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
    const outerPromiseArray = paginatedArray.map((array, outerIndex) => {
      return array.map(async (dice, index) => {
        const { icon } = dice;
        let x;
        let blank;
        let image;
        let explosion;
        let refresh;
        let toLoad = await generateDie(
          dice.sides,
          dice.rolled,
          randomColor({ luminosity: "light" }),
          "#000000"
        );
        image = await Canvas.loadImage(toLoad);

        switch (icon) {
          case "x":
            const xToLoad = await generateIcon("x");
            x = await Canvas.loadImage(xToLoad);
            break;
          case "explosion":
            const explosionToLoad = await generateIcon("explosion");
            explosion = await Canvas.loadImage(explosionToLoad);
          case "refresh":
            const refreshToLoad = await generateIcon("refresh");
            refresh = await Canvas.loadImage(refreshToLoad);
          default:
            const blankToLoad = await generateIcon("blank");
            blank = await Canvas.loadImage(blankToLoad);
            break;
        }

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
          ctx.drawImage(
            getIcon(icon, explosion, refresh, x, blank),
            defaultDiceDimension * index + defaultDiceDimension * 0.35,
            outerIndex * defaultDiceDimension +
            defaultDiceDimension +
            outerIndex * defaultIconDimension,
            defaultIconDimension,
            defaultIconDimension
          );
        }
      });
    });

    await Promise.all(outerPromiseArray.map(Promise.all, Promise));

    const attachment = new Discord.MessageAttachment(
      canvas.toBuffer("image/png", { compressionLevel: 0 }),
      "currentDice.png"
    );
    return attachment;
  } catch (err) {
    console.error(err);
  }
}

module.exports = generateDiceAttachment;
