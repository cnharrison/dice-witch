import { Guild } from "discord.js";
import { DiceArray, Die } from "../src/types";

const getRandomNumber = (range: number) =>
  Math.floor(Math.random() * range) + 1;

const getTotalDiceRolled = (diceArray: DiceArray) =>
  diceArray.reduce((acc: number, element: Die[]) => acc + element.length, 0);

const makeBold = (string?: string | null | Guild) =>
  string ? `**${string}**` : undefined;

const makeItalic = (string?: string | null | Guild) =>
  string ? `_${string}_` : undefined;

const pluralPick = (isSingleDie: boolean, singular: string, plural: string) =>
  isSingleDie ? singular : plural;

const shuffle = (array: any[]) => {
  let currentIndex = array.length;
  let randomIndex;

  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
};

export {
  getRandomNumber,
  getTotalDiceRolled,
  makeBold,
  makeItalic,
  pluralPick,
  shuffle,
};
