import Discord, { Client, Collection, Message, TextChannel } from "discord.js";
import fs from "fs";
import path from "path";
import { prefix, botPath, supportServerLink } from "../../config.json";
import { Command } from "../types";
import { logEvent } from "../services";
import { errorColor } from "../constants/";

export default function (discord: Client, logOutputChannel: TextChannel) {
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

  discord.on("message", (message: Message) => {
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
      const embed: any = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setDescription(
          `error 😥 please join my [support server](${supportServerLink}) and report this`
        );
      message.channel.send({ embeds: [embed] });
      logEvent("criticalError", logOutputChannel, message, command, args);
    }
  });
}
