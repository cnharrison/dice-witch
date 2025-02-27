import { makeBold } from "../../shared/helpers";
import { EventType, Result, SendDiceResultMessageParams } from "../../shared/types";
import { DiceService } from "../../core/services/DiceService";
import sendLogEventMessage from "./sendLogEventMessage";

const sendDiceResultMessage = async ({
  resultArray,
  interaction,
  title,
}: SendDiceResultMessageParams) => {
  try {
    const diceService = DiceService.getInstance();
    const embed = await diceService.generateEmbedMessage({
      resultArray,
      attachment: { attachment: Buffer.from(''), name: 'dummy.png' },
      title,
      interaction,
      source: 'discord'
    });

    const userId = interaction ? interaction.user.id : "unknown user";
    const titleText = title ? makeBold(title) : "";
    const resultsText = resultArray.map((result) => result.output).join("\n");
    const grandTotal = resultArray.reduce(
      (prev: number, cur: Result) => prev + cur.results,
      0
    );
    const grandTotalText = resultArray.length > 1 ? `\ngrand total = \`${grandTotal}\`` : "";

    const reply = `<@${userId}> 🎲 ${titleText}\n${resultsText} ${grandTotalText}`;

    if (interaction?.deferred) {
      await interaction.followUp({
        embeds: embed.embeds,
      });
    } else if (interaction) {
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