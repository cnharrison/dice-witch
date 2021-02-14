const Discord = require("discord.js");
const { getRandomNumber } = require("../helpers");
const { rollDice } = require("../services/rollDice");
const {
  generateDiceAttachment
} = require("../services/generateDiceAttachment");

const maxDice = 100;
const availableDice = [20, 12, 10, 8, 6, 4];

const roll = async (message, args, flags) => {
  const { diceArray, resultArray } = rollDice(args, availableDice);

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
      .addFields(
        {
          name: `Need help? 😅`,
          value: `You need to put least one valid argument after the **!roll** command.\nArguments must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any of these dice: **${availableDice
            .map((dice) => `d${dice}`)
            .join(", ")}**.`
        },
        { name: "\u200B", value: "\u200B" },
        {
          name: "Basic rolls",
          value: `\`!roll 1d20\`: roll one twenty sided die\n\`!roll 1d20 1d12 1d8\`: roll one twenty-sided die, one twelve-sided die, and one eight-sided die\n\`!roll 1d12+3 5d4\`: roll one twelve-sided die, adding three to the total, and five four-sided dice\n\nYou can also subtract\`-\`, multiply\`*\`, and divide\`/\` rolls.\nYou can roll up to **${maxDice}** dice at once 😈`
        },
        { name: "\u200B", value: "\u200B" },
        {
          name: "Title a roll",
          value:
            "You can add a title to a roll by inserting a `-t '<your title here>'` flag anywhere within the roll command:\n\n`!roll 1d20 -t 'to flirt with the bartender'`: roll one twenty-sided die and title it 'to flirt with the bartender'"
        }
      )
      .addField(
        "\u200B",
        `_Sent to ${message.author.username}_ | [Invite me](https://discord.com/api/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot) | [Support server](https://discord.gg/7FT6VT5x)`
      );

    return message.channel.send(embed);
  } else {
    return;
  }

  shouldHaveIcon = diceArray.some((dice) => !!dice.icon);

  const attachment = await generateDiceAttachment(diceArray, shouldHaveIcon);

  const embed = flags?.t
    ? new Discord.MessageEmbed()
        .setColor("#966F33")
        .attachFiles(attachment)
        .setTitle(flags?.t)
        .setImage("attachment://currentDice.png")
        .setFooter(
          `${message.author.username} | ${resultArray
            .map((roll) => `${roll.value}: ${roll.result}`)
            .join(" / ")}`
        )
    : new Discord.MessageEmbed()
        .setColor("#966F33")
        .attachFiles(attachment)
        .setImage("attachment://currentDice.png")
        .setFooter(
          `${message.author.username} | ${resultArray
            .map((roll) => `${roll.value}: ${roll.result}`)
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
  usage:
    "[dice notation], e.g. 1d20 2d12. Type `!roll` with no arguments for a detailed explanation",
  execute(message, args, _, flags) {
    roll(message, args, flags);
  }
};
