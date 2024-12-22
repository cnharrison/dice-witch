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
import { sendLogEventMessage } from "../messages";
import { DatabaseService } from "../../core/services/DatabaseService";

const setupEvents = async (discord: Client, logOutputChannel: TextChannel) => {
  try {
    const databaseService = DatabaseService.getInstance();
    const commands = new Collection<string, Command>();

    process.chdir(path.dirname(CONFIG.botPath));
    const commandFiles: string[] = fs
      .readdirSync(`${CONFIG.botPath}/src/backend/discord/commands`)
      .filter((file: string) => file.endsWith(".ts"));

    for (const file of commandFiles) {
      try {
        const commandModule = await import(`${CONFIG.botPath}/src/backend/discord/commands/${file}`);
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

      const targetShard = interaction.guild
        ? discord.shard?.ids[0]
        : 0;

      if (targetShard !== discord.shard?.ids[0]) {
        return;
      }

      const { commandName } = interaction;

      try {
        if (commandName !== "status") {
          await interaction.deferReply();
        }

        await databaseService.updateOnCommand({ commandName, interaction });

        const { value: diceNotation } = interaction.options.get("notation") || {};
        const { value: title } = interaction.options.get("title") || {};
        const { value: topic } = interaction.options.get("topic") || {};
        const { value: timesToRepeat } = interaction.options.get("timestorepeat") || {};

        const unformattedArgs = topic?.toString().trim().split("-") || [];
        const args = diceNotation
          ? diceNotation?.toString().trim().split(/ +/)
          : unformattedArgs[1]
          ? [unformattedArgs[1]]
          : [];
        const titleAsString = title?.toString();
        const timesToRepeatAsNumber = Number(timesToRepeat);

        const command = commands.get(commandName);

        if (!command) {
          throw new Error(`Command ${commandName} not found`);
        }

        await command.execute({
          message: undefined,
          args,
          discord,
          logOutputChannel,
          commands,
          interaction,
          title: titleAsString,
          timesToRepeat: timesToRepeatAsNumber,
        });

        sendLogEventMessage({
          eventType: EventType.RECEIVED_COMMAND,
          logOutputChannel,
          command,
          args,
          interaction,
          discord,
        });
      } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        const errorResponse = { content: 'There was an error executing this command!' };

        if (interaction.deferred) {
          await interaction.editReply(errorResponse);
        } else {
          await interaction.reply(errorResponse);
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

      await interaction.deferReply();
      const unformattedArgs = interaction.customId.trim().split("-");
      const args = unformattedArgs[1] ? [unformattedArgs[1]] : [];

      const command =
        commands.get(unformattedArgs[0]) ||
        commands.find(
          (cmd) => cmd.aliases && cmd.aliases.includes(unformattedArgs[0])
        );

      if (command)
        command.execute({
          args,
          discord,
          logOutputChannel,
          commands,
          interaction,
          wasFromSlash,
        });
      sendLogEventMessage({
        eventType: EventType.RECEIVED_COMMAND,
        logOutputChannel,
        command,
        args,
        interaction,
        discord,
      });
    });

    discord.on("guildCreate", async (guild: Guild) => {
      try {
        await databaseService.upsertGuild(guild, false);
        sendLogEventMessage({
          eventType: EventType.GUILD_ADD,
          logOutputChannel,
          guild,
          discord,
        });
      } catch (err) {
        console.error(err);
      }
    });

    discord.on("guildDelete", async (guild: Guild) => {
      try {
        await databaseService.upsertGuild(guild, false, false);
        sendLogEventMessage({
          eventType: EventType.GUILD_REMOVE,
          logOutputChannel,
          guild,
          discord,
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
