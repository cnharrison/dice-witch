import Discord, {
  Guild,
  Message,
  TextChannel,
  DMChannel,
  NewsChannel,
  MessageEmbed,
  MessageAttachment,
  CommandInteraction,
  ButtonInteraction,
  PartialDMChannel,
  ThreadChannel
} from "discord.js";
import { Command, EmbedObject, EventType, LogEventProps } from "../types";
import { adminID, prefix } from "../../config.json";
import { eventColor, errorColor, goodColor, infoColor } from "../constants";

const logEvent = async ({
  eventType,
  logOutputChannel,
  message,
  command,
  args,
  title,
  guild,
  embedParam,
  interaction
}: Partial<LogEventProps>) => {
  let embed: any;
  const channel:
    | TextChannel
    | DMChannel
    | NewsChannel
    | PartialDMChannel
    | ThreadChannel
    | null = interaction
      ? (interaction.channel as TextChannel)
      : (message?.channel as TextChannel);
  const { name: channelName } = channel;
  const username = interaction
    ? interaction.user.username
    : message?.author.username;
  const guildName = guild
    ? guild.name
    : interaction
      ? interaction?.guild?.name
      : message?.guild;
  const commandName = command?.name;
  const prefixName = interaction ? "/" : prefix;
  const isGuildChannel = channel && channel.type === "GUILD_TEXT";
  const isInGuild = message?.guild?.id || interaction?.inGuild();

  if (logOutputChannel) {
    switch (eventType) {
      case "receivedCommand":
        console.log(
          message?.guild?.id || interaction?.inGuild()
            ? `received command ${prefixName}${commandName}: ${args} from [ ${username} ] in channel [ ${channelName} ] on [ ${guildName} ]`
            : `received ${prefixName}command ${commandName}: ${args} from [ ${username} ] in [ DM ]`
        );
        embed = new Discord.MessageEmbed()
          .setColor(eventColor)
          .setTitle(`${eventType}: ${prefixName}${commandName}`)
          .setDescription(
            isInGuild
              ? `${args} from ** ${username}** in channel **${channelName}** on **${guildName}**`
              : `${args} from ** ${username}** in **DM**`
          );
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err) => console.error(err));
        break;
      case "criticalError":
        embed = new Discord.MessageEmbed()
          .setColor("#FF0000")
          .setTitle(`${eventType}: ${commandName}`)
          .setDescription(
            isInGuild
              ? `${args} from **${username}** in channel **${channelName}** on **${guildName}** <@${adminID}>`
              : `${args} from **${username}** in **DM** ${adminID}`
          );
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err) => console.error(err));
        break;
      case "rollTitleRejected":
        embed = new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(
            isInGuild
              ? `**${username}** in **${channelName}** on **${guildName}**`
              : `**${username}** in **DM**`
          );
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err) => console.error(err));
        break;
      case "rollTitleAccepted":
        embed = new Discord.MessageEmbed()
          .setColor(eventColor)
          .setTitle(`${eventType}: ${title}`)
          .setDescription(
            isInGuild
              ? ` **${username}** in channel **${channelName}** on **${guildName}**`
              : `**${username}** in **DM**`
          );
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err) => console.error(err));
        break;
      case "rollTitleTimeout":
        embed = new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(
            isInGuild
              ? `**${username}** in **${channelName}** on **${guildName}**`
              : `**${username}** in **DM**`
          );
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
        break;
      case "guildAdd":
        embed = new Discord.MessageEmbed()
          .setColor(goodColor)
          .setTitle(eventType)
          .setDescription(`${guildName}`);
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
        break;
      case "guildRemove":
        embed = new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(`${guildName}`);
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
        break;
      case "sentRollResultMessage":
        logOutputChannel
          .send(embedParam as EmbedObject)
          .catch((err: Error) => console.error(err));
        break;
      case "sentHelperMessage":
        embed = new Discord.MessageEmbed()
          .setColor(infoColor)
          .setTitle(eventType)
          .setDescription(
            `${username} in ${isGuildChannel ? channelName : "DM"}`
          );
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
        break;
      case "sentDiceOverMaxMessage":
        embed = new Discord.MessageEmbed()
          .setColor(infoColor)
          .setTitle(eventType)
          .setDescription(`${username} in ${channelName}`);
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
        break;
      case "sentNeedPermissionsMessage":
        embed = new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(`**${channelName}** on **${guildName}**`);
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
        break;
      default:
        return null;
    }
  }
};

export default logEvent;
