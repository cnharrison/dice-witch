import { CommandInteraction, EmbedBuilder } from "discord.js";
import { panacheColor, footerButtonRow } from "../../core/constants";

const command = {
  name: "web",
  description: "Access Dice Witch's web interface",

  async execute({ interaction }: { interaction: CommandInteraction }) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(panacheColor)
        .setTitle("Dice Witch Web Interface")
        .setDescription("Control Dice Witch from the web: https://dicewit.ch/app")
        .setThumbnail("https://i.imgur.com/tBfG2pP.png");

      await interaction.followUp({
        embeds: [embed],
        components: [footerButtonRow],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error in web command:', error);
      if (!interaction.replied) {
        await interaction.reply({ 
          content: "Something went wrong when processing your command. Please try again.", 
          ephemeral: true 
        });
      }
    }
  },
};

export default command;