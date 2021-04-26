const { getRandomNumber } = require("../helpers");

const sendDiceRolledMessage = (message, diceArray) => {
  const diceArrayLengths = diceArray.map((array) => array.length);
  const isSingleDie =
    diceArrayLengths.length === 1 && diceArray[0].length === 1;

  const pluralPick = (isSingleDie, singular, plural) =>
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
      "it",
      "one"
    )} spins on its axis for a few seconds after the others, as if possessed by an unknown force..._`,
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
    )} across the wood, you're almost sure you can spot a faint light from within ${pluralPick(
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
    getRandomNumber(20) === 1 ? messages[number - 1] : messages[0];

  try {
    message.channel.send(getText());
  } catch (err) {
    console.error(err);
  }
};

module.exports = sendDiceRolledMessage;
