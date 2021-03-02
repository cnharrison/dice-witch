const sendDiceRolledMessage = (message, diceArray) => {
  const diceArrayLengths = diceArray.map((array) => array.length);
  const isSingleDie =
    diceArrayLengths.length === 1 && diceArray[0].length === 1;

  try {
    message.channel.send(
      `_...the ${isSingleDie ? "die" : "dice"} ${
        isSingleDie ? "clatters" : "clatter"
      } across the table..._`
    );
  } catch (err) {
    console.error(err);
  }
};

module.exports = sendDiceRolledMessage;
