import Discord, {
  ButtonInteraction,
  CommandInteraction,
  MessageEmbed
} from "discord.js";
import { getRandomNumber } from "../helpers";
import { sendLogEventMessage } from ".";
import { MessageAttachment, Message, TextChannel } from "discord.js";
import { EmbedObject, EventType, Result } from "../types";

const generateEmbedMessage = async (
  resultArray: Result[],
  attachment: MessageAttachment,
  title?: string,
  interaction?: CommandInteraction | ButtonInteraction
): Promise<{ embeds: MessageEmbed[]; files: MessageAttachment[] }> => {
  const grandTotal = resultArray.reduce(
    (prev: number, cur: Result) => prev + cur.results,
    0
  );
  try {
    const embed = title
      ? new Discord.MessageEmbed()
        .setColor("#966F33")
        .setTitle(title)
        .setImage("attachment://currentDice.png")
        .setFooter(
          `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
          }\n${interaction ? `sent to ` + interaction.user.username : ``}
          `
        )
      : new Discord.MessageEmbed()
        .setColor("#966F33")
        .setImage("attachment://currentDice.png")
        .setFooter(
          `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
          }\n${interaction ? `sent to ` + interaction.user.username : ``}
          `
        );
    return { embeds: [embed], files: [attachment] };
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

const sendDiceResultMessageWithImage = async (
  resultArray: Result[],
  message: Message,
  attachment: MessageAttachment,
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
          embedParam: embedMessage
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
