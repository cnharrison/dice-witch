import {
  isDiscordRollChannelType,
  type DiscordRollChannelType,
} from "./roll-interaction";

export type DiscordChannelContextRequestV1 = Readonly<{
  version: 1;
  guildId: string;
  channelId: string;
}>;

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

export type DiscordChannelContextSourceV1 =
  | "gateway"
  | "interaction"
  | "lifecycle"
  | "rest";

export type DiscordChannelDirectoryMutationV1 =
  | Readonly<{
      version: 1;
      operation: "upsert";
      source: DiscordChannelContextSourceV1;
      guildId: string;
      channelId: string;
      channelName: string;
      channelType: DiscordRollChannelType;
      observedAt: number;
    }>
  | Readonly<{
      version: 1;
      operation: "delete";
      source: "gateway";
      guildId: string;
      channelId: string;
      observedAt: number;
    }>;

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/u;
const SOURCES = new Set<DiscordChannelContextSourceV1>([
  "gateway",
  "interaction",
  "lifecycle",
  "rest",
]);
const UPSERT_DISPATCHES = new Set([
  "CHANNEL_CREATE",
  "CHANNEL_UPDATE",
  "THREAD_CREATE",
  "THREAD_UPDATE",
]);
const DELETE_DISPATCHES = new Set([
  "CHANNEL_DELETE",
  "THREAD_DELETE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isContextSource(
  value: unknown,
): value is DiscordChannelContextSourceV1 {
  return typeof value === "string" &&
    SOURCES.has(value as DiscordChannelContextSourceV1);
}

function isChannelName(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 100;
}

export function parseDiscordChannelContextRequestV1(
  value: unknown,
): DiscordChannelContextRequestV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["channelId", "guildId", "version"]) ||
    value.version !== 1 ||
    typeof value.guildId !== "string" ||
    !SNOWFLAKE.test(value.guildId) ||
    typeof value.channelId !== "string" ||
    !SNOWFLAKE.test(value.channelId)
  ) {
    throw new Error("Discord channel context request is invalid");
  }
  return {
    version: 1,
    guildId: value.guildId,
    channelId: value.channelId,
  };
}

export function parseDiscordChannelContextResponseV1(
  value: unknown,
  request: DiscordChannelContextRequestV1,
): Extract<DiscordChannelContextResultV1, { status: "resolved" }> {
  if (
    !isRecord(value) ||
    value.id !== request.channelId ||
    value.guild_id !== request.guildId ||
    !isChannelName(value.name) ||
    !isDiscordRollChannelType(value.type)
  ) {
    throw new Error("Discord channel context response is invalid");
  }
  return {
    status: "resolved",
    channelName: value.name,
    channelType: value.type,
  };
}

export function parseDiscordChannelDirectoryMutationV1(
  value: unknown,
): DiscordChannelDirectoryMutationV1 {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.guildId !== "string" ||
    !SNOWFLAKE.test(value.guildId) ||
    typeof value.channelId !== "string" ||
    !SNOWFLAKE.test(value.channelId) ||
    !isTimestamp(value.observedAt)
  ) {
    throw new Error("Discord channel directory mutation is invalid");
  }
  if (
    value.operation === "delete" &&
    value.source === "gateway" &&
    hasExactKeys(value, [
      "channelId",
      "guildId",
      "observedAt",
      "operation",
      "source",
      "version",
    ])
  ) {
    return {
      version: 1,
      operation: "delete",
      source: "gateway",
      guildId: value.guildId,
      channelId: value.channelId,
      observedAt: value.observedAt,
    };
  }
  if (
    value.operation !== "upsert" ||
    !isContextSource(value.source) ||
    !hasExactKeys(value, [
      "channelId",
      "channelName",
      "channelType",
      "guildId",
      "observedAt",
      "operation",
      "source",
      "version",
    ]) ||
    !isChannelName(value.channelName) ||
    !isDiscordRollChannelType(value.channelType)
  ) {
    throw new Error("Discord channel directory mutation is invalid");
  }
  return {
    version: 1,
    operation: "upsert",
    source: value.source,
    guildId: value.guildId,
    channelId: value.channelId,
    channelName: value.channelName,
    channelType: value.channelType,
    observedAt: value.observedAt,
  };
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
  data: unknown,
  observedAt: number,
): DiscordChannelDirectoryMutationV1 | null {
  if (!UPSERT_DISPATCHES.has(eventType) && !DELETE_DISPATCHES.has(eventType)) {
    return null;
  }
  if (
    !isRecord(data) ||
    typeof data.id !== "string" ||
    !SNOWFLAKE.test(data.id) ||
    typeof data.guild_id !== "string" ||
    !SNOWFLAKE.test(data.guild_id) ||
    !isTimestamp(observedAt)
  ) {
    throw new Error("Discord channel directory dispatch is invalid");
  }
  if (DELETE_DISPATCHES.has(eventType)) {
    return parseDiscordChannelDirectoryMutationV1({
      version: 1,
      operation: "delete",
      source: "gateway",
      guildId: data.guild_id,
      channelId: data.id,
      observedAt,
    });
  }
  if (
    typeof data.type !== "number" ||
    !Number.isSafeInteger(data.type)
  ) {
    throw new Error("Discord channel directory dispatch is invalid");
  }
  if (!isDiscordRollChannelType(data.type)) return null;
  return parseDiscordChannelDirectoryMutationV1({
    version: 1,
    operation: "upsert",
    source: "gateway",
    guildId: data.guild_id,
    channelId: data.id,
    channelName: data.name,
    channelType: data.type,
    observedAt,
  });
}
