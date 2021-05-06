const { getRandomNumber } = require("../helpers");
import { Message } from "discord.js"
import { Die } from '../types';

const sendDiceRolledMessage = (message: Message, diceArray: Die[][]) => {
  const diceArrayLengths = diceArray.map((array) => array.length);
  const isSingleDie =
    diceArrayLengths.length === 1 && diceArray[0].length === 1;

  const pluralPick = (isSingleDie: boolean, singular: string, plural: string) =>
    isSingleDie ? singular : plural;

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
    )} across the wood, you think you can spot a faint light emanating from deep within ${pluralPick(
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
      "piroettes",
      "piroutte"
    )} across the table's ancient cracks..._`,
  ];

  const number = getRandomNumber(messages.length);

  const getText = () =>
    getRandomNumber(30) === 1 ? messages[number - 1] : messages[0];

  try {
    message.channel.send(getText());
  } catch (err) {
    console.error(err);
  }
};

module.exports = sendDiceRolledMessage;
