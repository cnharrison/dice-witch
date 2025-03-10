import { Client, GatewayIntentBits, Partials } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { CONFIG } from "../../config";

const prisma = new PrismaClient();
const { token: discordToken } = CONFIG.discord;

const startServer = () => {
  const discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
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

      try {
        const guildId = BigInt(id);
        const ownerBigInt = BigInt(ownerId);
        const updateChannelId = publicUpdatesChannelId ? BigInt(publicUpdatesChannelId) : null;

        await prisma.guilds.upsert({
          where: { id: guildId.toString() },
          update: {
            name,
            icon,
            ownerId: ownerBigInt.toString(),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: updateChannelId ? updateChannelId.toString() : null,
            joinedTimestamp,
          },
          create: {
            id: guildId.toString(),
            name,
            icon,
            ownerId: ownerBigInt.toString(),
            memberCount,
            approximateMemberCount,
            preferredLocale,
            publicUpdatesChannelId: updateChannelId ? updateChannelId.toString() : null,
            joinedTimestamp,
            rollCount: 0,
          },
        });
      } catch (err) {
        console.error(`Error writing ${guild.name}:`, err);
        process.exit(1);
      }
    });
    await Promise.all(promises);
    console.log('Finished backfilling guilds');
    process.exit(0);
  });

  discord.login(discordToken);
};

startServer();
