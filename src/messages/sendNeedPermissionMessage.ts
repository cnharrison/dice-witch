import { logEvent } from "../services";
import { Message, TextChannel } from "discord.js";

const sendNeedPermissionMessage = (
  message: Message,
  logOutputChannel: TextChannel
) => {
  message.channel.send(
    `doesn't look like i have permission to **attach files** in this channel. i need them to show you the dice 😅`
  );
  logEvent("sentNeedPermissionsMessage", logOutputChannel, message);
};

export default sendNeedPermissionMessage;
