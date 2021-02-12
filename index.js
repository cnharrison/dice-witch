const config = require("./config.json");
const Discord = require("discord.js");
const discord = new Discord.Client();

discord.on("ready", async () => {
  let logOutputChannel;
  discord.user.setActivity("!roll [dice notation]");
  try {
    const channel = await discord.channels.fetch(config.logOutputChannel);
    logOutputChannel = channel;
    console.log("[Discord] Found log output channel " + channel.name);
  } catch (err) {
    console.error(err);
  }
  require("./src/commands/index")(discord, logOutputChannel);
  require("./src/events/index")(discord, logOutputChannel);
});

discord.login(config.discordToken);
