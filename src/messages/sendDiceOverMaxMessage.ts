const { maxDice } = require("../constants/index.ts");
import { Message } from "discord.js";

const sendDiceOverMaxMessage = (message: Message) =>
  message.channel.send(`${maxDice} dice max, sorry 😅`);

module.exports = sendDiceOverMaxMessage;
