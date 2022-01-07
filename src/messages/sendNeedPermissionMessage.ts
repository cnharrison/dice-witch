import { sendLogEventMessage } from "../messages";
import {
  ButtonInteraction,
  CommandInteraction,
  Message,
  TextChannel,
} from "discord.js";
import { EventType } from "../types";

const msg = `Looks like I don't have permission to either **attach files** or **embed links** in this channel. I need both of them to show you the dice 😅`;

const sendNeedPermissionMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  interaction?: CommandInteraction | ButtonInteraction
) => {
  try {
    interaction ? await interaction.followUp(msg) : await message.reply(msg);
  } catch (err) {
    console.error(err);
  }
  sendLogEventMessage({
    eventType: EventType.SENT_NEED_PERMISSION_MESSAGE,
    logOutputChannel,
    message,
    interaction,
  });
};

export default sendNeedPermissionMessage;
