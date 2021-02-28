const getRandomNumber = (range) => Math.floor(Math.random() * range) + 1;

const getAuthorDisplayName = async (msg) => {
  const member = await msg.guild.member(msg.author);
  return member ? member.nickname : msg.author.username;
};

module.exports = { getAuthorDisplayName, getRandomNumber };
