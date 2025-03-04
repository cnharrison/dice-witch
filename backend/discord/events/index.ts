import {
  Client,
  Guild,
  Collection,
} from "discord.js";
import fs from "fs";
import path from "path";
import { CONFIG } from "../../config";
import { Command, EventType } from "../../shared/types";
import { sendLogEventMessage } from "../messages/sendLogEventMessage";
import { DatabaseService } from "../../core/services/DatabaseService";

const handlers = new Map<string, (...args: any[]) => void>();

const registerHandler = (
  client: Client, 
  event: string, 
  handler: (...args: any[]) => void
) => {
  const key = `${event}:${handler.name || Math.random().toString(36).substring(2, 9)}`;
  if (handlers.has(key)) {
    return;
  }
  
  client.on(event, handler);
  handlers.set(key, handler);
};

export const removeAllHandlers = (client: Client) => {
  handlers.forEach((handler, key) => {
    const [event] = key.split(':');
    client.removeListener(event, handler);
  });
  handlers.clear();
};

const setupEvents = async (discord: Client) => {
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

    const commandInteractionHandler = async (interaction: any) => {
      if (!interaction.isCommand()) return;

      const interactionId = interaction.id;
      const timestamp = Date.now();

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

      const { commandName } = interaction;

      try {

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
          await interaction.deferReply({ ephemeral }).catch((err: any) => {
            console.error(`Error deferring reply for ${commandName}:`, err);
            
            const isInteractionTimeout = err?.code === 10062 || 
              (err?.message && err.message.includes("Unknown interaction"));
              
            if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
              process.send({
                type: 'error',
                errorType: isInteractionTimeout ? 'INTERACTION_TIMEOUT' : 'INTERACTION_DEFER_ERROR',
                message: err?.message || String(err),
                stack: (err as Error)?.stack || '',
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

          const isInteractionTimeout = (deferError as any)?.code === 10062 || 
            ((deferError as any)?.message && (deferError as any).message.includes("Unknown interaction"));

          if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
            process.send({
              type: 'error',
              errorType: isInteractionTimeout ? 'INTERACTION_TIMEOUT' : 'INTERACTION_DEFER_ERROR',
              message: (deferError as any)?.message || String(deferError),
              stack: (deferError as Error)?.stack || '',
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
        
        if (!command) {
          console.error(`Command not found: ${commandName}`);
          return;
        }

        try {
          await command.execute({
            args,
            discord,
            commands,
            interaction,
            title: titleAsString,
            timesToRepeat: timesToRepeatAsNumber,
          });
        } catch (error: any) {
          if (error?.code === 429 || 
              (error?.message && (
                error.message.includes("rate limit") || 
                error.message.includes("You are being rate limited") ||
                error.message.toLowerCase().includes("ratelimit")
              ))) {
              
            if (typeof discord.shard !== 'undefined' && typeof process.send === 'function') {
              process.send({
                type: 'error',
                errorType: 'DISCORD_RATE_LIMIT',
                message: error?.message || String(error),
                stack: (error as Error)?.stack || '',
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
                await interaction.editReply(
                  "Discord is currently rate limiting requests. Please try again in a few moments."
                );
              } else {
                await interaction.reply(
                  "Discord is currently rate limiting requests. Please try again in a few moments."
                );
              }
            } catch (replyError) {
              console.error(`Error replying to rate limited interaction:`, replyError);
            }
          } else {
            throw error;
          }
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
          const enhancedContext: any = {
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
            enhancedContext.guildInfo = {
              id: interaction.guild.id,
              name: interaction.guild.name
            };
          }


          process.send({
            type: 'error',
            errorType: 'COMMAND_EXECUTION_ERROR',
            message: (error as Error)?.message || String(error),
            stack: (error as Error)?.stack || '',
            shardId: discord.shard?.ids[0],
            timestamp: Date.now(),
            context: enhancedContext
          });

          console.error(`Guild: ${interaction.guild?.name || 'Unknown'} (${interaction.guildId || 'Unknown ID'})`);
          console.error(`User: ${interaction.user.username} (${interaction.user.id})`);
        }

        try {
          const errorResponse = 
            "There was an error executing this command. The bot team has been notified.";

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
              message: (replyError as Error)?.message || String(replyError),
              stack: (replyError as Error)?.stack || '',
              shardId: discord.shard?.ids[0],
              timestamp: Date.now(),
              context: {
                commandName,
                originalError: (error as Error)?.message || String(error)
              }
            });
          }
        }
      }
    };

    const buttonInteractionHandler = async (interaction: any) => {
      if (!interaction.isButton()) return;

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
    };

    const guildCreateHandler = async (guild: Guild) => {
      try {
        await databaseService.updateGuild(databaseService.mapGuildToGuildType(guild), false);
        sendLogEventMessage({
          eventType: EventType.GUILD_ADD,
          guild,
        });
      } catch (err: any) {
        console.error(err);
      }
    };

    const guildDeleteHandler = async (guild: Guild) => {
      try {
        await databaseService.updateGuild(databaseService.mapGuildToGuildType(guild), false, false);
        sendLogEventMessage({
          eventType: EventType.GUILD_REMOVE,
          guild
        });
      } catch (err: any) {
        console.error(err);
      }
    };
    
    registerHandler(discord, "interactionCreate", commandInteractionHandler);
    registerHandler(discord, "interactionCreate", buttonInteractionHandler);
    registerHandler(discord, "guildCreate", guildCreateHandler);
    registerHandler(discord, "guildDelete", guildDeleteHandler);
    discord.once('shutdown', () => removeAllHandlers(discord));
    discord.once('disconnect', () => removeAllHandlers(discord));
    
  } catch (err) {
    console.error(err);
  }
  
  return { removeHandlers: () => removeAllHandlers(discord) };
};

export { setupEvents as default };
