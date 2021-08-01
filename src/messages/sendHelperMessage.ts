import Discord, { Message, TextChannel, MessageEmbed, MessageOptions, Interaction, CommandInteraction } from "discord.js";
import { prefix, inviteLink, supportServerLink } from "../../config.json";
import { availableDice, maxDice } from "../constants";
import { logEvent } from "../services";


const sendHelperMessage = async (
  message: Message,
  name: string,
  logOutputChannel: TextChannel,
  args?: string[],
  interaction?: CommandInteraction
) => {
  try {
    const embed:
      MessageEmbed = new Discord.MessageEmbed()
        .setColor("#0000ff")
        .addFields(
          {
            name: `Need help? 😅`,
            value: `You need to put least one valid argument after the **${prefix}${name}** command.\nArguments must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any of these dice: **${availableDice
              .map((dice: number | string) => `d${dice}`)
              .join(
                ", "
              )}**.\nYou can roll up to **${maxDice}** dice at once 😈\n\n`,
          },
          {
            name: "Basic rolls",
            value: `\`${prefix}${name} 1d20\`: roll one twenty sided die\n\`${prefix}${name} 1d20 1d12 1d8\`: Roll one twenty-sided die, one twelve-sided die, and one eight-sided die.\n\`${prefix}${name} 1d12+3 5d4\`: Roll one twelve-sided die, adding three to the total, and five four-sided dice.\n\`!roll 3d6+3d6\`: Roll two sets of three six-sided dice and add the total.\n\n`,
          },
          {
            name: "Advanced rolls and modifiers",
            value: `Type \`${prefix}kb <topic>\` for explanations and examples:\n\nMin/Max: \`${prefix}kb minmax\`\nExploding 💥: \`${prefix}kb exploding\`\nRe-roll ♻: \`${prefix}kb reroll\`\nKeep/drop AKA Advantage: \`${prefix}kb keepdrop\`\nTarget success/failure 🎯: \`${prefix}kb target\`\nCritical success/failure ⚔: \`${prefix}kb crit\`\nSorting ↕: \`${prefix}kb sort\`\nMath 🧮: \`${prefix}kb math\`\nRepeating rolls 👯‍♀️: \`${prefix}kb repeating\``,
          }
        )
        .addField(
          "\u200B",
          `_sent to ${interaction ? interaction.user.username : message.author.username}_ | [Invite me](${inviteLink}) | Questions? join the [Support server](${supportServerLink})`
        );
    interaction ? await interaction.followUp({ embeds: [embed] }) : await message.channel.send({ embeds: [embed] });
    logEvent(
      "sentHelperMessage",
      logOutputChannel,
      message,
      undefined,
      args
    );
    return;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export default sendHelperMessage;
