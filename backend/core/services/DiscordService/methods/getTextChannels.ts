import { Client } from "discord.js";
import { DiscordService } from "..";

export async function getTextChannels(
  this: DiscordService,
  guildId: string
) {
  if (!this.manager) {
    return Promise.reject('Sharding manager not initialized');
  }

  try {
    const shardId = Number(BigInt(guildId) >> 22n) % this.manager.shards.size;
    const shard = this.manager.shards.get(shardId);

    if (!shard) {
      return Promise.reject('Shard not found');
    }

    const channels = await shard.eval(async (client, { context }) => {
      try {
        if (!client.isReady()) {
          await new Promise<void>(resolve => (client as Client).once('ready', () => resolve()));
        }

        const guild = await client.guilds.fetch(context.guildId);
        if (!guild) {
          return null;
        }

        const channels = await guild.channels.fetch();
        const textChannelTypes = [0, 5]; // Text and Announcement channels
        const textChannels = Array.from(channels.values())
          .filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined && textChannelTypes.includes(c?.type as number))
          .map(c => ({
            id: c.id,
            name: 'name' in c ? c.name : 'Unknown Channel',
            type: c.type
          }));

        return textChannels;
      } catch (error) {
        return null;
      }
    }, { context: { guildId: guildId.toString() } });

    return channels || [];
  } catch (error) {
    return Promise.reject(error);
  }
}