import { Client, Intents } from "discord.js";
import axios from "axios";
import Cron from "cron";
import commands from "./commands";
import events from "./events";
import {
  discordToken,
  logOutputChannel,
  botListAuthKeys,
  clientID
} from "../config.json";
const { discordbotlist, topgg, dbots } = botListAuthKeys;

const getHeaders = (key: string) => {
  return {
    headers: {
      Authorization: key
    }
  };
};

const globalSlashCommands: any = [
  {
    name: "roll",
    description: "/roll [dice notation], e.g. 1d6+1 2d4. /roll for help",
    options: [
      {
        name: "notation",
        description: "dice notation string",
        type: "STRING"
      },
      {
        name: "title",
        description: "what is this roll for? e.g. attack with sword",
        type: "STRING"
      },
      {
        name: "timestorepeat",
        description: "how many times to repeat this notation",
        type: "STRING"
      }
    ]
  },
  {
    name: "knowledgebase",
    description: "show the knowledgebase",
    options: [
      {
        name: "topic",
        required: true,
        description: "what you want to know about",
        type: "STRING",
        choices: [
          {
            name: "Exploding dice",
            value: "kb-exploding-slash"
          },
          {
            name: "Auto-reroll",
            value: "kb-reroll-slash"
          },
          {
            name: "Keep/drop AKA advantage",
            value: "kb-keepdrop-slash"
          },
          {
            name: "Target success/failure AKA Dice pool",
            value: "kb-target-slash"
          },
          {
            name: "Critical success/failure",
            value: "kb-crit-slash"
          },
          {
            name: "Sorting",
            value: "kb-sort-slash"
          },
          {
            name: "Math",
            value: "kb-math-slash"
          },
          {
            name: "Repeating",
            value: "kb-repeating-slash"
          }
        ]
      }
    ]
  }
];

const startServer = () => {
  const discord = new Client({
    intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.DIRECT_MESSAGES,
      Intents.FLAGS.DIRECT_MESSAGE_TYPING
    ],
    partials: ["MESSAGE", "CHANNEL", "REACTION"]
  });
  discord.on("ready", async () => {
    let logOutputChannelTemp;
    discord.user ? discord.user.setActivity("/roll") : {};
    try {
      const channel: any = await discord.channels.fetch(logOutputChannel);
      logOutputChannelTemp = channel;
      console.log(`[Discord] Found log output channel ${channel.name}`);
      console.log(`[Discord] Registering global slash commands...`);
      await discord.application?.commands.set(globalSlashCommands);
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
              server_count: discord.guilds.cache.size
            },
            getHeaders(topgg)
          );
          axios.post(
            `https://discordbotlist.com/api/v1/bots/${clientID}}/stats`,
            {
              guilds: discord.guilds.cache.size
            },
            getHeaders(discordbotlist)
          );
          axios.post(
            `https://dbots.co/api/v1/bots/${clientID}/stats`,
            {
              guildCount: discord.guilds.cache.size
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
