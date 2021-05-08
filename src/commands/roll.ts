import { Message, TextChannel } from "discord.js";
import { Command, Result, DiceArray } from "../types";
import { availableDice, maxDice } from "../constants/";
import {
  sendDiceResultMessage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage,
  sendNeedPermissionMessage,
} from "../messages";
import {
  rollDice,
  generateDiceAttachment,
  checkForAttachPermission,
} from "../services";
import { getTotalDiceRolled } from "../helpers";

export default {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage:
    "[dice notation], e.g. 1d20 2d12. Type `!roll` with no arguments for a detailed explanation",
  async execute(
    message: Message,
    args: string[],
    _: Command,
    logOutputChannel: TextChannel
  ) {
    if (!args.length)
      return sendHelperMessage(message, module.exports.name, logOutputChannel);
    if (!checkForAttachPermission(message))
      return sendNeedPermissionMessage(message, logOutputChannel);

    const {
      diceArray,
      resultArray,
    }: { diceArray: DiceArray; resultArray: Result[] } = rollDice(
      args,
      availableDice
    );
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
      logOutputChannel
    );
  },
};
