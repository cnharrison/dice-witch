import Discord, {
  Client,
  TextChannel,
  Guild,
  Collection,
  Message,
  MessageEmbed
} from "discord.js";
import fs from "fs";
import path from "path";
import { prefix, botPath, supportServerLink } from "../../config.json";
import { Command } from "../types";
import { logEvent } from "../services";
import { errorColor } from "../constants/";

export default (discord: Client, logOutputChannel: TextChannel) => {
  try {
    let commands: Collection<string, Command>;
    commands = new Discord.Collection();
    process.chdir(path.dirname(botPath));
    const commandFiles: string[] = fs
      .readdirSync(`${botPath}/src/commands`)
      .filter((file: string) => file.endsWith(".ts"));

    for (const file of commandFiles) {
      const command = require(`${botPath}/src/commands/${file}`);
      commands?.set(command.name, command);
    }

    discord.on("messageCreate", async (message: Message) => {
      if (!message.content.startsWith(prefix) || message.author.bot) return;

      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const shiftedArgs = args.shift() as string;
      const commandName = shiftedArgs.toLowerCase();

      const command =
        commands.get(commandName) ||
        commands.find(
          (cmd) => cmd.aliases && cmd.aliases.includes(commandName)
        );

      if (!command) return;

      try {
        command.execute({ message, args, discord, logOutputChannel, commands });
        logEvent({
          eventType: "receivedCommand",
          logOutputChannel,
          message,
          command,
          args
        });
      } catch (error) {
        const embed: MessageEmbed = new Discord.MessageEmbed()
          .setColor(errorColor)
          .setDescription(
            `error 😥 please join my [support server](${supportServerLink}) and report this`
          );
        await message.channel.send({ embeds: [embed] });
        logEvent({
          eventType: "criticalError",
          logOutputChannel,
          message,
          command,
          args
        });
      }
    });

    discord.on("interactionCreate", async (interaction) => {
      if (!interaction.isCommand()) return;

      if (interaction.commandName !== "status") {
        await interaction.defer();
      }

      const { value: diceNotation } = interaction.options.get("notation") || {};
      const { value: title } = interaction.options.get("title") || {};
      const { value: topic } = interaction.options.get("topic") || {};
      const { value: timesToRepeat } =
        interaction.options.get("timestorepeat") || {};

      const unformattedArgs = topic?.toString().trim().split("-") || [];
      const wasFromSlash =
        !!unformattedArgs.length && unformattedArgs[2] === "slash";
      const args = diceNotation
        ? diceNotation?.toString().trim().split(/ +/)
        : unformattedArgs[1]
          ? [unformattedArgs[1]]
          : [];
      const titleAsString = title?.toString();
      const timesToRepeatAsNumber = Number(timesToRepeat);

      const command =
        commands.get(interaction.commandName) ||
        commands.find(
          (cmd) => cmd.aliases && cmd.aliases.includes(interaction.commandName)
        );
      if (command)
        command.execute({
          message: undefined,
          args,
          discord,
          logOutputChannel,
          commands,
          interaction,
          title: titleAsString,
          timesToRepeat: timesToRepeatAsNumber,
          wasFromSlash
        });
      logEvent({
        eventType: "receivedCommand",
        logOutputChannel,
        command,
        args,
        interaction
      });
    });

    discord.on("interactionCreate", async (interaction) => {
      if (!interaction.isButton()) return;
      await interaction.defer();
      const unformattedArgs = interaction.customId.trim().split("-");
      const args = unformattedArgs[1] ? [unformattedArgs[1]] : [];

      const command =
        commands.get(unformattedArgs[0]) ||
        commands.find(
          (cmd) => cmd.aliases && cmd.aliases.includes(unformattedArgs[0])
        );

      const wasFromSlash =
        !!unformattedArgs.length && unformattedArgs[2] === "slash";

      if (command)
        command.execute({
          args,
          discord,
          logOutputChannel,
          commands,
          interaction,
          wasFromSlash
        });
      logEvent({
        eventType: "receivedCommand",
        logOutputChannel,
        command,
        args,
        interaction
      });
    });

    discord.on("guildCreate", (guild: Guild) => {
      logEvent({
        eventType: "guildAdd",
        logOutputChannel,
        guild
      });
    });

    discord.on("guildDelete", (guild: Guild) => {
      logEvent({
        eventType: "guildRemove",
        logOutputChannel,
        guild
      });
    });
  } catch (err) {
    console.error(err);
  }
};
