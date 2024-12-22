import  {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
} from "discord.js";
import { availableDice, footerButtonRow, maxImageDice } from "../constants";
import { sendLogEventMessage } from ".";
import { EventType } from "../../shared/types";
import { SendHelperMessageParams } from "../../shared/types";

const createButton = (id: string, label: string) =>
  new ButtonBuilder()
    .setCustomId(`${id}-slash`)
    .setLabel(label)
    .setStyle(1);

const createEmbed = (title: string, description: string) =>
  new EmbedBuilder()
    .setColor("#0000ff")
    .addFields({ name: title, value: description });

const sendHelperMessage = async ({
  interaction,
  logOutputChannel,
}: SendHelperMessageParams) => {
  const kbButtonRow = new ActionRowBuilder()
    .addComponents(
      createButton("kb-exploding", "Exploding 💥"),
      createButton("kb-reroll", "Re-roll ♻"),
      createButton("kb-keepdrop", "Keep/drop 🚮"),
      createButton("kb-target", "Targets 🎯"),
      createButton("kb-crit", "Criticals ⚔")
    ) as ActionRowBuilder<ButtonBuilder>;

  const kbButtonRow2 = new ActionRowBuilder()
    .addComponents(
      createButton("kb-math", "Math 🧮"),
      createButton("kb-sort", "Sorting ↕"),
      createButton("kb-repeating", "Repeating 👯‍♀️")
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
    eventType: EventType.SENT_HELER_MESSAGE,
    logOutputChannel,
    interaction,
  });
};

export default sendHelperMessage;