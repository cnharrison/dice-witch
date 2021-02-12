const config = require("../../config.json");
const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");

module.exports = function (discord, logOutputChannel) {
  discord.commands = new Discord.Collection();
  process.chdir(path.dirname(config.botPath));
  const commandFiles = fs
    .readdirSync(`${config.botPath}src/commands`)
    .filter((file) => file.endsWith(".js") && !file.startsWith("index"));

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
      discord.commands.get(command).execute(message, args, discord);
      console.log(
        message.guild?.id
          ? `received command ${command}: ${args} from [ ${message.author.username} ] in channel [ ${message.channel.name} ] on [ ${message.guild} ]`
          : `received command ${command}: ${args} from [ ${message.author.username} ] in [ DM ]`
      );

      const embed = new Discord.MessageEmbed()
        .setColor("#99999")
        .setDescription(
          message.guild?.id
            ? `received command **${command}**: ${args} from **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}**`
            : `received command **${command}**: ${args} from **${message.author.username}** in **DM**`
        );
      logOutputChannel.send(embed);
    } catch (error) {
      console.error(error);
      const sendReactions = async () => {
        await message.react("🤪");
        await message.react("📞");
        await message.react("🏡");
      };
      sendReactions();
      const logEmbed = new Discord.MessageEmbed()
        .setColor("#FF0000")
        .setDescription(
          message.guild?.id
            ? `ERROR encountered: **${command}**: ${args} from **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}** <@${config.adminID}>`
            : `ERROR encountered: **${command}**: ${args} from **${message.author.username}** in **DM** ${config.adminID}`
        );
      logOutputChannel.send(logEmbed);
    }
  });
};
