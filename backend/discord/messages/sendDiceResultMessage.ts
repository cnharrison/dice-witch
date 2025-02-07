
import { makeBold } from "../../shared/helpers";
import { EventType, Result, SendDiceResultMessageParams } from "../../shared/types";
import sendLogEventMessage from "./sendLogEventMessage";

const sendDiceResultMessage = async ({
  resultArray,
  interaction,
  title,
}: SendDiceResultMessageParams) => {
  const grandTotal = resultArray.reduce(
    (prev: number, cur: Result) => prev + cur.results,
    0
  );

  const userId = interaction ? interaction.user.id : "unknown user";
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
    }

    sendLogEventMessage({
      eventType: EventType.SENT_ROLL_RESULT_MESSAGE,
      resultMessage: reply,
    });
  } catch (err) {
    console.error("Error sending dice result message:", err);
    throw new Error("Failed to send dice result message");
  }
};

export default sendDiceResultMessage;