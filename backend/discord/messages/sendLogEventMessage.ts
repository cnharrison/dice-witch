import {
  ChannelType,
  Client,
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

const { adminId, logOutputChannelId } = CONFIG.discord;

const sendLogEventMessage = async ({
  eventType,
  command,
  args,
  title,
  resultMessage,
  guild,
  interaction,
  discord,
}: Partial<LogEventProps>) => {
  if (!eventType) {
    console.error("Event type is undefined");
    return;
  }

  const channel = interaction?.channel as TextChannel | ThreadChannel | null;
  const channelName = channel?.name ?? "";
  const username = interaction?.user.username ?? "";
  const guildName = guild?.name ?? interaction?.guild?.name ?? "";
  const commandName = command?.name ?? "";
  const isGuildChannel = channel?.type === ChannelType.GuildText;
  const isThread = channel?.type === ChannelType.PublicThread;
  const isInGuild = interaction?.inGuild() ?? false;

  const getNameString = (isThread: boolean): string => isThread ? "thread" : "channel";

  const embedMap = {
    [EventType.RECEIVED_COMMAND]: {
      color: eventColor,
      title: `${eventType}: /${commandName}`,
      description: isInGuild
        ? `${args} from **${username}** in ${getNameString(isThread)} ${makeBold(channelName)} on ${makeBold(guildName)}`
        : `${args} from **${username}** in **DM**`,
    },
    [EventType.CRITICAL_ERROR]: {
      color: resolveColor("#FF0000"),
      title: `${eventType}: ${commandName}`,
      description: isInGuild
        ? `${args} from ${makeBold(username)} in ${getNameString(isThread)} ${makeBold(channelName)} on ${makeBold(guildName)} <@${adminId}>`
        : `${args} from ${makeBold(username)} in **DM** ${adminId}`,
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
      description: `Attachment sent🖼️`,
    },
    [EventType.SENT_ROLL_RESULT_MESSAGE]: {
      color: tabletopColor,
      title: `${eventType}: ${title ?? ""}`,
      description: resultMessage,
    },
    [EventType.SENT_HELPER_MESSAGE]: {
      color: infoColor,
      title: eventType,
      description: `${username} in ${isGuildChannel ? channelName : "DM"}`,
    },
    [EventType.SENT_DICE_OVER_MAX_MESSAGE]: {
      color: infoColor,
      title: eventType,
      description: `${username} in ${channelName}`,
    },
    [EventType.SENT_NEED_PERMISSION_MESSAGE]: {
      color: errorColor,
      title: eventType,
      description: `${makeBold(channelName)} on ${makeBold(guildName)}`,
    },
  };

  const generateEmbed = () => embedMap[eventType as keyof typeof embedMap] ?? {};

  const logEvent = async (c: Client, { embed, logOutputChannelID }: { embed: any; logOutputChannelID?: string }) => {
    if (!logOutputChannelID) return;
    const logOutputChannel = c.channels.cache.get(logOutputChannelID) as TextChannel;
    if (logOutputChannel) {
      try {
        await logOutputChannel.send({ embeds: [embed] });
      } catch (error) {
        console.error("Error sending log event message:", error);
      }
    }
  };

  if (discord) {
    if (discord.shard && discord.shard.count > 1) {
      discord.shard.broadcastEval(logEvent, {
        context: {
          embed: generateEmbed(),
          logOutputChannelId,
        },
      }).catch(console.error);
    } else {
      await logEvent(discord, {
        embed: generateEmbed(),
        logOutputChannelID: logOutputChannelId,
      });
    }
  } else {
    console.error("Discord client is undefined");
  }
};

export default sendLogEventMessage;