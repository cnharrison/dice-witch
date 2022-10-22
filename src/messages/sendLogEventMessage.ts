import {
  TextChannel,
  DMChannel,
  NewsChannel,
  PartialDMChannel,
  ThreadChannel,
  ChannelType,
  Client,
  resolveColor,
} from "discord.js";
import { EventType, LogEventProps } from "../types";
import { adminID, prefix } from "../../config.json";
import {
  eventColor,
  errorColor,
  goodColor,
  infoColor,
  tabletopColor,
} from "../constants";
import { makeBold } from "../helpers";

const sendLogEventMessage = async ({
  eventType,
  logOutputChannel,
  message,
  command,
  args,
  title,
  resultMessage,
  guild,
  interaction,
  discord,
  canvas,
}: Partial<LogEventProps>) => {
  const channel:
    | TextChannel
    | DMChannel
    | NewsChannel
    | PartialDMChannel
    | ThreadChannel
    | null = interaction
    ? (interaction.channel as TextChannel | ThreadChannel)
    : (message?.channel as TextChannel | ThreadChannel);
  const { name: channelName } = channel || {};
  const username = interaction
    ? interaction.user.username
    : message?.author.username;
  const guildName = guild ? guild.name : interaction?.guild?.name;
  const commandName = command?.name;
  const prefixName = interaction ? "/" : prefix;
  const isGuildChannel = channel && channel.type === ChannelType.GuildText;
  const isThread = channel && channel.type === ChannelType.PublicThread;
  const isInGuild = !!interaction?.inGuild();

  const generateEmbed = () => {
    const getNameString = (isThread: boolean): string =>
      isThread ? "thread" : "channel";
    switch (eventType) {
      case EventType.RECEIVED_COMMAND:
        return {
          color: eventColor,
          title: `${eventType}: ${prefixName}${commandName}`,
          description: isInGuild
            ? `${args} from ** ${username}** in ${getNameString(
                isThread
              )} ${makeBold(channelName)} on ${makeBold(guildName)}`
            : `${args} from ** ${username}** in **DM**`,
        };
      case EventType.CRITICAL_ERROR:
        return {
          color: resolveColor("#FF0000"),
          title: `${eventType}: ${commandName}`,
          description: isInGuild
            ? `${args} from ${makeBold(username)} in ${getNameString(
                isThread
              )} ${makeBold(channelName)} on ${makeBold(
                guildName
              )} <@${adminID}>`
            : `${args} from ${makeBold(username)} in **DM** ${adminID}`,
        };
      case EventType.GUILD_ADD:
        return {
          color: goodColor,
          title: eventType,
          description: guildName,
        };
      case EventType.GUILD_REMOVE:
        return {
          color: errorColor,
          title: eventType,
          description: guildName,
        };
      case EventType.SENT_ROLL_RESULT_MESSAGE_WITH_IMAGE:
        return {
          color: tabletopColor,
          title: `${eventType}: ${title ? title : ""}`,
          description: `${resultMessage}`,
        };

      case EventType.SENT_ROLL_RESULT_MESSAGE:
        return {
          color: tabletopColor,
          title: `${eventType}: ${title ? title : ""}`,
          description: resultMessage,
        };

      case EventType.SENT_HELER_MESSAGE:
        return {
          color: infoColor,
          title: eventType,
          description: `${username} in ${isGuildChannel ? channelName : "DM"}`,
        };
      case EventType.SENT_DICE_OVER_MAX_MESSAGE:
        return {
          color: infoColor,
          title: eventType,
          description: `${username} in ${channelName}`,
        };
      case EventType.SENT_NEED_PERMISSION_MESSAGE:
        return {
          color: errorColor,
          title: eventType,
          description: `${makeBold(channelName)} on ${makeBold(guildName)}`,
        };
      default:
        return {
          color: eventColor,
          title: `${eventType}: ${prefixName}${commandName}`,
          description: isInGuild
            ? `${args} from ** ${username}** in ${getNameString(
                isThread
              )} ${makeBold(channelName)} on ${makeBold(guildName)}`
            : `${args} from ** ${username}** in **DM**`,
        };
    }
  };

  const logEvent = (
    c: Client,
    {
      embed,
      logOutputChannelID,
    }: {
      embed: any;
      logOutputChannelID?: string;
    }
  ) => {
    if (!logOutputChannelID) return;
    const logOutputChannel = c.channels.cache.get(
      logOutputChannelID
    ) as TextChannel;
    if (logOutputChannel) {
      logOutputChannel
        .send({ embeds: [embed] })
        .catch((err: Error) => console.error(err));
    }
  };

  discord?.shard
    ?.broadcastEval(logEvent, {
      context: {
        embed: generateEmbed(),
        logOutputChannelID: "809430929676042290",
      },
    })
    .then(console.log)
    .catch(console.error);
};

export default sendLogEventMessage;
