import { Client } from "discord.js";

type UserCountResult = {
  totalGuilds: number;
  totalMembers: number;
};

const getUserCount = async ({
  discord,
}: {
  discord: Client;
  }): Promise<UserCountResult> => {
  try {
    const [guildSizes, memberCounts] = await Promise.all([
      discord?.shard?.fetchClientValues("guilds.cache.size"),
      discord?.shard?.broadcastEval((c) =>
        c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
      ),
    ]);

    const totalGuilds = (guildSizes as number[])?.reduce((acc, count) => acc + count, 0) || 0;
    const totalMembers = (memberCounts as number[])?.reduce((acc, count) => acc + count, 0) || 0;

    return { totalGuilds, totalMembers };
  } catch (error) {
    return Promise.reject(error);
  }
};

export default getUserCount;