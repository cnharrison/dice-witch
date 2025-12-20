import { EventType, SendDiceResultMessageParams } from "../../shared/types";
import { DiceService } from "../../core/services/DiceService";
import sendLogEventMessage from "./sendLogEventMessage";
import { AttachmentBuilder } from "discord.js";

const sendDiceResultMessage = async ({
  resultArray,
  interaction,
  title,
}: SendDiceResultMessageParams) => {
  try {
    const diceService = DiceService.getInstance();
    const embed = await diceService.generateEmbedMessage({
      resultArray,
      attachment: new AttachmentBuilder(Buffer.from(''), { name: 'dummy.webp' }),
      title,
      interaction,
      source: 'discord'
    });

    const resultsText = resultArray.map((result) => result.output).join("\n");

    if (interaction?.deferred) {
      await interaction.followUp({
        embeds: embed.embeds,
      });
    } else if (interaction) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          embeds: embed.embeds,
        });
      } else {
        await interaction.reply({
          embeds: embed.embeds,
        });
      }
    }

    try {
      sendLogEventMessage({
        eventType: EventType.SENT_ROLL_RESULT_MESSAGE,
        resultMessage: resultsText,
        title,
        interaction
      }).catch(() => {});
    } catch (error) {
      console.error("Error sending log event:", error);
    }
  } catch (err) {
    console.error("Error sending dice result message:", err);
    throw new Error("Failed to send dice result message");
  }
};

export default sendDiceResultMessage;
