import Discord, {
  Guild,
  Message,
  TextChannel,
  DMChannel,
  NewsChannel,
  MessageOptions,
  APIMessage,
} from "discord.js";
import { Command, EventType } from "../types";
import { adminID } from "../../config.json";
import { eventColor, errorColor, goodColor, infoColor } from "../constants";

const logEvent = async (
  eventType: EventType,
  logOutputChannel: TextChannel,
  message?: Message,
  command?: Command,
  args?: string[],
  title?: string,
  guild?: Guild,
  embedParam?: MessageOptions | APIMessage
) => {
  let embed: MessageOptions | APIMessage | undefined;
  const channel:
    | TextChannel
    | DMChannel
    | NewsChannel = message?.channel as TextChannel;
  switch (eventType) {
    case "receivedCommand":
      command &&
        console.log(
          message?.guild?.id
            ? `received command ${command.name}: ${args} from [ ${message.author.username} ] in channel [ ${channel.name} ] on [ ${message.guild} ]`
            : message &&
            `received command ${command.name}: ${args} from [ ${message.author.username} ] in [ DM ]`
        );
      embed =
        command &&
        new Discord.MessageEmbed()
          .setColor(eventColor)
          .setTitle(`${eventType}: ${command.name}`)
          .setDescription(
            message?.guild?.id
              ? `${args} from **${message.author.username}** in channel **${channel.name}** on **${message.guild}**`
              : message &&
              `${args} from **${message.author.username}** in **DM**`
          );
      embed && logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "criticalError":
      embed =
        command &&
        new Discord.MessageEmbed()
          .setColor("#FF0000")
          .setTitle(`${eventType}: ${command.name}`)
          .setDescription(
            message?.guild?.id
              ? `${args} from **${message.author.username}** in channel **${channel.name}** on **${message.guild}** <@${adminID}>`
              : message &&
              `${args} from **${message.author.username}** in **DM** ${adminID}`
          );
      embed && logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleRejected":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(
          message?.guild?.id
            ? `**${message.author.username}** in **${channel.name}** on **${message.guild}**`
            : message && `**${message.author.username}** in **DM**`
        );
      embed && logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleAccepted":
      embed = new Discord.MessageEmbed()
        .setColor(eventColor)
        .setTitle(`${eventType}: ${title}`)
        .setDescription(
          message?.guild?.id
            ? ` **${message.author.username}** in channel **${channel.name}** on **${message.guild}**`
            : message && `**${message.author.username}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleTimeout":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(
          message?.guild?.id
            ? `**${message.author.username}** in **${channel.name}** on **${message.guild}**`
            : message && `**${message.author.username}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err: Error) => console.error(err));
      break;
    case "guildAdd":
      embed =
        guild &&
        new Discord.MessageEmbed()
          .setColor(goodColor)
          .setTitle(eventType)
          .setDescription(`${guild.name}`);
      embed &&
        logOutputChannel.send(embed).catch((err: Error) => console.error(err));
      break;
    case "guildRemove":
      embed =
        guild &&
        new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(`${guild.name}`);
      embed &&
        logOutputChannel.send(embed).catch((err: Error) => console.error(err));
      break;
    case "sentRollResultMessage":
      embed = embedParam;
      embed &&
        logOutputChannel.send(embed).catch((err: Error) => console.error(err));
      break;
    case "sentHelperMessage":
      embed =
        message &&
        new Discord.MessageEmbed()
          .setColor(infoColor)
          .setTitle(eventType)
          .setDescription(`${message.author.username} in ${channel.name}`);
      embed &&
        logOutputChannel.send(embed).catch((err: Error) => console.error(err));
      break;
    case "sentDiceOverMaxMessage":
      embed =
        message &&
        new Discord.MessageEmbed()
          .setColor(infoColor)
          .setTitle(eventType)
          .setDescription(`${message.author.username} in ${channel.name}`);
      embed &&
        logOutputChannel.send(embed).catch((err: Error) => console.error(err));
      break;
    case "sentNeedPermissionsMessage":
      embed =
        message &&
        new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(`**${channel.name}** on **${message.guild}**`);
      embed &&
        logOutputChannel.send(embed).catch((err: Error) => console.error(err));
      break;
    default:
      return null;
  }
  return null;
};

export default logEvent;
