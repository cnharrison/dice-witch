import { maxDice } from "../constants/index";
import { Message } from "discord.js";

const sendDiceOverMaxMessage = (message: Message) =>
  message.channel.send(`${maxDice} dice max, sorry 😅`);

export default sendDiceOverMaxMessage;
