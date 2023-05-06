import { Client } from "discord.js";

const getUserCount = ({
  discord,
}: {
  discord: Client;
}): Promise<void | {
  totalGuilds: unknown;
  totalMembers: unknown;
}> => {
  const promises = [
    discord?.shard?.fetchClientValues("guilds.cache.size"),
    discord?.shard?.broadcastEval((c) =>
      c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
    ),
  ];

  return Promise.all(promises)
    .then((results) => {
      const totalGuilds = results[0]?.reduce(
        (acc: any, guildCount: any) => acc + guildCount,
        0
      );
      const totalMembers = results[1]?.reduce(
        (acc: any, memberCount: any) => acc + memberCount,
        0
      );
      return { totalGuilds, totalMembers };
    })
    .catch(console.error);
};
export default getUserCount;
