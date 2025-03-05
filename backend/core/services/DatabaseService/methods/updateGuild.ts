import { GuildType } from "../../../../shared/types";
import { DatabaseService } from "..";

export async function updateGuild(
  this: DatabaseService,
  guildData: GuildType, 
  isARoll = false, 
  isActive = true
): Promise<void> {
  const guildId = guildData.id;
  const ownerId = guildData.ownerId;
  const updateChannelId = guildData.publicUpdatesChannelId;

  await this.prisma.$transaction(async (tx) => {
    await tx.guilds.upsert({
      where: { id: guildId },
      update: {
        name: guildData.name,
        icon: guildData.icon,
        ownerId,
        memberCount: guildData.memberCount,
        approximateMemberCount: guildData.approximateMemberCount,
        preferredLocale: guildData.preferredLocale,
        publicUpdatesChannelId: updateChannelId,
        joinedTimestamp: guildData.joinedTimestamp,
        rollCount: isARoll ? { increment: 1 } : undefined,
        isActive,
      },
      create: {
        id: guildId,
        name: guildData.name,
        icon: guildData.icon,
        ownerId,
        memberCount: guildData.memberCount,
        approximateMemberCount: guildData.approximateMemberCount,
        preferredLocale: guildData.preferredLocale,
        publicUpdatesChannelId: updateChannelId,
        joinedTimestamp: guildData.joinedTimestamp,
        rollCount: isARoll ? 1 : 0,
        isActive,
      },
    });
  });
}