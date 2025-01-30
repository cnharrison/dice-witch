import { DiceService } from '../../core/services/DiceService';
import { getRandomNumber } from "../../shared/helpers";
import { sendLogEventMessage } from ".";
import { EmbedObject, EventType, Result, SendDiceResultMessageWithImageParams } from "../../shared/types";
import { MAX_DELAY_MS } from '../../core/constants/index';

const diceService = DiceService.getInstance();

const sendDiceResultMessageWithImage = async ({
  resultArray,
  attachment,
  canvas,
  logOutputChannel,
  discord,
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
          const shardId = interaction?.guild?.shardId ? discord?.shard?.ids[0] : null;
          if (!shardId || shardId === interaction?.guild?.shardId) {
            if (!interaction.deferred && !interaction.replied) {
              await interaction.deferReply();
            }
            await interaction.followUp(embedMessage);
          }
        }
        sendLogEventMessage({
          eventType: EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE,
          logOutputChannel,
          discord,
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
    throw new Error("Failed to send dice result message with image");
  }
};

export default sendDiceResultMessageWithImage;