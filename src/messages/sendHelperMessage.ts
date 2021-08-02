import Discord, {
  Message,
  TextChannel,
  MessageEmbed,
  CommandInteraction,
  MessageActionRow,
  MessageButton,
  MessageComponentInteraction
} from "discord.js";
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
  const kbButtonRow = new MessageActionRow()
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-exploding${interaction ? "-slash" : ""}`)
        .setLabel("Exploding 💥")
        .setStyle("PRIMARY")
    )
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-reroll${interaction ? "-slash" : ""}`)
        .setLabel("Re-roll ♻")
        .setStyle("PRIMARY")
    )
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-keepdrop${interaction ? "-slash" : ""}`)
        .setLabel("Keep/drop 🚮")
        .setStyle("PRIMARY")
    )
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-target${interaction ? "-slash" : ""}`)
        .setLabel("Targets 🎯")
        .setStyle("PRIMARY")
    )
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-crit${interaction ? "-slash" : ""}`)
        .setLabel("Criticals ⚔")
        .setStyle("PRIMARY")
    );

  const kbButtonRow2 = new MessageActionRow()
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-math${interaction ? "-slash" : ""}`)
        .setLabel("Math 🧮")
        .setStyle("PRIMARY")
    )
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-sort${interaction ? "-slash" : ""}`)
        .setLabel("Sorting ↕")
        .setStyle("PRIMARY")
    )
    .addComponents(
      new MessageButton()
        .setCustomId(`kb-repeating${interaction ? "-slash" : ""}`)
        .setLabel("Repeating 👯‍♀️")
        .setStyle("PRIMARY")
    );

  const footerButtonRow = new MessageActionRow()
    .addComponents(
      new MessageButton()
        .setLabel("Invite me")
        .setStyle("LINK")
        .setURL(inviteLink)
    )
    .addComponents(
      new MessageButton()
        .setLabel("Questions? Join the support server")
        .setStyle("LINK")
        .setURL(supportServerLink)
    );

  const commandEmbed: MessageEmbed = new Discord.MessageEmbed()
    .setColor("#0000ff")
    .addFields(
      {
        name: `Need help ?😅`,
        value: `⚠** BEGIN SCARY WARNING **⚠\n\n The \`!roll\` and \`!titledroll\` commands are being deprecated. You should start using \`/roll\` instead (It's much better 😈). For help with it, type \`/roll\ help\`. If you invited Dice Witch on or before **August 1, 2021**, you will need to grant her permissions to create slash commands on your server before you will see the \`/roll\` command. You can do this by clicking [here](https://discord.com/api/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot%20applications.commands).\n\n⚠**END SCARY WARNING**⚠\n\n You need to put least one valid argument after the **${prefix}${name}** command.\nArguments must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any of these dice: **${availableDice
          .map((dice: number | string) => `d${dice}`)
          .join(
            ", "
          )}**.\nYou can roll up to **${maxDice}** dice at once 😈\n\n`
      },
      {
        name: "Basic rolls",
        value: `\`${prefix}${name} 1d20\`: roll one twenty sided die\n\`${prefix}${name} 1d20 1d12 1d8\`: Roll one twenty-sided die, one twelve-sided die, and one eight-sided die.\n\`${prefix}${name} 1d12+3 5d4\`: Roll one twelve-sided die, adding three to the total, and five four-sided dice.\n\`!roll 3d6+3d6\`: Roll two sets of three six-sided dice and add the total.\n\n`
      },
      {
        name: "Advanced rolls and modifiers",
        value: "Click one of the buttons below for more info 👇"
      }
    )
    .addField(
      "\u200B",
      `_sent to ${interaction ? interaction.user.username : message.author.username
      }_`
    );

  const slashEmbed: MessageEmbed = new Discord.MessageEmbed()
    .setColor("#0000ff")
    .addFields(
      {
        name: `Need help? 😅`,
        value: `The  \`/roll\` command has three arguments: \`notation\`, \`title\`, and \`timestorepeat\`. The \`notation\` argument must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any of these dice: **${availableDice
          .map((dice: number | string) => `d${dice}`)
          .join(
            ", "
          )}**.\nYou can roll up to **${maxDice}** dice at once 😈\n\n`
      },
      {
        name: "Basic rolls",
        value: `\`/roll notation:1d20\`: roll one twenty sided die\n\`/roll notation:1d20 1d12 1d8\`: Roll one twenty-sided die, one twelve-sided die, and one eight-sided die.\n\`/roll notation:1d12+3 5d4\`: Roll one twelve-sided die, adding three to the total, and five four-sided dice.\n\`/roll notation:3d6+3d6\`: Roll two sets of three six-sided dice and add the total.\n\n`
      },
      {
        name: "Advanced rolls and modifiers",
        value: "Click one of the buttons below for more info 👇"
      }
    )
    .addField(
      "\u200B",
      `_sent to ${interaction ? interaction.user.username : message.author.username
      }_`
    );
  interaction
    ? await interaction.followUp({
      embeds: [slashEmbed],
      components: [kbButtonRow, kbButtonRow2, footerButtonRow]
    })
    : await message.channel.send({
      embeds: [commandEmbed],
      components: [kbButtonRow, kbButtonRow2, footerButtonRow]
    });

  if (interaction && interaction.channel) {
    const filter = (i: MessageComponentInteraction) =>
      i.customId === "kb-exploding" ||
      i.customId === "kb-exploding-slash" ||
      i.customId === "kb-reroll" ||
      i.customId === "kb-reroll-slash" ||
      i.customId === "kb-keepdrop" ||
      i.customId === "kb-keepdrop-slash" ||
      i.customId === "kb-targetsuccessfailure" ||
      i.customId === "kb-keepdrop-slash" ||
      i.customId === "kb-targetsuccessfailure" ||
      i.customId === "kb-keepdrop-slash" ||
      i.customId === "kb-crit" ||
      i.customId === "kb-keepdrop-slash" ||
      i.customId === "kb-math" ||
      i.customId === "kb-keepdrop-slash" ||
      i.customId === "kb-sorting" ||
      i.customId === "kb-keepdrop-slash";
    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 15000
    });

    collector.on("collect", async (i) => {
      if (filter(i)) {
        await i.update({ components: [footerButtonRow] });
      }
    });
  }

  logEvent(
    "sentHelperMessage",
    logOutputChannel,
    message,
    undefined,
    args,
    undefined,
    undefined,
    undefined,
    interaction
  );
  return;
};

export default sendHelperMessage;
