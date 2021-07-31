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

module.exports = {
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
    if (!args.length) {
      sendHelperMessage(message, module.exports.name, logOutputChannel);
      return;
    }
    if (!checkForAttachPermission(message)) {
      sendNeedPermissionMessage(message, logOutputChannel);
      return;
    }

    const {
      diceArray,
      resultArray,
    }: { diceArray: DiceArray; resultArray: Result[] } = rollDice(
      args,
      availableDice
    );

    if (!diceArray.length) {
      sendHelperMessage(message, module.exports.name, logOutputChannel);
      return;
    }
    if (getTotalDiceRolled(diceArray) > maxDice) {
      sendDiceOverMaxMessage(message, logOutputChannel, args);
      return;
    }

    const title = await sendGetRollTitleMessage(message, logOutputChannel);

    if (title) {
      sendDiceRolledMessage(message, diceArray);
      const attachment = await generateDiceAttachment(diceArray);
      sendDiceResultMessage(
        resultArray,
        message,
        attachment,
        title,
        logOutputChannel
      );
      return;
    }
  },
};
