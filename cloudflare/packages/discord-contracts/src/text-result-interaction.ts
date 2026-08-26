import { z } from "zod";
import {
  DISCORD_COMPONENTS_V2_FLAG,
  DISCORD_EPHEMERAL_FLAG,
  type DiscordTextDisplay,
} from "./responses";
import {
  ROLL_SAVE_INTENT_RETENTION_MS,
  type SaveRollSourceV1,
} from "./save-roll-interaction";
import {
  interactionTokenSchema,
  nonNegativeSafeIntegerSchema,
  type SchemaInput,
  snowflakeSchema,
  strictObjectSchema,
  uuidV4Schema,
} from "./schema-primitives";

const TEXT_RESULT_CUSTOM_ID = /^text-result:v1:([dw]):([^:]+)$/;
const MAX_RESULT_TEXT_LENGTH = 4_000;

const TextResultIntentV1Schema = strictObjectSchema({
  version: z.literal(1),
  resultText: z.string().min(1).max(MAX_RESULT_TEXT_LENGTH),
  applicationId: snowflakeSchema,
  guildId: snowflakeSchema,
  channelId: snowflakeSchema,
  messageId: z.nullable(snowflakeSchema),
  createdAt: nonNegativeSafeIntegerSchema,
  expiresAt: nonNegativeSafeIntegerSchema,
}).refine(
  ({ createdAt, expiresAt }) =>
    expiresAt === createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
);
const SaveRollSourceSchema = z.discriminatedUnion("kind", [
  strictObjectSchema({ kind: z.literal("discord"), id: snowflakeSchema }),
  strictObjectSchema({
    kind: z.literal("web"),
    id: uuidV4Schema,
    userId: snowflakeSchema,
  }),
]);
const TextResultInteractionSchema = z.looseObject({
  type: z.literal(3),
  id: snowflakeSchema,
  application_id: snowflakeSchema,
  token: interactionTokenSchema,
  guild_id: snowflakeSchema,
  channel_id: snowflakeSchema,
  message: z.looseObject({ id: snowflakeSchema }),
  member: z.looseObject({
    user: z.looseObject({ id: snowflakeSchema }),
  }),
  data: z.looseObject({
    component_type: z.literal(2),
    custom_id: z.string(),
  }),
});

export type TextResultIntentV1 = z.infer<typeof TextResultIntentV1Schema>;

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

function parseSource(
  discriminator: string,
  value: string,
): SaveRollSourceV1 | null {
  if (discriminator === "d") {
    const id = snowflakeSchema.safeParse(value);
    return id.success ? { kind: "discord", id: id.data } : null;
  }
  if (discriminator !== "w") return null;
  const separator = value.indexOf(".");
  if (separator < 1) return null;
  const source = SaveRollSourceSchema.safeParse({
    kind: "web",
    userId: value.slice(0, separator),
    id: value.slice(separator + 1),
  });
  return source.success ? source.data : null;
}

export function buildTextResultCustomId(source: SaveRollSourceV1): string {
  const parsedSource = SaveRollSourceSchema.safeParse(source);
  if (!parsedSource.success) {
    throw new Error("Text result source is invalid");
  }
  const discriminator = parsedSource.data.kind === "discord" ? "d" : "w";
  const sourceId = parsedSource.data.kind === "discord"
    ? parsedSource.data.id
    : `${parsedSource.data.userId}.${parsedSource.data.id}`;
  const customId = `text-result:v1:${discriminator}:${sourceId}`;
  if (customId.length > 100) throw new Error("Text result source is invalid");
  return customId;
}

export function parseTextResultInteraction(
  value: SchemaInput,
  options: { applicationId: string },
): ParsedTextResultInteractionV1 | null {
  if (!snowflakeSchema.safeParse(options.applicationId).success) return null;
  const interaction = TextResultInteractionSchema.safeParse(value);
  if (
    !interaction.success ||
    interaction.data.application_id !== options.applicationId
  ) {
    return null;
  }
  const match = TEXT_RESULT_CUSTOM_ID.exec(interaction.data.data.custom_id);
  if (match === null) return null;
  const source = parseSource(match[1] ?? "", match[2] ?? "");
  if (source === null) return null;
  return {
    source,
    interactionId: interaction.data.id,
    applicationId: options.applicationId,
    token: interaction.data.token,
    userId: interaction.data.member.user.id,
    guildId: interaction.data.guild_id,
    channelId: interaction.data.channel_id,
    messageId: interaction.data.message.id,
  };
}

export function parseTextResultIntent(
  value: SchemaInput,
): TextResultIntentV1 {
  const intent = TextResultIntentV1Schema.safeParse(value);
  if (!intent.success) {
    throw new Error("Text result intent is invalid");
  }
  return intent.data;
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
  const components: DiscordTextDisplay[] = [{ type: 10, content: resultText }];
  const parse: [] = [];
  return {
    type: 4,
    data: {
      flags: DISCORD_COMPONENTS_V2_FLAG | DISCORD_EPHEMERAL_FLAG,
      allowed_mentions: { parse },
      components,
    },
  };
}
