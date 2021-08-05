import { logEvent } from "../services";
import { Message, TextChannel, Collection } from "discord.js";

const sendGetRollTitleMessage = async (
  message: Message,
  logOutputChannel: TextChannel
) => {
  let title;
  const originalMessage = message;

  const filter = () => message.author.id === originalMessage.author.id;

  await message.channel.send(`${message.author} what's this roll for?`);

  try {
    const collected = (await originalMessage.channel.awaitMessages({
      filter,
      max: 1,
      time: 30000
    })) as Collection<string, Message>;
    if (!collected) return;
    const firstCollected = collected.first();
    const content = firstCollected?.content;
    if (content && content.length > 256) {
      await message.channel.send(
        `that title's too long, ${message.author} -- roll cancelled`
      );
      logEvent({
        eventType: "rollTitleRejected",
        logOutputChannel,
        message,
        title
      });
      return;
    }
  } catch (err) {
    console.error(err);
    await message.channel.send(
      `didn't get a reaponse from ${message.author} -- roll cancelled 😢`
    );
    logEvent({ eventType: "rollTitleTimeout", logOutputChannel, message });
    return;
  }
  return title;
};

export default sendGetRollTitleMessage;
