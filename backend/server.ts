import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { ShardingManager } from "discord.js";
import { CONFIG } from "./config";
import { logger } from "./web/middleware/logger";
import guilds from "./web/routes/guilds";
import diceRouter from "./web/routes/dice";
import statsRouter from "./web/routes/stats";
import healthRouter from "./web/routes/health";
import { ChildProcess } from "child_process";
import { DiscordService } from "./core/services/DiscordService";
import { DatabaseService } from "./core/services/DatabaseService";

class ResourceRegistry {
  private static instance: ResourceRegistry;
  private timers: Set<NodeJS.Timeout> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();
  private shardListeners: Map<number, Set<{ event: string, handler: (...args: any[]) => void }>> = new Map();

  private constructor() {}

  public static getInstance(): ResourceRegistry {
    if (!ResourceRegistry.instance) {
      ResourceRegistry.instance = new ResourceRegistry();
    }
    return ResourceRegistry.instance;
  }

  public registerTimeout(timeout: NodeJS.Timeout): NodeJS.Timeout {
    this.timers.add(timeout);
    return timeout;
  }

  public clearTimeout(timeout: NodeJS.Timeout): void {
    clearTimeout(timeout);
    this.timers.delete(timeout);
  }

  public registerInterval(interval: NodeJS.Timeout): NodeJS.Timeout {
    this.intervals.add(interval);
    return interval;
  }

  public clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  public registerShardListener(shardId: number, event: string, handler: (...args: any[]) => void): void {
    if (!this.shardListeners.has(shardId)) {
      this.shardListeners.set(shardId, new Set());
    }
    this.shardListeners.get(shardId)!.add({ event, handler });
  }

  public clearShardListeners(shardId: number): void {
    this.shardListeners.delete(shardId);
  }

  public clearAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();

    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();

    this.shardListeners.clear();
  }
}

export const resourceRegistry = ResourceRegistry.getInstance();

function getShardStatusText(status: number): string {
  switch (status) {
    case 0: return "Connecting";
    case 1: return "Online";
    case 2: return "Closing";
    case 3: return "Closed";
    default: return "Unknown";
  }
}

const app = new Hono();
const port = process.env.PORT || 443;

const manager = new ShardingManager(process.env.BOT_PATH ? `${process.env.BOT_PATH}/backend/discord/app.ts` : "./discord/app.ts", {
  token: CONFIG.discord.token,
  respawn: true,
  mode: 'process'
});

