import { KnowledgeBaseProps } from "../../shared/types";
import { footerButtonRow, infoColor } from "../constants";
import { EmbedBuilder } from "discord.js";

const knowledgebase = {
  name: "knowledgebase",
  description: "Get help with dice rolling syntax",
  aliases: ["kb", "help"],
  usage: "[topic]",
  async execute({ interaction, message, args }: KnowledgeBaseProps) {
    try {
      if (interaction && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      const embed = new EmbedBuilder()
        .setColor(infoColor)
        .setTitle("Dice Rolling Knowledge Base")
        .setDescription(`
          **Basic Dice Rolling:**
          • Roll a single die: \`/roll 1d20\`
          • Roll multiple dice: \`/roll 2d6\`
          • Roll with a title: \`/roll 1d20 title:Attack Roll\`

          **Advanced Usage:**
          • Multiple dice types: \`/roll 1d20 2d6\`
          • Repeat rolls: \`/roll 2d20 timestorepeat:3\`

          **Available Dice:**
          • d4, d6, d8, d10, d12, d20, d100
        `);

      const response = {
        embeds: [embed],
        components: [footerButtonRow]
      };

      if (interaction) {
        await interaction.followUp(response);
      } else if (message) {
        await message.reply(response);
      }

    } catch (error) {
      console.error('Error in knowledgebase command:', error);
      const errorResponse = { content: 'There was an error showing the knowledge base!' };

      if (interaction) {
        if (!interaction.replied) {
          await interaction.reply(errorResponse);
        } else {
          await interaction.followUp(errorResponse);
        }
      } else if (message) {
        await message.reply(errorResponse);
      }
    }
  },
};

export default knowledgebase;
