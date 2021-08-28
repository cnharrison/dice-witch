import {
    Message,
    TextChannel,
    CommandInteraction,
    ButtonInteraction
} from "discord.js";
import { EventType, Result } from "../types";
import sendLogEventMessage from "./sendLogEventMessage";

const sendDiceResultMessage = async (
    resultArray: Result[],
    message: Message,
    logOutputChannel: TextChannel,
    interaction?: CommandInteraction | ButtonInteraction,
    title?: string
) => {
    const grandTotal = resultArray.reduce(
        (prev: number, cur: Result) => prev + cur.results,
        0
    );
    const makeBold = (title: string) => `**${title}**`;
    const reply = `<@${interaction ? interaction.user.id : message.author.id
        }> 🎲 ${title ? makeBold(title) : ""}\n${resultArray
            .map((result) => result.output)
            .join("\n")} ${resultArray.length > 1 ? `\ngrand total = \`${grandTotal}\`` : ""
        }`;

    try {
        interaction
            ? await interaction.followUp(reply)
            : await message.reply(reply);
        sendLogEventMessage({
            eventType: EventType.SENT_ROLL_RESULT_MESSAGE,
            logOutputChannel,
            message
        });
    } catch (err) {
        console.error(err);
        throw new Error(err);
    }
};

export default sendDiceResultMessage;
