import Discord, {
  Client,
  Collection,
  Message,
  MessageEmbed,
  TextChannel
} from "discord.js";
import fs from "fs";
import path from "path";
import { prefix, botPath, supportServerLink } from "../../config.json";
import { Command } from "../types";
import { logEvent } from "../services";
import { errorColor } from "../constants/";

export default (discord: Client, logOutputChannel: TextChannel) => {
  let commands: Collection<string, Command>;
  commands = new Discord.Collection();
  process.chdir(path.dirname(botPath));
  const commandFiles: string[] = fs
    .readdirSync(`${botPath}src/commands`)
    .filter(
      (file: string) => file.endsWith(".ts") && !file.startsWith("index")
    );

  for (const file of commandFiles) {
    const command = require(`./${file}`);
    commands?.set(command.name, command);
  }

  discord.on("messageCreate", (message: Message) => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const shiftedArgs = args.shift() as string;
    const commandName = shiftedArgs.toLowerCase();

    const command =
      commands.get(commandName) ||
      commands.find((cmd) => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    try {
      command.execute(message, args, discord, logOutputChannel, commands);
      logEvent("receivedCommand", logOutputChannel, message, command, args);
    } catch (error) {
      const embed: MessageEmbed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setDescription(
          `error 😥 please join my [support server](${supportServerLink}) and report this`
        );
      message.channel.send({ embeds: [embed] });
      logEvent("criticalError", logOutputChannel, message, command, args);
    }
  });

  discord.on("interactionCreate", async (interaction) => {
    if (!interaction.isCommand()) return;
    await interaction.defer();
    const message = await interaction.fetchReply();

    const { value: diceNotation } = interaction.options.get("notation") || {};
    const { value: title } = interaction.options.get("title") || {};
    const { value: timesToRepeat } =
      interaction.options.get("timestorepeat") || {};

    const args = diceNotation?.toString().trim().split(/ +/) || [];
    const titleAsString = title?.toString();
    const timesToRepeatAsNumber = Number(timesToRepeat);

    const command =
      commands.get(interaction.commandName) ||
      commands.find(
        (cmd) => cmd.aliases && cmd.aliases.includes(interaction.commandName)
      );
    if (command)
      command.execute(
        message as Message,
        args,
        discord,
        logOutputChannel,
        commands,
        interaction,
        titleAsString,
        timesToRepeatAsNumber
      );
  });

  discord.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    const args = interaction.customId.trim().split('-');
    console.log(args);
    const command =
      commands.get(args[0]) ||
      commands.find(
        (cmd) => cmd.aliases && cmd.aliases.includes(args[0])
      );

    const wasFromSlash = !!args.length && args[2] === 'slash'

    if (command)
      command.execute(
        undefined,
        args[1] ? [args[1]] : [],
        discord,
        logOutputChannel,
        commands,
        interaction,
        undefined,
        undefined,
        wasFromSlash
      );

  });

};
