import { EmbedBuilder } from "discord.js";
import { DiscordService } from "../../core/services/DiscordService";
import { StatusProps, UserCount } from "../../shared/types";
import { footerButtonRow } from "../../core/constants/index";

const status = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute({ interaction }: StatusProps) {
    const discordService = DiscordService.getInstance();
    const now = Date.now();

    try {
      if (interaction) {
        try {
          if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
          }
        } catch (err) {
          return;
        }
      }

      const userCountPromise = discordService.getUserCount();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout getting user count')), 5000)
      );

      let result: UserCount = { totalGuilds: undefined, totalMembers: undefined };

      try {
        result = await Promise.race([userCountPromise, timeoutPromise]) as UserCount;
      } catch (err) {}

      const { totalGuilds, totalMembers } = result;
      const latency = now - (interaction?.createdTimestamp ?? now);

      const embed = new EmbedBuilder()
        .setColor([153, 153, 153])
        .setTitle("Status")
        .setDescription(
          `Latency: **${latency}ms**\n I'm in **${totalGuilds || 'unknown'}** discord servers with **${totalMembers || 'unknown'}** users 😈`
        );

      const response = {
        embeds: [embed],
        components: [footerButtonRow],
      };

      if (interaction?.deferred) {
        await interaction.editReply(response);
      }
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

      if (interaction) {
        try {
          if (interaction.deferred) {
            await interaction.editReply(errorResponse);
          } else if (!interaction.replied) {
            await interaction.reply({ ...errorResponse, ephemeral: true });
          }
        } catch (err) {
          console.error("Error sending error response:", err);
        }
      }
    }
  },
};

export default status;