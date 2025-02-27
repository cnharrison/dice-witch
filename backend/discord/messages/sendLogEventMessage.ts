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
  const manager = discordService.manager || discordService.getManager?.();

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

  const getNameString = (isThreadValue: boolean) => {
    return isThreadValue ? "thread " : "channel ";
  };

  const embedMap = {
    [EventType.RECEIVED_COMMAND]: {
      color: eventColor,
      title: `${eventType}: /${source === 'web' ? 'roll' : commandName}`,
      description: (isInGuild || (source === 'web' && channelNameParam))
        ? `${args} from **${user}** in ${getNameString(isThread)} ${makeBold(channelNameParam)} on ${makeBold(guildName || 'Discord')}`
        : `${args} from **${user}** in **DM**`,
    },
    [EventType.CRITICAL_ERROR]: {
      color: resolveColor("#FF0000"),
      title: `${eventType}: ${commandName}`,
      description: (isInGuild || (source === 'web' && channelNameParam))
        ? `${args} from ${makeBold(user)} in ${getNameString(isThread)} ${makeBold(channelNameParam)} on ${makeBold(guildName || 'Discord')} <@${adminId}>`
        : `${args} from ${makeBold(user)} in **DM** ${adminId}`,
    },
    [EventType.GUILD_ADD]: {
      color: goodColor,
      title: eventType,
      description: guildName,
    },
    [EventType.GUILD_REMOVE]: {
      color: errorColor,
      title: eventType,
      description: guildName,
    },
    [EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE]: {
      color: tabletopColor,
      title: title || "Dice Roll",
      description: `${resultMessage || args || ""}`,
      image: true,
    },
    [EventType.SENT_ROLL_RESULT_MESSAGE]: {
      color: tabletopColor,
      title: `${eventType}: ${title ?? ""}`,
      description: resultMessage,
    },
    [EventType.SENT_HELPER_MESSAGE]: {
      color: infoColor,
      title: eventType,
      description: `${user} in ${(isGuildChannel || (source === 'web' && channelNameParam)) ? channelNameParam : "DM"}`,
    },
    [EventType.SENT_DICE_OVER_MAX_MESSAGE]: {
      color: infoColor,
      title: eventType,
      description: `${user} in ${channelNameParam}`,
    },
    [EventType.SENT_NEED_PERMISSION_MESSAGE]: {
      color: errorColor,
      title: eventType,
      description: `${makeBold(channelNameParam)} on ${makeBold(guildName)}`,
    },
  };

  const generateEmbed = () => embedMap[eventType as keyof typeof embedMap] ?? {};

  if (discord) {
    try {
      const embed = generateEmbed();
      if (eventType === EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE && files && files.length > 0) {
        embed.image = { url: 'attachment://currentDice.png' };
      }

      const logChannelId = logOutputChannelId;

      if (discord.shard && discord.shard.count > 1) {
        const shardForChannel = ShardClientUtil.shardIdForGuildId(CONFIG.discord.logOutputChannelId);

        if (files && files.length > 0 && eventType === EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE) {
          const serializedFiles = files.map(file => ({
            name: file.name,
            attachment: file.attachment && Buffer.isBuffer(file.attachment)
              ? file.attachment.toString('base64')
              : null
          }));

          discord.shard.broadcastEval(
            async (c, { channelId, embedData, files }) => {
              const channel = await c.channels.fetch(channelId).catch(() => null);
              if (!channel || !channel.isTextBased()) return false;

              try {
                const deserializedFiles = files.map(file => ({
                  name: file.name,
                  attachment: file.attachment ? Buffer.from(file.attachment, 'base64') : null
                }));

                await channel.send({
                  embeds: [embedData],
                  files: deserializedFiles
                });
                return true;
              } catch (err) {
                console.error('Error sending to log channel with files:', err);

                if (err.code === 50013) {
                  try {
                    await channel.send({ embeds: [embedData] });
                    return true;
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

            discord.shard.broadcastEval(
              async (c, { channelId, embedData }) => {
                try {
                  const channel = await c.channels.fetch(channelId).catch(() => null);
                  if (!channel || !channel.isTextBased()) return false;

                  await channel.send({ embeds: [embedData] });
                  return true;
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
          discord.shard.broadcastEval(
            async (c, { channelId, embedData }) => {
              try {
                const channel = await c.channels.fetch(channelId).catch(() => null);
                if (!channel || !channel.isTextBased()) return false;

                await channel.send({ embeds: [embedData] });
                return true;
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
            await channel.send({
              embeds: [embed],
              files
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
      if (eventType === EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE && files && files.length > 0) {
        embed.image = { url: 'attachment://currentDice.png' };
      }

      const logChannelId = logOutputChannelId;

      if (files && files.length > 0 && eventType === EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE) {
        const serializedFiles = files.map(file => ({
          name: file.name,
          attachment: file.attachment && Buffer.isBuffer(file.attachment)
            ? file.attachment.toString('base64')
            : null
        }));

        await manager.broadcastEval(
          async (c, { channelId, embedData, files }) => {
            const channel = await c.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return false;

            try {
              const deserializedFiles = files.map(file => ({
                name: file.name,
                attachment: file.attachment ? Buffer.from(file.attachment, 'base64') : null
              }));

              await channel.send({
                embeds: [embedData],
                files: deserializedFiles
              });
              return true;
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
            const channel = await c.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return false;

            try {
              await channel.send({ embeds: [embedData] });
              return true;
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