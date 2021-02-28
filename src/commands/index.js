const Discord = require("discord.js");
const { prefix, botPath, supportServerLink } = require("../../config.json");
const { logEvent } = require("../services");
const fs = require("fs");
const path = require("path");

module.exports = function (discord, logOutputChannel) {
  discord.commands = new Discord.Collection();
  process.chdir(path.dirname(botPath));
  const commandFiles = fs
    .readdirSync(`${botPath}src/commands`)
    .filter((file) => file.endsWith(".js") && !file.startsWith("index"));

  for (const file of commandFiles) {
    const command = require(`./${file}`);
    discord.commands.set(command.name, command);
  }

  discord.on("message", (message) => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command =
      discord.commands.get(commandName) ||
      discord.commands.find(
        (cmd) => cmd.aliases && cmd.aliases.includes(commandName)
      );

    if (!command) return;

    try {
      command.execute(message, args, discord, logOutputChannel);
      logEvent("receivedCommand", logOutputChannel, message, command, args);
    } catch (error) {
      embed = new Discord.MessageEmbed()
        .setColor(errorColor)
        .setDescription(
          `error 😥 please join my [support server](${supportServerLink}) and report this`
        );
      message.channel.send(embed);
      logEvent("criticalError", logOutputChannel, message, command, args);
    }
  });
};
