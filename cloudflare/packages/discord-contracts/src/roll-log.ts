import { z } from "zod";
import { MAX_NOTATION_LENGTH } from "../../roll-domain/src/constants";
import {
  isComponentsV2Message,
  validateDiscordMessage,
  type DiscordActionRow,
  type DiscordComponentsV2Message,
  type DiscordEmbed,
  type DiscordLegacyMessage,
  type DiscordTopLevelComponent,
} from "./responses";
import {
  boundaryObjectSchema,
  exactEnumSchema,
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  safeIntegerSchema,
  type SchemaInput,
  snowflakeSchema,
  strictObjectSchema,
  timestampSchema,
} from "./schema-primitives";
import {
  parseRollLoggingContext,
  type RollLoggingContext,
} from "./roll-interaction";

const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/iu;
const ATTACHMENT_URL = /^attachment:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,103}$/u;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const MAX_USERNAME_LENGTH = 32;
const MAX_MESSAGE_CONTENT_LENGTH = 2_000;
const MAX_EMBED_COUNT = 2;
const MAX_EMBED_TITLE_LENGTH = 256;
const MAX_EMBED_DESCRIPTION_LENGTH = 4_096;
const MAX_EMBED_FOOTER_LENGTH = 2_048;
const MAX_ARTIFACT_JSON_BYTES = 128_000;
const MAX_DISCORD_EMBED_CHARACTERS = 6_000;
const LOG_METADATA_TITLE = "receivedCommand: /roll";
const IMAGE_UNAVAILABLE_MARKER = "**image unavailable**";

export const MAX_LOG_ARTIFACT_PNG_BYTES = 1_500_000;
export const LOG_WORK_RETRY_WINDOW_MS = 6 * 60 * 60 * 1_000;
export const LOG_WORK_RETENTION_MS = 24 * 60 * 60 * 1_000;

const LogArtifactUnavailableReasonSchema = exactEnumSchema([
  "corrupt",
  "discord-rejected",
  "missing",
  "not-applicable",
  "oversized",
]);
export type LogArtifactUnavailableReasonV1 = z.infer<
  typeof LogArtifactUnavailableReasonSchema
>;

export type LogArtifactImageV1 =
  | {
      status: "available";
      filename: string;
      png: Uint8Array;
    }
  | {
      status: "unavailable";
      reason: LogArtifactUnavailableReasonV1;
    };

export const RollLogShardSchema = z.discriminatedUnion("status", [
  strictObjectSchema({ status: z.literal("not-applicable") }),
  strictObjectSchema({ status: z.literal("unavailable") }),
  strictObjectSchema({
    status: z.literal("available"),
    shardId: nonNegativeSafeIntegerSchema,
    shardCount: positiveSafeIntegerSchema,
    generation: nonNegativeSafeIntegerSchema,
  }).refine((shard) => shard.shardId < shard.shardCount),
]);
export type RollLogShardV1 = z.infer<typeof RollLogShardSchema>;

export type RollLogArtifactV1 = {
  version: 1;
  rollId: string;
  source: "discord" | "web";
  notation: string;
  user: {
    id: string;
    username: string;
  };
  guildId: string | null;
  channelId: string;
  context: RollLoggingContext | null;
  destinationDeliveredAt: number;
  payload: DiscordLegacyMessage;
  image: LogArtifactImageV1;
};

const RollLogPresentationSchema = strictObjectSchema({
  title: z.string().min(1).max(MAX_EMBED_TITLE_LENGTH).nullable(),
  result: z.string().min(1).max(MAX_EMBED_DESCRIPTION_LENGTH).nullable(),
  savedRoll: strictObjectSchema({
    scope: exactEnumSchema(["personal", "server"]),
    name: z.string().min(1).max(1_024),
  }).nullable(),
});
export type RollLogPresentationV2 = z.infer<
  typeof RollLogPresentationSchema
>;

export type RollLogArtifactV2 = Omit<RollLogArtifactV1, "payload" | "version"> & {
  version: 2;
  presentation: RollLogPresentationV2;
  payload: DiscordComponentsV2Message;
};

export type RollLogArtifact = RollLogArtifactV1 | RollLogArtifactV2;

