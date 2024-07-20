import { RollProps } from "../types";
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

    const { diceArray, resultArray, shouldHaveImage } = rollDice(args, availableDice, timesToRepeat);
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

    const handleOverMaxMessage = () => {
      sendDiceOverMaxMessage(
        message,
        logOutputChannel,
        discord,
        args,
        interaction,
        shouldHaveImage
      );
    };

    if (shouldHaveImage) {
      if (getTotalDiceRolled(diceArray) > maxImageDice) {
        handleOverMaxMessage();
        return;
      }
      await sendDiceRolledMessage(message, diceArray, interaction);
      const attachmentResult = await generateDiceAttachment(diceArray);
      if (!attachmentResult) {
        console.error("Failed to generate dice attachment");
        return;
      }
      const { attachment, canvas } = attachmentResult;
      await sendDiceResultMessageWithImage(
        resultArray,
        message,
        attachment,
        canvas,
        logOutputChannel,
        discord,
        interaction,
        title
      );
    } else {
      if (getTotalDiceRolled(diceArray) > maxTextDice || getHighestDiceSide(diceArray) > maxDiceSides) {
        handleOverMaxMessage();
        return;
      }
      sendDiceResultMessage(
        resultArray,
        message,
        logOutputChannel,
        interaction,
        title
      );
    }
  },
};