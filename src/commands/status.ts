import Discord from "discord.js";
import { footerButtonRow } from "../constants";
import { getUserCount } from "../services";
import { StatusProps } from "../types";

module.exports = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute({ message, discord, interaction }: StatusProps) {
    const now = Date.now();
    const { totalGuilds, totalMembers } = await getUserCount({ discord }) ?? {};
    const latency = now - (interaction?.createdTimestamp ?? message.createdTimestamp);
    const embed = new Discord.EmbedBuilder()
      .setColor([153, 153, 153])
      .setTitle("Status")
      .setDescription(
        `Latency: **${latency}ms**\n I'm in **${totalGuilds}** discord servers with **${totalMembers}** users 😈`
      );

    try {
      const response = {
        embeds: [embed],
        components: [footerButtonRow],
      };
      interaction ? await interaction.reply(response) : await message.reply(response);
    } catch (err) {
      console.error(err);
    }
  },
};