export type ValidatedRollLogArtifactV1 = RollLogArtifactV1 & {
  payloadJson: string;
};
export type ValidatedRollLogArtifactV2 = RollLogArtifactV2 & {
  payloadJson: string;
};
export type ValidatedRollLogArtifact =
  | ValidatedRollLogArtifactV1
  | ValidatedRollLogArtifactV2;

type StoredImageV1 =
  | { status: "available"; filename: string; sha256: string; bytes: number }
  | { status: "unavailable"; reason: LogArtifactUnavailableReasonV1 };

export type StoredLogArtifactV1 = Omit<
  RollLogArtifactV1,
  "image" | "payload"
> & {
  payload: DiscordLegacyMessage;
  image: StoredImageV1;
};
export type StoredLogArtifactV2 = Omit<
  RollLogArtifactV2,
  "image" | "payload"
> & {
  payload: DiscordComponentsV2Message;
  image: StoredImageV1;
};
export type StoredLogArtifact = StoredLogArtifactV1 | StoredLogArtifactV2;

type RollLogTelemetryKeys =
  | "channelId"
  | "context"
  | "destinationDeliveredAt"
  | "guildId"
  | "notation"
  | "payload"
  | "rollId"
  | "source"
  | "user"
  | "version";

type RollLogTelemetryArtifact = (
  | Pick<RollLogArtifactV1, RollLogTelemetryKeys>
  | Pick<RollLogArtifactV2, RollLogTelemetryKeys | "presentation">
) & {
  image:
    | { status: "available"; filename: string }
    | { status: "unavailable"; reason: LogArtifactUnavailableReasonV1 };
};

export function rollLogTelemetryContext(
  artifact: RollLogTelemetryArtifact,
  logicalShard: RollLogShardV1 | null,
) {
  const guildContext = artifact.context?.kind === "guild"
    ? artifact.context
    : null;
  return {
    rollId: artifact.rollId,
    interactionId: artifact.rollId,
    source: artifact.source,
    notation: artifact.notation,
    userId: artifact.user.id,
    username: artifact.user.username,
    guildId: artifact.guildId,
    channelId: artifact.channelId,
    context: artifact.context,
    guildName: guildContext?.guildName ?? null,
    channelName: guildContext?.channelName ?? null,
    channelType: guildContext?.channelType ?? null,
    title:
      artifact.version === 2
        ? artifact.presentation.title
        : artifact.payload.embeds?.[0]?.title ?? null,
    destinationPayload: artifact.payload,
    destinationDeliveredAt: artifact.destinationDeliveredAt,
    imageStatus: artifact.image.status,
    imageFilename:
      artifact.image.status === "available" ? artifact.image.filename : null,
    imageUnavailableReason:
      artifact.image.status === "unavailable" ? artifact.image.reason : null,
    logicalShard,
  };
}

function readUint32(value: Uint8Array, offset: number): number {
  return (
    ((value[offset] ?? 0) << 24) |
    ((value[offset + 1] ?? 0) << 16) |
    ((value[offset + 2] ?? 0) << 8) |
    (value[offset + 3] ?? 0)
  ) >>> 0;
}

