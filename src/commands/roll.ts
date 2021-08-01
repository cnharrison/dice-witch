import { CommandInteraction, Message, TextChannel } from "discord.js";
import { Result, DiceArray } from "../types";
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

module.exports = {
  name: "roll",
  aliases: ["r"],
  description: "Throw some dice",
  usage:
    "[dice notation], e.g. 1d20 2d12. Type `!roll` with no arguments for a detailed explanation",
  async execute(
    message: Message,
    args: string[],
    _: any,
    logOutputChannel: TextChannel,
    __: any,
    interaction?: CommandInteraction
  ) {
    if (!args.length) {
      sendHelperMessage(message, module.exports.name, logOutputChannel, undefined, interaction);
      return;
    }
    if (!checkForAttachPermission(message)) {
      sendNeedPermissionMessage(message, logOutputChannel, interaction);
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
      sendHelperMessage(message, module.exports.name, logOutputChannel, undefined, interaction);
      return
    }
    if (getTotalDiceRolled(diceArray) > maxDice) {
      sendDiceOverMaxMessage(message, logOutputChannel, args, interaction);
      return;
    }

    sendDiceRolledMessage(message, diceArray, interaction);
    const attachment = await generateDiceAttachment(diceArray);
    sendDiceResultMessage(
      resultArray,
      message,
      attachment,
      undefined,
      logOutputChannel
    );
    return;
  },
};
