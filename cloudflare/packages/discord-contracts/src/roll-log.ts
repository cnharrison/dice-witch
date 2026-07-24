import { MAX_NOTATION_LENGTH } from "../../roll-domain/src/constants";
import type { DiscordEmbed, DiscordMessage } from "./responses";
import {
  isDiscordRollChannelType,
  type RollLoggingContext,
} from "./roll-interaction";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/i;
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

export type LogArtifactUnavailableReasonV1 =
  | "corrupt"
  | "discord-rejected"
  | "missing"
  | "not-applicable"
  | "oversized";

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

export type RollLogShardV1 =
  | { status: "not-applicable" }
  | { status: "unavailable" }
  | {
      status: "available";
      shardId: number;
      shardCount: number;
      generation: number;
    };

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
  payload: DiscordMessage;
  image: LogArtifactImageV1;
};

export type ValidatedRollLogArtifactV1 = RollLogArtifactV1 & {
  payloadJson: string;
};

export type StoredLogArtifactV1 = Omit<
  RollLogArtifactV1,
  "image" | "payload"
> & {
  payload: DiscordMessage;
  image:
    | { status: "available"; filename: string; sha256: string; bytes: number }
    | { status: "unavailable"; reason: LogArtifactUnavailableReasonV1 };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
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

function validateEmbed(value: unknown): DiscordEmbed {
  if (!isRecord(value)) throw new Error("Roll log artifact payload is invalid");
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some(
      (key) =>
        key !== "color" &&
        key !== "description" &&
        key !== "footer" &&
        key !== "image" &&
        key !== "title",
    ) ||
    (value.title !== undefined &&
      (typeof value.title !== "string" ||
        value.title.length < 1 ||
        value.title.length > MAX_EMBED_TITLE_LENGTH)) ||
    (value.description !== undefined &&
      (typeof value.description !== "string" ||
        value.description.length < 1 ||
        value.description.length > MAX_EMBED_DESCRIPTION_LENGTH)) ||
    (value.color !== undefined &&
      (typeof value.color !== "number" ||
        !Number.isInteger(value.color) ||
        value.color < 0 ||
        value.color > 0xff_ffff)) ||
    (value.footer !== undefined &&
      (!isRecord(value.footer) ||
        !hasExactKeys(value.footer, ["text"]) ||
        typeof value.footer.text !== "string" ||
        value.footer.text.length < 1 ||
        value.footer.text.length > MAX_EMBED_FOOTER_LENGTH)) ||
    (value.image !== undefined &&
      (!isRecord(value.image) ||
        !hasExactKeys(value.image, ["url"]) ||
        typeof value.image.url !== "string" ||
        !/^attachment:\/\/[A-Za-z0-9][A-Za-z0-9._-]{0,103}$/.test(
          value.image.url,
        )))
  ) {
    throw new Error("Roll log artifact payload is invalid");
  }
  return value;
}

function validatePayload(value: unknown): DiscordMessage {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== "content" && key !== "embeds") ||
    (value.content !== undefined &&
      (typeof value.content !== "string" ||
        value.content.length < 1 ||
        value.content.length > MAX_MESSAGE_CONTENT_LENGTH)) ||
    (value.embeds !== undefined &&
      (!Array.isArray(value.embeds) ||
        value.embeds.length < 1 ||
        value.embeds.length > MAX_EMBED_COUNT)) ||
    (value.content === undefined && value.embeds === undefined)
  ) {
    throw new Error("Roll log artifact payload is invalid");
  }
  return {
    ...(value.content === undefined ? {} : { content: value.content }),
    ...(value.embeds === undefined
      ? {}
      : { embeds: value.embeds.map(validateEmbed) }),
  };
}

