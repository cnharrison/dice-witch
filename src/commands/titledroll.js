const { availableDice, maxDice } = require("../constants");
const {
  sendDiceResultMessage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage,
  sendGetRollTitleMessage,
  sendNeedPermissionMessage,
} = require("../messages");
const {
  rollDice,
  generateDiceAttachment,
  checkForAttachPermission,
} = require("../services");

const { getTotalDiceRolled } = require("../helpers");

module.exports = {
  name: "titledroll",
  aliases: ["tr"],
  description: "Throw some dice with a displayed title",
  usage:
    "-- Works exactly like roll, but you'll be prompted for a title before performing the roll",
  async execute(message, args, _, logOutputChannel) {
    if (!args.length)
      return sendHelperMessage(message, module.exports.name, logOutputChannel);
    if (!checkForAttachPermission(message))
      return sendNeedPermissionMessage(message, logOutputChannel);

    const { diceArray, resultArray } = rollDice(args, availableDice);

    if (!diceArray.length) {
      return sendHelperMessage(message, module.exports.name, logOutputChannel);
    }
    if (getTotalDiceRolled(diceArray) > maxDice) {
      return sendDiceOverMaxMessage(message);
    }

    const title = await sendGetRollTitleMessage(message, logOutputChannel);

    if (title) {
      sendDiceRolledMessage(message, diceArray);
      const attachment = await generateDiceAttachment(diceArray);
      return sendDiceResultMessage(
        resultArray,
        message,
        attachment,
        title,
        undefined,
        logOutputChannel
      );
    }
    return null;
  },
};
