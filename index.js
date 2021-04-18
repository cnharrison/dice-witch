const Discord = require("discord.js");
const dbotsPkg = require("dbots");
const { discordToken, logOutputChannel, listTokens } = require("./config.json");

const startServer = () => {
  const discord = new Discord.Client();

  discord.on("ready", async () => {
    let logOutputChannelTemp;
    discord.user.setActivity("!roll [dice notation]");
    try {
      const channel = await discord.channels.fetch(logOutputChannel);
      logOutputChannelTemp = channel;
      console.log(`[Discord] Found log output channel ${channel.name}`);
    } catch (err) {
      console.error(err);
    }

    try {
      const { discordbotlist, topgg, dbots } = listTokens;
      const poster = new dbotsPkg.Poster({
        discord,
        apiKeys: {
          discordbotlist,
          topgg,
          dbots,
        },
        clientLibrary: "discord.js",
      });

      poster.startInterval();
    } catch (err) {
      console.error(err);
    }
    require("./src/commands/index")(discord, logOutputChannelTemp);
    require("./src/events/index")(discord, logOutputChannelTemp);
  });
  discord.login(discordToken);
};
startServer();
