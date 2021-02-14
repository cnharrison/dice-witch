const config = require("../../config.json");
const { getRandomColor } = require("../helpers");
const Canvas = require("canvas");
const Discord = require("discord.js");

const maxRowLength = 7;
const defaultDiceDimension = 90;
const defaultIconDimension = 30;

const generateDiceAttachment = async (diceArray, shouldHaveIcon) => {
  let outerDiceArray = [];
  for (let i = 0; i < diceArray.length; i += maxRowLength) {
    outerDiceArray.push(diceArray.slice(i, i + maxRowLength));
  }

  const canvasWidth =
    diceArray.length <= maxRowLength
      ? defaultDiceDimension * diceArray.length
      : defaultDiceDimension * maxRowLength;

  const canvas = Canvas.createCanvas(
    canvasWidth,
    shouldHaveIcon
      ? defaultDiceDimension * outerDiceArray.length +
          defaultIconDimension * outerDiceArray.length
      : defaultDiceDimension * outerDiceArray.length
  );

  const ctx = canvas.getContext("2d");
  const outerPromiseArray = outerDiceArray.map((array, outerIndex) => {
    return array.map(async (dice, index) => {
      let check;
      let x;
      const image = await Canvas.loadImage(
        `${config.botPath}assets/d${dice.sides}/d${
          dice.sides
        }-${getRandomColor()}-${dice.rolled}.svg`
      );
      if (shouldHaveIcon) {
        check = await Canvas.loadImage(
          `${config.botPath}assets/greencheck.svg`
        );
        x = await Canvas.loadImage(`${config.botPath}assets/redx.svg`);
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
          dice.icon ? check : x,
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
  try {
    await Promise.all(outerPromiseArray.map(Promise.all, Promise));
  } catch (err) {
    console.error(err);
  }

  return new Discord.MessageAttachment(
    canvas.toBuffer("image/png", { compressionLevel: 0 }),
    "currentDice.png"
  );
};

module.exports = { generateDiceAttachment };
