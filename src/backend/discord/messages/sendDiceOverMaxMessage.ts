import { maxDiceSides, maxImageDice, maxTextDice } from "../constants/index";
import { sendLogEventMessage } from ".";
import { EventType, SendDiceOverMaxMessageParams } from "../../shared/types";

const imageMsg = `${maxImageDice} dice max, sorry 😅`;
const textMsg = `${maxDiceSides} sides max and ${maxTextDice} dice max, sorry 😅`;

const sendDiceOverMaxMessage = async ({
  logOutputChannel,
  discord,
  args,
  interaction,
  shouldHaveImage,
}: SendDiceOverMaxMessageParams) => {
  const msg = shouldHaveImage ? imageMsg : textMsg;
  try {
    if (interaction) {
      await interaction.followUp(msg);
    }
  } catch (err) {
    console.error("Error sending dice over max message:", err);
  }

  sendLogEventMessage({
    eventType: EventType.SENT_DICE_OVER_MAX_MESSAGE,
    logOutputChannel,
    message,
    interaction,
    args,
    discord,
  });
};

export default sendDiceOverMaxMessage;