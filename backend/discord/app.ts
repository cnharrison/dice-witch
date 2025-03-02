import {
  Client,
  GatewayIntentBits,
  Interaction,
  Partials,
  TextChannel,
} from "discord.js";

declare module "discord.js" {
  interface Client {
    trackCommandStart?: (interaction: Interaction) => void;
    trackCommandEnd?: (interaction: Interaction) => void;
  }
}
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

function forwardErrorToManager(type, error, context = {}) {
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
      message: error?.message || String(error),
      stack: error?.stack,
      shardId: currentShardId,
      timestamp: Date.now(),
      context: enhancedContext
    };

    process.send(errorData);
  }

  console.error(`${type}:`, error);

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

process.on('unhandledRejection', (reason, promise) => {
  forwardErrorToManager('UNHANDLED_REJECTION', reason);
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

import { globalSlashCommands } from './commands/definitions';

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
      discord.user.setActivity("/help");
    }

    console.log(`Ready! Logged in as ${discord.user?.tag} in ${discord.guilds.cache.size} servers`);

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


  const commandTimers = new Map();
  const SLOW_COMMAND_THRESHOLD = 2500;

  discord.trackCommandStart = (interaction) => {
    commandTimers.set(interaction.id, {
      receivedAt: Date.now(),
      commandName: interaction.commandName,
      guildId: interaction.guildId,
      userId: interaction.user.id
    });
  };

  discord.trackCommandEnd = (interaction) => {
    const timer = commandTimers.get(interaction.id);
    if (timer) {
      const completedAt = Date.now();
      const duration = completedAt - timer.receivedAt;

      if (duration > SLOW_COMMAND_THRESHOLD) {
        forwardErrorToManager('SLOW_COMMAND', new Error(`Command ${timer.commandName} took ${duration}ms to execute`), {
          commandName: timer.commandName,
          duration: duration,
          guildId: timer.guildId,
          userId: timer.userId
        });
      }

      commandTimers.delete(interaction.id);
    }
  };

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
    if (message.includes('error') || message.includes('Error') || message.includes('failed')) {
      forwardErrorToManager('DISCORD_DEBUG', new Error(message));
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