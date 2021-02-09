const config = require("../../config.json");
const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");
const discord = new Discord.Client();
discord.commands = new Discord.Collection();

module.exports = function () {
  process.chdir(path.dirname(config.botPath));
  const commandFiles = fs
    .readdirSync(`${config.botPath}src/commands`)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const command = require(`./${file}`);
    discord.commands.set(command.name, command);
  }

  discord.on("message", (message) => {
    const prefix = config.prefix;
    if (!message.content.startsWith(prefix) || message.author.bot) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (!discord.commands.has(command)) return;

    try {
      discord.commands.get(command).execute(message, args, Discord);
      console.log(
        `recieved ${command}: ${args} from ${message.author.username} in ${message.channel.name} on ${message.guild}`
      );
    } catch (error) {
      console.error(error);
      const embed = new Discord.MessageEmbed()
        .setColor("#FF0000")
        .setDescription(`There's a problem🤪`);
      message.reply(embed);
    }
  });

  discord.login(config.discordToken);
  discord.on("ready", () => {
    console.log(`[Discord] Logged in as ${discord.user.tag}!`);
  });
};