process.on('uncaughtException', (error) => {
  console.error(`[ShardManager] Uncaught Exception:`, error);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[ShardManager] Unhandled Rejection:`, reason);
});

const initializeDiscordService = async () => {
  const discordService = await DiscordService.getInstance();
  discordService.setManager(manager);

  manager.on("shardCreate", (shard) => {
    console.log(`[Manager] Launched shard ${shard.id}`);

    const registerShardEvent = (event: string, handler: (...args: any[]) => void) => {
      shard.on(event as any, handler);
      resourceRegistry.registerShardListener(shard.id, event, handler);
    };

    registerShardEvent("error", (error) => {
      console.error(`[Manager] Shard ${shard.id} Error:`, error);
    });

    registerShardEvent("death", (process) => {
      const exitCode = (process as ChildProcess).exitCode ?? 'unknown';
      console.error(`[Manager] Shard ${shard.id} died with exit code: ${exitCode}`);
      resourceRegistry.clearShardListeners(shard.id);
    });

    registerShardEvent("disconnect", () => {
      console.log(`[Manager] Shard ${shard.id} disconnected, attempting to reconnect...`);
    });

    registerShardEvent("reconnecting", () => {
      console.log(`[Manager] Shard ${shard.id} reconnecting...`);
    });

    registerShardEvent("ready", () => {
      console.log(`[Manager] Shard ${shard.id} ready and operational`);
    });

    shard.on("message", async (message) => {
      if (message && typeof message === 'object') {
        if (message.type === 'interaction_received') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[INTERACTION] [${timestamp}] Received interaction ${message.interactionId} for command /${message.commandName} from user ${message.userId} in guild ${message.guildId || 'DM'}`);
        }
        else if (message.type === 'status_command_start') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[STATUS_COMMAND] [${timestamp}] Status command started for interaction ${message.interactionId} from user ${message.userId} in guild ${message.guildId || 'DM'}`);
        }
        else if (message.type === 'status_getting_data') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[STATUS_COMMAND] [${timestamp}] Getting user/guild data for interaction ${message.interactionId}`);
        }
        else if (message.type === 'status_requesting_shards') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[STATUS_COMMAND] [${timestamp}] Requesting shard status for interaction ${message.interactionId}, requestId: ${message.requestId}`);
        }
        else if (message.type === 'status_shards_timeout') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[STATUS_COMMAND] [${timestamp}] ⚠️ Shard status request timed out for interaction ${message.interactionId}, requestId: ${message.requestId}`);
        }
        else if (message.type === 'status_sending_response') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[STATUS_COMMAND] [${timestamp}] Preparing to send response for interaction ${message.interactionId}`);
        }
        else if (message.type === 'status_response_sent') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[STATUS_COMMAND] [${timestamp}] ✅ Response successfully sent for interaction ${message.interactionId}`);
        }
        else if (message.type === 'roll_command_start') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[ROLL_COMMAND] [${timestamp}] Roll command started for interaction ${message.interactionId} from user ${message.userId} in guild ${message.guildId || 'DM'} - Dice: ${message.dice}`);
        }
        else if (message.type === 'roll_processing_dice') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[ROLL_COMMAND] [${timestamp}] Processing dice for interaction ${message.interactionId} - Dice: ${message.dice}`);
        }
        else if (message.type === 'roll_dice_processed') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[ROLL_COMMAND] [${timestamp}] Dice processed for interaction ${message.interactionId} - Results: ${message.resultCount}`);
        }
        else if (message.type === 'roll_generating_image') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[ROLL_COMMAND] [${timestamp}] Generating dice image for interaction ${message.interactionId} - Dice count: ${message.diceCount}`);
        }
        else if (message.type === 'roll_image_generated') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[ROLL_COMMAND] [${timestamp}] Dice image generated for interaction ${message.interactionId}`);
        }
        else if (message.type === 'roll_sending_result') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[ROLL_COMMAND] [${timestamp}] Sending dice result for interaction ${message.interactionId}`);
        }
        else if (message.type === 'roll_result_sent') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[ROLL_COMMAND] [${timestamp}] ✅ Dice result successfully sent for interaction ${message.interactionId}`);
        }
        else if (message.type === 'command_defer_start') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[DEFER] [${timestamp}] Deferring reply for /${message.commandName} interaction ${message.interactionId}`);
        }
        else if (message.type === 'command_defer_success') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          console.log(`[DEFER] [${timestamp}] ✅ Successfully deferred reply for interaction ${message.interactionId}`);
        }
        else if (message.type === 'error') {
          const timestamp = new Date(message.timestamp || Date.now()).toISOString();
          const shardIdStr = `Shard ${message.shardId || shard.id}`;
          const errorType = message.errorType || 'UNKNOWN_ERROR';

          console.error(`\n[ERROR] [${timestamp}] [${shardIdStr}] [${errorType}]`);

          if (message.message) {
            console.error(`Message: ${message.message}`);
          }

          if (message.context) {
            if (message.context.commandName) {
              console.error(`Command: ${message.context.commandName}`);
            }

            if (message.context.args) {
              console.error(`Args: ${JSON.stringify(message.context.args)}`);
            }

            if (message.context.user) {
              const user = message.context.user;
              console.error(`User: ${user.username || user.tag || 'Unknown'} (${user.id || 'Unknown ID'})`);
            } else if (message.context.userId) {
              console.error(`User ID: ${message.context.userId}`);
            }

            if (message.context.guild) {
              const guild = message.context.guild;
              console.error(`Guild: ${guild.name || 'Unknown'} (${guild.id || 'Unknown ID'})`);
            } else if (message.context.guildId) {
              console.error(`Guild ID: ${message.context.guildId}`);
            }

            const otherContextProps = { ...message.context };
            delete otherContextProps.user;
            delete otherContextProps.guild;
            delete otherContextProps.userId;
            delete otherContextProps.guildId;
            delete otherContextProps.commandName;
            delete otherContextProps.args;

            if (message.context.isTimeout) {
              console.error(`INTERACTION TIMEOUT DETECTED: ${message.context.isTimeout}`);
            }

            if (message.errorType === 'DISCORD_RATE_LIMIT') {
              console.error(`DISCORD RATE LIMIT DETECTED:
  Route: ${message.context.route || 'unknown'}
  Limit: ${message.context.limit || 'unknown'}
  Timeout: ${message.context.timeout || 'unknown'}ms
  Global: ${message.context.global || false}
  Path: ${message.context.path || 'unknown'}`);
            }

            if (Object.keys(otherContextProps).length > 0) {
              console.error(`Additional Context: ${JSON.stringify(otherContextProps)}`);
            }
          }

          if (message.stack) {
            console.error(`\nStack Trace:`);
            console.error(message.stack);
          }

          console.error('\n---');
        }
        else if (message.type === 'shardStatusRequest') {
          try {
            console.log(`[Manager] Received shard status request from Shard ${shard.id}, request ID: ${message.requestId}`);

            const shardStatus = await Promise.all(
              Array.from(manager.shards.values()).map(async (s) => {
                try {
                  const ready = await s.fetchClientValue('ws.status');
                  const guilds = await s.fetchClientValue('guilds.cache.size');
                  const ping = await s.fetchClientValue('ws.ping');
                  const status = ready === 0 ? 0 : 1;

                  return {
                    id: s.id,
                    status: getShardStatusText(status as number),
                    guilds: guilds as number,
                    ping: ping as number
                  };
                } catch (err) {
                  return {
                    id: s.id,
                    status: "Offline",
                    guilds: -1,
                    ping: -1
                  };
                }
              })
            );

            shard.send({
              type: 'shardStatusResponse',
              requestId: message.requestId,
              shardStatus
            });

            console.log(`[Manager] Sent shard status response to Shard ${shard.id} with ${shardStatus.length} shards`);
          } catch (err) {
            console.error(`[Manager] Error handling shard status request:`, err);
          }
        }
      }
    });
  });
};

