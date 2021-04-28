import { Client, TextChannel, Guild } from "discord.js";

const { logEvent } = require("../services");

module.exports = function (discord: Client, logOutputChannel: TextChannel) {
  try {
    discord.on("guildCreate", (guild: Guild) => {
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

    discord.on("guildDelete", (guild: Guild) => {
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
