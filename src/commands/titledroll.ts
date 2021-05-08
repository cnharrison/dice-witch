import { Message, TextChannel } from "discord.js";
import { Command, DiceArray, Result } from "../types";
import { availableDice, maxDice } from "../constants";
import {
  sendDiceResultMessage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage,
  sendGetRollTitleMessage,
  sendNeedPermissionMessage,
} from "../messages";
import {
  rollDice,
  generateDiceAttachment,
  checkForAttachPermission,
} from "../services";
import { getTotalDiceRolled } from "../helpers";

export default {
  name: "titledroll",
  aliases: ["tr"],
  description: "Throw some dice with a displayed title",
  usage:
    "-- Works exactly like roll, but you'll be prompted for a title before performing the roll",
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

    const title = await sendGetRollTitleMessage(message, logOutputChannel);

    if (title) {
      sendDiceRolledMessage(message, diceArray);
      const attachment = await generateDiceAttachment(diceArray);
      return sendDiceResultMessage(
        resultArray,
        message,
        attachment,
        title,
        logOutputChannel
      );
    }
  },
};