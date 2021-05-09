import Discord from "discord.js";
import axios from "axios";
import Cron from "cron";
import commands from "./commands";
import events from "./events";
import {
  discordToken,
  logOutputChannel,
  botListAuthKeys,
  clientID,
} from "../config.json";
const { discordbotlist, topgg, dbots } = botListAuthKeys;

const getHeaders = (key: string) => {
  return {
    headers: {
      Authorization: key,
    },
  }
};

const startServer = () => {
  const discord = new Discord.Client();

  discord.on("ready", async () => {
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

    const job = new Cron.CronJob(
      "22 * * * *",
      function () {
        try {
          axios.post(
            `https://top.gg/api/bots/${clientID}/stats`,
            {
              server_count: discord.guilds.cache.size,
            },
            getHeaders(topgg)
          );
          axios.post(
            `https://discordbotlist.com/api/v1/bots/${clientID}}/stats`,
            {
              guilds: discord.guilds.cache.size,
            },
            getHeaders(discordbotlist)
          );
          axios.post(
            `https://dbots.co/api/v1/bots/${clientID}/stats`,
            {
              guildCount: discord.guilds.cache.size,
            },
            getHeaders(dbots)
          );
        } catch (err) {
          console.error(err);
        }
      },
      null,
      true,
      "America/New_York"
    );
    job.start();
  });

  discord.login(discordToken);
};
startServer();
