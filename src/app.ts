import {
  ApplicationCommandDataResolvable,
  ApplicationCommandOptionType,
  Client,
  GatewayIntentBits,
  Partials,
  TextChannel,
} from "discord.js";
import axios from "axios";
import { ToadScheduler, SimpleIntervalJob, AsyncTask } from "toad-scheduler";
import events from "./events";
import {
  discordToken,
  logOutputChannelID,
  botListAuthKeys,
  clientID,
} from "../config.json";
import { getUserCount } from "./services";
const { discordbotlist, topgg } = botListAuthKeys;

const scheduler = new ToadScheduler();

const getHeaders = (key: string) => ({
  headers: {
    Authorization: key,
  },
});

const globalSlashCommands: ApplicationCommandDataResolvable[] = [
  {
    name: "roll",
    description: "Throws some dice",
    options: [
      {
        name: "notation",
        required: true,
        description: "Dice notation, e.g. 1d6+2",
        type: ApplicationCommandOptionType.String,
      },
      {
        name: "title",
        description: "What is this roll for? e.g. attack with enchanted sword",
        type: ApplicationCommandOptionType.String,
      },
      {
        name: "timestorepeat",
        description:
          "If you would like to repeat this roll, enter the number of times here.",
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    name: "status",
    description: "Pings Dice Witch",
  },
  {
    name: "knowledgebase",
    description: "Shows the Dice Witch knowledgebase",
    options: [
      {
        name: "topic",
        required: true,
        description: "what you want to know about",
        type: ApplicationCommandOptionType.String,
        choices: [
          { name: "Exploding dice", value: "kb-exploding-slash" },
          { name: "Auto-reroll", value: "kb-reroll-slash" },
          { name: "Keep/drop AKA advantage", value: "kb-keepdrop-slash" },
          { name: "Target success/failure AKA Dice pool", value: "kb-target-slash" },
          { name: "Critical success/failure", value: "kb-crit-slash" },
          { name: "Sorting", value: "kb-sort-slash" },
          { name: "Math", value: "kb-math-slash" },
          { name: "Repeating", value: "kb-repeating-slash" },
        ],
      },
    ],
  },
];

const registerCommands = async (discord: Client) => {
  try {
    const channel = await discord.channels.fetch(logOutputChannelID) as TextChannel;
    console.log(`[Discord] Found log output channel ${channel?.name}`);
    console.log(`[Discord] Registering global slash commands...`);
    await discord.application?.commands.set(globalSlashCommands);
    console.log(`[Discord] Registered.`);
    return channel;
  } catch (err) {
    console.error("Error registering commands:", err);
    return null;
  }
};

const createBotSiteUpdateTask = (discord: Client) => {
  return new AsyncTask(
    "botsite updates",
    async () => {
      const { totalGuilds } = await getUserCount({ discord }) ?? {};
      const promises = [
        axios.post(
          `https://top.gg/api/bots/${clientID}/stats`,
          { server_count: totalGuilds },
          getHeaders(topgg)
        ),
        axios.post(
          `https://discordbotlist.com/api/v1/bots/${clientID}/stats`,
          { guilds: totalGuilds },
          getHeaders(discordbotlist)
        ),
      ];
      await Promise.all(promises);
    },
    (err: Error) => {
      console.error("Error updating bot site stats:", err);
    }
  );
};

const startServer = () => {
  const discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.DirectMessageTyping,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  discord.on("ready", async () => {
    if (discord.user) {
      discord.user.setActivity("/roll");
    }

    const logOutputChannel = await registerCommands(discord);
    if (logOutputChannel) {
      events(discord, logOutputChannel);
    } else {
      console.error("Log output channel not found.");
    }

    const task = createBotSiteUpdateTask(discord);
    const job = new SimpleIntervalJob({ hours: 4 }, task);
    scheduler.addSimpleIntervalJob(job);
  });

  discord.login(discordToken);
};

startServer();