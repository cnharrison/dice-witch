const { logEvent } = require("../services");

module.exports = function (discord, logOutputChannel) {
  try {
    discord.on("guildCreate", (guild) => {
      logEvent(
        "guildAdd",
        logOutputChannel,
        undefined,
        undefined,
        undefined,
        undefined,
        guild
      );
    });

    discord.on("guildDelete", (guild) => {
      logEvent(
        "guildRemove",
        logOutputChannel,
        undefined,
        undefined,
        undefined,
        undefined,
        guild
      );
    });
  } catch (err) {
    console.error(err);
  }
};
