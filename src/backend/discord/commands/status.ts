import { EmbedBuilder } from "discord.js";
import { footerButtonRow } from "../constants";
import { StatusProps } from "../../shared/types";
import { DiscordService } from "../../core/services/DiscordService";

const status = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute({ message, discord, interaction }: StatusProps) {
    const discordService = DiscordService.getInstance();
    const now = Date.now();

    try {
      const { totalGuilds, totalMembers } = await discordService.getUserCount({ discord }) ?? {};
      const latency = now - (interaction?.createdTimestamp ?? message.createdTimestamp);

      const embed = new EmbedBuilder()
        .setColor([153, 153, 153])
        .setTitle("Status")
        .setDescription(
          `Latency: **${latency}ms**\n I'm in **${totalGuilds}** discord servers with **${totalMembers}** users 😈`
        );

      const response = {
        embeds: [embed],
        components: [footerButtonRow],
      };

      interaction ? await interaction.reply(response) : await message.reply(response);
    } catch (err) {
      console.error("Error in status command:", err);
      const errorResponse = {
        embeds: [
          new EmbedBuilder()
            .setColor([255, 0, 0])
            .setTitle("Error")
            .setDescription("Failed to fetch status information")
        ],
        components: [footerButtonRow],
      };

      interaction ?
        await interaction.reply(errorResponse) :
        await message.reply(errorResponse);
    }
  },
};

export default status;