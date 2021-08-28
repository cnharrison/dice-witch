import { sendLogEventMessage } from "../messages";
import {
  ButtonInteraction,
  CommandInteraction,
  Message,
  TextChannel
} from "discord.js";
import { EventType } from "../types";

const sendNeedPermissionMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  interaction?: CommandInteraction | ButtonInteraction
) => {
  const msg = `looks like i don't have permission to either **attach files** or **embed links** in this channel. i need both of them to show you the dice 😅`;
  interaction
    ? await interaction.followUp(msg)
    : await message.reply(msg);
  sendLogEventMessage({
    eventType: EventType.SENT_NEED_PERMISSION_MESSAGE,
    logOutputChannel,
    message,
    interaction
  });
};

export default sendNeedPermissionMessage;
