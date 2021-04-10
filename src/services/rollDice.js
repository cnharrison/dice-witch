const { DiceRoll, Parser } = require('rpg-dice-roller');

const generateIconArray = (modifierSet) => {
  return modifierSet.size > 0 ? [...modifierSet].map(item => {
    switch (item) {
      case "drop":
        return "trashcan";
      case "explode":
        return "explosion";
      case "Re-roll":
        return "recycle"
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
    }
  }) : null;

};

const rollDice = (args, availableDice) => {
  try {
    let parsedRoll;
    let diceArray = [];
    let resultArray = [];

    for (const value of args) {
      let groupArray = [];
      try {
        parsedRoll = Parser.parse(value);
      } catch (err) {
        console.error(err);
      }

      if (parsedRoll && availableDice.includes(parsedRoll[0].sides)) {
        const roll = new DiceRoll(value);
        resultArray.push({ output: roll.output, results: roll.total });
        for (i = 0; i < roll.rolls[0].length; i++) {
          groupArray.push({
            sides: parsedRoll[0].sides,
            rolled: roll.rolls[0].rolls[i].initialValue,
            icon: generateIconArray(roll.rolls[0].rolls[i].modifiers)
          })
        }
        diceArray.push(groupArray);
      }
    }
    return { diceArray, resultArray };
  } catch (err) {
    console.error(err);
  }

}

module.exports = rollDice;