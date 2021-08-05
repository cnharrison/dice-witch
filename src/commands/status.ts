import Discord from "discord.js";
import { footerButtonRow } from "../constants";
import { StatusProps } from "../types";

module.exports = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute({ message, discord, interaction }: StatusProps) {
    const now = Date.now();
    const embed = new Discord.MessageEmbed()
      .setColor("#99999")
      .setTitle("Status")
      .setDescription(
        `Latency: **${interaction
          ? now - interaction.createdTimestamp
          : now - message.createdTimestamp
        }ms**\n I'm in **${discord.guilds.cache.size}** discord servers 😈`
      )
      .addField(
        "\u200B",
        `_sent to ${interaction ? interaction.user.username : message.author.username
        }_`
      );

    interaction
      ? await interaction.reply({
        embeds: [embed],
        components: [footerButtonRow]
      })
      : await message.channel.send({
        embeds: [embed],
        components: [footerButtonRow]
      });
    return;
  }
};
