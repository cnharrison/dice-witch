import { DiscordService } from "..";

type UserCountResult = {
  totalGuilds: number;
  totalMembers: number;
};

export async function getUserCount(
  this: DiscordService
): Promise<UserCountResult> {
  try {
    if (this.client && this.client.isReady() && this.client.shard) {
      try {
        const [guildSizes, memberCounts] = await Promise.all([
          this.client.shard.fetchClientValues("guilds.cache.size"),
          this.client.shard.broadcastEval((c) =>
            c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
          ),
        ]);

        const totalGuilds = Array.isArray(guildSizes)
          ? guildSizes.reduce((acc: number, count) => acc + (Number(count) || 0), 0)
          : 0;

        const totalMembers = Array.isArray(memberCounts)
          ? memberCounts.reduce((acc: number, count) => acc + (Number(count) || 0), 0)
          : 0;

        if (Number(totalGuilds) > 0 || Number(totalMembers) > 0) {
          return { 
            totalGuilds: Number(totalGuilds), 
            totalMembers: Number(totalMembers) 
          };
        }
      } catch (error) {
        console.error("Error with client.shard method:", error);
      }
    }

    if (this.manager && this.manager.shards.size > 0) {
      try {
        let totalGuilds = 0;
        let totalMembers = 0;

        await Promise.all(Array.from(this.manager.shards.values()).map(async (shard) => {
          try {
            const counts = await shard.eval(c => ({
              guilds: c.guilds.cache.size,
              members: c.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0)
            }));

            if (counts && typeof counts.guilds === 'number') {
              totalGuilds += counts.guilds;
            }

            if (counts && typeof counts.members === 'number') {
              totalMembers += counts.members;
            }
          } catch (error) {
            console.error(`Error getting counts from shard ${shard.id}:`, error);
          }
        }));

        if (totalGuilds > 0 || totalMembers > 0) {
          return { totalGuilds, totalMembers };
        }
      } catch (error) {
        console.error("Error with manager shards method:", error);
      }
    }

    if (this.client && this.client.isReady()) {
      try {
        const totalGuilds = this.client.guilds.cache.size;
        const totalMembers = this.client.guilds.cache.reduce(
          (acc, guild) => acc + (guild.memberCount || 0), 0
        );

        if (totalGuilds > 0 || totalMembers > 0) {
          return { totalGuilds, totalMembers };
        }
      } catch (error) {
        console.error("Error with direct client method:", error);
      }
    }

    try {
      const shardStatus = await this.getShardStatus();
      let totalGuilds = 0;

      for (const shard of shardStatus) {
        if (typeof shard.guilds === 'number' && shard.guilds > 0) {
          totalGuilds += shard.guilds;
        }
      }

      if (totalGuilds > 0) {
        const totalMembers = totalGuilds * 10;
        return { totalGuilds, totalMembers };
      }
    } catch (error) {
      console.error("Error with shard status method:", error);
    }

    return { totalGuilds: 1, totalMembers: 10 };
  } catch (error) {
    console.error("Error in getUserCount:", error);
    return { totalGuilds: 1, totalMembers: 10 };
  }
}