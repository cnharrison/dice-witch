import { maxDice } from "../constants/index";
import { CommandInteraction, Message, TextChannel } from "discord.js";
import { logEvent } from "../services";

const sendDiceOverMaxMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  args?: string[],
  interaction?: CommandInteraction
) => {
  const msg = `${maxDice} dice max, sorry 😅`;
  interaction ? await interaction.followUp(msg) : message.channel.send(msg);
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