function crc32(value: Uint8Array, start: number, end: number): number {
  let crc = 0xffff_ffff;
  for (let index = start; index < end; index += 1) {
    crc ^= value[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function isPng(value: Uint8Array): boolean {
  if (!PNG_SIGNATURE.every((byte, index) => value[index] === byte)) {
    return false;
  }
  let offset: number = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let hasImageData = false;
  while (offset + 12 <= value.byteLength) {
    const length = readUint32(value, offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const crcOffset = dataStart + length;
    const nextOffset = crcOffset + 4;
    if (nextOffset > value.byteLength) return false;
    const type = String.fromCharCode(
      value[typeStart] ?? 0,
      value[typeStart + 1] ?? 0,
      value[typeStart + 2] ?? 0,
      value[typeStart + 3] ?? 0,
    );
    if (readUint32(value, crcOffset) !== crc32(value, typeStart, crcOffset)) {
      return false;
    }
    if (chunkIndex === 0 && (type !== "IHDR" || length !== 13)) return false;
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      return length === 0 && hasImageData && nextOffset === value.byteLength;
    }
    offset = nextOffset;
    chunkIndex += 1;
  }
  return false;
}

const AttachmentUrlSchema = z.string().regex(ATTACHMENT_URL);
const LogEmbedSchema = strictObjectSchema({
  title: z.string().min(1).max(MAX_EMBED_TITLE_LENGTH).optional(),
  description: z.string().min(1).max(MAX_EMBED_DESCRIPTION_LENGTH).optional(),
  color: safeIntegerSchema.min(0).max(0xff_ffff).optional(),
  footer: strictObjectSchema({
    text: z.string().min(1).max(MAX_EMBED_FOOTER_LENGTH),
  }).optional(),
  image: strictObjectSchema({ url: AttachmentUrlSchema }).optional(),
}).refine(
  (embed) =>
    embed.title !== undefined ||
    embed.description !== undefined ||
    embed.color !== undefined ||
    embed.footer !== undefined ||
    embed.image !== undefined,
);

const HttpsUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
});
const LogButtonSchema = z.discriminatedUnion("style", [
  strictObjectSchema({
    type: z.literal(2),
    style: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    label: z.string().min(1).max(80),
    custom_id: z.string().min(1).max(100),
  }),
  strictObjectSchema({
    type: z.literal(2),
    style: z.literal(5),
    label: z.string().min(1).max(80),
    url: HttpsUrlSchema,
  }),
]);
const LogActionRowSchema = strictObjectSchema({
  type: z.literal(1),
  components: z.array(LogButtonSchema).min(1).max(5),
});
const PreservedLogEmbedSchema = z.custom<DiscordEmbed>(
  (value) => LogEmbedSchema.safeParse(value).success,
);
const PreservedLogActionRowSchema = z.custom<DiscordActionRow>(
  (value) => LogActionRowSchema.safeParse(value).success,
);
const LegacyLogPayloadSchema = strictObjectSchema({
  content: z.string().min(1).max(MAX_MESSAGE_CONTENT_LENGTH).optional(),
  embeds: z
    .array(PreservedLogEmbedSchema)
    .min(1)
    .max(MAX_EMBED_COUNT)
    .optional(),
  components: z.array(PreservedLogActionRowSchema).min(1).max(5).optional(),
}).refine(
  (message) =>
    message.content !== undefined ||
    message.embeds !== undefined ||
    message.components !== undefined,
);

function validatePayload(value: SchemaInput): DiscordLegacyMessage {
  const parsed = LegacyLogPayloadSchema.safeParse(value);
  if (!parsed.success) throw new Error("Roll log artifact payload is invalid");
  const payload: DiscordLegacyMessage = {};
  if (parsed.data.content !== undefined) payload.content = parsed.data.content;
  if (parsed.data.embeds !== undefined) payload.embeds = parsed.data.embeds;
  if (parsed.data.components !== undefined) {
    payload.components = parsed.data.components;
  }
  return payload;
}

function validateContext(
  value: SchemaInput,
  guildId: string | null,
  channelId: string,
): RollLoggingContext | null {
  if (value === null) return null;
  try {
    return parseRollLoggingContext(value, guildId, channelId);
  } catch {
    throw new Error("Roll log artifact context is invalid");
  }
}

function escapeDiscordMarkdown(value: string): string {
  let escaped = value;
  for (const character of [
    "\\",
    "`",
    "*",
    "_",
    "{",
    "}",
    "[",
    "]",
    "(",
    ")",
    "#",
    "+",
    "-",
    ".",
    "!",
    "|",
    ">",
    "~",
  ]) {
    escaped = escaped.replaceAll(character, `\\${character}`);
  }
  return escaped;
}

function rollLogShardLabel(shard: RollLogShardV1): string | null {
  if (shard.status === "not-applicable") return null;
  if (shard.status === "unavailable") return "[Shard unavailable]";
  return `[Shard ${String(shard.shardId + 1)}]`;
}

export type RollLogDisplayContextV1 = {
  guildName: string | null;
  channelName: string | null;
};

function rollLogDisplayLine(
  kind: "channel" | "guild",
  value: string | null,
): string {
  return value === null
    ? `unknown ${kind}`
    : `${kind}: **${escapeDiscordMarkdown(value)}**`;
}

export function rollLogContextDescription(
  artifact: RollLogArtifact,
  shard: RollLogShardV1,
  displayContext?: RollLogDisplayContextV1,
): string {
  const source = artifact.source === "web" ? "Web" : "Discord";
  const user = `user: **${escapeDiscordMarkdown(artifact.user.username)}** [${source}]`;
  if (artifact.guildId === null) return `${user}\nchannel: **DM**`;

  const shardLabel = rollLogShardLabel(shard);
  const shardSuffix = shardLabel === null ? "" : ` ${shardLabel}`;
  let context: RollLogDisplayContextV1 | null;
  if (displayContext !== undefined) {
    context = displayContext;
  } else if (artifact.context === null) {
    context = null;
  } else if (artifact.context.kind === "guild") {
    context = artifact.context;
  } else {
    throw new Error("Roll log guild context is invalid");
  }
  if (context === null) {
    return `${user}\nunknown channel\nunknown guild${shardSuffix}`;
  }
  const channel = rollLogDisplayLine("channel", context.channelName);
  const guild = rollLogDisplayLine("guild", context.guildName);
  return `${user}\n${channel}\n${guild}${shardSuffix}`;
}

export function rollLogResultDescription(
  artifact: RollLogArtifact,
): string | null {
  if (artifact.version === 2) {
    return [
      artifact.presentation.title === null
        ? null
        : `**${escapeDiscordMarkdown(artifact.presentation.title)}**`,
      artifact.presentation.result,
    ]
      .filter((line): line is string => line !== null)
      .join("\n") || null;
  }
  const result = artifact.payload.embeds?.[0];
  if (result === undefined) return null;
  const lines = [
    result.title === undefined
      ? undefined
      : `**${escapeDiscordMarkdown(result.title)}**`,
    result.description,
  ].filter((line): line is string => line !== undefined);
  return lines.length === 0 ? null : lines.join("\n");
}

export function rollLogMetadataDescription(
  artifact: RollLogArtifact,
  shard: RollLogShardV1,
  maximumLength = MAX_EMBED_DESCRIPTION_LENGTH,
  displayContext?: RollLogDisplayContextV1,
): string {
  if (
    !Number.isSafeInteger(maximumLength) ||
    maximumLength < 1 ||
    maximumLength > MAX_EMBED_DESCRIPTION_LENGTH
  ) {
    throw new Error("Roll log metadata limit is invalid");
  }
  const prefix = `${rollLogContextDescription(artifact, shard, displayContext)}\nroll: `;
  const notation = escapeDiscordMarkdown(artifact.notation);
  const notationLimit = maximumLength - prefix.length;
  if (notationLimit < 2) {
    throw new Error("Roll log metadata suffix is too long");
  }
  const displayedNotation =
    notation.length <= notationLimit
      ? notation
      : `${notation.slice(0, notationLimit - 1)}…`;
  return `${prefix}${displayedNotation}`;
}

function embedCharacters(embeds: readonly DiscordEmbed[]): number {
  return embeds.reduce(
    (total, embed) =>
      total +
      (embed.title?.length ?? 0) +
      (embed.description?.length ?? 0) +
      (embed.footer?.text.length ?? 0),
    0,
  );
}

const AvailableImageEnvelopeSchema = strictObjectSchema({
  status: z.literal("available"),
  filename: z.string().regex(PNG_FILENAME),
  png: z.instanceof(Uint8Array),
});
const UnavailableImageSchema = strictObjectSchema({
  status: z.literal("unavailable"),
  reason: LogArtifactUnavailableReasonSchema,
});

function validateImage(value: SchemaInput): LogArtifactImageV1 {
  const boundary = boundaryObjectSchema.safeParse(value);
  if (!boundary.success) throw new Error("Roll log artifact image is invalid");
  if (boundary.data.status === "available") {
    const parsed = AvailableImageEnvelopeSchema.safeParse(boundary.data);
    if (
      !parsed.success ||
      parsed.data.png.byteLength < PNG_SIGNATURE.length ||
      parsed.data.png.byteLength > MAX_LOG_ARTIFACT_PNG_BYTES ||
      !isPng(parsed.data.png)
    ) {
      throw new Error("Roll log artifact image is invalid");
    }
    return {
      status: "available",
      filename: parsed.data.filename,
      png: parsed.data.png.slice(),
    };
  }
  const parsed = UnavailableImageSchema.safeParse(boundary.data);
  if (!parsed.success) throw new Error("Roll log artifact image is invalid");
  return parsed.data;
}

function componentAttachmentUrls(
  component: DiscordTopLevelComponent,
): string[] {
  switch (component.type) {
    case 17:
      return component.components.flatMap(componentAttachmentUrls);
    case 9:
      return component.accessory.type === 11 &&
        component.accessory.media.url.startsWith("attachment://")
        ? [component.accessory.media.url]
        : [];
    case 12:
      return component.items
        .map((item) => item.media.url)
        .filter((url) => url.startsWith("attachment://"));
    case 13:
      return [component.file.url];
    default:
      return [];
  }
}

function validatePresentationV2(value: SchemaInput): RollLogPresentationV2 {
  const parsed = RollLogPresentationSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Roll log artifact presentation is invalid");
  }
  return parsed.data;
}

