import { Client, Intents } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { discordToken } from "../../config.json";

const prisma = new PrismaClient();

const startServer = () => {
  const discord = new Client({
    intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.DIRECT_MESSAGES,
      Intents.FLAGS.DIRECT_MESSAGE_TYPING,
    ],
    partials: ["MESSAGE", "CHANNEL", "REACTION"],
  });
  discord.on("ready", async () => {
    console.log(`[Discord] Registered.`);
    const promises = discord.guilds.cache.map(async (guild) => {
      const {
        id,
        name,
        icon,
        ownerId,
        memberCount,
        approximateMemberCount,
        preferredLocale,
        publicUpdatesChannelId,
        joinedTimestamp,
      } = guild;
      console.log(`writing ${guild.name}....`);
      try {
        await prisma.guilds.upsert({
          where: {
            id: Number(id),
          },
          update: {
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
          },
          create: {
            id: Number(id),
            name,
            icon,
            ownerId: Number(ownerId),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: Number(publicUpdatesChannelId),
            joinedTimestamp,
            rollCount: 0,
          },
        });
      } catch (err) {
        console.log(`❌ error writing ${guild.name}....`);
        console.error(err);
      }
      console.log(`...written! ✅`);
    });
    await Promise.all(promises);
    console.log("..all done! ✅✅✅😊👌");
  });

  discord.login(discordToken);
};
startServer();
