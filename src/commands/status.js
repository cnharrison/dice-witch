const Discord = require("discord.js");

module.exports = {
  name: "status",
  description: "Get ping and server info",
  aliases: ["ping"],
  cooldown: 10,
  execute(message, args, discord) {
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
        `_Sent to ${message.author.username}_ | [Invite me](https://discord.com/api/oauth2/authorize?client_id=808161585876697108&permissions=0&scope=bot) | [Support server](https://discord.gg/BdyQG7hZZn)`
      );

    return message.channel.send(embed);
  }
};
