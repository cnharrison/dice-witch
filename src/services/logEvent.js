const Discord = require("discord.js");
const { adminID } = require("../../config.json");
const { getAuthorDisplayName } = require("../helpers");

const eventColor = "#99999";
const errorColor = "#FF0000";
const goodColor = "#00FF00";
const infoColor = "#1E90FF";

const logEvent = async (
  eventType,
  logOutputChannel,
  message,
  command,
  args,
  title,
  guild,
  embedParam
) => {
  let embed;
  const displayName = await getAuthorDisplayName(message);
  switch (eventType) {
    case "receivedCommand":
      console.log(
        message.guild?.id
          ? `received command ${command.name}: ${args} from [ ${displayName} ] in channel [ ${message.channel.name} ] on [ ${message.guild} ]`
          : `received command ${command.name}: ${args} from [ ${displayName} ] in [ DM ]`
      );
      embed = new Discord.MessageEmbed()
        .setColor(eventColor)
        .setTitle(`${eventType}: ${command.name}`)
        .setDescription(
          message.guild?.id
            ? `${args} from **${displayName}** in channel **${message.channel.name}** on **${message.guild}**`
            : `${args} from **${displayName}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "criticalError":
      console.error(error);
      embed = new Discord.MessageEmbed()
        .setColor("#FF0000")
        .setTitle(`${eventType}: ${command.name}`)
        .setDescription(
          message.guild?.id
            ? `${args} from **${displayName}** in channel **${message.channel.name}** on **${message.guild}** <@${adminID}>`
            : `${args} from **${displayName}** in **DM** ${adminID}`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleRejected":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(
          message.guild?.id
            ? `**${displayName}** in **${message.channel.name}** on **${message.guild}**`
            : `**${displayName}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleAccepted":
      embed = new Discord.MessageEmbed()
        .setColor(eventColor)
        .setTitle(`${eventType}: ${title}`)
        .setDescription(
          message.guild?.id
            ? ` **${displayName}** in channel **${message.channel.name}** on **${message.guild}**`
            : `**${displayName}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleTimeout":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(
          message.guild?.id
            ? `**${displayName}** in **${message.channel.name}** on **${message.guild}**`
            : `**${displayName}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "guildAdd":
      embed = new Discord.MessageEmbed()
        .setColor(goodColor)
        .setTitle(eventType)
        .setDescription(`${guild.name}`);
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "guildRemove":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(`${guild.name}`);
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "sentRollResultMessage":
      embed = embedParam;
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "sentHelperMessage":
      embed = new Discord.MessageEmbed()
        .setColor(infoColor)
        .setTitle(eventType)
        .setDescription(`${displayName} in ${message.channel}`);
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "sentNeedPermissionsMessage":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(`**${message.channel}** on **${message.guild}**`);
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    default:
      return null;
  }
};

module.exports = logEvent;
