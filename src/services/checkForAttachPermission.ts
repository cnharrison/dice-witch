import {
  Message,
  TextChannel,
  ButtonInteraction,
  CommandInteraction,
  ChannelType,
} from "discord.js";

const checkForAttachPermission = (
  message: Message,
  interaction?: ButtonInteraction | CommandInteraction
) => {
  const channel = interaction?.channel ?? (message.channel as TextChannel);
  const guild = interaction?.guild ?? message.guild;
  const me = guild?.members.me;

  if (!guild || !me || channel.type !== ChannelType.GuildText) {
    return true;
  }

  const permissions = channel.permissionsFor(me);
  const permissionArray = permissions?.toArray();

  return permissionArray?.includes("AttachFiles") && permissionArray?.includes("EmbedLinks") || false;
};

export default checkForAttachPermission;