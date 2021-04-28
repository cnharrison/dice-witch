import { StandardDice } from "rpg-dice-roller/types/dice";
import { RollResult, RollResults } from "rpg-dice-roller/types/results";
import { Icon, Result, Die } from "../types";

const { DiceRoll, Parser } = require("rpg-dice-roller");

function generateIconArray(modifierSet: Set<string>): Icon[] | null {
  return modifierSet.size > 0
    ? [...modifierSet].map((item) => {
      switch (item) {
        case "drop":
          return "trashcan";
        case "explode":
          return "explosion";
        case "re-roll":
          return "recycle";
        case "max":
          return "chevronDown";
        case "min":
          return "chevronUp";
        case "target-success":
          return "bullseye";
        case "critical-success":
          return "crit";
        case "critical-failure":
          return "dizzyFace";
        case "penetrate":
          return "arrowThrough";
        default:
          return "blank";
      }
    })
    : null;
}

const getDPercentRolled = (rolled: number): number =>
  rolled === 100 ? 0 : Math.floor(rolled / 10) * 10;
const getD10PercentRolled = (rolled: number): number =>
  rolled % 10 === 0 ? 10 : rolled % 10;

const rollDice = (args: string[], availableDice: number[]) => {
  let diceArray: (Die | Die[])[] = [];
  let groupArray: Die[] = [];
  let result: Result = {};
  let resultArray: Result[] = [];
  let argsToMutate = args;

  try {
    argsToMutate.forEach((value: string, outerIndex: number) => {
      const isMultiRollToken = value.match(/^.*?(\<[^\d]*(\d+)[^\d]*\>).*/);
      if (isMultiRollToken) {
        const number = Number(isMultiRollToken[2]);
        argsToMutate = argsToMutate.filter((_, index) => index !== outerIndex);
        argsToMutate = new Array(number).fill(argsToMutate).flat();
      }
    });

    argsToMutate.forEach((value) => {
      let parsedRoll;

      try {
        parsedRoll = Parser.parse(value);
      } catch (err) {
        console.error(err);
      }

      const sidesArray = parsedRoll
        ? parsedRoll
          .filter((rollGroup: StandardDice) => typeof rollGroup !== "string")
          .filter((rollGroup: StandardDice) => typeof rollGroup !== "number")
          .map((roll: StandardDice) => roll.sides)
        : [];

      const isValid =
        parsedRoll &&
        sidesArray.every((sides: number) => availableDice.includes(sides));

      if (isValid) {
        const roll = new DiceRoll(value);
        result = {
          output: roll.output,
          results: roll.total,
        };
        groupArray = roll.rolls
          .filter((rollGroup: RollResults) => typeof rollGroup !== "string")
          .filter((rollGroup: RollResults) => typeof rollGroup !== "number")
          .map((rollGroup: RollResults, outerIndex: number) =>
            sidesArray[outerIndex] === 100
              ? rollGroup.rolls.reduce((acc: Die[], cur: RollResult) => {
                acc.push(
                  {
                    sides: "%",
                    rolled: getDPercentRolled(cur.initialValue),
                    icon: generateIconArray(cur.modifiers),
                  },
                  {
                    sides: 10,
                    rolled: getD10PercentRolled(cur.initialValue),
                    icon: generateIconArray(cur.modifiers),
                  }
                );
                return acc;
              }, [])
              : rollGroup.rolls.map((currentRoll: RollResult) => ({
                sides: sidesArray[outerIndex],
                rolled: currentRoll.initialValue,
                icon: generateIconArray(currentRoll.modifiers),
              }))
          );
        diceArray = [...diceArray, ...groupArray];
        resultArray = [...resultArray, result];
      }
    });
    return { diceArray, resultArray };
  } catch (err) {
    console.error(err);
    return null;
  }
};

module.exports = rollDice;
