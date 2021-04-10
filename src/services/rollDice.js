const { DiceRoll, Parser } = require("rpg-dice-roller");

function generateIconArray(modifierSet) {
  return modifierSet.size > 0
    ? [...modifierSet].map((item) => {
        switch (item) {
          case "drop":
            return "trashcan";
          case "explode":
            return "explosion";
          case "Re-roll":
            return "recycle";
          case "max":
            return "plus";
          case "min":
            return "minus";
          case "target-success":
            return "bullseye";
          case "critical-success":
            return "star";
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

      if (parsedRoll && availableDice.includes(parsedRoll[0].sides)) {
        const roll = new DiceRoll(value);
        result = {
          output: roll.output,
          results: roll.total,
        };
        groupArray = roll.rolls
          .filter((rollGroup) => typeof rollGroup !== "string")
          .map((rollGroup, outerIndex) =>
            rollGroup.rolls.map((currentRoll) => ({
              sides: parsedRoll[outerIndex].sides,
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
