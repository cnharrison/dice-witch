const { DiceRoll, Parser } = require('rpg-dice-roller');

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
        resultArray.push({ value: parsedRoll[0].notation, result: roll.rolls[0].value });
        for (i = 0; i < parsedRoll[0].qty; i++) {
          groupArray.push({
            sides: parsedRoll[0].sides,
            rolled: roll.rolls[0].rolls[i],
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