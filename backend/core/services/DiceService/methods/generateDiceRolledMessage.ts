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
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "skitters", "skitter")} across the table, then ${pluralPick(isSingleDie, "settles", "settle")} with a faint, satisfied tap..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "tumbles", "tumble")} in a tight spiral, as if tracing a tiny glyph in the air..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(isSingleDie, "hops", "hop")} once, twice, and ${pluralPick(isSingleDie, "comes", "come")} to rest where ${pluralPick(isSingleDie, "it was", "they were")} always headed..._`,
  ];

  const calculatePercentile = (total: number, min: number, max: number) => {
    return ((Number(total) - Number(min)) / (Number(max) - Number(min))) * 100;
  };

  // d100s are represented as two visual dice (d% + d10) but count as one logical die
  const flatDice = diceArray.flat();
  let total = 0;
  let maxTotal = 0;
  let minTotal = 0;
  let i = 0;

  while (i < flatDice.length) {
    const die = flatDice[i];
    if (die.sides === "%") {
      const percentValue = resultArray[i] || 0;
      const onesValue = resultArray[i + 1] || 0;
      total += (percentValue === 0 && onesValue === 10) ? 100 : percentValue + onesValue;
      maxTotal += 100;
      minTotal += 1;
      i += 2;
    } else {
      total += resultArray[i] || 0;
      maxTotal += Number(die.sides) || 0;
      minTotal += 1;
      i++;
    }
  }

  if (maxTotal <= minTotal) {
    return messages[0];
  }

  const percentile = calculatePercentile(total, minTotal, maxTotal);

  const isSingleD4 = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0][0].sides === 4;
  const isSingleD6 = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0][0].sides === 6;

  if ((isSingleD4 && total === 4) || (isSingleD6 && total === 6)) {
    const index = getRandomNumber(messages.length - 1);
    return messages[index];
  } else if (percentile >= 99 || total === maxTotal || percentile <= 5) {
    const index = getRandomNumber(messages.length - 1);
    return messages[index];
  }
  return messages[0];
}
