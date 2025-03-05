import { AttachmentBuilder, ButtonInteraction, CommandInteraction, EmbedBuilder } from "discord.js";
import { Result } from "../../../../shared/types";
import { DiceService } from "..";
import { tabletopColor } from "../../../constants";

export function createEmbed(
  this: DiceService,
  resultArray: Result[],
  grandTotal: number,
  attachment: AttachmentBuilder | null | undefined,
  title?: string,
  interaction?: CommandInteraction | ButtonInteraction,
  source?: string,
  username?: string
): EmbedBuilder {
  const diceOutput = `${resultArray.map((result) => result.output).join("\n")} ${resultArray.length > 1 ? `\ngrand total = ${grandTotal}` : ""}`;

  let sourceText = '';

  if (source === 'discord') {
    const discordUsername = interaction?.user?.username;
    sourceText = discordUsername ? `sent to ${discordUsername} via discord` : 'via discord';
  } else if (source === 'web') {
    sourceText = username ? `sent to ${username} via web` : 'via web';
  }
  const embed = new EmbedBuilder()
    .setColor(tabletopColor)
    .setDescription(diceOutput)
    .setFooter({
      text: sourceText,
    });

  if (title) {
    embed.setTitle(title);
  }

  if (attachment) {
    embed.setImage('attachment://currentDice.webp');
  }

  return embed;
}