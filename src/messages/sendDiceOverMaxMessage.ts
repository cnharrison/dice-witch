import { maxDice } from "../constants/index";
import {
  ButtonInteraction,
  CommandInteraction,
  Message,
  TextChannel
} from "discord.js";
import { sendLogEventMessage } from "../messages";
import { EventType } from "../types";

const msg = `${maxDice} dice max, sorry 😅`;

const sendDiceOverMaxMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  args?: string[],
  interaction?: CommandInteraction | ButtonInteraction
) => {
  interaction
    ? await interaction.followUp(msg)
    : await message.reply(msg);
  sendLogEventMessage({
    eventType: EventType.SENT_DICE_OVER_MAX_MESSAGE,
    logOutputChannel,
    message,
    interaction,
    args
  });
  return;
};

export default sendDiceOverMaxMessage;
