const getRandomNumber = (range) => Math.floor(Math.random() * range) + 1;

const getTotalDiceRolled = (diceArray) =>
  diceArray.reduce((acc, element) => acc + element.length, 0);

const checkIfMultiDimensional = (array) => !!array.filter(Array.isArray).length;

module.exports = {
  getRandomNumber,
  getTotalDiceRolled,
  checkIfMultiDimensional
};
