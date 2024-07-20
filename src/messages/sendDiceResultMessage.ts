import {
  Message,
  TextChannel,
  CommandInteraction,
  ButtonInteraction,
} from "discord.js";
import { makeBold } from "../helpers";
import { EventType, Result } from "../types";
import sendLogEventMessage from "./sendLogEventMessage";

const sendDiceResultMessage = async (
  resultArray: Result[],
  message: Message,
  logOutputChannel: TextChannel,
  interaction?: CommandInteraction | ButtonInteraction,
  title?: string
) => {
  const grandTotal = resultArray.reduce(
    (prev: number, cur: Result) => prev + cur.results,
    0
  );

  const userId = interaction ? interaction.user.id : message.author.id;
  const titleText = title ? makeBold(title) : "";
  const resultsText = resultArray.map((result) => result.output).join("\n");
  const grandTotalText = resultArray.length > 1 ? `\ngrand total = \`${grandTotal}\`` : "";

  const reply = `<@${userId}> 🎲 ${titleText}\n${resultsText} ${grandTotalText}`;

  try {
    if (interaction) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } else {
      await message.reply(reply);
    }

    sendLogEventMessage({
      eventType: EventType.SENT_ROLL_RESULT_MESSAGE,
      logOutputChannel,
      message,
      resultMessage: reply,
    });
  } catch (err) {
    console.error("Error sending dice result message:", err);
    throw new Error("Failed to send dice result message");
  }
};

export default sendDiceResultMessage;