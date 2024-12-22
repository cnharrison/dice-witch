import {
  ButtonInteraction,
  Client,
  CommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getRandomNumber } from "../../shared/helpers";
import { sendLogEventMessage } from ".";
import { AttachmentBuilder, Message, TextChannel } from "discord.js";
import { EmbedObject, EventType, Result } from "../../shared/types";
import { tabletopColor } from "../constants";
import { Canvas } from "@napi-rs/canvas";

const createEmbed = (
  resultArray: Result[],
  grandTotal: number,
  attachment: AttachmentBuilder,
  title?: string,
  interaction?: CommandInteraction | ButtonInteraction
): EmbedBuilder => {
  const footerText = `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
    }\n${interaction ? `sent to ` + interaction.user.username : ``}`;

  const embed = new EmbedBuilder()
    .setColor(tabletopColor)
    .setImage("attachment://currentDice.png")
    .setFooter({ text: footerText });

  if (title) {
    embed.setTitle(title);
  }

  return embed;
};

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
    const embed = createEmbed(resultArray, grandTotal, attachment, title, interaction);
    return { embeds: [embed], files: [attachment] };
  } catch (err) {
    console.error("Error generating embed message:", err);
    throw new Error("Failed to generate embed message");
  }
};

const sendDiceResultMessageWithImage = async (
  resultArray: Result[],
  attachment: AttachmentBuilder,
  canvas: Canvas,
  logOutputChannel: TextChannel,
  discord: Client,
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
        if (interaction) {
          await interaction.followUp(embedMessage);
        }
        sendLogEventMessage({
          eventType: EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE,
          logOutputChannel,
          discord,
          embedParam: embedMessage,
          canvasString: canvas.toDataURL(),
        });
      } catch (err) {
        console.error("Error sending message:", err);
      }
    };

    if (interaction) {
      await sendMessage();
    } else {
      setTimeout(sendMessage, getRandomNumber(5000));
    }
  } catch (err) {
    console.error("Error in sendDiceResultMessageWithImage:", err);
    throw new Error("Failed to send dice result message with image");
  }
};

export default sendDiceResultMessageWithImage;