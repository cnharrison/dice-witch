import { ButtonInteraction, ChannelType, CommandInteraction } from "discord.js";
import { DiscordService } from "..";

export function checkForAttachPermission(
  this: DiscordService,
  interaction?: ButtonInteraction | CommandInteraction | any
): boolean {
  if (!interaction) return true;

  if (interaction.type === ChannelType.GuildText && interaction.guild) {
    const channel = interaction;
    const guild = channel.guild;
    const me = guild?.members?.me;

    if (!me) return true;

    const permissions = channel.permissionsFor(me);
    const permissionArray = permissions?.toArray();

    return (permissionArray?.includes("AttachFiles") &&
           permissionArray?.includes("EmbedLinks") &&
           permissionArray?.includes("ReadMessageHistory")) ||
           false;
  } else {
    try {
      const channelId = interaction.id || interaction.channelId;
      if (!channelId) return true;

      return true;
    } catch (error) {
      console.error("Error checking permissions:", error);
      return true;
    }
  }
}