import { DiceArray } from "../../../../shared/types";
import { pluralPick, getRandomNumber } from "../../../../shared/helpers";
import { DiceService } from "..";

export function generateDiceRolledMessage(
  this: DiceService,
  diceArray: DiceArray, 
  resultArray: number[]
): string {
  const isSingleDie = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0].length === 1;

  const messages = [
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "clatters", "clatter")} across the table..._`,
    `_...as the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "tumbles", "tumble")}, ${pluralPick(isSingleDie, "it", "one")} continues to spin on its axis for a few seconds, as if possessed by an unknown force..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "bangs", "bang")} angrily across the table..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "clatters", "clatter")} crisply across the table..._`,
    `_...as the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "rolls", "roll")} across the gnarly surface, you think you can spot a faint light emanating from deep within ${pluralPick(isSingleDie, "it..._", "one of them..._")}`,
    `_...a sibilant wind suddenly hisses across the table as the restless ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "settles", "settle")} onto its planks..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "bumps", "bump")} proudly across the table's wizened grooves..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "dances", "dance")} and ${pluralPick(isSingleDie, "pirouettes", "pirouette")} across the table's ancient cracks..._`,
  ];

  const calculatePercentile = (total: number, min: number, max: number) => {
    return ((Number(total) - Number(min)) / (Number(max) - Number(min))) * 100;
  };

  const total = resultArray.reduce((sum, value) => sum + value, 0);

  const maxTotal = diceArray.reduce((sum, dieArray: any) => {
    if (Array.isArray(dieArray)) {
      return sum + dieArray.reduce((innerSum, die) => innerSum + (Number(die.sides) || 0), 0);
    } else {
      return sum + (Number(dieArray.sides) || 0);
    }
  }, 0);

  const minTotal = diceArray.reduce((sum, dieArray) => {
    if (Array.isArray(dieArray)) {
      return sum + dieArray.reduce((innerSum) => innerSum + 1, 0);
    } else {
      return sum + 1;
    }
  }, 0);

  const percentile = calculatePercentile(total, minTotal, maxTotal);

  const isSingleD4 = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0][0].sides === 4;
  const isSingleD6 = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0][0].sides === 6;

  if ((isSingleD4 && (total === 1 || total === 4)) || (isSingleD6 && total === 6)) {
    const index = getRandomNumber(messages.length - 1);
    return messages[index];
  } else if (!isSingleD4 && !isSingleD6 && (percentile >= 95 || total === maxTotal || percentile <= 15)) {
    const index = getRandomNumber(messages.length - 1);
    return messages[index];
  }
  return messages[0];
}