const ArtifactBaseSchema = {
  rollId: snowflakeSchema,
  source: exactEnumSchema(["discord", "web"]),
  notation: z.string().min(1).max(MAX_NOTATION_LENGTH),
  user: strictObjectSchema({
    id: snowflakeSchema,
    username: z.string().min(1).max(MAX_USERNAME_LENGTH),
  }),
  guildId: snowflakeSchema.nullable(),
  channelId: snowflakeSchema,
  context: z.unknown(),
  destinationDeliveredAt: timestampSchema,
  payload: z.unknown(),
  image: z.unknown(),
};
const RollLogArtifactV1EnvelopeSchema = strictObjectSchema({
  version: z.literal(1),
  ...ArtifactBaseSchema,
});
const RollLogArtifactV2EnvelopeSchema = strictObjectSchema({
  version: z.literal(2),
  ...ArtifactBaseSchema,
  presentation: z.unknown(),
});
type RollLogArtifactV1Envelope = z.infer<
  typeof RollLogArtifactV1EnvelopeSchema
>;
type RollLogArtifactV2Envelope = z.infer<
  typeof RollLogArtifactV2EnvelopeSchema
>;

function payloadJson(payload: DiscordLegacyMessage | DiscordComponentsV2Message): string {
  const serialized = JSON.stringify(payload);
  if (
    serialized.length === 0 ||
    new TextEncoder().encode(serialized).byteLength > MAX_ARTIFACT_JSON_BYTES
  ) {
    throw new Error("Roll log artifact payload is invalid");
  }
  return serialized;
}

