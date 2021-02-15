const Discord = require("discord.js");

const getRollTitle = async (message, logOutputChannel) => {
  let title;
  const originalMessage = message;

  const filter = (message) => {
    return message.author.id === originalMessage.author.id;
  };

  await message.channel.send(`${message.author} what's this roll for?`);

  try {
    const collected = await originalMessage.channel.awaitMessages(filter, {
      max: 1,
      time: 30000
    });
    if (!collected) return;
    if (collected.first().content.length > 256) {
      message.channel.send(
        `that title's too long, ${message.author} -- roll cancelled`
      );
      const embed = new Discord.MessageEmbed()
        .setColor("#FF0000")
        .setDescription(
          message.guild?.id
            ? `**roll title rejected**: **${message.author.username}** was rejectded for being too long in **${message.channel.name}** on **${message.guild}**`
            : `**roll title rejected**: **${message.author.username}** was rejectded for being too long in **DM**`
        );
      logOutputChannel.send(embed);
      return;
    }
    title = collected.first().cleanContent;
    collected.first().react("✅");
    const embed = new Discord.MessageEmbed()
      .setColor("#99999")
      .setDescription(
        message.guild?.id
          ? `accepted roll title: **${title}** from **${message.author.username}** in channel **${message.channel.name}** on **${message.guild}**`
          : `accepted roll title: **${title}** from **${message.author.username}** in **DM**`
      );
    logOutputChannel.send(embed);
  } catch (err) {
    console.error(err);
    message.channel.send(
      `didn't get a reaponse from ${message.author} -- roll cancelled 😢`
    );
    const embed = new Discord.MessageEmbed()
      .setColor("#FF0000")
      .setDescription(
        message.guild?.id
          ? `**roll title timeout**: **${message.author.username}** ran out of time to title their roll in channel **${message.channel.name}** on **${message.guild}**`
          : `**roll title timeout**: **${message.author.username}** ran out of time to title their roll in **DM**`
      );
    logOutputChannel.send(embed);
  }

  return title;
};

module.exports = getRollTitle;
