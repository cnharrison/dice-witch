const Roll = require("roll");

const rollDice = (args, availableDice) => {
  let diceArray = [];
  let resultArray = [];

  for ([index, value] of args.entries()) {
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
        diceArray.push({
          sides: parsedRoll.sides,
          rolled: rolls.rolled[i],
          icon: shouldHaveIcon && i < bestOrWorstOf ? "check" : null
        });
      }
    }
  }
  return { diceArray, resultArray };
};

module.exports = rollDice;
