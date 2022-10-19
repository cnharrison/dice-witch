const { ShardingManager } = require("discord.js");
import { Shard } from "discord.js";
import { discordToken } from "../config.json";

const manager = new ShardingManager("./build/src/app.js", {
  token: discordToken,
});

manager.on("shardCreate", (shard: Shard) => {
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

manager.spawn({ delay: 10000, timeout: -1 });
