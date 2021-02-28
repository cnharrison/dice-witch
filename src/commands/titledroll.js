const { availableDice, maxDice } = require("../constants");
const {
  sendDiceResultMessage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage,
  getRollTitle,
  sendNeedPermissionMessage
} = require("../controllers");
const {
  rollDice,
  generateDiceAttachment,
  checkForAttachPermission
} = require("../services");

module.exports = {
  name: "titledroll",
  aliases: ["tr"],
  description: "Throw some dice with a displayed title",
  usage:
    "-- Works exactly like roll, but you'll be prompted for a title before performing the roll",
  async execute(message, args, _, logOutputChannel) {
    if (!args.length) return sendHelperMessage(message, module.exports.name);
    if (!checkForAttachPermission(message)) {
      return sendNeedPermissionMessage(message, logOutputChannel);
    }
    const { diceArray, resultArray } = rollDice(args, availableDice);
    if (!diceArray.length) {
      return sendHelperMessage(message, module.exports.name);
    } else if (diceArray.length > maxDice) {
      return sendDiceOverMaxMessage(message);
    }
    const title = await getRollTitle(message, logOutputChannel);
    if (title) {
      sendDiceRolledMessage(message, diceArray);
      const attachment = await generateDiceAttachment(diceArray);
      sendDiceResultMessage(
        resultArray,
        message,
        attachment,
        title,
        undefined,
        logOutputChannel
      );
    }
  }
};
