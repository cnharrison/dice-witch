const Discord = require("discord.js");
const { inviteLink, supportServerLink } = require("../../config.json");
const { getAuthorDisplayName } = require("../helpers");

module.exports = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  async execute(message, _, discord) {
    const displayName = await getAuthorDisplayName(message);
    const embed = new Discord.MessageEmbed()
      .setColor("#99999")
      .setTitle("Status")
      .setDescription(
        `**Latency**: ${Date.now() - message.createdTimestamp}ms\n I'm in **${
          discord.guilds.cache.size
        }** discord servers 😈`
      )
      .addField(
        "\u200B",
        `_Sent to ${displayName}_ | [Invite me](${inviteLink}) | [Support server](${supportServerLink})`
      );

    return message.channel.send(embed);
  }
};
