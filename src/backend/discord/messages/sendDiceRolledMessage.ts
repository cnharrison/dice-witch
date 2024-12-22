import { getRandomNumber, pluralPick } from "../../shared/helpers";
import { ButtonInteraction, CommandInteraction, Message } from "discord.js";
import { Die } from "../../shared/types";

const sendDiceRolledMessage = async (
  diceArray: (Die | Die[])[],
  interaction?: CommandInteraction | ButtonInteraction
) => {
  const isSingleDie = diceArray.length === 1 && Array.isArray(diceArray[0]) && diceArray[0].length === 1;

  const messages = [
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(
      isSingleDie,
      "clatters",
      "clatter"
    )} across the table..._`,
    `_...as the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(
      isSingleDie,
      "tumbles",
      "tumble"
    )}, ${pluralPick(
      isSingleDie,
      "it",
      "one"
    )} continues to spin on its axis for a few seconds, as if possessed by an unknown force..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(
      isSingleDie,
      "bangs",
      "bang"
    )} angrily across the table..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(
      isSingleDie,
      "clatters",
      "clatter"
    )} crisply across the table..._`,
    `_...as the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(
      isSingleDie,
      "rolls",
      "roll"
    )} across the gnarly surface, you think you can spot a faint light emanating from deep within ${pluralPick(
      isSingleDie,
      "it..._",
      "one of them..._"
    )}`,
    `_...a sibilant wind suddenly hisses across the table as the restless ${pluralPick(
      isSingleDie,
      "die",
      "dice"
    )} ${pluralPick(isSingleDie, "settles", "settle")} onto its planks..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(
      isSingleDie,
      "bumps",
      "bump"
    )} proudly across the table's wizened grooves..._`,
    `_...the ${pluralPick(isSingleDie, "die", "dice")} ${pluralPick(
      isSingleDie,
      "dances",
      "dance"
    )} and ${pluralPick(
      isSingleDie,
      "pirouettes",
      "pirouette"
    )} across the table's ancient cracks..._`,
  ];

  const getText = () => {
    const number = getRandomNumber(messages.length);
    return getRandomNumber(20) === 1 ? messages[number - 1] : messages[0];
  };

  try {
    const text = getText();
    if (interaction) {
      await interaction.followUp(text);
    }
  } catch (err) {
    console.error("Error sending dice rolled message:", err);
  }
};

export default sendDiceRolledMessage;