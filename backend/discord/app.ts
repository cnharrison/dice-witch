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

function forwardErrorToManager(type, error, context = {}) {
  if (process.send) {
    const errorData = {
      type: 'error',
      errorType: type,
      message: error?.message || String(error),
      stack: error?.stack,
      shardId: currentShardId,
      timestamp: Date.now(),
      context
    };
    
    process.send(errorData);
  }
  
  console.error(`${type}:`, error);
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
  
  const safeCommandHandler = async (interaction, handler) => {
    try {
      await handler(interaction);
    } catch (error) {
      const contextData = {
        commandName: interaction.commandName,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        userId: interaction.user.id
      };
      
      forwardErrorToManager('COMMAND_EXECUTION_ERROR', error, contextData);
      
      try {
        const errorReply = {
          content: "An error occurred while processing your command. The bot team has been notified.",
          ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(errorReply);
        } else {
          await interaction.reply(errorReply);
        }
      } catch (replyError) {
        forwardErrorToManager('INTERACTION_REPLY_ERROR', replyError, contextData);
      }
    }
  };
  
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

  discord.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isCommand()) return;
      
      const timingData = {
        receivedAt: Date.now(),
        ackBy: Date.now() + 2500
      };
      
      try {
        await interaction.deferReply({ ephemeral: interaction.commandName === 'status' });
        timingData.ackedAt = Date.now();
      } catch (deferError) {
        forwardErrorToManager('INTERACTION_DEFER_ERROR', deferError, {
          commandName: interaction.commandName,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          timingData
        });
        return;
      }
      
      const command = await import(`./commands/${interaction.commandName}`).catch(err => {
        forwardErrorToManager('COMMAND_IMPORT_ERROR', err, {
          commandName: interaction.commandName,
          guildId: interaction.guildId
        });
        return null;
      });
      
      if (!command || !command.default || typeof command.default.execute !== 'function') {
        forwardErrorToManager('INVALID_COMMAND', new Error(`Command ${interaction.commandName} not found or invalid`), {
          commandName: interaction.commandName
        });
        
        await interaction.editReply({
          content: "This command is currently unavailable. Please try again later.",
          ephemeral: true
        });
        return;
      }
      
      try {
        await command.default.execute({
          interaction,
          client: discord,
          discord
        });
        
        timingData.completedAt = Date.now();
        timingData.duration = timingData.completedAt - timingData.receivedAt;
        
        if (timingData.duration > 2500) {
          forwardErrorToManager('SLOW_COMMAND', new Error(`Command ${interaction.commandName} took ${timingData.duration}ms to execute`), {
            commandName: interaction.commandName,
            duration: timingData.duration,
            timingData,
            guildId: interaction.guildId
          });
        }
      } catch (commandError) {
        forwardErrorToManager('COMMAND_EXECUTION_ERROR', commandError, {
          commandName: interaction.commandName,
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.user.id,
          timingData
        });
        
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: "There was an error executing this command. The bot team has been notified.",
              ephemeral: true
            });
          } else {
            await interaction.reply({
              content: "There was an error executing this command. The bot team has been notified.",
              ephemeral: true
            });
          }
        } catch (replyError) {
          forwardErrorToManager('INTERACTION_REPLY_ERROR', replyError, {
            commandName: interaction.commandName,
            originalError: commandError.message
          });
        }
      }
    } catch (globalError) {
      forwardErrorToManager('GLOBAL_INTERACTION_ERROR', globalError, {
        interactionId: interaction.id,
        type: interaction.type
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