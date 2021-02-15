const { availableDice } = require("../constants");
const { sendDiceMessage, sendHelperMessage } = require("../controllers");
const { rollDice, generateDiceAttachment } = require("../services");

module.exports = {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage:
    "[dice notation], e.g. 1d20 2d12. Type `!roll` with no arguments for a detailed explanation",
  async execute(message, args) {
    if (!args.length) sendHelperMessage(message, module.exports.name);
    const { diceArray, resultArray } = rollDice(args, availableDice);
    const attachment = await generateDiceAttachment(diceArray);
    sendDiceMessage(diceArray, resultArray, message, attachment);
  }
};
