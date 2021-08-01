import Discord, { Client, CommandInteraction, Message } from "discord.js";
import { inviteLink, supportServerLink } from "../../config.json";

module.exports = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute(message: Message, _: string[], discord: Client, __: any, ___: any, ____: any, interaction: CommandInteraction) {
    const embed = new Discord.MessageEmbed()
      .setColor("#99999")
      .setTitle("Status")
      .setDescription(
        `Latency: **${Date.now() - message.createdTimestamp}ms**\n I'm in **${discord.guilds.cache.size
        }** discord servers 😈`
      )
      .addField(
        "\u200B",
        `_sent to ${interaction ? interaction.user.username : message.author.username}_ | [Invite me](${inviteLink}) | [Support server](${supportServerLink})`
      );

    message.channel.send({ embeds: [embed] });
    return;
  },
};
