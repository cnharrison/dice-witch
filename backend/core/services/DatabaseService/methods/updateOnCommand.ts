import { CommandInteraction, ButtonInteraction, GuildMember } from "discord.js";
import { DatabaseService } from "..";
import { DiscordService } from "../../DiscordService";
import { PERMISSION_ADMINISTRATOR, ROLE_DICE_WITCH_ADMIN } from "../../../constants";

export async function updateOnCommand(
  this: DatabaseService,
  { commandName, interaction }: { 
    commandName: string;
    interaction?: CommandInteraction | ButtonInteraction; 
  }
): Promise<void> {
  if (!interaction) return;
  if (this.processedInteractions.has(interaction.id)) return;

  const { user, guild, member } = interaction;
  if (!guild?.id) return;
  const discordService = DiscordService.getInstance();
  const resolvedMember = await discordService.fetchGuildMember(member as GuildMember);

  try {
    await this.prisma.$transaction(async (tx) => {
      const userId = user.id;
      const guildId = guild.id;

      const guildData = this.mapGuildToGuildType(guild);
      await tx.guilds.upsert({
        where: { id: guildId },
        update: {
          name: guildData.name,
          icon: guildData.icon,
          ownerId: guildData.ownerId,
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: guildData.publicUpdatesChannelId,
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: ["r", "roll"].includes(commandName) ? { increment: 1 } : undefined,
          isActive: true,
        },
        create: {
          id: guildId,
          name: guildData.name,
          icon: guildData.icon,
          ownerId: guildData.ownerId,
          memberCount: guildData.memberCount,
          approximateMemberCount: guildData.approximateMemberCount,
          preferredLocale: guildData.preferredLocale,
          publicUpdatesChannelId: guildData.publicUpdatesChannelId,
          joinedTimestamp: guildData.joinedTimestamp,
          rollCount: ["r", "roll"].includes(commandName) ? 1 : 0,
          isActive: true,
        },
      });

      const userData = this.mapUserToUserType(user);
      await tx.users.upsert({
        where: { id: userId },
        update: {
          username: userData.username,
          avatar: userData.avatar,
          flags: userData.flags ? userData.flags.bitfield : undefined,
          discriminator: userData.discriminator,
          rollCount: ["r", "roll"].includes(commandName) ? { increment: 1 } : undefined,
        },
        create: {
          id: userId,
          username: userData.username,
          avatar: userData.avatar,
          flags: userData.flags ? userData.flags.bitfield : undefined,
          discriminator: userData.discriminator,
          rollCount: ["r", "roll"].includes(commandName) ? 1 : 0,
        },
      });

      if (resolvedMember) {
        const guildMember = resolvedMember;
        const isAdmin = guildMember.permissions.has(PERMISSION_ADMINISTRATOR);
        const isDiceWitchAdmin = guildMember.roles.cache.some(role => role.name === ROLE_DICE_WITCH_ADMIN);

        await tx.usersGuilds.upsert({
          where: {
            userId_guildId: {
              userId,
              guildId
            }
          },
          update: {
            isAdmin,
            isDiceWitchAdmin,
            updated_at: new Date()
          },
          create: {
            userId,
            guildId,
            isAdmin,
            isDiceWitchAdmin
          }
        });
      }
    });

    this.processedInteractions.add(interaction.id);
  } catch (err) {
    console.error("Error updating on command:", err);
  }
}
