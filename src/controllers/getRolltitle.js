const getRollTitle = async (message) => {
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
      return;
    }
    title = collected.first().cleanContent;
    collected.first().react("✅");
  } catch (err) {
    console.error(err);
    message.channel.send(
      `didn't get a reaponse from ${message.author} -- roll cancelled`
    );
  }

  return title;
};

module.exports = getRollTitle;
