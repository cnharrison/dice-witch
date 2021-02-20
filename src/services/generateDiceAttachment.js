const randomColor = require("randomcolor");
const Canvas = require("canvas");
const Discord = require("discord.js");
const generateIcon = require("./generateIcon");
const generateDie = require("./generateDie/generateDie");

const maxRowLength = 7;
const defaultDiceDimension = 100;
const defaultIconDimension = 30;

const generateDiceAttachment = async (diceArray) => {
  try {
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
        let image;
        const toLoad = await generateDie(
          dice.sides,
          dice.rolled,
          randomColor({ luminosity: "light" }),
          "#000000"
        );
        image = await Canvas.loadImage(toLoad);
        if (shouldHaveIcon) {
          const checkToLoad = await generateIcon("check");
          const xToLoad = await generateIcon("x");
          check = await Canvas.loadImage(checkToLoad);
          x = await Canvas.loadImage(xToLoad);
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