function validateV2Payload(value: SchemaInput): DiscordComponentsV2Message {
  const payload = validateDiscordMessage(value);
  if (!isComponentsV2Message(payload)) {
    throw new Error("Roll log artifact V2 payload is invalid");
  }
  return payload;
}

function validateRollLogArtifactV2(
  value: RollLogArtifactV2Envelope,
): ValidatedRollLogArtifactV2 {
  const payload = validateV2Payload(value.payload);
  const serializedPayload = payloadJson(payload);
  const presentation = validatePresentationV2(value.presentation);
  const image = validateImage(value.image);
  const attachmentUrls = payload.components.flatMap(componentAttachmentUrls);
  if (
    (image.status === "available" &&
      (attachmentUrls.length !== 1 ||
        attachmentUrls[0] !== `attachment://${image.filename}`)) ||
    (image.status === "unavailable" && attachmentUrls.length !== 0)
  ) {
    throw new Error("Roll log artifact payload does not match its image");
  }
  return {
    version: 2,
    rollId: value.rollId,
    source: value.source,
    notation: value.notation,
    user: value.user,
    guildId: value.guildId,
    channelId: value.channelId,
    context: validateContext(value.context, value.guildId, value.channelId),
    destinationDeliveredAt: value.destinationDeliveredAt,
    presentation,
    payload,
    payloadJson: serializedPayload,
    image,
  };
}

