import { CommandInteraction, GuildMember, Message } from "discord.js";
import { DiscordService } from "..";
import { DatabaseService } from "../../DatabaseService";
import { PERMISSION_ADMINISTRATOR, ROLE_DICE_WITCH_ADMIN } from "../../../constants";

export async function checkAndStorePermissions(
  this: DiscordService,
  interaction: CommandInteraction | Message
): Promise<void> {
  if (!interaction.guild || !interaction.member || this.handledInteractions.has(interaction.id)) return;

  this.trackInteraction(interaction.id);
  const member = await this.fetchGuildMember(interaction.member as GuildMember);
  if (!member) return;
  const isAdmin = member.permissions.has(PERMISSION_ADMINISTRATOR);
  const isDiceWitchAdmin = member.roles.cache.some(role => role.name === ROLE_DICE_WITCH_ADMIN);

  DatabaseService.getInstance().updateUserGuildPermissions({
    userId: member.id,
    guildId: interaction.guild.id,
    isAdmin,
    isDiceWitchAdmin
  });
}
