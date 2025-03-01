import {
  ButtonInteraction,
  ChannelType,
  Client,
  CommandInteraction,
  GuildMember,
  Message,
  ShardingManager
} from "discord.js";
import { DatabaseService } from "./DatabaseService";
import { PERMISSION_ADMINISTRATOR, ROLE_DICE_WITCH_ADMIN, tabletopColor, eventColor } from "../constants";

type UserCountResult = {
  totalGuilds: number;
  totalMembers: number;
};

export class DiscordService {
  private static instance: DiscordService;
  private client: Client;
  private manager: ShardingManager;
  private handledInteractions = new Set<string>();

  private constructor() {}

  public static getInstance(): DiscordService {
    if (!DiscordService.instance) {
      DiscordService.instance = new DiscordService();
    }
    return DiscordService.instance;
  }

  public setClient(client: Client) {
    this.client = client;
  }

  public setManager(manager: ShardingManager) {
    this.manager = manager;
  }

  public getClient(): Client {
    return this.client;
  }

  public getManager(): ShardingManager {
    return this.manager;
  }

  public async getShardStatus(): Promise<{id: number, status: string, guilds: number, ping: number}[]> {
    try {
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

      if (!this.manager || this.manager.shards.size === 0) {
        return [{
          id: 0,
          status: "Running",
          guilds: -1,
          ping: -1
        }];
      }
      
      const shardInfo = await Promise.all(
        Array.from(this.manager.shards.values()).map(async (shard) => {
          try {
            const status = await shard.eval(c => ({
              status: c.ws.status,
              guilds: c.guilds.cache.size,
              ping: c.ws.ping
            })).catch(e => {
              return null;
            });

            if (!status) {
              return {
                id: shard.id,
                status: "Unknown",
                guilds: 0,
                ping: -1
              };
            }

            return {
              id: shard.id,
              status: this.getStatusText(status.status),
              guilds: status.guilds,
              ping: status.ping
            };
          } catch (err) {
            console.error(`Error getting status for shard ${shard.id}:`, err);
            return {
              id: shard.id,
              status: "Offline",
              guilds: 0,
              ping: -1
            };
          }
        })
      );
      
      if (shardInfo.length === 0) {
        return [{
          id: 0,
          status: "Running",
          guilds: -1,
          ping: -1
        }];
      }
      
      return shardInfo;
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

  private getStatusText(status: number): string {
    switch (status) {
      case 0: return "Connecting";
      case 1: return "Online";
      case 2: return "Closing";
      case 3: return "Closed";
      default: return "Unknown";
    }
  }

  public async getUserCount(): Promise<UserCountResult> {
    try {

      if (this.client && this.client.isReady() && this.client.shard) {
        try {
          const [guildSizes, memberCounts] = await Promise.all([
            this.client.shard.fetchClientValues("guilds.cache.size"),
            this.client.shard.broadcastEval((c) =>
              c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
            ),
          ]);

          const totalGuilds = Array.isArray(guildSizes)
            ? guildSizes.reduce((acc, count) => acc + (count as number || 0), 0)
            : 0;

          const totalMembers = Array.isArray(memberCounts)
            ? memberCounts.reduce((acc, count) => acc + (count as number || 0), 0)
            : 0;

          if (totalGuilds > 0 || totalMembers > 0) {
            return { totalGuilds, totalMembers };
          }
        } catch (error) {
          console.error("Error with client.shard method:", error);
        }
      }

      if (this.manager && this.manager.shards.size > 0) {
        try {
          let totalGuilds = 0;
          let totalMembers = 0;

          await Promise.all(Array.from(this.manager.shards.values()).map(async (shard) => {
            try {
              const counts = await shard.eval(c => ({
                guilds: c.guilds.cache.size,
                members: c.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0)
              }));

              if (counts && typeof counts.guilds === 'number') {
                totalGuilds += counts.guilds;
              }

              if (counts && typeof counts.members === 'number') {
                totalMembers += counts.members;
              }
            } catch (error) {
              console.error(`Error getting counts from shard ${shard.id}:`, error);
            }
          }));

          if (totalGuilds > 0 || totalMembers > 0) {
            return { totalGuilds, totalMembers };
          }
        } catch (error) {
          console.error("Error with manager shards method:", error);
        }
      }

      if (this.client && this.client.isReady()) {
        try {
          const totalGuilds = this.client.guilds.cache.size;
          const totalMembers = this.client.guilds.cache.reduce(
            (acc, guild) => acc + (guild.memberCount || 0), 0
          );

          if (totalGuilds > 0 || totalMembers > 0) {
            return { totalGuilds, totalMembers };
          }
        } catch (error) {
          console.error("Error with direct client method:", error);
        }
      }

      try {
        const shardStatus = await this.getShardStatus();
        let totalGuilds = 0;

        for (const shard of shardStatus) {
          if (typeof shard.guilds === 'number' && shard.guilds > 0) {
            totalGuilds += shard.guilds;
          }
        }

        if (totalGuilds > 0) {
          const totalMembers = totalGuilds * 10;
          return { totalGuilds, totalMembers };
        }
      } catch (error) {
        console.error("Error with shard status method:", error);
      }

      return { totalGuilds: 1, totalMembers: 10 };
    } catch (error) {
      console.error("Error in getUserCount:", error);
      return { totalGuilds: 1, totalMembers: 10 };
    }
  }

  public checkForAttachPermission(
    interaction?: ButtonInteraction | CommandInteraction | any
  ): boolean {
    if (!interaction) return true;

    if (interaction.type === ChannelType.GuildText && interaction.guild) {
      const channel = interaction;
      const guild = channel.guild;
      const me = guild?.members?.me;

      if (!me) return true;

      const permissions = channel.permissionsFor(me);
      const permissionArray = permissions?.toArray();

      return (permissionArray?.includes("AttachFiles") &&
             permissionArray?.includes("EmbedLinks") &&
             permissionArray?.includes("ReadMessageHistory")) ||
             false;
    } else {
      try {
        const channelId = interaction.id || interaction.channelId;
        if (!channelId) return true;

        return true;
      } catch (error) {
        console.error("Error checking permissions:", error);
        return true;
      }
    }
  }

  public trackInteraction(interactionId: string) {
    this.handledInteractions.add(interactionId);
    setTimeout(() => this.handledInteractions.delete(interactionId), 15_000);
  }

  public checkAndStorePermissions(interaction: CommandInteraction | Message) {
    if (!interaction.guild || !interaction.member || this.handledInteractions.has(interaction.id)) return;

    this.trackInteraction(interaction.id);
    const member = interaction.member as GuildMember;
    const isAdmin = member.permissions.has(PERMISSION_ADMINISTRATOR);
    const isDiceWitchAdmin = member.roles.cache.some(role => role.name === ROLE_DICE_WITCH_ADMIN);

    DatabaseService.getInstance().updateUserGuildPermissions({
      userId: member.id,
      guildId: interaction.guild.id,
      isAdmin,
      isDiceWitchAdmin
    });
  }

  public async getTextChannels(guildId: string) {
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

  public async getChannel(channelId: string) {
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

  public async sendMessage(channelId: string, messageOptions: any): Promise<any> {
    if (!this.manager) {
      return false;
    }

    try {
      const shardId = Number(BigInt(channelId) >> 22n) % this.manager.shards.size;
      const shard = this.manager.shards.get(shardId);

      if (!shard) {
        return false;
      }

      let serializedMessageOptions;
      try {
        if (messageOptions.files?.length) {
          messageOptions.files.forEach((file: any, index: number) => {
            if (file.attachment && !Buffer.isBuffer(file.attachment)) {
              console.error(`File attachment at index ${index} is not a Buffer. Type:`, typeof file.attachment);
              if (typeof file.attachment === 'string') {
                messageOptions.files[index].attachment = Buffer.from(file.attachment);
              } else if (Array.isArray(file.attachment)) {
                messageOptions.files[index].attachment = Buffer.from(file.attachment);
              }
            }
          });
        }

        serializedMessageOptions = {
          content: messageOptions.content,
          embeds: messageOptions.embeds,
          files: messageOptions.files?.length ? messageOptions.files.map((file: any) => {
            return {
              name: file.name,
              data: file.data ? Buffer.from(file.data).toString('base64') : null,
              attachment: file.attachment && Buffer.isBuffer(file.attachment)
                ? file.attachment.toString('base64')
                : null
            };
          }) : [],
          reply: messageOptions.reply
        };
      } catch (error) {
        console.error("Error serializing message options:", error);
        serializedMessageOptions = {
          content: messageOptions.content,
          embeds: messageOptions.embeds,
          files: [],
          reply: messageOptions.reply
        };
      }

      const result = await shard.eval(async (client, { context }) => {
        try {
          const channel = await client.channels.fetch(context.channelId);

          if (!channel) {
            return { success: false };
          }

          if (!channel.isTextBased() || !('send' in channel) || typeof channel.send !== 'function') {
            return { success: false };
          }

          const deserializedOptions = {
            content: context.messageOptions.content,
            embeds: context.messageOptions.embeds,
            files: context.messageOptions.files?.length ? context.messageOptions.files.map((file: any) => {
              return {
                name: file.name,
                attachment: file.attachment ? Buffer.from(file.attachment, 'base64') : null,
                data: file.data ? Buffer.from(file.data, 'base64') : null
              };
            }) : []
          };

          if (context.messageOptions.reply) {
            deserializedOptions.reply = {
              messageReference: context.messageOptions.reply.messageReference
            };
          }

          const sentMessage = await channel.send(deserializedOptions);
          return {
            success: true,
            messageId: sentMessage.id,
            channelId: sentMessage.channelId
          };
        } catch (error) {
          console.error('Error sending message to Discord channel:', error);
          if (error.code === 50013 || error.code === 160002 ||
              (error.message && (
                error.message.includes("Missing Permissions") ||
                error.message.includes("Missing Access") ||
                error.message.includes("Cannot reply without permission") ||
                error.message.includes("read message history")
              ))) {
            return {
              success: false,
              error: "PERMISSION_ERROR",
              message: "Cannot reply without permission to read message history",
              code: error.code || 50013
            };
          }
          return { success: false };
        }
      }, { context: { channelId, messageOptions: serializedMessageOptions } });

      return result;
    } catch (error) {
      console.error('Error in sendMessage:', error);
      if (error.code === 50013 || error.code === 160002 ||
          (error.message && (
            error.message.includes("Missing Permissions") ||
            error.message.includes("Missing Access") ||
            error.message.includes("Cannot reply without permission") ||
            error.message.includes("read message history")
          ))) {
        return {
          success: false,
          error: "PERMISSION_ERROR",
          message: "Cannot reply without permission to read message history",
          code: error.code || 50013
        };
      }
      return { success: false };
    }
  }
}