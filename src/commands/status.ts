import Discord from "discord.js";
import { footerButtonRow } from "../constants";
import { getUserCount } from "../services";
import { StatusProps } from "../types";

module.exports = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute({ message, discord, interaction }: StatusProps) {
    const now = Date.now();
    const { totalGuilds, totalMembers } =
      (await getUserCount({ discord })) ?? {};
    const embed = new Discord.EmbedBuilder()
      .setColor([153, 153, 153])
      .setTitle("Status")
      .setDescription(
        `Latency: **${
          interaction
            ? now - interaction.createdTimestamp
            : now - message.createdTimestamp
        }ms**\n I'm in **${totalGuilds}** discord servers with **${totalMembers}** users 😈`
      );
    try {
      interaction
        ? await interaction.reply({
            embeds: [embed],
            components: [footerButtonRow],
          })
        : await message.reply({
            embeds: [embed],
            components: [footerButtonRow],
          });
    } catch (err) {
      console.error(err);
    }
    return;
  },
};