function validateRollLogArtifactV1(
  value: RollLogArtifactV1Envelope,
): ValidatedRollLogArtifactV1 {
  const payload = validatePayload(value.payload);
  const serializedPayload = payloadJson(payload);
  const image = validateImage(value.image);
  const attachmentUrls =
    payload.embeds?.flatMap((embed) =>
      embed.image === undefined ? [] : [embed.image.url],
    ) ?? [];
  const visibleText = [
    payload.content,
    ...(payload.embeds?.flatMap((embed) => [
      embed.title,
      embed.description,
      embed.footer?.text,
    ]) ?? []),
  ].filter((text): text is string => text !== undefined);
  if (
    (image.status === "available" &&
      ((payload.embeds?.length ?? 0) > 1 ||
        attachmentUrls.length !== 1 ||
        attachmentUrls[0] !== `attachment://${image.filename}`)) ||
    (image.status === "unavailable" &&
      (attachmentUrls.length !== 0 ||
        (image.reason !== "not-applicable" &&
          !visibleText.some((text) => text.includes(IMAGE_UNAVAILABLE_MARKER)))))
  ) {
    throw new Error("Roll log artifact payload does not match its image");
  }

  const context = validateContext(value.context, value.guildId, value.channelId);
  const artifact: RollLogArtifactV1 = {
    version: 1,
    rollId: value.rollId,
    source: value.source,
    notation: value.notation,
    user: value.user,
    guildId: value.guildId,
    channelId: value.channelId,
    context,
    destinationDeliveredAt: value.destinationDeliveredAt,
    payload,
    image,
  };
  const maximumShard: RollLogShardV1 =
    artifact.guildId === null
      ? { status: "not-applicable" }
      : {
          status: "available",
          shardId: Number.MAX_SAFE_INTEGER - 1,
          shardCount: Number.MAX_SAFE_INTEGER,
          generation: Number.MAX_SAFE_INTEGER,
        };
  const fallbackReserve =
    image.status === "available" ? IMAGE_UNAVAILABLE_MARKER.length : 0;
  if (
    embedCharacters(payload.embeds ?? []) > MAX_DISCORD_EMBED_CHARACTERS ||
    LOG_METADATA_TITLE.length +
      rollLogMetadataDescription(artifact, maximumShard).length +
      fallbackReserve >
      MAX_DISCORD_EMBED_CHARACTERS
  ) {
    throw new Error("Roll log artifact embeds exceed Discord's aggregate limit");
  }
  return { ...artifact, payloadJson: serializedPayload };
}

export function validateRollLogArtifact(
  value: SchemaInput,
): ValidatedRollLogArtifact {
  const boundary = boundaryObjectSchema.safeParse(value);
  if (!boundary.success) throw new Error("Roll log artifact is invalid");
  if (boundary.data.version === 2) {
    const parsed = RollLogArtifactV2EnvelopeSchema.safeParse(boundary.data);
    if (!parsed.success) throw new Error("Roll log artifact is invalid");
    return validateRollLogArtifactV2(parsed.data);
  }
  const parsed = RollLogArtifactV1EnvelopeSchema.safeParse(boundary.data);
  if (!parsed.success) throw new Error("Roll log artifact is invalid");
  return validateRollLogArtifactV1(parsed.data);
}

export type DeliverRollLogInputV1 = {
  artifact: RollLogArtifact;
  logicalShard: RollLogShardV1;
};

export type DeliverRollLogResultV1 =
  | { status: "delivered"; httpStatus: number }
  | {
      status: "retryable";
      httpStatus: number;
      retryAfterMs: number | null;
    }
  | { status: "image-rejected"; httpStatus: number }
  | { status: "failed"; httpStatus: number };

function v2PayloadWithoutImage(
  payload: DiscordComponentsV2Message,
): DiscordComponentsV2Message {
  let markerAdded = false;
  const components: DiscordTopLevelComponent[] = [];
  for (const component of payload.components) {
    if (component.type === 12 || component.type === 13) continue;
    if (component.type !== 17) {
      components.push(component);
      continue;
    }
    const children = component.components.filter(
      (child) => child.type !== 12 && child.type !== 13,
    );
    const separatorIndex = children.findIndex((child) => child.type === 14);
    children.splice(
      separatorIndex < 0 ? children.length : separatorIndex,
      0,
      { type: 10, content: IMAGE_UNAVAILABLE_MARKER },
    );
    markerAdded = true;
    components.push({ ...component, components: children });
  }
  if (!markerAdded) {
    components.push({ type: 10, content: IMAGE_UNAVAILABLE_MARKER });
  }
  return { ...payload, components };
}

