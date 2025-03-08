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
import { ResourceRegistry } from "./core/services/ResourceRegistry";
import * as fs from "fs";
import { handleShardMessage } from "./discord/logging/shardMessageLogger";

const resourceRegistry = ResourceRegistry.getInstance();

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
const defaultPort = process.env.USE_SSL ? 443 : 80;
const port = process.env.PORT || defaultPort;

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

    shard.on("error", (error) => {
      console.error(`[Manager] Shard ${shard.id} Error:`, error);
    });

    shard.on("death", (process) => {
      const exitCode = (process as ChildProcess).exitCode ?? 'unknown';
      console.error(`[Manager] Shard ${shard.id} died with exit code: ${exitCode}`);
    });

    shard.on("disconnect", () => {
      console.log(`[Manager] Shard ${shard.id} disconnected, attempting to reconnect...`);
    });

    shard.on("reconnecting", () => {
      console.log(`[Manager] Shard ${shard.id} reconnecting...`);
    });

    shard.on("ready", () => {
      console.log(`[Manager] Shard ${shard.id} ready and operational`);
    });

    shard.on("message", async (message) => {
      await handleShardMessage(message, shard, async (requestId: string) => {
        try {
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
            requestId,
            shardStatus
          });

          console.log(`[Manager] Sent shard status response to Shard ${shard.id} with ${shardStatus.length} shards`);
        } catch (err) {
          console.error(`[Manager] Error handling shard status request:`, err);
        }
      });
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

const getHttpsOptions = () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      const keyPath = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/api.dicewit.ch/privkey.pem';
      const certPath = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/api.dicewit.ch/fullchain.pem';

      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
    } else if (process.env.USE_SSL) {
      // For local development with self-signed certs
      return {
        key: fs.readFileSync('./certs/localhost-key.pem'),
        cert: fs.readFileSync('./certs/localhost.pem'),
      };
    }
    return null;
  } catch (error) {
    console.error('[SSL] Failed to load SSL certificates:', error);
    return null;
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

    const httpsOptions = getHttpsOptions();

    if (httpsOptions) {
      serve({
        fetch: app.fetch,
        port: Number(port),
        serverOptions: httpsOptions
      });
      
      console.log(`🔒 🎲 [Web] Dice Witch Web Server is running on port ${port} (HTTPS)`);
    } else {
      serve({
        fetch: app.fetch,
        port: Number(port),
      });
      
      console.log(`🎲 [Web] Dice Witch Web Server is running on port ${port} (HTTP)`);
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Gracefully shutting down...`);

  try {
    resourceRegistry.clearAll();
    console.log(`Cleared all registered timeouts and intervals`);

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
