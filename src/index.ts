import { Client, Intents } from "discord.js";
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

const globalSlashCommands: any = {
  name: "roll",
  description: "/roll [dice notation], e.g. 1d6+1 2d4. /roll for help",
  options: [
    {
      name: 'notation',
      description: "dice notation string",
      type: 'STRING',
    },
    {
      name: 'title',
      description: "what is this roll for? e.g. attack with sword",
      type: 'STRING'
    }
  ]
};

const startServer = () => {
  const discord = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })
  discord.on("ready", async () => {
    let logOutputChannelTemp;
    discord.user ? discord.user.setActivity("!roll [dice notation]") : {};
    try {
      const channel: any = await discord.channels.fetch(logOutputChannel);
      logOutputChannelTemp = channel;
      console.log(`[Discord] Found log output channel ${channel.name}`);
      console.log(`[Discord] Registering global slash commands...`);
      await discord.application?.commands.create(globalSlashCommands);
      console.log(`[Discord] Registered.`);
    } catch (err) {
      console.error(err);
    }
    commands(discord, logOutputChannelTemp);
    events(discord, logOutputChannelTemp);

    const job = new Cron.CronJob(
      "22 * * * *",
      () => {
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
