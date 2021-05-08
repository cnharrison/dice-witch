import { DiceArray, Die } from "../src/types";

const getRandomNumber = (range: number) =>
  Math.floor(Math.random() * range) + 1;

const getTotalDiceRolled = (diceArray: DiceArray) =>
  diceArray.reduce((acc: number, element: Die[]) => acc + element.length, 0);

export { getRandomNumber, getTotalDiceRolled };
