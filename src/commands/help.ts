import Discord from "discord.js";
import { Command, HelpProps } from "../types";
import { prefix } from "../../config.json";
import { deprecationWarning, footerButtonRow } from "../constants";

module.exports = {
  name: "help",
  description: "List commands",
  aliases: ["commands"],
  usage: "[command name]",
  async execute({ message, args, commands }: HelpProps) {
    const data = [];
    if (!args.length) {
      data.push(commands.map((command) => command?.name).join("\r"));
      data.push(`\n\n\More: \n\`${prefix}help [command name]\``);

      const embed = new Discord.EmbedBuilder()
        .setColor("#0000ff")
        .setTitle("Commands")
        .setDescription(`${deprecationWarning}\n\n${data.join("\r")}`);
      try {
        await message.reply({
          embeds: [embed],
          components: [footerButtonRow],
        });
      } catch (err) {
        console.error(err);
      }
      return;
    }
    const name = args[0].toLowerCase();
    const command =
      commands.get(name) ||
      (commands.find((c) => c.aliases && c.aliases.includes(name)) as Command);

    if (!command) {
      await message.react("❓");
    }

    data.push(`**Name:** ${command?.name}`);

    if (command?.aliases)
      data.push(`**Aliases:** ${command?.aliases.join(", ")}`);
    if (command?.description)
      data.push(`**Description:** ${command?.description}`);
    if (command?.usage)
      data.push(`**Usage:** ${prefix}${command?.name} ${command?.usage}`);

    const embed = new Discord.EmbedBuilder()
      .setColor("#0000ff")
      .setTitle(`👩‍🏫 ${command?.name}`)
      .setDescription(data.join("\r"));
    try {
      await message.channel.send({
        embeds: [embed],
        components: [footerButtonRow],
      });
    } catch (err) {
      console.error(err);
    }
    return;
  },
};
