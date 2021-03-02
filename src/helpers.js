const getRandomNumber = (range) => Math.floor(Math.random() * range) + 1;

const getTotalDiceRolled = (diceArray) =>
  diceArray.reduce((acc, element) => acc + element.length, 0);

module.exports = { getRandomNumber, getTotalDiceRolled };
