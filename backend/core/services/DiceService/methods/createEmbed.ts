import { AttachmentBuilder, ButtonInteraction, CommandInteraction, EmbedBuilder } from "discord.js";
import { Result } from "../../../../shared/types";
import { DiceService } from "..";
import { tabletopColor } from "../../../constants";

const essenceByFace: Record<string, string> = {
  "1": "🧙‍♀️ Authority",
  "2": "🌿 Nature",
  "3": "☕ Empathy",
  "4": "🐈‍⬛ Stillness",
  "5": "🧉 Imagination",
  "6": "📖 Wisdom",
};

export function mapEssences(output: string): string {
  return output.replace(/\[([^\]]+)\]/g, (_match, bracketContent: string) => {
    const mappedResults = bracketContent
      .split(",")
      .map((value) => value.trim())
      .map((value) => essenceByFace[value] ?? value);

    return `[${mappedResults.join(", ")}]`;
  });
}

export function createEmbed(
  this: DiceService,
  resultArray: Result[],
  _grandTotal: number,
  attachment: AttachmentBuilder | null | undefined,
  title?: string,
  interaction?: CommandInteraction | ButtonInteraction,
  source?: string,
  username?: string
): EmbedBuilder {
  const diceOutput = resultArray.map((result) => mapEssences(result.output.replace(/ = .*$/, ""))).join("\n");

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
    const attachmentName = attachment.name || 'currentDice.webp';
    embed.setImage(`attachment://${attachmentName}`);
  }

  return embed;
}
