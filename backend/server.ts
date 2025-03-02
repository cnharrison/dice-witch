import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ShardingManager } from "discord.js";
import { CONFIG } from "./config";
import { logger } from "./web/middleware/logger";
import guilds from "./web/routes/guilds";
import clerkWebhook from "./web/webhooks/clerk-webhook";
import diceRouter from "./web/routes/dice";
import statsRouter from "./web/routes/stats";
import { ChildProcess } from "child_process";
import { DiscordService } from "./core/services/DiscordService";

const app = new Hono();
const port = process.env.PORT || 3000;

const manager = new ShardingManager(process.env.BOT_PATH ? `${process.env.BOT_PATH}/backend/discord/app.ts` : "./discord/app.ts", {
  token: CONFIG.discord.token,
  totalShards: 'auto',
  respawn: true,
  mode: 'process',
  shardArgs: ['--shard'],
  execArgv: process.env.NODE_ENV === 'production' ? ['--enable-source-maps'] : []
});

process.on('uncaughtException', (error) => {
  console.error(`[ShardManager] Uncaught Exception:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[ShardManager] Unhandled Rejection:`, reason);
});

const initializeDiscordService = async () => {
  const discordService = await DiscordService.getInstance();
  discordService.setManager(manager);

  manager.on("shardCreate", (shard) => {
    console.log(`[Discord] [Shard] Launched shard ${shard.id}`);

    shard.on("error", (error) => {
      console.error(`[Shard ${shard.id}] Error:`, error);
    });

    shard.on("death", (process) => {
      const exitCode = (process as ChildProcess).exitCode ?? 'unknown';
      console.error(`[Shard ${shard.id}] Process died with exit code: ${exitCode}`);
      
      const childProcess = process as ChildProcess;
      if (childProcess && childProcess.stderr) {
        childProcess.stderr.on('data', (data) => {
          console.error(`[Shard ${shard.id}] stderr: ${data.toString()}`);
        });
      }
      
      if (childProcess && childProcess.stdout) {
        childProcess.stdout.on('data', (data) => {
          console.log(`[Shard ${shard.id}] stdout: ${data.toString()}`);
        });
      }
    });

    shard.on("disconnect", () => {
      console.log(`[Shard ${shard.id}] Disconnected. Attempting to reconnect...`);
    });

    shard.on("reconnecting", () => {
      console.log(`[Shard ${shard.id}] Reconnecting...`);
    });

    shard.on("ready", () => {
      console.log(`[Shard ${shard.id}] Ready and operational`);
    });
    
    shard.on("message", (message) => {
      if (message && message.type === 'error') {
        console.error(`[Shard ${shard.id}] Error from child process:`, message.data);
      }
    });
  });
};

initializeDiscordService().catch(console.error);

app.use("*", logger());

app.route("/api/guilds", guilds);
app.route("/webhook", clerkWebhook);
app.route("/api/dice", diceRouter);
app.route("/api/stats", statsRouter);

const startServer = async () => {
  try {
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

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Gracefully shutting down...');
  await manager.broadcastEval(c => c.destroy());
  process.exit(0);
});

startServer();
