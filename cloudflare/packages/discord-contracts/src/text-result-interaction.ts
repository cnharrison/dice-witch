import {
  DISCORD_COMPONENTS_V2_FLAG,
  DISCORD_EPHEMERAL_FLAG,
  type DiscordTextDisplay,
} from "./responses";
import {
  ROLL_SAVE_INTENT_RETENTION_MS,
  type SaveRollSourceV1,
} from "./save-roll-interaction";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const TEXT_RESULT_CUSTOM_ID = /^text-result:v1:([dw]):([^:]+)$/;
const MAX_RESULT_TEXT_LENGTH = 4_000;

export type TextResultIntentV1 = {
  version: 1;
  resultText: string;
  applicationId: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  createdAt: number;
  expiresAt: number;
};

export type ParsedTextResultInteractionV1 = {
  source: SaveRollSourceV1;
  interactionId: string;
  applicationId: string;
  token: string;
  userId: string;
  guildId: string;
  channelId: string;
  messageId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index]);
}

function parseSource(
  discriminator: string,
  value: string,
): SaveRollSourceV1 | null {
  if (discriminator === "d" && SNOWFLAKE.test(value)) {
    return { kind: "discord", id: value };
  }
  if (discriminator !== "w") return null;
  const separator = value.indexOf(".");
  const userId = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return separator > 0 && SNOWFLAKE.test(userId) && UUID_V4.test(id)
    ? { kind: "web", id, userId }
    : null;
}

export function buildTextResultCustomId(source: SaveRollSourceV1): string {
  if (
    (source.kind === "discord" && !SNOWFLAKE.test(source.id)) ||
    (source.kind === "web" &&
      (!SNOWFLAKE.test(source.userId) || !UUID_V4.test(source.id)))
  ) {
    throw new Error("Text result source is invalid");
  }
  const discriminator = source.kind === "discord" ? "d" : "w";
  const sourceId = source.kind === "discord"
    ? source.id
    : `${source.userId}.${source.id}`;
  const customId = `text-result:v1:${discriminator}:${sourceId}`;
  if (customId.length > 100) throw new Error("Text result source is invalid");
  return customId;
}

export function parseTextResultInteraction(
  value: unknown,
  options: { applicationId: string },
): ParsedTextResultInteractionV1 | null {
  if (
    !SNOWFLAKE.test(options.applicationId) ||
    !isRecord(value) ||
    value.type !== 3 ||
    typeof value.id !== "string" ||
    !SNOWFLAKE.test(value.id) ||
    value.application_id !== options.applicationId ||
    typeof value.token !== "string" ||
    !INTERACTION_TOKEN.test(value.token) ||
    typeof value.guild_id !== "string" ||
    !SNOWFLAKE.test(value.guild_id) ||
    typeof value.channel_id !== "string" ||
    !SNOWFLAKE.test(value.channel_id) ||
    !isRecord(value.message) ||
    typeof value.message.id !== "string" ||
    !SNOWFLAKE.test(value.message.id) ||
    !isRecord(value.member) ||
    !isRecord(value.member.user) ||
    typeof value.member.user.id !== "string" ||
    !SNOWFLAKE.test(value.member.user.id) ||
    !isRecord(value.data) ||
    value.data.component_type !== 2 ||
    typeof value.data.custom_id !== "string"
  ) {
    return null;
  }
  const match = TEXT_RESULT_CUSTOM_ID.exec(value.data.custom_id);
  if (match === null) return null;
  const source = parseSource(match[1] ?? "", match[2] ?? "");
  if (source === null) return null;
  return {
    source,
    interactionId: value.id,
    applicationId: options.applicationId,
    token: value.token,
    userId: value.member.user.id,
    guildId: value.guild_id,
    channelId: value.channel_id,
    messageId: value.message.id,
  };
}

export function parseTextResultIntent(value: unknown): TextResultIntentV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "applicationId",
      "channelId",
      "createdAt",
      "expiresAt",
      "guildId",
      "messageId",
      "resultText",
      "version",
    ]) ||
    value.version !== 1 ||
    typeof value.resultText !== "string" ||
    value.resultText.length < 1 ||
    value.resultText.length > MAX_RESULT_TEXT_LENGTH ||
    typeof value.applicationId !== "string" ||
    !SNOWFLAKE.test(value.applicationId) ||
    typeof value.guildId !== "string" ||
    !SNOWFLAKE.test(value.guildId) ||
    typeof value.channelId !== "string" ||
    !SNOWFLAKE.test(value.channelId) ||
    (value.messageId !== null &&
      (typeof value.messageId !== "string" || !SNOWFLAKE.test(value.messageId))) ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt !== value.createdAt + ROLL_SAVE_INTENT_RETENTION_MS
  ) {
    throw new Error("Text result intent is invalid");
  }
  return {
    version: 1,
    resultText: value.resultText,
    applicationId: value.applicationId,
    guildId: value.guildId,
    channelId: value.channelId,
    messageId: value.messageId,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  };
}

export function textResultIntentIdentity(intent: TextResultIntentV1): string {
  return JSON.stringify({
    version: intent.version,
    resultText: intent.resultText,
    applicationId: intent.applicationId,
    guildId: intent.guildId,
    channelId: intent.channelId,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
  });
}

export function buildTextResultResponse(resultText: string) {
  if (resultText.length < 1 || resultText.length > MAX_RESULT_TEXT_LENGTH) {
    throw new Error("Text result response is invalid");
  }
  return {
    type: 4 as const,
    data: {
      flags: DISCORD_COMPONENTS_V2_FLAG | DISCORD_EPHEMERAL_FLAG,
      allowed_mentions: { parse: [] as [] },
      components: [{ type: 10, content: resultText }] satisfies DiscordTextDisplay[],
    },
  };
}
