import { Message, TextChannel } from "discord.js";
import { Command, Die, Result } from "../types";

const { availableDice, maxDice } = require("../constants/index.ts");
const {
  sendDiceResultMessage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage,
  sendNeedPermissionMessage,
} = require("../messages");
const {
  rollDice,
  generateDiceAttachment,
  checkForAttachPermission,
} = require("../services");
const { getTotalDiceRolled } = require("../helpers");

module.exports = {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage:
    "[dice notation], e.g. 1d20 2d12. Type `!roll` with no arguments for a detailed explanation",
  async execute(message: Message, args: string[], _: Command, logOutputChannel: TextChannel) {
    if (!args.length)
      return sendHelperMessage(message, module.exports.name, logOutputChannel);
    if (!checkForAttachPermission(message))
      return sendNeedPermissionMessage(message, logOutputChannel);

    const { diceArray, resultArray }: { diceArray: Die[][], resultArray: Result[] } = rollDice(args, availableDice);
    if (!diceArray.length) {
      return sendHelperMessage(message, module.exports.name, logOutputChannel);
    }
    if (getTotalDiceRolled(diceArray) > maxDice) {
      return sendDiceOverMaxMessage(message);
    }

    sendDiceRolledMessage(message, diceArray);
    const attachment = await generateDiceAttachment(diceArray);
    return sendDiceResultMessage(
      resultArray,
      message,
      attachment,
      undefined,
      undefined,
      logOutputChannel
    );
  },
};
