import Discord, {
  Guild,
  Message,
  TextChannel,
  DMChannel,
  NewsChannel,
  MessageEmbed,
  MessageAttachment,
  CommandInteraction,
  ButtonInteraction
} from "discord.js";
import { Command, EventType } from "../types";
import { adminID, prefix } from "../../config.json";
import { eventColor, errorColor, goodColor, infoColor } from "../constants";

const logEvent = async (
  eventType: EventType,
  logOutputChannel: TextChannel,
  message?: Message,
  command?: Command,
  args?: string[],
  title?: string,
  guild?: Guild,
  embedParam?: { embeds: MessageEmbed[]; files: MessageAttachment[] },
  interaction?: CommandInteraction | ButtonInteraction
) => {
  console.log(interaction?.inGuild());
  let embed: any;
  const channel:
    | TextChannel
    | DMChannel
    | NewsChannel = message?.channel as TextChannel;
  switch (eventType) {
    case "receivedCommand":
      command &&
        console.log(
          message?.guild?.id || interaction?.inGuild()
            ? `received command ${interaction ? "/" : prefix}${command.name
            }: ${args} from [ ${interaction
              ? interaction.user.username
              : message?.author.username
            } ] in channel [ ${interaction ? interaction.channel : channel.name
            } ] on [ ${interaction ? interaction?.guild?.name : message?.guild
            } ]`
            : message &&
            `received ${interaction ? "/" : ""}command ${command.name
            }: ${args} from [ ${interaction
              ? interaction.user.username
              : message.author.username
            } ] in [ DM ]`
        );
      embed =
        command &&
        new Discord.MessageEmbed()
          .setColor(eventColor)
          .setTitle(
            `${eventType}: ${interaction ? "/" : prefix}${command.name}`
          )
          .setDescription(
            message?.guild?.id || interaction?.inGuild()
              ? `${args} from ** ${interaction
                ? interaction.user.username
                : message?.author.username
              }** in channel **${channel.name}** on **${interaction ? interaction?.guild?.name : message?.guild
              }**`
              : `${args} from ** ${interaction
                ? interaction.user.username
                : message?.author.username
              }** in **DM**`
          );
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err) => console.error(err));
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
              : `${args} from **${message?.author.username}** in **DM** ${adminID}`
          );
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err) => console.error(err));
      break;
    case "rollTitleRejected":
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setTitle(eventType)
        .setDescription(
          message?.guild?.id
            ? `**${message.author.username}** in **${channel.name}** on **${message.guild}**`
            : `**${message?.author.username}** in **DM**`
        );
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err) => console.error(err));
      break;
    case "rollTitleAccepted":
      embed = new Discord.MessageEmbed()
        .setColor(eventColor)
        .setTitle(`${eventType}: ${title}`)
        .setDescription(
          message?.guild?.id
            ? ` **${message.author.username}** in channel **${channel.name}** on **${message.guild}**`
            : `**${message?.author.username}** in **DM**`
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
          message?.guild?.id
            ? `**${message.author.username}** in **${channel.name}** on **${message.guild}**`
            : `**${message?.author.username}** in **DM**`
        );
      logOutputChannel
        .send({ embeds: [embed] })
        .catch((err: Error) => console.error(err));
      break;
    case "guildAdd":
      embed =
        guild &&
        new Discord.MessageEmbed()
          .setColor(goodColor)
          .setTitle(eventType)
          .setDescription(`${guild.name}`);
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
      break;
    case "guildRemove":
      embed =
        guild &&
        new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(`${guild.name}`);
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
      break;
    case "sentRollResultMessage":
      embedParam &&
        logOutputChannel
          .send(embedParam)
          .catch((err: Error) => console.error(err));
      break;
    case "sentHelperMessage":
      embed =
        message &&
        new Discord.MessageEmbed()
          .setColor(infoColor)
          .setTitle(eventType)
          .setDescription(
            `${interaction ? interaction.user.username : message?.author.username
            } in ${channel.name}`
          );
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
      break;
    case "sentDiceOverMaxMessage":
      embed =
        message &&
        new Discord.MessageEmbed()
          .setColor(infoColor)
          .setTitle(eventType)
          .setDescription(`${message.author.username} in ${channel.name}`);
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
      break;
    case "sentNeedPermissionsMessage":
      embed =
        message &&
        new Discord.MessageEmbed()
          .setColor(errorColor)
          .setTitle(eventType)
          .setDescription(`**${channel.name}** on **${message.guild}**`);
      embed &&
        logOutputChannel
          .send({ embeds: [embed] })
          .catch((err: Error) => console.error(err));
      break;
    default:
      return null;
  }
};

export default logEvent;
