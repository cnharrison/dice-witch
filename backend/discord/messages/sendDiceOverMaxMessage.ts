import { maxDiceSides, maxImageDice, maxTextDice } from "../../core/constants/index";
import { sendLogEventMessage } from ".";
import { EventType, SendDiceOverMaxMessageParams } from "../../shared/types";

const imageMsg = `${maxImageDice} dice max, sorry 😅`;
const textMsg = `${maxDiceSides} sides max and ${maxTextDice} dice max, sorry 😅`;

const sendDiceOverMaxMessage = async ({
  args,
  interaction,
  shouldHaveImage,
}: SendDiceOverMaxMessageParams) => {
  const msg = shouldHaveImage ? imageMsg : textMsg;
  try {
    if (interaction) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply(msg);
      } else {
        await interaction.followUp(msg);
      }
    }
  } catch (err) {
    console.error("Error sending dice over max message:", err);
  }

  sendLogEventMessage({
    eventType: EventType.SENT_DICE_OVER_MAX_MESSAGE,
    interaction,
    args
  });
};

export default sendDiceOverMaxMessage;