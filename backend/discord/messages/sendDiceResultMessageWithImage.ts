import { DiceService } from "../../core/services/DiceService";
import { SendDiceResultMessageWithImageParams } from "../../shared/types";

const sendDiceResultMessageWithImage = async ({
  resultArray,
  attachment,
  canvas,
  interaction,
  title,
}: SendDiceResultMessageWithImageParams) => {
  try {
    const diceService = DiceService.getInstance();
    const embedMessage = await diceService.generateEmbedMessage({
      resultArray,
      attachment,
      title,
      interaction,
      source: 'discord'
    });

    if (interaction?.deferred) {
      await interaction.followUp({
        embeds: embedMessage.embeds,
        files: embedMessage.files,
      });
    }
  } catch (err) {
    console.error("Error sending dice result message with image:", err);
  }
};

export default sendDiceResultMessageWithImage;