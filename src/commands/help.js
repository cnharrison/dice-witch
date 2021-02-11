const { prefix } = require("../../config.json");
const Discord = require("discord.js");

module.exports = {
  name: "help",
  description: "List commands",
  aliases: ["commands"],
  usage: "[command name]",
  cooldown: 5,
  execute(message, args) {
    const data = [];
    const { commands } = message.client;

    if (!args.length) {
      data.push(commands.map((command) => command.name).join("\r"));
      data.push(
        `\nYou can send \`${prefix}help [command name]\` to get info on a specific command!`
      );

      const embed = new Discord.MessageEmbed()
        .setColor("#0000ff")
        .setTitle("Commands:")
        .setDescription(data, { split: true });

      return message.channel.send(embed);
    }
    const name = args[0].toLowerCase();
    const command =
      commands.get(name) ||
      commands.find((c) => c.aliases && c.aliases.includes(name));

    if (!command) {
      return message.reply("that's not a valid command!");
    }

    data.push(`**Name:** ${command.name}`);

    if (command.aliases)
      data.push(`**Aliases:** ${command.aliases.join(", ")}`);
    if (command.description)
      data.push(`**Description:** ${command.description}`);
    if (command.usage)
      data.push(`**Usage:** ${prefix}${command.name} ${command.usage}`);

    data.push(`**Cooldown:** ${command.cooldown || 3} second(s)`);

    const embed = new Discord.MessageEmbed()
      .setColor("#0000ff")
      .setTitle(`👩‍🏫 ${command.name}`)
      .setDescription(data, { split: true });

    return message.channel.send(embed);
  }
};
