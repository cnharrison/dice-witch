const Discord = require("discord.js");
const { getRandomNumber } = require("../helpers");
const { logEvent } = require("../services");

const generateEmbed = async function (resultArray, attachment, message, title) {
  const grandTotal = resultArray.reduce((prev, cur) => {
    return prev + cur.result;
  }, 0);
  try {
    const embed = title
      ? new Discord.MessageEmbed()
          .setColor("#966F33")
          .setTitle(title)
          .attachFiles(attachment)
          .setImage("attachment://currentDice.png")
          .setFooter(
            `${resultArray
              .map((roll) => `${roll.value}: ${roll.result}`)
              .join("\n")} ${
              resultArray.length > 1 ? `\ngrand total: ${grandTotal}` : ""
            }\nsent to ${message.author.username}`
          )
      : new Discord.MessageEmbed()
          .setColor("#966F33")
          .attachFiles(attachment)
          .setImage("attachment://currentDice.png")
          .setFooter(
            `${resultArray
              .map((roll) => `${roll.value}: ${roll.result}`)
              .join("\n")} ${
              resultArray.length > 1 ? `\ngrand total: ${grandTotal}` : ""
            }\nsent to ${message.author.username}`
          );
    return embed;
  } catch (err) {
    console.log(err);
  }
};

const sendDiceResultMessage = async (
  resultArray,
  message,
  attachment,
  title,
  _,
  logOutputChannel
) => {
  try {
    const embed = await generateEmbed(resultArray, attachment, message, title);

    const sendMessageAndStopTyping = async () => {
      try {
        await message.channel.send(embed);
        logEvent(
          "sentRollResultMessage",
          logOutputChannel,
          message,
          undefined,
          undefined,
          undefined,
          undefined,
          embed
        );
        message.channel.stopTyping();
      } catch (err) {
        message.channel.stopTyping();
      }
    };

    message.channel.startTyping();

    setTimeout(sendMessageAndStopTyping, getRandomNumber(5000));

    return;
  } catch (err) {
    console.log(err);
  }
};

module.exports = sendDiceResultMessage;
