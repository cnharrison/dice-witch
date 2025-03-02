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
import setupEvents from './events';
import { CONFIG } from "../config";
import { DiscordService } from "../core/services/DiscordService";

const { token: discordToken, logOutputChannelId: logOutputChannelID, clientId } = CONFIG.discord;
const { discordbotlist, topgg } = CONFIG.botListAuth;

const scheduler = new ToadScheduler();
const discordService = DiscordService.getInstance();

export const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  failIfNotExists: false,
  sweepers: {
    messages: {
      interval: 300,
      lifetime: 600
    }
  }
});

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
          { name: "Exploding dice", value: "exploding" },
          { name: "Auto-reroll", value: "reroll" },
          { name: "Keep/drop AKA advantage", value: "keepdrop" },
          { name: "Target success/failure AKA Dice pool", value: "target" },
          { name: "Critical success/failure", value: "crit" },
          { name: "Sorting", value: "sort" },
          { name: "Math", value: "math" },
          { name: "Repeating", value: "repeating" },
        ],
      },
    ],
  },
  {
    name: "help",
    description: "List all commands or info about a specific command",
    options: [
      {
        name: "command",
        description: "The command to get help for",
        type: ApplicationCommandOptionType.String,
        required: false,
      }
    ],
  },
  {
    name: "web",
    description: "Access Dice Witch's web interface",
  },
  {
    name: "prefs",
    description: "Set your preferences on the web",
  },
];

const registerCommands = async (discord: Client) => {
  const shardId = discord.shard?.ids[0] ?? 'unknown';
  try {
    const channel = await discord.channels.fetch(logOutputChannelID) as TextChannel;
    console.log(`[Shard ${shardId}] Found log output channel ${channel?.name}`);
    console.log(`[Shard ${shardId}] Registering global slash commands...`);
    await discord.application?.commands.set(globalSlashCommands);
    console.log(`[Shard ${shardId}] Global slash commands registered successfully`);
    return channel;
  } catch (err) {
    console.error(`[Shard ${shardId}] Error registering commands:`, err);
    return null;
  }
};

const createBotSiteUpdateTask = (discord: Client) => {
  const shardId = discord.shard?.ids[0] ?? 'unknown';
  return new AsyncTask(
    "botsite updates",
    async () => {
      console.log(`[Shard ${shardId}] Running scheduled bot site update task`);
      const { totalGuilds } = await discordService.getUserCount() ?? {};
      console.log(`[Shard ${shardId}] Reporting ${totalGuilds} total guilds to bot listing sites`);
      
      const promises = [
        axios.post(
          `https://top.gg/api/bots/${clientId}/stats`,
          { server_count: totalGuilds },
          getHeaders(topgg)
        ).then(() => console.log(`[Shard ${shardId}] Successfully updated stats on top.gg`)),
        
        axios.post(
          `https://discordbotlist.com/api/v1/bots/${clientId}/stats`,
          { guilds: totalGuilds },
          getHeaders(discordbotlist)
        ).then(() => console.log(`[Shard ${shardId}] Successfully updated stats on discordbotlist.com`)),
      ];
      
      await Promise.all(promises);
      console.log(`[Shard ${shardId}] Bot site update completed successfully`);
    },
    (err: Error) => {
      console.error(`[Shard ${shardId}] Error updating bot site stats:`, err);
    }
  );
};

const startServer = () => {
  const shardId = discord.shard?.ids[0] ?? 'unknown';
  console.log(`[Shard ${shardId}] Starting up...`);
  
  discord.on("ready", async () => {
    const discordService = DiscordService.getInstance();
    discordService.setClient(discord);

    if (discord.user) {
      discord.user.setActivity("/roll");
    }

    console.log(`[Shard ${shardId}] Client ready. Logged in as ${discord.user?.tag} (${discord.user?.id})`);
    console.log(`[Shard ${shardId}] Serving ${discord.guilds.cache.size} guilds with ${discord.users.cache.size} users`);

    const logOutputChannel = await registerCommands(discord);
    if (logOutputChannel) {
      await setupEvents(discord, logOutputChannel);
      console.log(`[Shard ${shardId}] Events setup completed`);
    } else {
      console.error(`[Shard ${shardId}] Log output channel not found.`);
    }

    const task = createBotSiteUpdateTask(discord);
    const job = new SimpleIntervalJob({ hours: 4 }, task);
    scheduler.addSimpleIntervalJob(job);
    console.log(`[Shard ${shardId}] Bot site update scheduler initialized`);
  });

  discord.login(discordToken);

  discord.on('shardReady', (shardId) => {
    console.log(`[Shard ${shardId}] Ready and fully operational`);
  });
  
  discord.on('shardError', (error, shardId) => {
    console.error(`[Shard ${shardId}] Error:`, error);
  });
  
  discord.on('shardDisconnect', (event, shardId) => {
    console.log(`[Shard ${shardId}] Disconnected from Discord gateway. Code: ${event.code}`);
  });
  
  discord.on('shardReconnecting', (shardId) => {
    console.log(`[Shard ${shardId}] Reconnecting to Discord gateway...`);
  });
  
  discord.on('shardResume', (shardId, replayedEvents) => {
    console.log(`[Shard ${shardId}] Resumed connection. Replayed ${replayedEvents} events.`);
  });
};

startServer();