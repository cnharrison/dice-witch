import { sendLogEventMessage } from "../messages";
import { Message, TextChannel, Collection } from "discord.js";
import { EventType } from "../types";

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
      time: 30000,
    })) as Collection<string, Message>;
    if (!collected) return;
    const firstCollected = collected.first();
    const content = firstCollected?.content;
    if (content && content.length > 256) {
      await message.reply(
        `That title's too long, ${message.author} -- roll cancelled 😢`
      );
      sendLogEventMessage({
        eventType: EventType.ROLL_TITLE_REJECTED,
        logOutputChannel,
        message,
        title,
      });
      return;
    }
    title = firstCollected?.cleanContent;
    firstCollected?.react("👀");
    sendLogEventMessage({
      eventType: EventType.ROLL_TITLE_ACCEPTED,
      logOutputChannel,
      message,
      title,
    });
  } catch (err) {
    console.error(err);
    await message.reply(
      `didn't get a reaponse from ${message.author} -- roll cancelled 😢`
    );
    sendLogEventMessage({
      eventType: EventType.ROLL_TITLE_TIMEOUT,
      logOutputChannel,
      message,
    });
    return;
  }
  return title;
};

export default sendGetRollTitleMessage;