initializeDiscordService().catch(console.error);

app.use("*", logger());

app.use("*", cors({
  origin: ["https://dicewit.ch", "https://api.dicewit.ch", "http://localhost:5173", "http://localhost:3000"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge: 86400,
}));

app.route("/health", healthRouter);
app.route("/api/guilds", guilds);
app.route("/api/dice", diceRouter);
app.route("/api/stats", statsRouter);

const checkDatabaseConnection = async () => {
  const databaseService = DatabaseService.getInstance();
  try {
    console.log(`[Database] Checking database connection...`);
    await databaseService.testConnection();
    console.log(`[Database] Connection successful`);
    return true;
  } catch (error) {
    console.error(`[Database] Connection failed:`, error);
    return false;
  }
};

const startServer = async () => {
  try {
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      console.error(`[Server] Database connection failed. Exiting.`);
      process.exit(1);
    }

    await manager.spawn({
      delay: 7500,
      timeout: -1,
      amount: 'auto'
    }).catch(err => {
      console.error('[Sharding] Failed to spawn shards:', err);
      process.exit(1);
    });

    serve({
      fetch: app.fetch,
      port: Number(port),
    });

    console.log(`🎲 [Web] Dice Witch Web Server is running on port ${port}`);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Gracefully shutting down...`);

  try {
    resourceRegistry.clearAll();
    console.log(`Cleared all registered timeouts, intervals, and event listeners`);

    const discordService = DiscordService.getInstance();
    discordService.destroy();

    const databaseService = DatabaseService.getInstance();
    await databaseService.destroy();

    manager.shards.forEach(shard => {
      shard.removeAllListeners();
    });

    await manager.broadcastEval(c => {
      return c.destroy();
    });

    console.log(`${signal} cleanup completed successfully`);
  } catch (err) {
    console.error(`Error during ${signal} shutdown:`, err);
  } finally {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
