import { Client } from "discord.js";
import { DiscordService } from "..";
import { ROLE_DICE_WITCH_ADMIN } from "../../../constants";

type GuildSnapshot = {
  id: string;
  name: string;
  icon: string | null;
  ownerId: string;
  memberCount: number | null;
  approximateMemberCount: number | null;
  preferredLocale: string;
  publicUpdatesChannelId: string | null;
  joinedTimestamp: number | null;
};

type GuildMemberPermissions = {
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
};

export async function getGuildMemberPermissions(
  this: DiscordService,
  guildId: string,
  userId: string
): Promise<{ guild: GuildSnapshot; permissions: GuildMemberPermissions } | null> {
  if (!this.manager) {
    return null;
  }

  try {
    const shardId = Number(BigInt(guildId) >> 22n) % this.manager.shards.size;
    const shard = this.manager.shards.get(shardId);

    if (!shard) {
      return null;
    }

    const result = await shard.eval(async (client, { context }) => {
      try {
        if (!client.isReady()) {
          await new Promise<void>(resolve => (client as Client).once('ready', () => resolve()));
        }

        const guild = await client.guilds.fetch(context.guildId);
        if (!guild) {
          return null;
        }

        const member = await guild.members.fetch(context.userId).catch(() => null);
        if (!member) {
          return null;
        }

        const isAdmin = member.permissions.has("Administrator");
        const isDiceWitchAdmin = member.roles.cache.some(role => role.name === context.roleName);

        return {
          guild: {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            ownerId: guild.ownerId,
            memberCount: guild.memberCount ?? null,
            approximateMemberCount: guild.approximateMemberCount ?? null,
            preferredLocale: guild.preferredLocale,
            publicUpdatesChannelId: guild.publicUpdatesChannelId ?? null,
            joinedTimestamp: guild.joinedTimestamp ?? null,
          },
          permissions: {
            isAdmin,
            isDiceWitchAdmin,
          },
        };
      } catch (error) {
        return null;
      }
    }, {
      context: {
        guildId: guildId.toString(),
        userId: userId.toString(),
        roleName: ROLE_DICE_WITCH_ADMIN,
      },
    });

    return result || null;
  } catch (error) {
    return null;
  }
}
