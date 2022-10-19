const { ShardingManager } = require("discord.js");
import { Shard } from "discord.js";
import { discordToken } from "../config.json";

const manager = new ShardingManager("./build/src/app.js", { token: discordToken });

manager.on("shardCreate", (shard: Shard) =>
  console.log(`Launched shard ${shard.id}`)
);

manager.spawn();
