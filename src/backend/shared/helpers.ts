import { Guild } from "discord.js";
import { DiceArray, Die } from "../shared/types";

const getRandomNumber = (range: number) =>
  Math.floor(Math.random() * range) + 1;

const getTotalDiceRolled = (diceArray: DiceArray) =>
  diceArray.reduce((acc: number, element: Die[]) => acc + element.length, 0);

const getHighestDiceSide = (diceArray: DiceArray): number => {
  const sidesArray: number[] = diceArray.flat().map((die: Die) => Number(die.sides));
  return sidesArray.reduce((a: number, b: number) => Math.max(a, b), 0);
};

const makeBold = (string?: string | null | Guild) =>
  string ? `**${string}**` : undefined;

const makeItalic = (string?: string | null | Guild) =>
  string ? `_${string}_` : undefined;

const pluralPick = (isSingleDie: boolean, singular: string, plural: string) =>
  isSingleDie ? singular : plural;

const coinFlip = () => getRandomNumber(2) > 1;

export {
  getRandomNumber,
  getTotalDiceRolled,
  getHighestDiceSide,
  makeBold,
  makeItalic,
  pluralPick,
  coinFlip,
};