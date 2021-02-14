const rollDice = () => {
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
      resultArray.push({ value, result: rolls.result });
      for (i = 0; i < parsedRoll.quantity; i++) {
        diceArray.push({ sides: parsedRoll.sides, rolled: rolls.rolled[i] });
      }
    }
  }
  return { diceArray, resultArray };
};
