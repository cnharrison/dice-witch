const Discord = require("discord.js");
const { adminID } = require("../../config.json");
const {
  eventColor,
  errorColor,
  goodColor,
  infoColor,
} = require("../constants");

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
  switch (eventType) {
    case "receivedCommand":
      console.log(
        message.guild?.id
          ? `received command ${command.name}: ${args} from [ ${message.author.username} ] in channel [ ${message.channel.name} ] on [ ${message.guild} ]`
          : `received command ${command.name}: ${args} from [ ${message.author.username} ] in [ DM ]`
      );
      embed = new Discord.MessageEmbed()
        .setColor(eventColor)
        .setTitle(`${eventType}: ${command.name}`)
        .setDescription(
          message.guild?.id
            ? `${args} from **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}**`
            : `${args} from **${message.author.username}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "criticalError":
      embed = new Discord.MessageEmbed()
        .setColor("#FF0000")
        .setTitle(`${eventType}: ${command.name}`)
        .setDescription(
          message.guild?.id
            ? `${args} from **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}** <@${adminID}>`
            : `${args} from **${message.author.username}** in **DM** ${adminID}`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleRejected":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(
          message.guild?.id
            ? `**${message.author.username}** in **${message.channel.name}** on **${message.guild}**`
            : `**${message.author.username}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleAccepted":
      embed = new Discord.MessageEmbed()
        .setColor(eventColor)
        .setTitle(`${eventType}: ${title}`)
        .setDescription(
          message.guild?.id
            ? ` **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}**`
            : `**${message.author.username}** in **DM**`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "rollTitleTimeout":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(
          message.guild?.id
            ? `**${message.author.username}** in **${message.channel.name}** on **${message.guild}**`
            : `**${message.author.username}** in **DM**`
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
        .setDescription(
          `${message.author.username} in ${message.channel.name}`
        );
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    case "sentNeedPermissionsMessage":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(`**${message.channel.name}** on **${message.guild}**`);
      logOutputChannel.send(embed).catch((err) => console.error(err));
      break;
    default:
      return null;
  }
  return null;
};

module.exports = logEvent;
