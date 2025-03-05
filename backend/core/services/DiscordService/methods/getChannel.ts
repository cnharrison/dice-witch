import { Client } from "discord.js";
import { DiscordService } from "..";

export async function getChannel(
  this: DiscordService,
  channelId: string
) {
  if (!this.manager) {
    return null;
  }

  try {
    const shardId = Number(BigInt(channelId) >> 22n) % this.manager.shards.size;
    const shard = this.manager.shards.get(shardId);

    if (!shard) {
      return null;
    }

    const channel = await shard.eval(async (client, { context }) => {
      try {
        if (!client.isReady()) {
          await new Promise<void>(resolve => (client as Client).once('ready', () => resolve()));
        }

        const channel = await client.channels.fetch(context.channelId);
        if (!channel) {
          return null;
        }

        const channelProps = {
          id: channel.id,
          name: 'name' in channel ? channel.name : 'Unknown Channel',
          type: channel.type
        };

        const guild = 'guild' in channel ? channel.guild : null;

        return {
          ...channelProps,
          guild: guild ? {
            id: guild.id,
            name: 'name' in guild ? guild.name : 'Unknown Guild'
          } : null
        };
      } catch (error) {
        return null;
      }
    }, { context: { channelId: channelId.toString() } });

    return channel;
  } catch (error) {
    console.error('Error getting channel:', error);
    return null;
  }
}