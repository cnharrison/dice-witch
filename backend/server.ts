import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ShardingManager } from "discord.js";
import { CONFIG } from "./config";
import { logger } from "./web/middleware/logger";
import guilds from "./web/routes/guilds";
import clerkWebhook from "./web/webhooks/clerk-webhook";
import diceRouter from "./web/routes/dice";
import { ChildProcess } from "child_process";

const app = new Hono();
const port = process.env.PORT || 3000;

const manager = new ShardingManager("./discord/app.ts", {
  token: CONFIG.discord.token,
  totalShards: 'auto',
  respawn: true,
  mode: 'process'
});

manager.on("shardCreate", (shard) => {
  console.log(`[Discord] [Shard] Launched shard ${shard.id}`);

  shard.on("error", (error) => {
    console.error(`[Shard ${shard.id}] Error:`, error);
  });

  shard.on("death", (process) => {
    console.log(`[Shard ${shard.id}] Process died with exit code: ${(process as ChildProcess).exitCode ?? 'unknown'}`);
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
});

app.use("*", logger());

app.route("/api/guilds", guilds);
app.route("/webhook", clerkWebhook);
app.route("/api/dice", diceRouter);

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

    console.log(`🎲[Web] Dice Witch Web Server is running on port ${port}`);
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