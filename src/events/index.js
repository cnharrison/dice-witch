const Discord = require("discord.js");

module.exports = function (discord, logOutputChannel) {
  discord.on("guildCreate", (guild) => {
    const embed = new Discord.MessageEmbed()
      .setColor("#00FF00")
      .setDescription(`**added** to server: **${guild.name}**`);
    logOutputChannel.send(embed).catch((err) => console.error(err));
  });

  discord.on("guildDelete", (guild) => {
    const embed = new Discord.MessageEmbed()
      .setColor("#FF0000")
      .setDescription(`**removed** from server: **${guild.name}**`);
    logOutputChannel.send(embed).catch((err) => console.error(err));
  });
};
