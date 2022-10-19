import Discord, {
  ButtonInteraction,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getRandomNumber } from "../helpers";
import { sendLogEventMessage } from ".";
import { AttachmentBuilder, Message, TextChannel } from "discord.js";
import { EmbedObject, EventType, Result } from "../types";
import { tabletopColor } from "../constants";

const generateEmbedMessage = async (
  resultArray: Result[],
  attachment: AttachmentBuilder,
  title?: string,
  interaction?: CommandInteraction | ButtonInteraction
): Promise<{ embeds: EmbedBuilder[]; files: AttachmentBuilder[] }> => {
  const grandTotal = resultArray.reduce(
    (prev: number, cur: Result) => prev + cur.results,
    0
  );
  try {
    const embed = title
      ? new Discord.EmbedBuilder()
          .setColor(tabletopColor)
          .setTitle(title)
          .setImage("attachment://currentDice.png")
          .setFooter({
            text: `${resultArray.map((result) => result.output).join("\n")} ${
              resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
            }\n${interaction ? `sent to ` + interaction.user.username : ``}
          `,
          })
      : new Discord.EmbedBuilder()
          .setColor(tabletopColor)
          .setImage("attachment://currentDice.png")
          .setFooter({
            text: `${resultArray.map((result) => result.output).join("\n")} ${
              resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
            }\n${interaction ? `sent to ` + interaction.user.username : ``}
          `,
          });
    return { embeds: [embed], files: [attachment] };
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

const sendDiceResultMessageWithImage = async (
  resultArray: Result[],
  message: Message,
  attachment: AttachmentBuilder,
  logOutputChannel: TextChannel,
  interaction?: CommandInteraction | ButtonInteraction,
  title?: string
) => {
  try {
    const embedMessage: EmbedObject = await generateEmbedMessage(
      resultArray,
      attachment,
      title,
      interaction
    );

    const sendMessage = async () => {
      try {
        interaction
          ? await interaction?.followUp(embedMessage)
          : await message.reply(embedMessage);
        sendLogEventMessage({
          eventType: EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE,
          logOutputChannel,
          message,
          embedParam: embedMessage,
        });
      } catch (err) {
        console.error(err);
      }
    };

    setTimeout(sendMessage, getRandomNumber(5000));

    return;
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

export default sendDiceResultMessageWithImage;
