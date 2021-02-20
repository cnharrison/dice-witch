const { availableDice, maxDice } = require("../constants");
const {
  sendDiceResultMessage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage
} = require("../controllers");
const { rollDice, generateDiceAttachment } = require("../services");

module.exports = {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage:
    "[dice notation], e.g. 1d20 2d12. Type `!roll` with no arguments for a detailed explanation",
  async execute(message, args) {
    if (!args.length) return sendHelperMessage(message, module.exports.name);
    const { diceArray, resultArray } = rollDice(args, availableDice);
    if (!diceArray.length) {
      return sendHelperMessage(message, module.exports.name);
    } else if (diceArray.length > maxDice) {
      sendDiceOverMaxMessage(message);
      return;
    }
    sendDiceRolledMessage(message, diceArray);
    const attachment = await generateDiceAttachment(diceArray);
    sendDiceResultMessage(resultArray, message, attachment);
  }
};