function validateContext(
  value: unknown,
  guildId: string | null,
  channelId: string,
): RollLoggingContext | null {
  if (value === null) return null;
  if (!isRecord(value) || value.channelId !== channelId) {
    throw new Error("Roll log artifact context is invalid");
  }
  if (
    value.kind === "dm" &&
    guildId === null &&
    hasExactKeys(value, ["channelId", "kind"])
  ) {
    return { kind: "dm", channelId };
  }
  if (
    value.kind !== "guild" ||
    guildId === null ||
    value.guildId !== guildId ||
    !hasExactKeys(value, [
      "channelId",
      "channelName",
      "channelType",
      "guildId",
      "guildName",
      "kind",
    ]) ||
    typeof value.guildName !== "string" ||
    value.guildName.length < 2 ||
    value.guildName.length > 100 ||
    typeof value.channelName !== "string" ||
    value.channelName.length < 1 ||
    value.channelName.length > 100 ||
    !isDiscordRollChannelType(value.channelType)
  ) {
    throw new Error("Roll log artifact context is invalid");
  }
  return {
    kind: "guild",
    guildId,
    guildName: value.guildName,
    channelId,
    channelName: value.channelName,
    channelType: value.channelType,
  };
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

function rollLogLocation(artifact: RollLogArtifactV1): string {
  if (artifact.guildId === null) return "**DM**";
  if (artifact.context === null) {
    return "an **unavailable channel/server**";
  }
  if (artifact.context.kind !== "guild") {
    throw new Error("Roll log guild context is invalid");
  }
  const channelType = [10, 11, 12].includes(artifact.context.channelType)
    ? "thread"
    : "channel";
  return `${channelType} **${escapeDiscordMarkdown(artifact.context.channelName)}**\non **${escapeDiscordMarkdown(artifact.context.guildName)}**`;
}

function rollLogShardLabel(shard: RollLogShardV1): string | null {
  if (shard.status === "not-applicable") return null;
  if (shard.status === "unavailable") return "[Shard unavailable]";
  return `[Shard ${String(shard.shardId + 1)}]`;
}

export function rollLogMetadataDescription(
  artifact: RollLogArtifactV1,
  shard: RollLogShardV1,
  maximumLength = MAX_EMBED_DESCRIPTION_LENGTH,
): string {
  if (
    !Number.isSafeInteger(maximumLength) ||
    maximumLength < 1 ||
    maximumLength > MAX_EMBED_DESCRIPTION_LENGTH
  ) {
    throw new Error("Roll log metadata limit is invalid");
  }
  const shardLabel = rollLogShardLabel(shard);
  const shardSuffix = shardLabel === null ? "" : ` ${shardLabel}`;
  const suffix = `\nfrom **${escapeDiscordMarkdown(artifact.user.username)} [from ${artifact.source}]**\nin ${rollLogLocation(artifact)}${shardSuffix}`;
  const notation = escapeDiscordMarkdown(artifact.notation);
  const notationLimit = maximumLength - suffix.length;
  if (notationLimit < 2) {
    throw new Error("Roll log metadata suffix is too long");
  }
  const displayedNotation =
    notation.length <= notationLimit
      ? notation
      : `${notation.slice(0, notationLimit - 1)}…`;
  return `${displayedNotation}${suffix}`;
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

function validateImage(value: unknown): LogArtifactImageV1 {
  if (!isRecord(value)) throw new Error("Roll log artifact image is invalid");
  if (
    value.status === "available" &&
    hasExactKeys(value, ["filename", "png", "status"]) &&
    typeof value.filename === "string" &&
    PNG_FILENAME.test(value.filename) &&
    value.png instanceof Uint8Array &&
    value.png.byteLength >= PNG_SIGNATURE.length &&
    value.png.byteLength <= MAX_LOG_ARTIFACT_PNG_BYTES &&
    isPng(value.png)
  ) {
    return {
      status: "available",
      filename: value.filename,
      png: value.png.slice(),
    };
  }
  if (
    value.status === "unavailable" &&
    hasExactKeys(value, ["reason", "status"]) &&
    (value.reason === "corrupt" ||
      value.reason === "discord-rejected" ||
      value.reason === "missing" ||
      value.reason === "not-applicable" ||
      value.reason === "oversized")
  ) {
    return { status: "unavailable", reason: value.reason };
  }
  throw new Error("Roll log artifact image is invalid");
}

export function validateRollLogArtifact(
  value: unknown,
): ValidatedRollLogArtifactV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "channelId",
      "context",
      "destinationDeliveredAt",
      "guildId",
      "image",
      "notation",
      "payload",
      "rollId",
      "source",
      "user",
      "version",
    ]) ||
    value.version !== 1 ||
    typeof value.rollId !== "string" ||
    !SNOWFLAKE.test(value.rollId) ||
    (value.source !== "discord" && value.source !== "web") ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > MAX_NOTATION_LENGTH ||
    !isRecord(value.user) ||
    !hasExactKeys(value.user, ["id", "username"]) ||
    typeof value.user.id !== "string" ||
    !SNOWFLAKE.test(value.user.id) ||
    typeof value.user.username !== "string" ||
    value.user.username.length < 1 ||
    value.user.username.length > MAX_USERNAME_LENGTH ||
    (value.guildId !== null &&
      (typeof value.guildId !== "string" || !SNOWFLAKE.test(value.guildId))) ||
    typeof value.channelId !== "string" ||
    !SNOWFLAKE.test(value.channelId) ||
    !Number.isSafeInteger(value.destinationDeliveredAt) ||
    Number(value.destinationDeliveredAt) < 0
  ) {
    throw new Error("Roll log artifact is invalid");
  }

  const payload = validatePayload(value.payload);
  const payloadJson = JSON.stringify(payload);
  if (
    payloadJson.length === 0 ||
    new TextEncoder().encode(payloadJson).byteLength > MAX_ARTIFACT_JSON_BYTES
  ) {
    throw new Error("Roll log artifact payload is invalid");
  }
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
          !visibleText.some((text) => text.includes("**image unavailable**")))))
  ) {
    throw new Error("Roll log artifact payload does not match its image");
  }

  const context = validateContext(value.context, value.guildId, value.channelId);
  const artifact: RollLogArtifactV1 = {
    version: 1,
    rollId: value.rollId,
    source: value.source,
    notation: value.notation,
    user: { id: value.user.id, username: value.user.username },
    guildId: value.guildId,
    channelId: value.channelId,
    context,
    destinationDeliveredAt: Number(value.destinationDeliveredAt),
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

  return {
    ...artifact,
    payloadJson,
  };
}

