import {
  TextChannel,
  ThreadChannel,
  ChannelType,
  Client,
  resolveColor,
} from "discord.js";
import { EventType, LogEventProps } from "../../shared/types";
import { adminID, logOutputChannelID } from "../../config.json";
import {
  eventColor,
  errorColor,
  goodColor,
  infoColor,
  tabletopColor,
} from "../constants";
import { makeBold } from "../../shared/helpers";

const sendLogEventMessage = async ({
  eventType,
  message,
  command,
  args,
  title,
  resultMessage,
  guild,
  interaction,
  discord,
}: Partial<LogEventProps>) => {
  const channel = interaction?.channel ?? message?.channel as TextChannel | ThreadChannel | null;
  const channelName = (channel && 'name' in channel) ? channel.name : "";
  const username = interaction?.user.username ?? message?.author.username ?? "";
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
        ? `${args} from ${makeBold(username)} in ${getNameString(isThread)} ${makeBold(channelName)} on ${makeBold(guildName)} <@${adminID}>`
        : `${args} from ${makeBold(username)} in **DM** ${adminID}`,
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
    [EventType.SENT_HELER_MESSAGE]: {
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

  if (!eventType) {
    console.error("Event type is undefined");
    return;
  }

  const generateEmbed = () => embedMap[eventType as keyof typeof embedMap] ?? {};

  const logEvent = (c: Client, { embed, logOutputChannelID }: { embed: any; logOutputChannelID?: string }) => {
    if (!logOutputChannelID) return;
    const logOutputChannel = c.channels.cache.get(logOutputChannelID) as TextChannel;
    if (logOutputChannel) {
      logOutputChannel.send({ embeds: [embed] }).catch(console.error);
    }
  };

  discord?.shard
    ?.broadcastEval(logEvent, {
      context: {
        embed: generateEmbed(),
        logOutputChannelID,
      },
    })
    .catch(console.error);
};

export default sendLogEventMessage;