import Discord from "discord.js";
import { Client, Collection, Message, TextChannel } from "discord.js";
import { Command } from "../types";
import fs from "fs";
import path from "path";
import { prefix, botPath, supportServerLink } from "../../config.json";
import { logEvent } from "../services";
import { errorColor } from "../constants/";

module.exports = function (discord: Client, logOutputChannel: TextChannel) {
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
      const embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setDescription(
          `error 😥 please join my [support server](${supportServerLink}) and report this`
        );
      message.channel.send(embed);
      logEvent("criticalError", logOutputChannel, message, command, args);
    }
  });
};
