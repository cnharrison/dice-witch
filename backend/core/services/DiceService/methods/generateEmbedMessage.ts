import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { GenerateEmbedMessageParams, Result } from "../../../../shared/types";
import { DiceService } from "..";

export async function generateEmbedMessage(
  this: DiceService,
  {
    resultArray,
    attachment,
    title,
    interaction,
    source,
    username,
  }: GenerateEmbedMessageParams
): Promise<{ embeds: EmbedBuilder[]; files: AttachmentBuilder[] }> {
  const grandTotal = resultArray.reduce(
    (prev: number, cur: Result) => prev + cur.results,
    0
  );

  try {
    const embed = this.createEmbed(resultArray, grandTotal, attachment, title, interaction, source, username);
    return {
      embeds: [embed],
      files: attachment ? [attachment] : []
    } as { embeds: EmbedBuilder[]; files: AttachmentBuilder[] };
  } catch (error) {
    return { embeds: [], files: [] };
  }
}