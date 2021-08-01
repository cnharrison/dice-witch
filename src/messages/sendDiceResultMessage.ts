import Discord, { CommandInteraction, MessageEmbed } from "discord.js";
import { getRandomNumber } from "../helpers";
import { logEvent } from "../services/index";
import { MessageAttachment, Message, TextChannel } from "discord.js";
import { Result } from "../types";

const generateEmbedMessage = async (
  resultArray: Result[],
  attachment: MessageAttachment,
  message: Message,
  title?: string,
  interaction?: CommandInteraction
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
          }\nsent to ${interaction ? interaction.user.username : message.author.username
          }`
        )
      : new Discord.MessageEmbed()
        .setColor("#966F33")
        .setImage("attachment://currentDice.png")
        .setFooter(
          `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""
          }\nsent to ${interaction ? interaction.user.username : message.author.username
          }`
        );
    return { embeds: [embed], files: [attachment] };
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

const sendDiceResultMessage = async (
  resultArray: Result[],
  message: Message,
  attachment: MessageAttachment,
  logOutputChannel: TextChannel,
  interaction?: CommandInteraction,
  title?: string
) => {
  try {
    const embedMessage: {
      embeds: MessageEmbed[];
      files: MessageAttachment[];
    } = await generateEmbedMessage(
      resultArray,
      attachment,
      message,
      title,
      interaction
    );

    const sendMessage = async () => {
      try {
        await message.channel.send(embedMessage);
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
      } catch (err) { }
    };

    setTimeout(sendMessage, getRandomNumber(5000));

    return;
  } catch (err) {
    console.error(err);
    throw new Error(err);
  }
};

export default sendDiceResultMessage;
