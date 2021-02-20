const Discord = require("discord.js");
const { getRandomNumber } = require("../helpers");

const generateEmbed = (resultArray, attachment, message, title) => {
  try {
    return title
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
  } catch (err) {
    console.log(err);
  }
};

const sendDiceResultMessage = async (
  resultArray,
  message,
  attachment,
  title
) => {
  try {
    const embed = generateEmbed(resultArray, attachment, message, title);

    const sendMessageAndStopTyping = async () => {
      await message.channel.send(embed);
      message.channel.stopTyping();
    };
    message.channel.startTyping();

    setTimeout(sendMessageAndStopTyping, getRandomNumber(5000));

    return;
  } catch (err) {
    console.log(err);
  }
};

module.exports = sendDiceResultMessage;
