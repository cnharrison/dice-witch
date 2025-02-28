import { EmbedBuilder } from "discord.js";
import { Command, HelpProps } from "../../shared/types";
import { footerButtonRow } from "../../core/constants/index";

const help: Command = {
  name: "help",
  description: "List commands",
  aliases: ["commands"],
  usage: "[command name]",
  async execute({ args = [], commands, interaction }: Partial<HelpProps>) {
    if (!commands) return;

    const data: string[] = [];

    const sendEmbed = async (title: string, description: string) => {
      const embed = new EmbedBuilder()
        .setColor("#0000ff")
        .setTitle(title)
        .setDescription(description);
      try {
        const response = { embeds: [embed], components: [footerButtonRow] };
        if (interaction) {
          await interaction.reply(response);
        }
      } catch (err) {
        console.error(err);
      }
    };

    if (!args.length) {
      data.push("**Available Commands:**");
      data.push("• **/roll** - Roll dice using standard notation");
      data.push("• **/status** - Check bot status");
      data.push("• **/knowledgebase** - View dice rolling help");
      data.push("• **/web** - Access the web interface");
      data.push("• **/prefs** - Set your preferences on the web");
      data.push("• **/help** - Show this help message");
      data.push(`\nUse /help [command name] for more info about a specific command`);
      await sendEmbed("Dice Witch Commands", data.join("\n"));
      return;
    }

    const name = args[0].toLowerCase();
    const command = commands.get(name) || commands.find((c) => c.aliases?.includes(name));

    if (!command) {
      if (interaction) {
        await interaction.reply({ content: "❓ Command not found", ephemeral: true });
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