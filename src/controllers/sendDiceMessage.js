const Discord = require("discord.js");
const { maxDice } = require("../constants");
const { getRandomNumber } = require("../helpers");

const generateEmbed = (resultArray, attachment, message, title) =>
  title
    ? new Discord.MessageEmbed()
        .setColor("#966F33")
        .setTitle(title)
        .attachFiles(attachment)
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

const sendDiceMessage = (
  diceArray,
  resultArray,
  message,
  attachment,
  title
) => {
  if (diceArray.length > maxDice) {
    message.channel.send(`${maxDice} dice max, sorry 😅`);
    return;
  } else if (diceArray.length) {
    message.channel.send(
      `_...the ${diceArray.length === 1 ? "die" : "dice"} ${
        diceArray.length === 1 ? "clatters" : "clatter"
      } across the table..._`
    );
  }

  const embed = generateEmbed(resultArray, attachment, message, title);

  const sendMessageAndStopTyping = () => {
    message.channel.send(embed);
    message.channel.stopTyping();
  };
  message.channel.startTyping();

  setTimeout(sendMessageAndStopTyping, getRandomNumber(5000));

  return;
};

module.exports = sendDiceMessage;
