const { maxDice } = require("../constants");
const sendDiceOverMaxMessage = (message) =>
  message.channel.send(`${maxDice} dice max, sorry 😅`);

module.exports = sendDiceOverMaxMessage;
