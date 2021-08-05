import { maxDice } from "../constants/index";
import {
  ButtonInteraction,
  CommandInteraction,
  Message,
  TextChannel
} from "discord.js";
import { logEvent } from "../services";

const sendDiceOverMaxMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  args?: string[],
  interaction?: CommandInteraction | ButtonInteraction
) => {
  const msg = `${maxDice} dice max, sorry 😅`;
  interaction
    ? await interaction.followUp(msg)
    : await message.channel.send(msg);
  logEvent(
    "sentDiceOverMaxMessage",
    logOutputChannel,
    message,
    undefined,
    args
  );
  return;
};

export default sendDiceOverMaxMessage;
