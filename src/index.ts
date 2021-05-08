import Discord from "discord.js";
import dbotsPkg from "dbots";
import commands from "./commands";
import events from "./events";
import {
  discordToken,
  logOutputChannel,
  listTokens,
  clientID,
} from "../config.json";

const startServer = () => {
  const discord = new Discord.Client();

  discord.on("ready", async () => {
    const { discordbotlist, topgg, dbots } = listTokens;
    try {
      const poster = new dbotsPkg.Poster({
        clientID,
        apiKeys: {
          discordbotlist,
          topgg,
          dbots,
        },
        clientLibrary: "discord.js",
        serverCount: async () => discord.guilds.cache.size,
      });
      poster.startInterval();
    } catch (err) {
      console.error(err);
    }
    let logOutputChannelTemp;
    discord.user ? discord.user.setActivity("!roll [dice notation]") : {};
    try {
      const channel: any = await discord.channels.fetch(logOutputChannel);
      logOutputChannelTemp = channel;
      console.log(`[Discord] Found log output channel ${channel.name}`);
    } catch (err) {
      console.error(err);
    }
    commands(discord, logOutputChannelTemp);
    events(discord, logOutputChannelTemp);
  });

  discord.login(discordToken);
};
startServer();
