import { logEvent } from "../services";
import {
  ButtonInteraction,
  CommandInteraction,
  Message,
  TextChannel
} from "discord.js";

const sendNeedPermissionMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  interaction?: CommandInteraction | ButtonInteraction
) => {
  const msg = `looks like i don't have permission to either **attach files** or **embed links** in this channel. i need both of them to show you the dice 😅`;
  interaction
    ? await interaction.followUp(msg)
    : await message.channel.send(msg);
  logEvent({
    eventType: "sentNeedPermissionsMessage",
    logOutputChannel,
    message,
    interaction
  });
};

export default sendNeedPermissionMessage;