export type DeliverRollLogInputV1 = {
  artifact: RollLogArtifactV1;
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

export function imageUnavailableLogArtifact(
  artifact: RollLogArtifactV1,
  reason: LogArtifactUnavailableReasonV1,
): RollLogArtifactV1 {
  const originalContent = artifact.payload.content;
  const markerFitsContent =
    originalContent !== undefined &&
    originalContent.length + 23 <= MAX_MESSAGE_CONTENT_LENGTH;
  let content = originalContent;
  if (content === undefined) content = IMAGE_UNAVAILABLE_MARKER;
  else if (markerFitsContent) content += `\n\n${IMAGE_UNAVAILABLE_MARKER}`;

  const payload: DiscordMessage = {
    content,
    embeds: [
      ...(artifact.payload.embeds
        ?.map((embed) => {
          const withoutImage = { ...embed };
          delete withoutImage.image;
          return withoutImage;
        })
        .filter((embed) => Object.keys(embed).length > 0) ?? []),
      ...(originalContent !== undefined && !markerFitsContent
        ? [{ description: IMAGE_UNAVAILABLE_MARKER }]
        : []),
    ],
  };
  if (payload.embeds?.length === 0) delete payload.embeds;
  const validated = validateRollLogArtifact({
    ...artifact,
    payload,
    image: { status: "unavailable", reason },
  });
  return {
    version: validated.version,
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

export async function storedLogArtifact(
  artifact: ValidatedRollLogArtifactV1,
): Promise<{
  artifact: StoredLogArtifactV1;
  identity: string;
  png: Uint8Array | null;
}> {
  const { payloadJson, ...value } = artifact;
  const image =
    value.image.status === "available"
      ? {
          status: "available" as const,
          filename: value.image.filename,
          sha256: await sha256(value.image.png),
          bytes: value.image.png.byteLength,
        }
      : value.image;
  const stored: StoredLogArtifactV1 = {
    ...value,
    payload: JSON.parse(payloadJson) as DiscordMessage,
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
