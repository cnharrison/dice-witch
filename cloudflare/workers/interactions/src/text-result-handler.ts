import {
  buildTextResultResponse,
  type ParsedTextResultInteractionV1,
} from "../../../packages/discord-contracts/src";
import type {
  DurableObjectNamespacePort,
  RollWorkPort,
  WebDeliveryWorkPort,
} from "./ports";
import { parseTextResultLookup } from "./service-results";

const UNAVAILABLE_MESSAGE = "This text result is no longer available.";

type TextResultEnv = {
  ROLL_WORK: DurableObjectNamespacePort<RollWorkPort>;
  WEB_DELIVERY_WORK: DurableObjectNamespacePort<WebDeliveryWorkPort>;
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
    const result = parseTextResultLookup(
      await namespace.getByName(objectName).getTextResult({
      applicationId: interaction.applicationId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
        messageId: interaction.messageId,
      }),
    );
    if (result.status === "available") {
      return buildTextResultResponse(result.resultText);
    }
  } catch {
    // Missing, mismatched, and unavailable lookups intentionally look alike.
  }
  return buildTextResultResponse(UNAVAILABLE_MESSAGE);
}
