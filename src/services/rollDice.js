const Roll = require("roll");

const getIcon = (i, shouldHaveIcon, bestOrWorstOf) => {
  if (shouldHaveIcon) {
    if (i < bestOrWorstOf) {
      return "check";
    } else {
      return "x";
    }
  }
  return null;
};

const rollDice = (args, availableDice) => {
  try {
    let diceArray = [];
    let resultArray = [];

    for ([index, value] of args.entries()) {
      let groupArray = [];
      roll = new Roll();

      let parsedRoll;
      const valid = roll.validate(value);
      if (valid) {
        parsedRoll = roll.parse(value);
      }
      if (valid && availableDice.includes(parsedRoll.sides)) {
        const rolls = roll.roll(value);
        const type = rolls.input?.transformations[0][0][0];
        const bestOrWorstOf = rolls.input?.transformations[0][0][1];
        shouldHaveIcon = ["best-of", "worst-of"].includes(type);
        resultArray.push({ value, result: rolls.result });
        for (i = 0; i < parsedRoll.quantity; i++) {
          groupArray.push({
            sides: parsedRoll.sides,
            rolled: rolls.rolled[i],
            icon: getIcon(i, shouldHaveIcon, bestOrWorstOf)
          });
        }
        diceArray.push(groupArray);
      }
    }
    return { diceArray, resultArray };
  } catch (err) {
    console.error(err);
  }
};

module.exports = rollDice;
