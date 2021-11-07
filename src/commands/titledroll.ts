import { DiceArray, Result, TitledRollProps } from "../types";
import {
  availableDice,
  maxDiceSides,
  maxImageDice,
  maxTextDice,
} from "../constants";
import {
  sendDiceResultMessageWithImage,
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
import { getHighestDiceSide, getTotalDiceRolled } from "../helpers";

module.exports = {
  name: "titledroll",
  aliases: ["tr"],
  description: "Throw some dice with a displayed title",
  usage:
    "-- Works exactly like roll, but you'll be prompted for a title before performing the roll",
  async execute({
    message,
    args,
    logOutputChannel,
    interaction,
  }: TitledRollProps) {
    let attachment;
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
      sendNeedPermissionMessage(message, logOutputChannel);
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
    } = rollDice(args, availableDice);

    if (!diceArray.length) {
      sendHelperMessage(message, module.exports.name, logOutputChannel);
      return;
    }

    const title = await sendGetRollTitleMessage(message, logOutputChannel);

    if (title) {
      if (shouldHaveImage) {
        if (getTotalDiceRolled(diceArray) > maxImageDice) {
          sendDiceOverMaxMessage(
            message,
            logOutputChannel,
            args,
            interaction,
            shouldHaveImage
          );
          return;
        }
        await sendDiceRolledMessage(message, diceArray, interaction);
        attachment = await generateDiceAttachment(diceArray);
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
        if (getTotalDiceRolled(diceArray) > maxTextDice) {
          sendDiceOverMaxMessage(
            message,
            logOutputChannel,
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
    }
  },
};
