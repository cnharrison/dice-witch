import { Die } from "../src/types"

const getRandomNumber = (range: number) => Math.floor(Math.random() * range) + 1;

const getTotalDiceRolled = (diceArray: Die[][]) =>
  diceArray.reduce((acc, element) => acc + element.length, 0);

export {
  getRandomNumber,
  getTotalDiceRolled,
};
