const { discordToken, logOutputChannel } = require("./config.json");
const Discord = require("discord.js");
const discord = new Discord.Client();

discord.on("ready", async () => {
  let logOutputChannelTemp;
  discord.user.setActivity("!roll [dice notation]");
  try {
    const channel = await discord.channels.fetch(logOutputChannel);
    logOutputChannelTemp = channel;
    console.log("[Discord] Found log output channel " + channel.name);
  } catch (err) {
    console.error(err);
  }
  require("./src/commands/index")(discord, logOutputChannelTemp);
  require("./src/events/index")(discord, logOutputChannelTemp);
});

discord.login(discordToken);
