const { DiceRoll, Parser } = require('rpg-dice-roller');

const getIcon = (modifierSet) => {
  if (modifierSet.size > 0) {
    switch (true) {
      case modifierSet.has("drop"):
        return "x";
      case modifierSet.has("explode"):
        return "explosion";
    }
  }
  return null;
};

const rollDice = (args, availableDice) => {
  try {
    let parsedRoll;
    let roll;
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
        roll = new DiceRoll(value);
        resultArray.push({ output: roll.output, results: roll.total });
        for (i = 0; i < roll.rolls[0].length; i++) {
          groupArray.push({
            sides: parsedRoll[0].sides,
            rolled: roll.rolls[0].rolls[i].initialValue,
            icon: getIcon(roll.rolls[0].rolls[i].modifiers)
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