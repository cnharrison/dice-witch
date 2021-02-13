const config = require("../../config.json");
const Discord = require("discord.js");
const Canvas = require("canvas");
const Roll = require("roll");

const maxDice = 100;
const maxRowLength = 7;
const defaultImageDimension = 90;
const availableDice = [20, 12, 10, 8, 6, 4];

const getRandomNumber = (range) => Math.floor(Math.random() * range) + 1;

const getRandomColor = () => {
  switch (getRandomNumber(5)) {
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
      return "purple";
    default:
      return "red";
  }
};

const rollDice = async (message, args) => {
  let diceArray = [];
  let resultMap = [];

  for (arg of args) {
    roll = new Roll();
    let parsedRoll;
    const valid = roll.validate(arg);
    if (valid) {
      parsedRoll = roll.parse(arg);
    }
    if (valid && availableDice.includes(parsedRoll.sides)) {
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
  } else if (diceArray.length === 0) {
    const embed = new Discord.MessageEmbed()
      .setColor("#0000ff")
      .setTitle(`Need help? 😅`)
      .setDescription(
        `You need to provide some arguments after the **!roll** command. These arguments must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm). Here are some examples:\n\n **!roll 1d20**: roll one twenty sided die\n**!roll 1d20 1d12 1d8**: roll one twenty-sided die, one twelve-sided die, and one eight sided die\n **!roll 1d12+3 5d4** : roll one twelve-sided die, adding three to the total, and five four sided dice\n\nYou can also subtract(-), multiply(*), and divide(/) rolls. You can roll up to ${maxDice} dice at once 😈`
      )
      .addField(
        "\u200B",
        `_Sent to ${message.author.username}_ | [Invite me](https://discord.com/api/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot) | [Support server](https://discord.gg/7FT6VT5x)`
      );

    return message.channel.send(embed);
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
    canvas.toBuffer("image/png", { compressionLevel: 0 }),
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
  description: "Throw some dice",
  usage: "[dice notation], e.g. 1d20 2d12",
  execute(message, args) {
    rollDice(message, args);
  }
};
