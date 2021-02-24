const {
  prefix,
  botPath,
  supportServerLink,
  adminID
} = require("../../config.json");
const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");

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
      console.log(
        message.guild?.id
          ? `received command ${command.name}: ${args} from [ ${message.author.username} ] in channel [ ${message.channel.name} ] on [ ${message.guild} ]`
          : `received command ${command.name}: ${args} from [ ${message.author.username} ] in [ DM ]`
      );

      const embed = new Discord.MessageEmbed()
        .setColor("#99999")
        .setDescription(
          message.guild?.id
            ? `received command **${command.name}**: ${args} from **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}**`
            : `received command **${command.name}**: ${args} from **${message.author.username}** in **DM**`
        );
      logOutputChannel.send(embed);
    } catch (error) {
      console.error(error);
      const embed = new Discord.MessageEmbed()
        .setColor("#FF0000")
        .setDescription(
          `error 😥 please join my [support server](${supportServerLink}) and report this`
        );
      message.channel.send(embed);
      sendReactions();
      const logEmbed = new Discord.MessageEmbed()
        .setColor("#FF0000")
        .setDescription(
          message.guild?.id
            ? `ERROR encountered: **${command.name}**: ${args} from **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}** <@${adminID}>`
            : `ERROR encountered: **${command.name}**: ${args} from **${message.author.username}** in **DM** ${adminID}`
        );
      logOutputChannel.send(logEmbed);
    }
  });
};
