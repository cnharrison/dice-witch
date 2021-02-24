const Discord = require("discord.js");

const sendNeedPermissionMessage = (message, logOutputChannel) => {
  message.channel.send(
    `doesn't look like i have permission to **attach files** in this channel. i need them to show you the dice 😅`
  );
  const embed = new Discord.MessageEmbed()
    .setColor("#FF0000")
    .setDescription(
      `**sent permissions request to ${message.channel} on ${message.guild}**`
    );
  logOutputChannel.send(embed).catch((err) => console.error(err));
};

module.exports = sendNeedPermissionMessage;
