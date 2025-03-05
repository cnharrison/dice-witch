import { DiscordService } from "..";

export async function getShardStatus(
  this: DiscordService
): Promise<{id: number, status: string, guilds: number, ping: number}[]> {
  try {
    if (this.manager && this.manager.shards.size > 0) {
      const result = [];
      
      for (const [id, shard] of this.manager.shards) {
        try {
          const shardData = await shard.fetchClientValue('ws.status')
            .then(status => ({
              id: Number(id),
              status: this.getStatusText(status as number),
              guilds: -1,
              ping: -1
            }))
            .catch(() => ({
              id: Number(id),
              status: "Unknown",
              guilds: -1,
              ping: -1
            }));
            
          try {
            shardData.guilds = await shard.fetchClientValue('guilds.cache.size') as number;
          } catch (e) {}
          
          try {
            shardData.ping = await shard.fetchClientValue('ws.ping') as number;
          } catch (e) {}
          
          result.push(shardData);
        } catch (err) {
          result.push({
            id: Number(id),
            status: "Error",
            guilds: -1,
            ping: -1
          });
        }
      }
      
      if (result.length > 0) {
        return result;
      }
    }
    
    if (this.client && this.client.isReady()) {
      if (this.client.shard) {
        const shardIds = this.client.shard.ids;
        return shardIds.map(id => ({
          id,
          status: "Online",
          guilds: this.client.guilds.cache.size,
          ping: this.client.ws.ping
        }));
      }

      return [{
        id: 0,
        status: "Online",
        guilds: this.client.guilds.cache.size,
        ping: this.client.ws.ping
      }];
    }
    
    return [{
      id: 0,
      status: "Running",
      guilds: -1,
      ping: -1
    }];
  } catch (error) {
    console.error("Error getting shard status:", error);
    return [{
      id: 0,
      status: "Running",
      guilds: -1,
      ping: -1
    }];
  }
}