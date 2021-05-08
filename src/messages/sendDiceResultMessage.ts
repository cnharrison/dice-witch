import Discord, { FileOptions } from "discord.js";
import { getRandomNumber } from "../helpers";
import { logEvent } from "../services/index";
import {
  MessageAttachment,
  Message,
  TextChannel,
  MessageOptions,
  APIMessage,
} from "discord.js";
import { Result } from "../types";

const generateEmbed = async (
  resultArray: Result[],
  attachment: (string | MessageAttachment | FileOptions)[],
  message: Message,
  title?: string
): Promise<MessageOptions | APIMessage | undefined> => {
  const grandTotal = resultArray.reduce(
    (prev: number, cur: Result) => prev + cur.results,
    0
  );
  try {
    const embed = title
      ? new Discord.MessageEmbed()
          .setColor("#966F33")
          .setTitle(title)
          .attachFiles(attachment)
          .setImage("attachment://currentDice.png")
          .setFooter(
            `${resultArray.map((result) => result.output).join("\n")} ${
              resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
            }\nsent to ${message.author.username}`
          )
      : new Discord.MessageEmbed()
          .setColor("#966F33")
          .attachFiles(attachment)
          .setImage("attachment://currentDice.png")
          .setFooter(
            `${resultArray.map((result) => result.output).join("\n")} ${
              resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
            }\nsent to ${message.author.username}`
          );
    return embed;
  } catch (err) {
    console.log(err);
    throw new Error(err);
  }
};

const sendDiceResultMessage = async (
  resultArray: Result[],
  message: Message,
  attachment: (string | MessageAttachment | FileOptions)[],
  title: string | undefined,
  logOutputChannel: TextChannel
) => {
  try {
    const embed: MessageOptions | APIMessage | undefined = await generateEmbed(
      resultArray,
      attachment,
      message,
      title
    );

    const sendMessageAndStopTyping = async () => {
      try {
        embed && (await message.channel.send(embed));
        logEvent(
          "sentRollResultMessage",
          logOutputChannel,
          message,
          undefined,
          undefined,
          undefined,
          undefined,
          embed
        );
        message.channel.stopTyping();
      } catch (err) {
        message.channel.stopTyping();
      }
    };

    message.channel.startTyping();

    setTimeout(sendMessageAndStopTyping, getRandomNumber(5000));

    return;
  } catch (err) {
    console.log(err);
    throw new Error(err);
  }
};

export default sendDiceResultMessage;