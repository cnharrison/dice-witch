const Discord = require("discord.js");

module.exports = {
  name: "status",
  description: "Get ping and server info",
  cooldown: 10,
  execute(message, args, discord) {
    const embed = new Discord.MessageEmbed()
      .setColor("#99999")
      .setTitle("Status")
      .setDescription(
        `**Latency**: ${Date.now() - message.createdTimestamp}ms\n I'm in **${
          discord.guilds.cache.size
        }** discord servers 😈`
      );

    return message.channel.send(embed);
  }
};
