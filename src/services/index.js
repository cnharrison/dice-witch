const generateDiceAttachment = require("./generateDiceAttachment");
const rollDice = require("./rollDice");
const generateDie = require("./generateDie/generateDie");
const generateIcon = require("./generateIcon");
const checkForAttachPermission = require("./checkForAttachPermission");

module.exports = {
  generateDiceAttachment,
  checkForAttachPermission,
  rollDice,
  generateDie,
  generateIcon
};
