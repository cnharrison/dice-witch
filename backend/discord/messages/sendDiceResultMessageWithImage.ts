import { DiceService } from '../../core/services/DiceService';
import { getRandomNumber } from "../../shared/helpers";
import { sendLogEventMessage } from ".";
import { EmbedObject, EventType, SendDiceResultMessageWithImageParams } from "../../shared/types";
import { MAX_DELAY_MS } from '../../core/constants/index';

const diceService = DiceService.getInstance();

const sendDiceResultMessageWithImage = async ({
  resultArray,
  attachment,
  canvas,
  interaction,
  title,
}: SendDiceResultMessageWithImageParams) => {
  try {
    const embedMessage: EmbedObject = await diceService.generateEmbedMessage({
      resultArray,
      attachment,
      title,
      interaction
    });

    const sendMessage = async () => {
      try {
        if (interaction?.isRepliable()) {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
          }
          await interaction.followUp(embedMessage);
        }

        sendLogEventMessage({
          eventType: EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE,
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
      setTimeout(sendMessage, getRandomNumber(MAX_DELAY_MS));
    }
  } catch (err) {
    console.error("Error in sendDiceResultMessageWithImage:", err);
  }
};

export default sendDiceResultMessageWithImage;