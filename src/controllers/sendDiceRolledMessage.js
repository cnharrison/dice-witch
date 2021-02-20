const sendDiceRolledMessage = (message, diceArray) => {
  try {
    message.channel.send(
      `_...the ${diceArray.length === 1 ? "die" : "dice"} ${
        diceArray.length === 1 ? "clatters" : "clatter"
      } across the table..._`
    );
  } catch (err) {
    console.error(err);
  }
};

module.exports = sendDiceRolledMessage;
