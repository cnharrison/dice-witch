const randomColor = require("randomcolor");
const Canvas = require("canvas");
const Discord = require("discord.js");
const generateIcon = require("./generateIcon");
const generateDie = require("./generateDie/generateDie");

const maxRowLength = 10;
const defaultDiceDimension = 100;
const defaultIconDimension = 30;

const getIcon = (icon, check, x, circle) => {
  switch (icon) {
    case "x":
      return x;
    case "check":
      return check;
    default:
      return circle;
  }
};

const getCanvasWidth = (diceArray) => {
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

const paginateDiceArray = (diceArray) => {
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

const generateDiceAttachment = async (diceArray) => {
  try {
    const shouldHaveIcon = diceArray.some((dice) => !!dice.icon);
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
        let check;
        let x;
        let circle;
        let image;
        const toLoad = await generateDie(
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
          case "check":
            const checkToLoad = await generateIcon("check");
            check = await Canvas.loadImage(checkToLoad);
            break;
          default:
            const circleToLoad = await generateIcon("circle");
            circle = await Canvas.loadImage(circleToLoad);
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
            getIcon(icon, check, x, circle),
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

    return new Discord.MessageAttachment(
      canvas.toBuffer("image/png", { compressionLevel: 0 }),
      "currentDice.png"
    );
  } catch (err) {
    console.error(err);
  }
};

module.exports = generateDiceAttachment;
