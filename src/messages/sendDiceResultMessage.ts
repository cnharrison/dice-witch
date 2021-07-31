import Discord, { FileOptions, MessageEmbed, MessagePayload } from "discord.js";
import { getRandomNumber } from "../helpers";
import { logEvent } from "../services/index";
import {
  MessageAttachment,
  Message,
  TextChannel,
  MessageOptions,
} from "discord.js";
import { Result } from "../types";

const generateEmbedMessage = async (
  resultArray: Result[],
  attachment: MessageAttachment,
  message: Message,
  title?: string
): Promise<{ embeds: MessageEmbed[]; files: MessageAttachment[]; }> => {
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
          }\nsent to ${message.author.username}`
        )
      : new Discord.MessageEmbed()
        .setColor("#966F33")
        .setImage("attachment://currentDice.png")
        .setFooter(
          `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
          }\nsent to ${message.author.username}`
        );
    return ({ embeds: [embed], files: [attachment] })
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

const sendDiceResultMessage = async (
  resultArray: Result[],
  message: Message,
  attachment: MessageAttachment,
  title: string | undefined,
  logOutputChannel: TextChannel
) => {
  try {
    const embedMessage: { embeds: MessageEmbed[]; files: MessageAttachment[]; } = await generateEmbedMessage(
      resultArray,
      attachment,
      message,
      title
    );

    const sendMessageAndStopTyping = async () => {
      try {
        embedMessage && (await message.channel.send(embedMessage));
        logEvent(
          "sentRollResultMessage",
          logOutputChannel,
          message,
          undefined,
          undefined,
          undefined,
          undefined,
          embedMessage.embeds[0]
        );
      } catch (err) {
      }
    };

    message.channel.sendTyping();

    setTimeout(sendMessageAndStopTyping, getRandomNumber(5000));

    return;
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

export default sendDiceResultMessage;
