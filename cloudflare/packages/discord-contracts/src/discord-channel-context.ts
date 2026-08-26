import { z } from "zod";
import {
  isDiscordRollChannelType,
  type DiscordRollChannelType,
} from "./roll-interaction";
import {
  boundedNameSchema,
  exactEnumSchema,
  safeIntegerSchema,
  type SchemaInput,
  snowflakeSchema,
  strictObjectSchema,
  timestampSchema,
} from "./schema-primitives";

const DiscordChannelContextRequestV1Schema = strictObjectSchema({
  version: z.literal(1),
  guildId: snowflakeSchema,
  channelId: snowflakeSchema,
});
const DiscordChannelContextSourceV1Schema = exactEnumSchema([
  "gateway",
  "interaction",
  "lifecycle",
  "rest",
]);
const DiscordChannelNameSchema = boundedNameSchema(1, 100);
const DiscordChannelContextResponseSchema = z.looseObject({
  id: snowflakeSchema,
  guild_id: snowflakeSchema,
  name: DiscordChannelNameSchema,
  type: safeIntegerSchema,
});
const DiscordChannelDirectoryDeleteV1Schema = strictObjectSchema({
  version: z.literal(1),
  operation: z.literal("delete"),
  source: z.literal("gateway"),
  guildId: snowflakeSchema,
  channelId: snowflakeSchema,
  observedAt: timestampSchema,
});
const DiscordChannelDirectoryUpsertV1Schema = strictObjectSchema({
  version: z.literal(1),
  operation: z.literal("upsert"),
  source: DiscordChannelContextSourceV1Schema,
  guildId: snowflakeSchema,
  channelId: snowflakeSchema,
  channelName: DiscordChannelNameSchema,
  channelType: safeIntegerSchema.refine(isDiscordRollChannelType),
  observedAt: timestampSchema,
});
const DiscordChannelDirectoryMutationV1Schema = z.discriminatedUnion(
  "operation",
  [
    DiscordChannelDirectoryUpsertV1Schema,
    DiscordChannelDirectoryDeleteV1Schema,
  ],
);
const UpsertDispatchSchema = exactEnumSchema([
  "CHANNEL_CREATE",
  "CHANNEL_UPDATE",
  "THREAD_CREATE",
  "THREAD_UPDATE",
]);
const DeleteDispatchSchema = exactEnumSchema([
  "CHANNEL_DELETE",
  "THREAD_DELETE",
]);
const DiscordChannelDispatchIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  guild_id: snowflakeSchema,
});

export type DiscordChannelContextRequestV1 = Readonly<
  z.infer<typeof DiscordChannelContextRequestV1Schema>
>;

export type DiscordChannelContextResultV1 =
  | Readonly<{
      status: "resolved";
      channelName: string;
      channelType: DiscordRollChannelType;
    }>
  | Readonly<{ status: "unavailable"; httpStatus: 403 | 404 }>
  | Readonly<{
      status: "retryable";
      httpStatus: number | null;
      retryAfterMs: number | null;
    }>
  | Readonly<{ status: "failed"; httpStatus: number }>;

export type DiscordChannelContextSourceV1 = z.infer<
  typeof DiscordChannelContextSourceV1Schema
>;

export type DiscordChannelDirectoryMutationV1 =
  | Readonly<z.infer<typeof DiscordChannelDirectoryUpsertV1Schema>>
  | Readonly<z.infer<typeof DiscordChannelDirectoryDeleteV1Schema>>;

export function parseDiscordChannelContextRequestV1(
  value: SchemaInput,
): DiscordChannelContextRequestV1 {
  const result = DiscordChannelContextRequestV1Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Discord channel context request is invalid");
  }
  return result.data;
}

export function parseDiscordChannelContextResponseV1(
  value: SchemaInput,
  request: DiscordChannelContextRequestV1,
): Extract<DiscordChannelContextResultV1, { status: "resolved" }> {
  const result = DiscordChannelContextResponseSchema.safeParse(value);
  if (
    !result.success ||
    result.data.id !== request.channelId ||
    result.data.guild_id !== request.guildId ||
    !isDiscordRollChannelType(result.data.type)
  ) {
    throw new Error("Discord channel context response is invalid");
  }
  return {
    status: "resolved",
    channelName: result.data.name,
    channelType: result.data.type,
  };
}

export function parseDiscordChannelDirectoryMutationV1(
  value: SchemaInput,
): DiscordChannelDirectoryMutationV1 {
  const result = DiscordChannelDirectoryMutationV1Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Discord channel directory mutation is invalid");
  }
  return result.data;
}

type DiscordChannelDirectoryContextV1 = Readonly<{
  guildId?: string | null;
  channelId: string;
  channelName?: string | null;
  channelType?: number | null;
}>;

export function buildDiscordChannelDirectoryUpsertV1(
  context: DiscordChannelDirectoryContextV1 | null,
  source: "interaction" | "lifecycle",
  observedAt: number,
): DiscordChannelDirectoryMutationV1 | null {
  if (
    context?.guildId === null ||
    context?.guildId === undefined ||
    context.channelName === null ||
    context.channelName === undefined ||
    context.channelType === null ||
    context.channelType === undefined
  ) {
    return null;
  }
  return parseDiscordChannelDirectoryMutationV1({
    version: 1,
    operation: "upsert",
    source,
    guildId: context.guildId,
    channelId: context.channelId,
    channelName: context.channelName,
    channelType: context.channelType,
    observedAt,
  });
}

export function parseDiscordChannelDirectoryDispatchV1(
  eventType: string,
  data: SchemaInput,
  observedAt: number,
): DiscordChannelDirectoryMutationV1 | null {
  const upsertDispatch = UpsertDispatchSchema.safeParse(eventType);
  const deleteDispatch = DeleteDispatchSchema.safeParse(eventType);
  if (!upsertDispatch.success && !deleteDispatch.success) return null;

  const identity = DiscordChannelDispatchIdentitySchema.safeParse(data);
  const timestamp = timestampSchema.safeParse(observedAt);
  if (!identity.success || !timestamp.success) {
    throw new Error("Discord channel directory dispatch is invalid");
  }
  if (deleteDispatch.success) {
    return parseDiscordChannelDirectoryMutationV1({
      version: 1,
      operation: "delete",
      source: "gateway",
      guildId: identity.data.guild_id,
      channelId: identity.data.id,
      observedAt: timestamp.data,
    });
  }

  const channelType = safeIntegerSchema.safeParse(identity.data.type);
  if (!channelType.success) {
    throw new Error("Discord channel directory dispatch is invalid");
  }
  if (!isDiscordRollChannelType(channelType.data)) return null;
  return parseDiscordChannelDirectoryMutationV1({
    version: 1,
    operation: "upsert",
    source: "gateway",
    guildId: identity.data.guild_id,
    channelId: identity.data.id,
    channelName: identity.data.name,
    channelType: channelType.data,
    observedAt: timestamp.data,
  });
}
