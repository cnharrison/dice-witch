import Discord from "discord.js";
import { Command, HelpProps } from "../types";
import { prefix } from "../../config.json";
import { footerButtonRow } from "../constants";

module.exports = {
  name: "help",
  description: "List commands",
  aliases: ["commands"],
  usage: "[command name]",
  async execute({ message, args, commands }: HelpProps) {
    const data = [];

    const sendEmbed = async (title: string, description: string) => {
      const embed = new Discord.EmbedBuilder()
        .setColor("#0000ff")
        .setTitle(title)
        .setDescription(description);
      try {
        await message.reply({
          embeds: [embed],
          components: [footerButtonRow],
        });
      } catch (err) {
        console.error(err);
      }
    };

    if (!args.length) {
      data.push(commands.map((command) => command?.name).join("\r"));
      data.push(`\n\nMore: \n\`${prefix}help [command name]\``);
      await sendEmbed("Commands", data.join("\r"));
      return;
    }

    const name = args[0].toLowerCase();
    const command = commands.get(name) || commands.find((c) => c.aliases?.includes(name));

    if (!command) {
      await message.react("❓");
      return;
    }

    data.push(`**Name:** ${command.name}`);
    if (command.aliases) data.push(`**Aliases:** ${command.aliases.join(", ")}`);
    if (command.description) data.push(`**Description:** ${command.description}`);
    if (command.usage) data.push(`**Usage:** ${prefix}${command.name} ${command.usage}`);

    await sendEmbed(`👩‍🏫 ${command.name}`, data.join("\r"));
  },
};