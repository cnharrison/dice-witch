import Discord, { Client, Collection, Message, TextChannel } from "discord.js";
import { Command } from "../types";
import { prefix } from "../../config.json";
import { deprecationWarning, footerButtonRow } from "../constants";

module.exports = {
  name: "help",
  description: "List commands",
  aliases: ["commands"],
  usage: "[command name]",
  async execute(
    message: Message,
    args: string[],
    _: Client,
    __: TextChannel,
    commands: Collection<string, Command>
  ) {
    const data = [];
    console.log(args);

    if (!args.length) {
      data.push(commands.map((command) => command.name).join("\r"));
      data.push(`\n\More: \n\`${prefix}help [command name]\``);

      const embed = new Discord.MessageEmbed()
        .setColor("#0000ff")
        .setTitle("Commands")
        .setDescription(`${deprecationWarning}\n\n${data.join("\r")}`)
        .addField("\u200B", `_sent to ${message.author.username}_`);

      await message.channel.send({
        embeds: [embed],
        components: [footerButtonRow]
      });
      return;
    }
    const name = args[0].toLowerCase();
    const command =
      commands.get(name) ||
      (commands.find((c) => c.aliases && c.aliases.includes(name)) as Command);

    if (!command) {
      await message.react("❓");
    }

    data.push(`**Name:** ${command.name}`);

    if (command.aliases)
      data.push(`**Aliases:** ${command.aliases.join(", ")}`);
    if (command.description)
      data.push(`**Description:** ${command.description}`);
    if (command.usage)
      data.push(`**Usage:** ${prefix}${command.name} ${command.usage}`);

    const embed = new Discord.MessageEmbed()
      .setColor("#0000ff")
      .setTitle(`👩‍🏫 ${command.name}`)
      .setDescription(data.join("\r"));

    await message.channel.send({
      embeds: [embed],
      components: [footerButtonRow]
    });
    return;
  }
};
