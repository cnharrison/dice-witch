import { Result, DiceArray, RollProps } from "../types";
import {
  availableDice,
  maxDiceSides,
  maxImageDice,
  maxTextDice,
} from "../constants";
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
import { getTotalDiceRolled, getHighestDiceSide } from "../helpers";

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
    discord,
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

    if (shouldHaveImage) {
      if (getTotalDiceRolled(diceArray) > maxImageDice) {
        sendDiceOverMaxMessage(
          message,
          logOutputChannel,
          discord,
          args,
          interaction,
          shouldHaveImage
        );
        return;
      }
      await sendDiceRolledMessage(message, diceArray, interaction);
      const { attachment, canvas } = await generateDiceAttachment(diceArray);
      await sendDiceResultMessageWithImage(
        resultArray,
        message,
        attachment,
        canvas,
        logOutputChannel,
        discord,
        interaction,
        title,
      );
      return;
    } else {
      if (getTotalDiceRolled(diceArray) > maxTextDice) {
        sendDiceOverMaxMessage(
          message,
          logOutputChannel,
          discord,
          args,
          interaction,
          shouldHaveImage
        );
        return;
      }
      if (getHighestDiceSide(diceArray) > maxDiceSides) {
        sendDiceOverMaxMessage(
          message,
          logOutputChannel,
          discord,
          args,
          interaction,
          shouldHaveImage
        );
        return;
      }
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