export function imageUnavailableLogArtifact(
  artifact: RollLogArtifact,
  reason: LogArtifactUnavailableReasonV1,
): RollLogArtifact {
  if (artifact.version === 2) {
    const validated = validateRollLogArtifact({
      ...artifact,
      payload: v2PayloadWithoutImage(artifact.payload),
      image: { status: "unavailable", reason },
    });
    if (validated.version !== 2) {
      throw new Error("Roll log artifact version changed unexpectedly");
    }
    return {
      version: 2,
      rollId: validated.rollId,
      source: validated.source,
      notation: validated.notation,
      user: validated.user,
      guildId: validated.guildId,
      channelId: validated.channelId,
      context: validated.context,
      destinationDeliveredAt: validated.destinationDeliveredAt,
      presentation: validated.presentation,
      payload: validated.payload,
      image: validated.image,
    };
  }

  const originalContent = artifact.payload.content;
  const markerFitsContent =
    originalContent !== undefined &&
    originalContent.length + 23 <= MAX_MESSAGE_CONTENT_LENGTH;
  let content = originalContent;
  if (content === undefined) content = IMAGE_UNAVAILABLE_MARKER;
  else if (markerFitsContent) content += `\n\n${IMAGE_UNAVAILABLE_MARKER}`;

  const embeds = artifact.payload.embeds
    ?.map((embed) => {
      const withoutImage = { ...embed };
      delete withoutImage.image;
      return withoutImage;
    })
    .filter((embed) => Object.keys(embed).length > 0) ?? [];
  if (originalContent !== undefined && !markerFitsContent) {
    embeds.push({ description: IMAGE_UNAVAILABLE_MARKER });
  }
  const payload: DiscordLegacyMessage = { content };
  if (embeds.length > 0) payload.embeds = embeds;

  const validated = validateRollLogArtifact({
    ...artifact,
    payload,
    image: { status: "unavailable", reason },
  });
  if (validated.version !== 1) {
    throw new Error("Roll log artifact version changed unexpectedly");
  }
  return {
    version: 1,
    rollId: validated.rollId,
    source: validated.source,
    notation: validated.notation,
    user: validated.user,
    guildId: validated.guildId,
    channelId: validated.channelId,
    context: validated.context,
    destinationDeliveredAt: validated.destinationDeliveredAt,
    payload: validated.payload,
    image: validated.image,
  };
}

type StoredLogArtifactResult = {
  artifact: StoredLogArtifact;
  identity: string;
  png: Uint8Array | null;
};

function storedV1Payload(payloadJsonValue: SchemaInput): DiscordLegacyMessage {
  return validatePayload(payloadJsonValue);
}

function storedV2Payload(
  payloadJsonValue: SchemaInput,
): DiscordComponentsV2Message {
  return validateV2Payload(payloadJsonValue);
}

export async function storedLogArtifact(
  artifact: ValidatedRollLogArtifact,
): Promise<StoredLogArtifactResult> {
  const { payloadJson: serializedPayload, ...value } = artifact;
  const image: StoredImageV1 =
    value.image.status === "available"
      ? {
          status: "available",
          filename: value.image.filename,
          sha256: await sha256(value.image.png),
          bytes: value.image.png.byteLength,
        }
      : value.image;
  const parsedPayload = z.json().parse(JSON.parse(serializedPayload));
  const stored: StoredLogArtifact =
    value.version === 2
      ? {
          ...value,
          payload: storedV2Payload(parsedPayload),
          image,
        }
      : {
          ...value,
          payload: storedV1Payload(parsedPayload),
          image,
        };
  return {
    artifact: stored,
    identity: JSON.stringify(stored),
    png: value.image.status === "available" ? value.image.png : null,
  };
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
