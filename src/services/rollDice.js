const { DiceRoll, Parser } = require("rpg-dice-roller");
const { removeElement } = require("../helpers");

function generateIconArray(modifierSet) {
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
            return "chevronUp";
          case "min":
            return "chevronDown";
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

const rollDice = (args, availableDice) => {
  let diceArray = [];
  let groupArray = [];
  let result = {};
  let resultArray = [];
  let argsToMutate = args;

  try {
    argsToMutate.forEach((value, outerIndex) => {
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
            .filter((rollGroup) => typeof rollGroup !== "string")
            .filter((rollGroup) => typeof rollGroup !== "number")
            .map((roll) => roll.sides)
        : [];

      const isValid =
        parsedRoll &&
        sidesArray.every((sides) => availableDice.includes(sides));

      if (isValid) {
        const roll = new DiceRoll(value);
        result = {
          output: roll.output,
          results: roll.total,
        };
        groupArray = roll.rolls
          .filter((rollGroup) => typeof rollGroup !== "string")
          .filter((rollGroup) => typeof rollGroup !== "number")
          .map((rollGroup, outerIndex) =>
            rollGroup.rolls.map((currentRoll) => ({
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
