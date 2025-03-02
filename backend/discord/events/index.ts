import {
  Client,
  TextChannel,
  Guild,
  Collection,
} from "discord.js";
import fs from "fs";
import path from "path";
import { CONFIG } from "../../config";
import { Command, EventType } from "../../shared/types";
import { sendLogEventMessage } from "../messages/sendLogEventMessage";
import { DatabaseService } from "../../core/services/DatabaseService";

const setupEvents = async (discord: Client, logOutputChannel: TextChannel) => {
  try {
    const databaseService = DatabaseService.getInstance();
    const commands = new Collection<string, Command>();

    process.chdir(path.dirname(CONFIG.botPath));
    const commandFiles: string[] = fs
      .readdirSync(`${CONFIG.botPath}/backend/discord/commands`)
      .filter((file: string) => file.endsWith(".ts") && file !== "definitions.ts");

    for (const file of commandFiles) {
      try {
        const commandModule = await import(`${CONFIG.botPath}/backend/discord/commands/${file}`);
        const command = commandModule.default;

        if (command?.name) {
          commands.set(command.name, command);
        } else {
          console.warn(`Command in file ${file} is missing a name property`);
        }
      } catch (error) {
        console.error(`Error loading command from file ${file}:`, error);
      }
    }

    discord.on("interactionCreate", async (interaction) => {
      if (!interaction.isCommand()) return;

      const interactionId = interaction.id;
      const timestamp = Date.now();
      const targetShard = interaction.guild
        ? discord.shard?.ids[0]
        : 0;

      if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
        process.send({
          type: 'interaction_received',
          timestamp: timestamp,
          interactionId: interactionId,
          commandName: interaction.commandName,
          shardId: discord.shard?.ids[0],
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          userId: interaction.user.id
        });
      }

      if (targetShard !== discord.shard?.ids[0]) {
        return;
      }

      const { commandName } = interaction;

      try {
        if (discord.trackCommandStart) {
          discord.trackCommandStart(interaction);
        }

        try {
          if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
            process.send({
              type: 'command_defer_start',
              timestamp: Date.now(),
              interactionId: interaction.id,
              commandName,
              shardId: discord.shard?.ids[0],
              guildId: interaction.guildId,
              channelId: interaction.channelId,
              userId: interaction.user.id
            });
          }
          
          const ephemeral = ['help', 'prefs', 'web'].includes(commandName);
          await interaction.deferReply({ ephemeral }).catch(err => {
            console.error(`Error deferring reply for ${commandName}:`, err);
            
            const isInteractionTimeout = err?.code === 10062 || 
              (err?.message && err.message.includes("Unknown interaction"));
              
            if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
              process.send({
                type: 'error',
                errorType: isInteractionTimeout ? 'INTERACTION_TIMEOUT' : 'INTERACTION_DEFER_ERROR',
                message: err?.message || String(err),
                stack: err?.stack,
                shardId: discord.shard?.ids[0],
                timestamp: Date.now(),
                context: {
                  commandName,
                  guildId: interaction.guildId,
                  channelId: interaction.channelId,
                  userId: interaction.user.id,
                  isTimeout: isInteractionTimeout
                }
              });
            }
          }).then(() => {
            if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
              process.send({
                type: 'command_defer_success',
                timestamp: Date.now(),
                interactionId: interaction.id,
                commandName,
                shardId: discord.shard?.ids[0]
              });
            }
          });
        } catch (deferError) {
          console.error(`Error deferring reply for ${commandName}:`, deferError);

          const isInteractionTimeout = deferError?.code === 10062 || 
            (deferError?.message && deferError.message.includes("Unknown interaction"));

          if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
            process.send({
              type: 'error',
              errorType: isInteractionTimeout ? 'INTERACTION_TIMEOUT' : 'INTERACTION_DEFER_ERROR',
              message: deferError?.message || String(deferError),
              stack: deferError?.stack,
              shardId: discord.shard?.ids[0],
              timestamp: Date.now(),
              context: {
                commandName,
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                userId: interaction.user.id,
                isTimeout: isInteractionTimeout
              }
            });
          }
        }

        const { value: diceNotation } = interaction.options.get("notation") || {};
        const { value: title } = interaction.options.get("title") || {};
        const { value: topic } = interaction.options.get("topic") || {};
        const { value: timesToRepeat } = interaction.options.get("timestorepeat") || {};

        const unformattedArgs = topic?.toString().trim().split("-") || [];
        const args = diceNotation
          ? diceNotation?.toString().trim().split(/ +/)
          : topic && commandName === "knowledgebase"
          ? [topic.toString().toLowerCase()]
          : unformattedArgs[1]
          ? [unformattedArgs[1]]
          : [];
        const titleAsString = title?.toString();
        const timesToRepeatAsNumber = Number(timesToRepeat);

        const command = commands.get(commandName);

        try {
          await command.execute({
            args,
            discord,
            commands,
            interaction,
            title: titleAsString,
            timesToRepeat: timesToRepeatAsNumber,
          });
        } catch (error) {
          if (error.code === 429 || 
              (error.message && (
                error.message.includes("rate limit") || 
                error.message.includes("You are being rate limited") ||
                error.message.toLowerCase().includes("ratelimit")
              ))) {
              
            if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
              process.send({
                type: 'error',
                errorType: 'DISCORD_RATE_LIMIT',
                message: error?.message || String(error),
                stack: error?.stack,
                shardId: discord.shard?.ids[0],
                timestamp: Date.now(),
                context: {
                  commandName,
                  code: error.code || 429,
                  method: error.method,
                  path: error.path,
                  limit: error.limit,
                  timeout: error.timeout,
                  route: error.route,
                  guildId: interaction.guildId,
                  channelId: interaction.channelId, 
                  userId: interaction.user.id,
                  global: error.global
                }
              });
            }
            
            try {
              if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                  content: "Discord is currently rate limiting requests. Please try again in a few moments.",
                  ephemeral: true
                });
              } else {
                await interaction.reply({
                  content: "Discord is currently rate limiting requests. Please try again in a few moments.",
                  ephemeral: true
                });
              }
            } catch (replyError) {
              console.error(`Error replying to rate limited interaction:`, replyError);
            }
          } else {
            throw error;
          }
        }

        if (discord.trackCommandEnd) {
          discord.trackCommandEnd(interaction);
        }

        sendLogEventMessage({
          eventType: EventType.RECEIVED_COMMAND,
          command,
          args,
          interaction
        });
      } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);

        if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
          const enhancedContext = {
            commandName,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            userId: interaction.user.id,
            user: {
              id: interaction.user.id,
              tag: interaction.user.tag,
              username: interaction.user.username
            }
          };

          if (interaction.guild) {
            enhancedContext.guild = {
              id: interaction.guild.id,
              name: interaction.guild.name
            };
          }

          if (args && args.length > 0) {
            enhancedContext.args = args;
          }

          process.send({
            type: 'error',
            errorType: 'COMMAND_EXECUTION_ERROR',
            message: error?.message || String(error),
            stack: error?.stack,
            shardId: discord.shard?.ids[0],
            timestamp: Date.now(),
            context: enhancedContext
          });

          console.error(`Guild: ${interaction.guild?.name || 'Unknown'} (${interaction.guildId || 'Unknown ID'})`);
          console.error(`User: ${interaction.user.username} (${interaction.user.id})`);
          console.error(`Args: ${JSON.stringify(args)}`);
        }

        try {
          const errorResponse = {
            content: "There was an error executing this command. The bot team has been notified.",
            ephemeral: true
          };

          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorResponse);
          } else {
            await interaction.reply(errorResponse);
          }
        } catch (replyError) {
          console.error(`Error replying to interaction after command error:`, replyError);

          if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
            process.send({
              type: 'error',
              errorType: 'INTERACTION_REPLY_ERROR',
              message: replyError?.message || String(replyError),
              stack: replyError?.stack,
              shardId: discord.shard?.ids[0],
              timestamp: Date.now(),
              context: {
                commandName,
                originalError: error?.message || String(error)
              }
            });
          }
        }
      }
    });

    discord.on("interactionCreate", async (interaction) => {
      if (!interaction.isButton()) return;

      const targetShard = interaction.guild
        ? discord.shard?.ids[0]
        : 0;

      if (targetShard !== discord.shard?.ids[0]) {
        return;
      }

      try {
        const unformattedArgs = interaction.customId.trim().split("-");
        const args = unformattedArgs[1] ? [unformattedArgs[1]] : [];

        const commandName = unformattedArgs[0];
        const command =
          commands.get(commandName) ||
          commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

        if (!command) {
          console.error(`Button interaction references unknown command: ${commandName}`);
          return;
        }

        command.execute({
          args,
          commands,
          interaction,
        });

        sendLogEventMessage({
          eventType: EventType.RECEIVED_COMMAND,
          command,
          args,
          interaction
        });
      } catch (error) {
        console.error('Error handling button interaction:', error);
      }
    });

    discord.on("guildCreate", async (guild: Guild) => {
      try {
        await databaseService.updateGuild(databaseService.mapGuildToGuildType(guild), false);
        sendLogEventMessage({
          eventType: EventType.GUILD_ADD,
          guild,
        });
      } catch (err) {
        console.error(err);
      }
    });

    discord.on("guildDelete", async (guild: Guild) => {
      try {
        await databaseService.updateGuild(databaseService.mapGuildToGuildType(guild), false, false);
        sendLogEventMessage({
          eventType: EventType.GUILD_REMOVE,
          guild
        });
      } catch (err) {
        console.error(err);
      }
    });
  } catch (err) {
    console.error(err);
  }
};

export { setupEvents as default };
