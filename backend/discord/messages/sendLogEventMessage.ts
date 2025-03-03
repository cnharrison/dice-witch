import {
  ChannelType,
  Client,
  PermissionFlagsBits,
  resolveColor,
  TextChannel,
  ThreadChannel,
} from "discord.js";
import { CONFIG } from "../../config";
import { makeBold } from "../../shared/helpers";
import { EventType, LogEventProps } from "../../shared/types";
import {
  errorColor,
  eventColor,
  goodColor,
  infoColor,
  tabletopColor,
} from "../../core/constants";
import { DiscordService } from "../../core/services/DiscordService";
import { ShardClientUtil } from "discord.js";
import { AttachmentBuilder } from "discord.js";

interface SerializedFile {
  name: string | null;
  attachment: string | Buffer | null;
}

const { adminId, logOutputChannelId } = CONFIG.discord;

const sendLogEventMessage = async ({
  eventType,
  command,
  args,
  title,
  resultMessage,
  guild,
  interaction,
  files,
  sourceName,
  username,
  channelName,
  guildName: providedGuildName,
}: LogEventProps) => {
  if (!eventType) {
    console.error("Event type is undefined");
    return;
  }

  const discordService = DiscordService.getInstance();
  const discord = discordService.getClient();
  const manager = discordService.getManager();

  if (!discord && !manager) {
    console.error("Discord client and manager are both undefined");
    return;
  }

  const channel = interaction?.channel as TextChannel | ThreadChannel | null;
  const channelNameParam = channel?.name ?? channelName ?? "";
  const guildName = guild?.name ?? interaction?.guild?.name ?? providedGuildName ?? "";
  const commandName = command?.name ?? "";
  const isGuildChannel = channel?.type === ChannelType.GuildText;
  const isThread = channel?.type === ChannelType.PublicThread;
  const isInGuild = interaction?.inGuild() ?? false;

  let user;

  const source = sourceName || "discord";
  if (username) {
    user = username;
  } else if (interaction?.user) {
    user = interaction.user.tag;
  } else {
    user = "Unknown User";
  }

  const userWithSource = source === 'web' ? `${user} [from web]` : `${user} [from discord]`;

  const getNameString = (isThreadValue: boolean) => {
    return isThreadValue ? "thread " : "channel ";
  };

  const generateEmbed = () => {
    const embedMap = {
      [EventType.RECEIVED_COMMAND]: {
        color: eventColor,
        title: `${eventType}: /${source === 'web' ? 'roll' : commandName}`,
        description: (isInGuild || (source === 'web' && channelNameParam))
          ? `${args} from **${userWithSource}** in ${getNameString(isThread)} ${makeBold(channelNameParam)} on ${makeBold(guildName || 'Discord')}`
          : `${args} from **${user}** in **DM**`,
        image: undefined,
      },
      [EventType.CRITICAL_ERROR]: {
        color: resolveColor("#FF0000"),
        title: `${eventType}: ${commandName}`,
        description: (isInGuild || (source === 'web' && channelNameParam))
          ? `${args} from ${makeBold(userWithSource)} in ${getNameString(isThread)} ${makeBold(channelNameParam)} on ${makeBold(guildName || 'Discord')} <@${adminId}>`
          : `${args} from ${makeBold(user)} in **DM** ${adminId}`,
        image: undefined,
      },
      [EventType.GUILD_ADD]: {
        color: goodColor,
        title: eventType,
        description: guildName,
        image: undefined,
      },
      [EventType.GUILD_REMOVE]: {
        color: errorColor,
        title: eventType,
        description: guildName,
        image: undefined,
      },
      [EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE]: {
        color: tabletopColor,
        title: title || "Dice Roll",
        description: `${resultMessage || args || ""}`,
        image: { url: 'attachment://currentDice.webp' },
      },
      [EventType.SENT_ROLL_RESULT_MESSAGE]: {
        color: tabletopColor,
        title: `${eventType}: ${title ?? ""}`,
        description: resultMessage,
        image: undefined,
      },
      [EventType.SENT_HELPER_MESSAGE]: {
        color: infoColor,
        title: eventType,
        description: `${(isGuildChannel || (source === 'web' && channelNameParam)) ? userWithSource + ' in ' + channelNameParam : user + ' in DM'}`,
        image: undefined,
      },
      [EventType.SENT_DICE_OVER_MAX_MESSAGE]: {
        color: infoColor,
        title: eventType,
        description: `${(isGuildChannel || (source === 'web' && channelNameParam)) ? userWithSource + ' in ' + channelNameParam : user + ' in DM'}`,
        image: undefined,
      },
      [EventType.SENT_NEED_PERMISSION_MESSAGE]: {
        color: errorColor,
        title: eventType,
        description: `${makeBold(channelNameParam)} on ${makeBold(guildName)}`,
        image: undefined,
      },
    };

    return embedMap[eventType] || {
      color: infoColor,
      title: `${eventType}`,
      description: `${args || ""}`,
      image: undefined,
    };
  };

  if (discord) {
    try {
      const embed = generateEmbed();

      const logChannelId = logOutputChannelId;

      if (discord.shard && discord.shard.count > 1) {
        const shardForChannel = ShardClientUtil.shardIdForGuildId(CONFIG.discord.logOutputChannelId, discord.shard.count);

        if (files && files.length > 0 && eventType === EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE) {
          const serializedFiles: SerializedFile[] = files.map(file => {
            if (!file || !file.name) return { name: null, attachment: null };

            return {
              name: file.name,
              attachment: file.attachment && Buffer.isBuffer(file.attachment)
                ? file.attachment.toString('base64')
                : null
            };
          });

          discord.shard?.broadcastEval(
            async (c, { channelId, embedData, files }) => {
              const channel = await c.channels.fetch(channelId).catch(() => null);
              if (!channel || !channel.isTextBased()) return false;

              try {
                const deserializedFiles = files
                  .map(file => {
                    if (!file || !file.name || !file.attachment) return null;
                    try {
                      let base64String: string;
                      const attachment = file.attachment as string | Buffer;

                      if (typeof attachment === 'string') {
                        base64String = attachment;
                      } else if (Buffer.isBuffer(attachment)) {
                        base64String = attachment.toString('base64');
                      } else {
                        return null;
                      }

                      const buffer = Buffer.from(base64String, 'base64');
                      if (file.name) {
                        return new AttachmentBuilder(buffer, { name: file.name });
                      }
                      return new AttachmentBuilder(buffer, { name: 'attachment.png' });
                    } catch (error) {
                      console.error('Error creating attachment:', error);
                      return null;
                    }
                  })
                  .filter((file): file is AttachmentBuilder => file !== null);

                if ('send' in channel) {
                  await channel.send({
                    embeds: [embedData],
                    files: deserializedFiles
                  });
                  return true;
                }
                return false;
              } catch (err) {
                console.error('Error sending to log channel with files:', err);

                if (err.code === 50013) {
                  try {
                    if ('send' in channel) {
                      await channel.send({ embeds: [embedData] });
                      return true;
                    }
                    return false;
                  } catch (innerErr) {
                    console.error('Fallback also failed:', innerErr);
                  }
                }
                return false;
              }
            },
            {
              context: {
                channelId: logChannelId,
                embedData: embed,
                files: serializedFiles
              },
              shard: shardForChannel
            }
          ).catch(error => {
            console.error('Error in broadcastEval with files:', error);

            discord.shard?.broadcastEval(
              async (c, { channelId, embedData }) => {
                try {
                  const channel = await c.channels.fetch(channelId).catch(() => null);
                  if (!channel || !channel.isTextBased()) return false;

                  if ('send' in channel) {
                    await channel.send({ embeds: [embedData] });
                    return true;
                  }
                  return false;
                } catch (err) {
                  return false;
                }
              },
              {
                context: {
                  channelId: logChannelId,
                  embedData: embed
                }
              }
            ).catch(finalError => {
              console.error('Final fallback failed:', finalError);
            });
          });
        } else {
          discord.shard?.broadcastEval(
            async (c, { channelId, embedData }) => {
              try {
                const channel = await c.channels.fetch(channelId).catch(() => null);
                if (!channel || !channel.isTextBased()) return false;

                if ('send' in channel) {
                  await channel.send({ embeds: [embedData] });
                  return true;
                }
                return false;
              } catch (err) {
                return false;
              }
            },
            {
              context: {
                channelId: logChannelId,
                embedData: embed
              }
            }
          ).catch(error => {
            console.error('Error sending non-image log:', error);
          });
        }
      } else {
        const channel = await discord.channels.fetch(logChannelId).catch(() => null) as TextChannel | null;
        if (!channel || !channel.isTextBased()) {
          console.error(`Log channel ${logChannelId} not found or not a text channel`);
          return;
        }

        try {
          if (eventType === EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE && files && files.length > 0) {
            const serializedFiles: SerializedFile[] = files.map(file => {
              if (!file || !file.name) return { name: null, attachment: null };

              return {
                name: file.name,
                attachment: file.attachment && Buffer.isBuffer(file.attachment)
                  ? file.attachment.toString('base64')
                  : null
              };
            });

            const deserializedFiles = serializedFiles
              .map(file => {
                if (!file || !file.name || !file.attachment) return null;
                try {
                  let base64String: string;
                  const attachment = file.attachment as string | Buffer;

                  if (typeof attachment === 'string') {
                    base64String = attachment;
                  } else if (Buffer.isBuffer(attachment)) {
                    base64String = attachment.toString('base64');
                  } else {
                    return null;
                  }

                  const buffer = Buffer.from(base64String, 'base64');
                  if (file.name) {
                    return new AttachmentBuilder(buffer, { name: file.name });
                  }
                  return new AttachmentBuilder(buffer, { name: 'attachment.webp' });
                } catch (error) {
                  console.error('Error creating attachment:', error);
                  return null;
                }
              })
              .filter((file): file is AttachmentBuilder => file !== null);

            await channel.send({
              embeds: [embed],
              files: deserializedFiles
            });
          } else {
            await channel.send({ embeds: [embed] });
          }
        } catch (error) {
          console.error('Error sending to log channel in non-sharded mode:', error);

          if (error.code === 50013 && files && files.length > 0) {
            try {
              await channel.send({ embeds: [embed] });
            } catch (fallbackError) {
              console.error('Fallback to text-only failed:', fallbackError);
            }
          }
        }
      }
    } catch (error) {
      console.error("Top-level error in log event message:", error);
    }
  } else if (manager) {
    try {
      const embed = generateEmbed();

      const logChannelId = logOutputChannelId;

      if (files && files.length > 0 && eventType === EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE) {
        const serializedFiles: SerializedFile[] = files.map(file => {
          if (!file || !file.name) return { name: null, attachment: null };

          return {
            name: file.name,
            attachment: file.attachment && Buffer.isBuffer(file.attachment)
              ? file.attachment.toString('base64')
              : null
          };
        });

        await manager.broadcastEval(
          async (c, { channelId, embedData, files }) => {
            const channel = c.channels.cache.get(channelId);
            if (!channel || !channel.isTextBased()) return;

            try {
              const deserializedFiles = files
                .map(file => {
                  if (!file || !file.name || !file.attachment) return null;
                  try {
                    let base64String: string;
                    const attachment = file.attachment as string | Buffer;

                    if (typeof attachment === 'string') {
                      base64String = attachment;
                    } else if (Buffer.isBuffer(attachment)) {
                      base64String = attachment.toString('base64');
                    } else {
                      return null;
                    }

                    const buffer = Buffer.from(base64String, 'base64');
                    if (file.name) {
                      return new AttachmentBuilder(buffer, { name: file.name });
                    }
                    return new AttachmentBuilder(buffer, { name: 'attachment.webp' });
                  } catch (error) {
                    console.error('Error creating attachment:', error);
                    return null;
                  }
                })
                .filter((file): file is AttachmentBuilder => file !== null);

              if ('send' in channel) {
                await channel.send({
                  embeds: [embedData],
                  files: deserializedFiles
                });
                return true;
              }
              return false;
            } catch (err) {
              console.error('Error sending to log channel with files:', err);
              return false;
            }
          },
          { context: { channelId: logChannelId, embedData: embed, files: serializedFiles } }
        );
      } else {
        await manager.broadcastEval(
          async (c, { channelId, embedData }) => {
            const channel = c.channels.cache.get(channelId);
            if (!channel || !channel.isTextBased()) return;

            try {
              if ('send' in channel) {
                await channel.send({ embeds: [embedData] });
                return true;
              }
              return false;
            } catch (err) {
              console.error('Error sending to log channel:', err);
              return false;
            }
          },
          { context: { channelId: logChannelId, embedData: embed } }
        );
      }
    } catch (error) {
      console.error("Error using manager to send log event message:", error);
    }
  } else {
    console.error("Discord client and manager are both undefined");
  }
};

export { sendLogEventMessage };
export default sendLogEventMessage;