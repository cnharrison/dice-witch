const Discord = require("discord.js");
const dbotsPkg = require("dbots");
const {
  discordToken,
  logOutputChannel,
  listTokens,
  clientID,
} = require("./config.json");

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
        serverCount: async () => discord.guilds.cache.size,
      });
      poster.startInterval();
    } catch (err) {
      console.error(err);
    }
    let logOutputChannelTemp;
    discord.user.setActivity("!roll [dice notation]");
    try {
      const channel = await discord.channels.fetch(logOutputChannel);
      logOutputChannelTemp = channel;
      console.log(`[Discord] Found log output channel ${channel.name}`);
    } catch (err) {
      console.error(err);
    }

    require("./src/commands/index")(discord, logOutputChannelTemp);
    require("./src/events/index")(discord, logOutputChannelTemp);
  });

  discord.login(discordToken);
};
startServer();
