import { logEvent } from "../services";
import { CommandInteraction, Message, TextChannel } from "discord.js";

const sendNeedPermissionMessage = async (
  message: Message,
  logOutputChannel: TextChannel,
  interaction?: CommandInteraction
) => {
  const msg = `doesn't look like i have permission to **attach files** in this channel. i need them to show you the dice 😅`;
  interaction ? await interaction.followUp(msg) : await message.channel.send(msg);
  logEvent("sentNeedPermissionsMessage", logOutputChannel, message);
};

export default sendNeedPermissionMessage;
