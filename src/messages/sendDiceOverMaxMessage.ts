import { maxDiceSides, maxImageDice, maxTextDice } from "../constants/index";
import {
  ButtonInteraction,
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
  args?: string[],
  interaction?: CommandInteraction | ButtonInteraction,
  shouldHaveImage?: boolean
) => {
  const msg = shouldHaveImage ? imageMsg : textMsg;
  interaction ? await interaction.followUp(msg) : await message.reply(msg);
  sendLogEventMessage({
    eventType: EventType.SENT_DICE_OVER_MAX_MESSAGE,
    logOutputChannel,
    message,
    interaction,
    args,
  });
  return;
};

export default sendDiceOverMaxMessage;
