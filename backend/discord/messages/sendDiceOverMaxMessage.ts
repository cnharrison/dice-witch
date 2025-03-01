import { maxDiceSides, maxImageDice } from "../../core/constants/index";
import { sendLogEventMessage } from ".";
import { EventType, SendDiceOverMaxMessageParams } from "../../shared/types";

const maxMsg = `${maxImageDice} dice max and ${maxDiceSides} sides max, sorry 😅`;

const sendDiceOverMaxMessage = async ({
  args,
  interaction,
}: SendDiceOverMaxMessageParams) => {
  const msg = maxMsg;
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