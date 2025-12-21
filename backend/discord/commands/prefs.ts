import { EmbedBuilder } from "discord.js";
import { panacheColor, footerButtonRow } from "../../core/constants";
import { CommandProps } from "../../shared/types";

const command = {
  name: "prefs",
  description: "Set your preferences on the web",

  async execute({ interaction }: CommandProps) {
    if (!interaction) {
      return;
    }
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(panacheColor)
        .setTitle("Dice Witch Preferences")
        .setDescription("Set user preferences and control Dice Witch from the web: https://dicewit.ch/app")
        .setThumbnail("https://i.imgur.com/tBfG2pP.png");

      await interaction.followUp({
        embeds: [embed],
        components: [footerButtonRow],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error in prefs command:', error);
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
