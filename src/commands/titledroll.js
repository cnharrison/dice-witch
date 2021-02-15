const { availableDice } = require("../constants");
const { rollDice, generateDiceAttachment } = require("../services");
const {
  getRollTitle,
  sendHelperMessage,
  sendDiceMessage
} = require("../controllers");

module.exports = {
  name: "titledroll",
  aliases: ["tr"],
  description: "Throw some dice with a displayed title",
  usage:
    "Works exactly like roll, but you'll be prompted for a title before performing the roll",
  async execute(message, args, _, logOutputChannel) {
    if (!args.length) return sendHelperMessage(message, module.exports.name);
    const title = await getRollTitle(message, logOutputChannel);
    if (title) {
      const { diceArray, resultArray } = rollDice(args, availableDice);
      const attachment = await generateDiceAttachment(diceArray);
      sendDiceMessage(diceArray, resultArray, message, attachment, title);
    }
  }
};
