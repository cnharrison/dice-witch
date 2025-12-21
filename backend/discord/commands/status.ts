import { EmbedBuilder } from "discord.js";
import { DiscordService } from "../../core/services/DiscordService";
import { CommandProps, UserCount } from "../../shared/types";
import { footerButtonRow } from "../../core/constants/index";

const status = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute({ interaction }: CommandProps) {
    const discordService = DiscordService.getInstance();
    const now = Date.now();

    try {
      if (!interaction) {
        return;
      }
      if (interaction) {
        const interactionId = interaction.id;
        const timestamp = Date.now();

        if (typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
          process.send({
            type: 'status_command_start',
            timestamp: timestamp,
            interactionId: interactionId,
            shardId: interaction.client.shard?.ids?.[0] ?? 'unknown',
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            userId: interaction.user.id
          });
        }

      }

      let userCountResult: UserCount = { totalGuilds: undefined, totalMembers: undefined };
      let shardStatus: {id: number, status: string, guilds: number, ping: number}[] = [];

      try {
        if (interaction && interaction.client.shard !== undefined && typeof process.send === 'function') {
          process.send({
            type: 'status_getting_data',
            timestamp: Date.now(),
            interactionId: interaction.id,
            shardId: interaction.client.shard?.ids?.[0] ?? 'unknown'
          });
        }

        userCountResult = await discordService.getUserCount().catch(err => {
          console.error("Error fetching user count:", err);
          return { totalGuilds: undefined, totalMembers: undefined };
        });

        if (interaction && interaction.client.shard) {
          try {
            if (process.send) {
              const requestId = `status_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

              if (interaction && interaction.client.shard !== undefined && typeof process.send === 'function') {
                process.send({
                  type: 'status_requesting_shards',
                  timestamp: Date.now(),
                  interactionId: interaction.id,
                  requestId: requestId,
                  shardId: interaction.client.shard.ids?.[0]
                });
              }

              const responsePromise = new Promise<{id: number, status: string, guilds: number, ping: number}[]>((resolve) => {
                const messageHandler = (message: any) => {
                  if (message && message.type === 'shardStatusResponse' && message.requestId === requestId) {
                    process.off('message', messageHandler);
                    resolve(message.shardStatus);
                  }
                };

                process.on('message', messageHandler);

                setTimeout(() => {
                  process.off('message', messageHandler);

                  if (typeof interaction.client.shard !== 'undefined' && typeof process.send === 'function') {
                    process.send({
                      type: 'status_shards_timeout',
                      timestamp: Date.now(),
                      interactionId: interaction.id,
                      requestId: requestId,
                      shardId: interaction.client.shard?.ids[0]
                    });
                  }

                  resolve([]);
                }, 5000);
              });

              process.send({
                type: 'shardStatusRequest',
                requestId,
                shardId: interaction.client.shard.ids[0]
              });

              shardStatus = await responsePromise;
            }
          } catch (err) {
            console.error("Error with shard status request:", err);
          }
        }

        if (shardStatus.length === 0) {
          shardStatus = await discordService.getShardStatus().catch(err => {
            console.error("Error fetching shard status:", err);
            return [];
          });
        }
      } catch (err) {
        console.error("Error in status command:", err);
      }

      const { totalGuilds, totalMembers } = userCountResult;
      const latency = now - (interaction?.createdTimestamp ?? now);

      shardStatus.sort((a, b) => a.id - b.id);

      let shardStatusText = "";
      if (shardStatus.length > 0) {
        shardStatusText = "\n\n__Shard Status:__\n";
        shardStatus.forEach(shard => {
          if (shard.guilds > 0) {
            shard.status = "Online";
          }

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

      if (interaction && interaction.client.shard !== undefined && typeof process.send === 'function') {
        process.send({
          type: 'status_sending_response',
          timestamp: Date.now(),
          interactionId: interaction.id,
          shardId: interaction.client.shard?.ids?.[0] ?? 'unknown'
        });
      }

      if (interaction?.deferred) {
        await interaction.editReply(response).then(() => {
          if (interaction && interaction.client.shard !== undefined && typeof process.send === 'function') {
            process.send({
              type: 'status_response_sent',
              timestamp: Date.now(),
              interactionId: interaction.id,
              shardId: interaction.client.shard?.ids?.[0] ?? 'unknown'
            });
          }
        }).catch(err => {
          if (interaction && interaction.client.shard !== undefined && typeof process.send === 'function') {
            process.send({
              type: 'error',
              errorType: 'EDIT_REPLY_ERROR',
              message: err?.message || String(err),
              stack: err?.stack,
              shardId: interaction.client.shard?.ids?.[0] ?? 'unknown',
              timestamp: Date.now(),
              context: {
                commandName: 'status',
                interactionId: interaction.id,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id
              }
            });
          }
        });
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
