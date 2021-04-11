const { DiceRoll, Parser } = require("rpg-dice-roller");

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
          default:
            return "";
        }
      })
    : null;
}

const rollDice = (args, availableDice) => {
  try {
    let parsedRoll;
    let diceArray = [];
    let groupArray = [];
    let result = {};
    let resultArray = [];

    args.forEach((value) => {
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

      if (
        parsedRoll &&
        sidesArray.every((sides) => availableDice.includes(sides))
      ) {
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
      }
      diceArray = [...diceArray, ...groupArray];
      resultArray = [...resultArray, result];
    });
    return { diceArray, resultArray };
  } catch (err) {
    console.error(err);
    return null;
  }
};

module.exports = rollDice;
