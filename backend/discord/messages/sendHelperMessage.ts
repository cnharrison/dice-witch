import {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
} from "discord.js";
import { availableDice, footerButtonRow, maxImageDice } from "../../core/constants";
import { sendLogEventMessage } from ".";
import { EventType } from "../../shared/types";
import { SendHelperMessageParams } from "../../shared/types";

const createButton = (id: string, label: string) =>
  new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(1);

const createEmbed = (title: string, description: string) =>
  new EmbedBuilder()
    .setColor("#0000ff")
    .addFields({ name: title, value: description });

const sendHelperMessage = async ({
  interaction,
}: Omit<SendHelperMessageParams, 'discord'>) => {

  const kbButtonRow = new ActionRowBuilder()
    .addComponents(
      createButton("knowledgebase-exploding", "Exploding 💥"),
      createButton("knowledgebase-reroll", "Re-roll ♻"),
      createButton("knowledgebase-keepdrop", "Keep/drop 🚮"),
      createButton("knowledgebase-target", "Targets 🎯"),
      createButton("knowledgebase-crit", "Criticals ⚔")
    ) as ActionRowBuilder<ButtonBuilder>;

  const kbButtonRow2 = new ActionRowBuilder()
    .addComponents(
      createButton("knowledgebase-math", "Math 🧮"),
      createButton("knowledgebase-sort", "Sorting ↕"),
      createButton("knowledgebase-repeating", "Repeating 👯‍♀️")
    ) as ActionRowBuilder<ButtonBuilder>;

  const embed = createEmbed(
    `Need help? 😅`,
    `The \`/roll\` command has three arguments: \`notation\`, \`title\`, and \`timestorepeat\`. The \`notation\` argument must be in valid [dice notation](http://dmreference.com/MRD/Basics/The_Basics/Dice_Notation.htm).\nYou can roll any dice, but you can only see images of these dice: **${availableDice.map((dice: number | string) => `d${dice}`).join(", ")}**.\nYou can roll up to **${maxImageDice}** dice at once 😈\n\n`
  );

  const publicHelperMessage = ` 🚫🎲 Invalid dice notation! DMing you some help 😉`;

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply(publicHelperMessage);
    } else {
      await interaction.followUp(publicHelperMessage);
    }

    await interaction.user.send({
      embeds: [embed],
      components: [kbButtonRow, kbButtonRow2, footerButtonRow],
    });
  } catch (err) {
    console.error("Error sending helper message:", err);
  }

  sendLogEventMessage({
    eventType: EventType.SENT_HELPER_MESSAGE,
    interaction
  });
};

export default sendHelperMessage;