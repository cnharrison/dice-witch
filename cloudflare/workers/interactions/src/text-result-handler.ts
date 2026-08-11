import {
  buildTextResultResponse,
  type ParsedTextResultInteractionV1,
} from "../../../packages/discord-contracts/src";

const UNAVAILABLE_MESSAGE = "This text result is no longer available.";

type TextResultLookup =
  | { status: "available"; resultText: string }
  | { status: "expired" | "missing" };

type TextResultStub = {
  getTextResult(value: {
    applicationId: string;
    guildId: string;
    channelId: string;
    messageId: string;
  }): Promise<TextResultLookup>;
};

type TextResultEnv = {
  ROLL_WORK: DurableObjectNamespace;
  WEB_DELIVERY_WORK: DurableObjectNamespace;
};

export async function handleTextResultInteraction(
  interaction: ParsedTextResultInteractionV1,
  env: TextResultEnv,
) {
  const namespace = interaction.source.kind === "discord"
    ? env.ROLL_WORK
    : env.WEB_DELIVERY_WORK;
  const objectName = interaction.source.kind === "discord"
    ? interaction.source.id
    : `${interaction.source.userId}:${interaction.source.id}`;
  try {
    const result = await (
      namespace.getByName(objectName) as unknown as TextResultStub
    ).getTextResult({
      applicationId: interaction.applicationId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      messageId: interaction.messageId,
    });
    if (result.status === "available") {
      return buildTextResultResponse(result.resultText);
    }
  } catch {
    // Missing, mismatched, and unavailable lookups intentionally look alike.
  }
  return buildTextResultResponse(UNAVAILABLE_MESSAGE);
}
