import { maxDiceSides, maxImageDice, maxTextDice } from "../constants/index";
import {
  ButtonInteraction,
  Client,
  CommandInteraction,
  Message,
  TextChannel,
} from "discord.js";
import { sendLogEventMessage } from "../messages";
import { EventType } from "../types";

const imageMsg = `${maxImageDice} dice max, sorry 😅`;
const textMsg = `${maxDiceSides} sides max and ${maxTextDice} dice max, sorry 😅`;

const sendDiceOverMaxMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  discord: Client,
  args?: string[],
  interaction?: CommandInteraction | ButtonInteraction,
  shouldHaveImage?: boolean
) => {
  const msg = shouldHaveImage ? imageMsg : textMsg;
  try {
    if (interaction) {
      await interaction.followUp(msg);
    } else {
      await message.reply(msg);
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