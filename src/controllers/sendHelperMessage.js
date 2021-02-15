const { availableDice, maxDice } = require("../constants");
const Discord = require("discord.js");

const sendHelperMessage = (message, name) => {
  const embed = new Discord.MessageEmbed()
    .setColor("#0000ff")
    .addFields(
      {
        name: `Need help? 😅`,
        value: `You need to put least one valid argument after the **!${name}** command.\nArguments must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any of these dice: **${availableDice
          .map((dice) => `d${dice}`)
          .join(", ")}**.`
      },
      {
        name: "Basic rolls",
        value: `\`!${name} 1d20\`: roll one twenty sided die\n\`!${name} 1d20 1d12 1d8\`: roll one twenty-sided die, one twelve-sided die, and one eight-sided die\n\`!${name} 1d12+3 5d4\`: roll one twelve-sided die, adding three to the total, and five four-sided dice\n\nYou can also subtract\`-\`, multiply\`*\`, and divide\`/\` rolls.\nYou can roll up to **${maxDice}** dice at once 😈\n\n`
      },
      {
        name: "Drop/keep dice AKA advantage rolls",
        value: `\`!${name} 3d20b2\`: roll three twenty-sided dice and keep the best two\n\`!${name} 5d8w1\`: roll five eight-sided dice and keep the worst one`
      }
    )
    .addField(
      "\u200B",
      `_Sent to ${message.author.username}_ | [Invite me](https://discord.com/api/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot) | [Support server](https://discord.gg/7FT6VT5x)`
    );

  return message.channel.send(embed);
};

module.exports = sendHelperMessage;
