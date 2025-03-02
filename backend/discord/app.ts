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

let currentShardId = 'unknown';

const getShardId = () => {
  if (currentShardId !== 'unknown') {
    return currentShardId;
  }
  
  try {
    if (discord && discord.shard && discord.shard.ids && discord.shard.ids.length > 0) {
      currentShardId = discord.shard.ids[0].toString();
      return currentShardId;
    }
  } catch (e) {
  }
  
  return 'unknown';
};

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  originalConsoleLog.apply(console, [`[Shard ${getShardId()}]`, ...args]);
};

console.error = function(...args) {
  originalConsoleError.apply(console, [`[Shard ${getShardId()}]`, ...args]);
};

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

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
  try {
    console.log(`Registering global slash commands...`);
    await discord.application?.commands.set(globalSlashCommands);
    console.log(`Commands registered successfully`);
    
    let channel = null;
    try {
      channel = await discord.channels.fetch(logOutputChannelID) as TextChannel;
      console.log(`Found log output channel: ${channel?.name}`);
    } catch (err) {
      console.log(`Log channel not available on this shard`);
    }
    
    return channel;
  } catch (err) {
    console.error(`Error registering commands:`, err);
    return null;
  }
};

const createBotSiteUpdateTask = (discord: Client) => {
  const shardId = discord.shard?.ids[0] ?? 'unknown';
  return new AsyncTask(
    "botsite updates",
    async () => {
      try {
        console.log(`[Shard ${shardId}] Running scheduled bot site update task`);
        
        const discordService = DiscordService.getInstance();
        discordService.setClient(discord);
        
        const { totalGuilds } = await discordService.getUserCount() ?? {};
        
        if (!totalGuilds || totalGuilds <= 0) {
          console.error(`[Shard ${shardId}] Failed to get guild count, skipping bot site update`);
          return;
        }
        
        console.log(`[Shard ${shardId}] Reporting ${totalGuilds} total guilds to bot listing sites`);
        
        const topggPromise = axios.post(
          `https://top.gg/api/bots/${clientId}/stats`,
          { server_count: totalGuilds },
          getHeaders(topgg)
        )
        .then(() => console.log(`[Shard ${shardId}] Successfully updated stats on top.gg`))
        .catch(err => console.error(`[Shard ${shardId}] Failed to update top.gg:`, err.message));
        
        const discordbotlistPromise = axios.post(
          `https://discordbotlist.com/api/v1/bots/${clientId}/stats`,
          { guilds: totalGuilds },
          getHeaders(discordbotlist)
        )
        .then(() => console.log(`[Shard ${shardId}] Successfully updated stats on discordbotlist.com`))
        .catch(err => console.error(`[Shard ${shardId}] Failed to update discordbotlist:`, err.message));
        
        await Promise.allSettled([topggPromise, discordbotlistPromise]);
        console.log(`[Shard ${shardId}] Bot site update task completed`);
      } catch (err) {
        console.error(`[Shard ${shardId}] Error in bot site update task:`, err);
      }
    },
    (err: Error) => {
      console.error(`[Shard ${shardId}] Error updating bot site stats:`, err);
    }
  );
};

const startServer = () => {
  console.log(`Starting up...`);
  
  discord.on("ready", async () => {
    if (discord.shard?.ids?.length > 0) {
      currentShardId = discord.shard.ids[0].toString();
    }
    
    const discordService = DiscordService.getInstance();
    discordService.setClient(discord);

    if (discord.user) {
      discord.user.setActivity("/roll");
    }

    console.log(`Ready! Logged in as ${discord.user?.tag} in ${discord.guilds.cache.size} servers`);
    
    if (process.send) {
      process.send({ type: 'ready', shardId: currentShardId });
    }

    const logOutputChannel = await registerCommands(discord);
    if (logOutputChannel) {
      await setupEvents(discord, logOutputChannel);
    }
    
    if (discord.shard?.ids[0] === 0) {
      const task = createBotSiteUpdateTask(discord);
      const job = new SimpleIntervalJob({ hours: 4 }, task);
      scheduler.addSimpleIntervalJob(job);
      console.log(`Bot site update scheduler initialized`);
    }
  });

  discord.login(discordToken);

  discord.on('shardReady', (shardId) => {
    console.log(`Shard ${shardId} ready`);
  });
  
  discord.on('shardError', (error, shardId) => {
    console.error(`SHARD ERROR: ${shardId}:`, error);
  });
  
  discord.on('shardDisconnect', (event, shardId) => {
    console.log(`Shard ${shardId} disconnected. Code: ${event.code}`);
  });
  
  discord.on('shardReconnecting', (shardId) => {
    console.log(`Shard ${shardId} reconnecting...`);
  });
  
  discord.on('error', (error) => {
    console.error(`DISCORD CLIENT ERROR:`, error);
  });
  
  process.on('exit', (code) => {
    console.log(`Process exiting with code: ${code}`);
  });
};

startServer();