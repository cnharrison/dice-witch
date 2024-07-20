import Discord, {
  Message,
  TextChannel,
  EmbedBuilder,
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  MessageComponentInteraction,
  ButtonInteraction,
  SelectMenuBuilder,
} from "discord.js";
import { prefix } from "../../config.json";
import {
  availableDice,
  footerButtonRow,
  maxImageDice,
} from "../constants";
import { sendLogEventMessage } from "../messages";
import { EventType } from "../types";

const createButton = (id: string, label: string, interaction?: CommandInteraction | ButtonInteraction) =>
  new ButtonBuilder()
    .setCustomId(`${id}${interaction ? "-slash" : ""}`)
    .setLabel(label)
    .setStyle(1);

const createEmbed = (title: string, description: string) =>
  new EmbedBuilder()
    .setColor("#0000ff")
    .addFields({ name: title, value: description });

const sendHelperMessage = async (
  message: Message,
  name: string,
  logOutputChannel: TextChannel,
  args?: string[],
  interaction?: CommandInteraction | ButtonInteraction
) => {
  const kbButtonRow = new ActionRowBuilder()
    .addComponents(
      createButton("kb-exploding", "Exploding 💥", interaction),
      createButton("kb-reroll", "Re-roll ♻", interaction),
      createButton("kb-keepdrop", "Keep/drop 🚮", interaction),
      createButton("kb-target", "Targets 🎯", interaction),
      createButton("kb-crit", "Criticals ⚔", interaction)
    ) as ActionRowBuilder<SelectMenuBuilder>;

  const kbButtonRow2 = new ActionRowBuilder()
    .addComponents(
      createButton("kb-math", "Math 🧮", interaction),
      createButton("kb-sort", "Sorting ↕", interaction),
      createButton("kb-repeating", "Repeating 👯‍♀️", interaction)
    ) as ActionRowBuilder<SelectMenuBuilder>;

  const commandEmbed = createEmbed(
    `Need help ?😅`,
    `You need to put least one valid argument after the **${prefix}${name}** command.\nArguments must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any dice, but you can only see images of these dice: **${availableDice.map((dice: number | string) => `d${dice}`).join(", ")}**.\nYou can roll up to **${maxImageDice}** dice at once 😈\n\n`
  );

  const slashEmbed = createEmbed(
    `Need help? 😅`,
    `The \`/roll\` command has three arguments: \`notation\`, \`title\`, and \`timestorepeat\`. The \`notation\` argument must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any dice, but you can only see images of these dice: **${availableDice.map((dice: number | string) => `d${dice}`).join(", ")}**.\nYou can roll up to **${maxImageDice}** dice at once 😈\n\n`
  );

  const publicHelperMessage = ` 🚫🎲 Invalid dice notation! DMing you some help 😉`;

  try {
    if (interaction) {
      await interaction.followUp(publicHelperMessage);
      await interaction.user.send({
        embeds: [slashEmbed],
        components: [kbButtonRow, kbButtonRow2, footerButtonRow],
      });
    } else {
      await message.reply(publicHelperMessage);
      await message.author.send({
        embeds: [commandEmbed],
        components: [kbButtonRow, kbButtonRow2, footerButtonRow],
      });
    }
  } catch (err) {
    console.error("Error sending helper message:", err);
  }

  if (interaction && interaction.channel) {
    const filter = (i: MessageComponentInteraction) => 
      ["kb-exploding", "kb-exploding-slash", "kb-reroll", "kb-reroll-slash", "kb-keepdrop", "kb-keepdrop-slash", "kb-target", "kb-target-slash", "kb-crit", "kb-crit-slash", "kb-math", "kb-math-slash", "kb-sort", "kb-sort-slash", "kb-repeating", "kb-repeating-slash"].includes(i.customId);

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 15000,
    });

    collector.on("collect", async (i) => {
      if (filter(i)) {
        await i.update({ components: [footerButtonRow] });
      }
    });
  }

  sendLogEventMessage({
    eventType: EventType.SENT_HELER_MESSAGE,
    logOutputChannel,
    message,
    args,
    interaction,
  });
};

export default sendHelperMessage;