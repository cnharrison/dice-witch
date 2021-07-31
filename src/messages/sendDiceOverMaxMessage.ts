import { maxDice } from "../constants/index";
import { Message, TextChannel } from "discord.js";
import { logEvent } from "../services";

const sendDiceOverMaxMessage = (message: Message, logOutputChannel: TextChannel, args?: string[]) => {
  message.channel.send(`${maxDice} dice max, sorry 😅`);
  logEvent(
    "sentDiceOverMaxMessage",
    logOutputChannel,
    message,
    undefined,
    args
  );
  return;
}

export default sendDiceOverMaxMessage;
