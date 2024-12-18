import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ShardingManager } from "discord.js";
import { discordToken } from "./config.json";
import { logger } from "./web/middleware/logger";
import { auth } from "./web/routes/auth";

const app = new Hono();
const port = process.env.PORT || 3000;

const manager = new ShardingManager("./discord/app.ts", {
  token: discordToken,
});

manager.on("shardCreate", (shard) => {
  console.log(`[Discord] [Shard] Launched shard ${shard.id}`);

  shard.on("death", () => {
    console.log(`[Shard ${shard.id}] Shard has been shut down.`);
  });

  shard.on("disconnect", () => {
    console.log(`[Shard ${shard.id}] Shard has disconnected.`);
  });

  shard.on("reconnecting", () => {
    console.log(`[Shard ${shard.id}] Shard is reconnecting.`);
  });

  shard.on("spawn", () => {
    console.log(`[Shard ${shard.id}] Shard has been spawned.`);
  });
});

app.use("*", logger());

app.route("/auth", auth);

const startServer = async () => {
  try {
    await manager.spawn({ delay: 10000, timeout: -1 });

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

startServer();