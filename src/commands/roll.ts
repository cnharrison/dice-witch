import { Result, DiceArray, RollProps } from "../types";
import { availableDice, maxDice } from "../constants";
import {
  sendDiceResultMessageWithImage,
  sendHelperMessage,
  sendDiceRolledMessage,
  sendDiceOverMaxMessage,
  sendNeedPermissionMessage,
  sendDiceResultMessage,
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
  async execute({
    message,
    args,
    logOutputChannel,
    interaction,
    title,
    timesToRepeat,
  }: RollProps) {
    if (!args.length) {
      sendHelperMessage(
        message,
        module.exports.name,
        logOutputChannel,
        undefined,
        interaction
      );
      return;
    }
    if (!checkForAttachPermission(message, interaction)) {
      sendNeedPermissionMessage(message, logOutputChannel, interaction);
      return;
    }

    const {
      diceArray,
      resultArray,
      shouldHaveImage,
    }: {
      diceArray: DiceArray;
      resultArray: Result[];
      shouldHaveImage?: boolean;
    } = rollDice(args, availableDice, timesToRepeat);
    if (!diceArray.length) {
      sendHelperMessage(
        message,
        module.exports.name,
        logOutputChannel,
        undefined,
        interaction
      );
      return;
    }
    if (getTotalDiceRolled(diceArray) > maxDice) {
      sendDiceOverMaxMessage(message, logOutputChannel, args, interaction);
      return;
    }

    if (shouldHaveImage) {
      await sendDiceRolledMessage(message, diceArray, interaction);
      const attachment = await generateDiceAttachment(diceArray);
      await sendDiceResultMessageWithImage(
        resultArray,
        message,
        attachment,
        logOutputChannel,
        interaction,
        title
      );
      return;
    } else {
      sendDiceResultMessage(
        resultArray,
        message,
        logOutputChannel,
        interaction,
        title
      );
      return;
    }
  },
};
