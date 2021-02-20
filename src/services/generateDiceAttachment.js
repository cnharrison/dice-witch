const config = require("../../config.json");
const { getRandomColor } = require("../helpers");
const randomColor = require("randomcolor");
const Canvas = require("canvas");
const Discord = require("discord.js");
const generateDie = require("./generateDie/generateDie");

const maxRowLength = 7;
const defaultDiceDimension = 100;
const defaultIconDimension = 30;

const generateDiceAttachment = async (diceArray) => {
  if (!diceArray) return;
  const shouldHaveIcon = diceArray.some((dice) => !!dice.icon);

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
      const toImport = await generateDie(
        dice.sides,
        dice.rolled,
        randomColor({ luminosity: "bright" }),
        "#000000"
      );
      try {
        image = await Canvas.loadImage(toImport);
      } catch (err) {
        console.error(err);
      }
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

module.exports = generateDiceAttachment;
