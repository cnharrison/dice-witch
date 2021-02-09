const config = require("../../config.json");
const Discord = require("discord.js");
const Canvas = require("canvas");
const Roll = require("roll");
const roll = new Roll();

const maxDice = 100;
const maxRowLength = 10;
const defaultImageDimension = 75;

const getRandomNumber = (range) => Math.floor(Math.random() * range) + 1;

const getRandomColor = () => {
  switch (getRandomNumber(6)) {
    case 1:
      return "red";
    case 2:
      return "orange";
    case 2:
      return "yellow";
    case 3:
      return "green";
    case 4:
      return "blue";
    case 5:
      return "indigo";
    case 6:
      return "purple";
    default:
      return "green";
  }
};

const rollDice = async (message, args) => {
  let diceArray = [];
  let resultMap = [];

  for (arg of args) {
    let parsedRoll;
    const valid = roll.validate(arg);
    if (valid) {
      parsedRoll = roll.parse(arg);
    }
    if (
      valid &&
      (parsedRoll.sides === 20 ||
        parsedRoll.sides === 12 ||
        parsedRoll.sides === 10 ||
        parsedRoll.sides === 8 ||
        parsedRoll.sides === 6 ||
        parsedRoll.sides === 4)
    ) {
      const rolls = roll.roll(arg);
      resultMap.push({ arg, result: rolls.result });
      for (i = 0; i < parsedRoll.quantity; i++) {
        diceArray.push({ sides: parsedRoll.sides, rolled: rolls.rolled[i] });
      }
    }
  }

  if (diceArray.length > maxDice) {
    message.channel.send(`${maxDice} dice max, sorry 😅`);
    return;
  } else if (diceArray.length) {
    message.channel.send(
      `_...the ${diceArray.length === 1 ? "die" : "dice"} ${
        diceArray.length === 1 ? "clatters" : "clatter"
      } across the table..._`
    );
  } else {
    return;
  }

  let outerDiceArray = [];

  for (let i = 0; i < diceArray.length; i += maxRowLength) {
    outerDiceArray.push(diceArray.slice(i, i + maxRowLength));
  }

  const canvasWidth =
    diceArray.length <= maxRowLength
      ? defaultImageDimension * diceArray.length
      : defaultImageDimension * maxRowLength;

  const canvas = Canvas.createCanvas(
    canvasWidth,
    defaultImageDimension * outerDiceArray.length
  );

  const ctx = canvas.getContext("2d");
  const outerPromiseArray = outerDiceArray.map((array, outerIndex) => {
    return array.map(async (dice, index) => {
      const image = await Canvas.loadImage(
        `${config.botPath}assets/d${dice.sides}/d${
          dice.sides
        }-${getRandomColor()}-${dice.rolled}.svg`
      );
      ctx.drawImage(
        image,
        defaultImageDimension * index,
        outerIndex * defaultImageDimension,
        defaultImageDimension,
        defaultImageDimension
      );
    });
  });

  try {
    await Promise.all(outerPromiseArray.map(Promise.all, Promise));
  } catch (err) {
    console.log(err);
  }

  const attachment = new Discord.MessageAttachment(
    canvas.toBuffer(),
    "currentDice.png"
  );

  const embed = new Discord.MessageEmbed()
    .setColor("#966F33")
    .attachFiles(attachment)
    .setImage("attachment://currentDice.png")
    .setFooter(
      `${message.author.username} | ${resultMap
        .map((roll) => `${roll.arg}: ${roll.result}`)
        .join(" / ")}`
    );

  const sendMessageAndStopTyping = () => {
    message.channel.send(embed);
    message.channel.stopTyping();
  };
  message.channel.startTyping();

  setTimeout(sendMessageAndStopTyping, getRandomNumber(5000));

  return;
};

module.exports = {
  name: "roll",
  description: "roll dice",
  execute(message, args) {
    rollDice(message, args);
  }
};
