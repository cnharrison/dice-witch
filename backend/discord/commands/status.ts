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
      const shardStatusPromise = discordService.getShardStatus();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout getting service information')), 5000)
      );

      let userCountResult: UserCount = { totalGuilds: undefined, totalMembers: undefined };
      let shardStatus: {id: number, status: string, guilds: number, ping: number}[] = [];

      try {
        try {
          userCountResult = await Promise.race([userCountPromise, timeoutPromise]) as UserCount;
        } catch (err) {
          console.error("Error fetching user count:", err);
        }

        try {
          const shards = await Promise.race([shardStatusPromise, timeoutPromise]);
          shardStatus = shards as typeof shardStatus;
        } catch (err) {
          console.error("Error fetching shard status:", err);
        }
      } catch (err) {
        console.error("Error in status command outer try/catch:", err);
      }

      const { totalGuilds, totalMembers } = userCountResult;
      const latency = now - (interaction?.createdTimestamp ?? now);

      shardStatus.sort((a, b) => a.id - b.id);

      let shardStatusText = "";
      if (shardStatus.length > 0) {
        shardStatusText = "\n\n__Shard Status:__\n";
        shardStatus.forEach(shard => {
          const statusEmoji = shard.status === "Online" ? "🟢" :
                             shard.status === "Connecting" ? "🟡" :
                             shard.status === "Running" ? "🟡" : "🔴";

          const guildText = shard.guilds >= 0 ? `${shard.guilds} servers` : "unknown servers";
          const pingText = shard.ping >= 0 ? `${shard.ping}ms` : "unknown";

          shardStatusText += `${statusEmoji} Shard ${shard.id}: ${shard.status} (${guildText}, ${pingText})\n`;
        });
      }

      const embed = new EmbedBuilder()
        .setColor([153, 153, 153])
        .setTitle("Status")
        .setDescription(
          `Latency: **${latency}ms**\nI'm in **${totalGuilds || 'unknown'}** discord servers with **${totalMembers || 'unknown'}** users 😈${shardStatusText}`
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