import {
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
let scheduler: ToadScheduler | null = null;

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

function forwardErrorToManager(type: string, error: any, context: Record<string, any> = {}) {
  let normalizedError: Error;
  if (error instanceof Error) {
    normalizedError = error;
  } else {
    let message: string;
    try {
      message = typeof error === 'string' ? error : JSON.stringify(error);
    } catch {
      message = String(error);
    }
    normalizedError = new Error(message);
  }
  let enhancedContext = { ...context };

  if (context.guildId && !enhancedContext.guild) {
    try {
      const guild = discord.guilds.cache.get(context.guildId);
      if (guild) {
        enhancedContext.guild = {
          id: guild.id,
          name: guild.name
        };
      }
    } catch (e) {
      enhancedContext.guild = { id: context.guildId };
    }
  }

  if (context.userId && !enhancedContext.user) {
    try {
      const user = discord.users.cache.get(context.userId);
      if (user) {
        enhancedContext.user = {
          id: user.id,
          tag: user.tag,
          username: user.username
        };
      }
    } catch (e) {
      enhancedContext.user = { id: context.userId };
    }
  }

  if (process.send) {
    const errorData = {
      type: 'error',
      errorType: type,
      message: normalizedError.message,
      stack: normalizedError.stack,
      shardId: currentShardId,
      timestamp: Date.now(),
      context: enhancedContext
    };

    process.send(errorData);
  }

  console.error(`${type}:`, normalizedError);

  if (enhancedContext.guild) {
    console.error(`Guild: ${enhancedContext.guild.name || 'Unknown'} (${enhancedContext.guild.id || 'Unknown ID'})`);
  }

  if (enhancedContext.user) {
    console.error(`User: ${enhancedContext.user.username || enhancedContext.user.tag || 'Unknown'} (${enhancedContext.user.id || 'Unknown ID'})`);
  }

  if (enhancedContext.commandName) {
    console.error(`Command: ${enhancedContext.commandName}`);
  }
}

process.on('uncaughtException', (error) => {
  forwardErrorToManager('UNCAUGHT_EXCEPTION', error);
});

process.on('unhandledRejection', (reason) => {
  forwardErrorToManager('UNHANDLED_REJECTION', reason);
});

process.on('SIGINT', () => {
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }
  
  if (discord) {
    discord.emit('shutdown');
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  if (scheduler) {
    scheduler.stop();
    scheduler = null;
  }
  
  if (discord) {
    discord.emit('shutdown');
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

const { token: discordToken, logOutputChannelId: logOutputChannelID, clientId } = CONFIG.discord;
const { discordbotlist, topgg } = CONFIG.botListAuth;

if (scheduler === null) {
  scheduler = new ToadScheduler();
}

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

import { globalSlashCommands } from './commands/definitions';

const registerCommands = async (discord: Client) => {
  try {
    console.log(`Registering global slash commands...`);
    await discord.application?.commands.set(globalSlashCommands);
    console.log(`Commands registered successfully`);
  } catch (err) {
    console.error(`Error registering commands:`, err);
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

  discord.once("ready", async () => {
    if (discord.shard?.ids && discord.shard.ids.length > 0) {
      currentShardId = discord.shard.ids[0].toString();
    }

    const discordService = DiscordService.getInstance();
    discordService.setClient(discord);

    if (discord.user) {
      discord.user.setActivity("/roll");
    }

    console.log(`Ready! Logged in as ${discord.user?.tag} in ${discord.guilds.cache.size} servers`);

    await registerCommands(discord);
    
    let logOutputChannel = null;
    try {
      logOutputChannel = await discord.channels.fetch(logOutputChannelID) as TextChannel;
      console.log(`Found log output channel: ${logOutputChannel?.name}`);
    } catch (err) {
      console.log(`Log channel not available on this shard, continuing without it`);
    }
    
    await setupEvents(discord);

    if (discord.shard?.ids[0] === 0 && scheduler) {
      const task = createBotSiteUpdateTask(discord);
      const job = new SimpleIntervalJob({ hours: 4 }, task);
      scheduler.addSimpleIntervalJob(job);
      console.log(`Bot site update scheduler initialized`);
      
      discord.on('shutdown', () => {
        if (scheduler) {
          scheduler.stop();
          scheduler = null;
        }
      });
    }
  });



  discord.login(discordToken);

  discord.on('shardReady', (shardId) => {
    console.log(`Shard ${shardId} ready`);
  });

  discord.on('shardError', (error, shardId) => {
    forwardErrorToManager('SHARD_ERROR', error, { shardId });
  });

  discord.on('shardDisconnect', (event, shardId) => {
    console.log(`Shard ${shardId} disconnected. Code: ${event.code}`);
    forwardErrorToManager('SHARD_DISCONNECT', new Error(`Shard disconnected with code ${event.code}`), {
      shardId,
      code: event.code,
      reason: event.reason
    });
  });

  discord.on('shardReconnecting', (shardId) => {
    console.log(`Shard ${shardId} reconnecting...`);
  });

  discord.on('error', (error) => {
    forwardErrorToManager('DISCORD_CLIENT_ERROR', error);
  });

  discord.on('warn', (message) => {
    forwardErrorToManager('DISCORD_WARNING', new Error(message));
  });

  discord.on('debug', (message) => {
    if (message.includes('error') || 
        message.includes('Error') || 
        message.includes('failed') || 
        message.includes('Unknown interaction') || 
        message.includes('Interaction has not been acknowledged') ||
        message.includes('application did not respond')) {
      
      let errorType = 'DISCORD_DEBUG';
      if (message.includes('Unknown interaction') || 
          message.includes('Interaction has not been acknowledged') ||
          message.includes('application did not respond')) {
        errorType = 'INTERACTION_TIMEOUT_DEBUG';
      }
      
      forwardErrorToManager(errorType, new Error(message));
    }
  });

  process.on('exit', (code) => {
    if (code !== 0) {
      forwardErrorToManager('PROCESS_EXIT', new Error(`Process exiting with code: ${code}`), { exitCode: code });
    }
    console.log(`Process exiting with code: ${code}`);
  });
};

startServer();
