import Discord from "discord.js";
import { Command, HelpProps } from "../../shared/types";
import { footerButtonRow } from "../constants";

const help: Command = {
  name: "help",
  description: "List commands",
  aliases: ["commands"],
  usage: "[command name]",
  async execute({ message, args = [], commands, interaction }: Partial<HelpProps>) {
    if (!commands) return;

    const data: string[] = [];

    const sendEmbed = async (title: string, description: string) => {
      const embed = new Discord.EmbedBuilder()
        .setColor("#0000ff")
        .setTitle(title)
        .setDescription(description);
      try {
        const response = { embeds: [embed], components: [footerButtonRow] };
        if (interaction) {
          await interaction.reply(response);
        } else if (message) {
          await message.reply(response);
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (!args.length) {
      data.push(Array.from(commands.values()).map(command => command.name).join("\r"));
      data.push(`\n\nUse /help [command name] for more info about a specific command`);
      await sendEmbed("Commands", data.join("\r"));
      return;
    }

    const name = args[0].toLowerCase();
    const command = commands.get(name) || commands.find((c) => c.aliases?.includes(name));

    if (!command) {
      if (interaction) {
        await interaction.reply({ content: "❓ Command not found", ephemeral: true });
      } else if (message) {
        await message.react("❓");
      }
      return;
    }

    data.push(`**Name:** ${command.name}`);
    if (command.aliases) data.push(`**Aliases:** ${command.aliases.join(", ")}`);
    if (command.description) data.push(`**Description:** ${command.description}`);
    if (command.usage) data.push(`**Usage:** /${command.name} ${command.usage}`);

    await sendEmbed(command.name, data.join("\n"));
  },
};

export default help;