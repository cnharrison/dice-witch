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
import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { CONFIG } from "../../config";

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

  public async getUserCount(): Promise<UserCountResult> {
    try {
      const [guildSizes, memberCounts] = await Promise.all([
        this.client?.shard?.fetchClientValues("guilds.cache.size"),
        this.client?.shard?.broadcastEval((c) =>
          c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
        ),
      ]);

      const totalGuilds = (guildSizes as number[])?.reduce((acc, count) => acc + count, 0) || 0;
      const totalMembers = (memberCounts as number[])?.reduce((acc, count) => acc + count, 0) || 0;

      return { totalGuilds, totalMembers };
    } catch (error) {
      return Promise.reject(error);
    }
  }

  public checkForAttachPermission(
    interaction?: ButtonInteraction | CommandInteraction
  ): boolean {
    const channel = interaction?.channel
    const guild = interaction?.guild
    const me = guild?.members.me;

    if (!guild || !me || channel?.type !== ChannelType.GuildText) {
      return true;
    }

    const permissions = channel.permissionsFor(me);
    const permissionArray = permissions?.toArray();

    return permissionArray?.includes("AttachFiles") &&
           permissionArray?.includes("EmbedLinks") ||
           false;
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
            .filter(c => textChannelTypes.includes(c?.type as number))
            .map(c => ({
              id: c.id,
              name: c.name,
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

          const guild = (channel as any).guild;
          
          return {
            id: channel.id,
            name: channel.name,
            type: channel.type,
            guild: guild ? {
              id: guild.id,
              name: guild.name
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

  public async sendMessage(channelId: string, messageOptions: any): Promise<boolean> {
    if (!this.manager) {
      return false;
    }

    try {
      const shardId = Number(BigInt(channelId) >> 22n) % this.manager.shards.size;
      const shard = this.manager.shards.get(shardId);

      if (!shard) {
        return false;
      }

      const serializedMessageOptions = {
        embeds: messageOptions.embeds,
        files: messageOptions.files.map((file: any) => {
          return {
            name: file.name,
            data: file.data ? Buffer.from(file.data).toString('base64') : null,
            attachment: file.attachment && Buffer.isBuffer(file.attachment)
              ? file.attachment.toString('base64')
              : null
          };
        })
      };

      const result = await shard.eval(async (client, { context }) => {
        try {
          const channel = await client.channels.fetch(context.channelId);

          if (!channel) {
            return false;
          }

          if (!channel.isTextBased()) {
            return false;
          }

          const deserializedOptions = {
            embeds: context.messageOptions.embeds,
            files: context.messageOptions.files.map((file: any) => {
              return {
                name: file.name,
                attachment: file.attachment ? Buffer.from(file.attachment, 'base64') : null,
                data: file.data ? Buffer.from(file.data, 'base64') : null
              };
            })
          };

          await channel.send(deserializedOptions);
          return true;
        } catch (error) {
          return false;
        }
      }, { context: { channelId, messageOptions: serializedMessageOptions } });

      return !!result;
    } catch (error) {
      return false;
    }
  }

  public async sendToLogChannel(options: {
    eventType: string;
    resultMessage?: string;
    files?: any[];
    source?: string;
    username?: string;
    channelName?: string;
    guildName?: string;
  }): Promise<boolean> {
    if (!this.manager) {
      return false;
    }

    try {
      const { eventType, resultMessage, files, source, username, channelName, guildName } = options;
      
      const embed = new EmbedBuilder()
        .setColor(tabletopColor);
      
      if (eventType === 'RECEIVED_COMMAND') {
        embed.setColor(eventColor)
            .setTitle(`receivedCommand: /${source === 'web' ? 'roll' : source}`)
            .setDescription(`${resultMessage} from ${username} in channel ${channelName || 'general'} on ${guildName || 'hiarcs\'s server'}`);
      } else {
        embed.setDescription(resultMessage || '')
          .setFooter({
            text: username ? `sent to ${username} via ${source}` : source || '',
          });
      }

      if (files && files.length > 0) {
        embed.setImage('attachment://currentDice.png');
      }

      // Use Discord.js calculation to determine shard ID
      const logChannelId = CONFIG.discord.logOutputChannelId;
      
      // First try to get the actual guild via the channels cache
      let targetShard = 0;
      
      // Try all shards to find which has access
      for (const [id, shard] of this.manager.shards.entries()) {
        try {
          const hasAccess = await shard.eval(async (client, { channelId }) => {
            try {
              const channel = await client.channels.fetch(channelId);
              if (channel && channel.isTextBased()) {
                // Return guild ID if channel found and accessible
                return channel.guild ? channel.guild.id : null;
              }
              return null;
            } catch (error) {
              return null;
            }
          }, { context: { channelId: logChannelId } });
          
          if (hasAccess) {
            targetShard = id;
            break;
          }
        } catch (error) {
          console.error(`Error checking shard ${id}:`, error);
        }
      }
      
      // Target only that specific shard
      const shard = this.manager.shards.get(targetShard);
      if (!shard) {
        console.error(`Could not find shard ${targetShard} for log channel`);
        return false;
      }
      
      // Prepare files for serialization - ensure they're in the right format
      const serializedFiles = files?.map(file => ({
        name: file.name,
        attachment: file.attachment && Buffer.isBuffer(file.attachment)
          ? file.attachment.toString('base64')
          : null
      })) || [];
      
      // Send only to the specific shard
      return await shard.eval(async (client, { context }) => {
        try {
          // Get the channel
          const logChannel = await client.channels.fetch(context.logChannelId)
            .catch(err => {
              console.error('Failed to fetch log channel:', err);
              return null;
            });
            
          if (!logChannel || !logChannel.isTextBased()) {
            console.error('Log channel not found or not text-based');
            return false;
          }
          
          // Check permissions
          const me = logChannel.guild?.members.me;
          if (!me) {
            console.error('Could not find bot member in guild');
            return false;
          }
          
          const permissions = logChannel.permissionsFor(me);
          if (!permissions?.has('SendMessages')) {
            console.error('Bot does not have permission to send messages to log channel');
            
            try {
              await client.rest.post(`/channels/${context.logChannelId}/messages`, {
                body: {
                  embeds: [context.embed]
                }
              });
              return true;
            } catch (restError) {
              console.error('Error:', restError);
              return false;
            }
          }
          
          // Deserialize files and send normally
          let messageOptions = { 
            embeds: [context.embed]
          };
          
          if (context.files && context.files.length > 0) {
            try {
              const deserializedFiles = context.files
                .filter((file: any) => {
                  const isValid = file && file.name && file.attachment;
                  return isValid;
                })
                .map((file: any) => {
                  try {
                    return {
                      name: file.name,
                      attachment: Buffer.from(file.attachment, 'base64')
                    };
                  } catch (err) {
                    console.error('Error creating buffer from attachment:', err);
                    return null;
                  }
                })
                .filter(Boolean);
              
              if (deserializedFiles.length > 0) {
                messageOptions.files = deserializedFiles;
              }
            } catch (fileError) {
              console.error('Error deserializing files:', fileError);
            }
          }
          
          await logChannel.send(messageOptions);
          return true;
        } catch (error) {
          console.error('Error in eval execution:', error);
          
          // Last resort - try without files
          if (context.files && context.files.length > 0) {
            try {
              const logChannelFallback = await client.channels.fetch(context.logChannelId);
              if (logChannelFallback && logChannelFallback.isTextBased()) {
                await logChannelFallback.send({ embeds: [context.embed] });
                return true;
              }
            } catch (fallbackError) {
              console.error('Final fallback also failed:', fallbackError);
            }
          }
          
          return false;
        }
      }, { 
        context: { 
          embed: embed.toJSON(),
          files: serializedFiles,
          logChannelId: logChannelId
        }
      });
    } catch (error) {
      console.error("Error sending to log channel:", error);
      return false;
    }
  }
}