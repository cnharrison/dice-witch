import type { RenderResult } from "../../../packages/dice-svg/src";
import {
  isDiscordRollChannelType,
  type RollLoggingContext,
} from "../../../packages/discord-contracts/src";
import {
  MAX_NOTATION_LENGTH,
  parseNotationArgs,
  type RollExecutionResult,
} from "../../../packages/roll-domain/src";

const DISCORD_EPOCH_MS = 1_420_070_400_000;
const INTERACTION_TOKEN_LIFETIME_MS = 15 * 60 * 1_000;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const MAX_TITLE_LENGTH = 256;
const MAX_USERNAME_LENGTH = 32;
const MAX_RETRY_DELAY_MS = 60_000;

export type RollWorkRequest = {
  notation: string[];
  repetitions: number;
};

export type RollWorkRecord = {
  version: 1;
  request: RollWorkRequest;
  rollSeed: number;
  renderSeed: number;
  outcome: RollExecutionResult;
  createdAt: number;
};

export type RollDeliveryRequest = {
  interaction: {
    id: string;
    applicationId: string;
    token: string;
  };
  request: {
    notation: string;
    repetitions: number;
  };
  message: {
    title: string | null;
    username: string;
  };
  accounting: {
    guildId: string | null;
    userId: string;
    receivedAt: number;
  };
  logging: {
    source: "discord" | "web";
    channelId: string;
    notation: string;
    context?: RollLoggingContext;
  };
};

export type PrepareRollWorkResult =
  | { status: "created" | "existing"; record: RollWorkRecord }
  | { status: "conflict" };

export type RenderRollWorkResult =
  | ({ status: "rendered" } & RenderResult)
  | { status: "conflict" };

export type DeliverRollWorkResult =
  | { status: "delivered" | "failed" | "expired" | "conflict" }
  | { status: "pending"; retryAt: number };

export type AcceptRollDeliveryResult =
  | {
      status: "created" | "existing";
      delivery: "pending" | "delivered" | "failed";
      expiresAt: number;
    }
  | { status: "conflict" }
  | { status: "expired" };

export type RollDeliveryStatus =
  | { state: "missing" }
  | {
      state: "pending" | "delivered" | "failed";
      expiresAt: number;
      deliveredAt: number | null;
      lastHttpStatus: number | null;
      attempts: number;
    };

export type RollDeliveryDiagnostics =
  | { state: "missing" }
  | {
      state: "pending" | "delivered" | "failed";
      accountingState: StoredDeliveryRow["accounting_state"];
      accountingHttpStatus: number | null;
      accountingAttempts: number;
      loggingState: StoredDeliveryRow["logging_state"];
      loggingHttpStatus: number | null;
      loggingAttempts: number;
      helperState: StoredDeliveryRow["helper_state"];
      helperAttempts: number;
    };

export type StoredWorkRow = {
  request_json: string;
  record_json: string;
};

export type DeliveryMetadata = {
  interactionId: string;
  applicationId: string;
  message: RollDeliveryRequest["message"];
  accounting: RollDeliveryRequest["accounting"] | null;
  logging: RollDeliveryRequest["logging"] | null;
};

export type StoredDeliveryRow = {
  metadata_json: string;
  token: string | null;
  token_fingerprint: string;
  expires_at: number;
  state: "pending" | "delivered" | "failed";
  delivered_at: number | null;
  last_http_status: number | null;
  attempts: number;
  clatter_sent_at: number | null;
  skip_dice_delay: number | null;
  delay_ms: number | null;
  result_not_before: number | null;
  accounting_state: "pending" | "not_applicable" | "accounted" | "failed";
  accounting_occurred_at: number | null;
  accounting_http_status: number | null;
  accounting_attempts: number;
  logging_state: "pending" | "not_applicable" | "delivered" | "failed";
  logging_http_status: number | null;
  logging_attempts: number;
  helper_state: "pending" | "not_applicable" | "delivered" | "failed";
  helper_attempts: number;
};

type ValidatedRollDeliveryRequest = Omit<
  RollDeliveryRequest,
  "accounting" | "logging" | "request"
> & {
  request: RollWorkRequest;
  accounting: RollDeliveryRequest["accounting"] | null;
  logging: RollDeliveryRequest["logging"] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

function parseLoggingContext(
  value: unknown,
  guildId: string | null,
  channelId: string,
): RollLoggingContext {
  if (!isRecord(value) || value.channelId !== channelId) {
    throw new Error("Roll logging context is invalid");
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
    !hasExactKeys(value, [
      "channelId",
      "channelName",
      "channelType",
      "guildId",
      "guildName",
      "kind",
    ]) ||
    value.guildId !== guildId ||
    typeof value.guildName !== "string" ||
    value.guildName.length < 2 ||
    value.guildName.length > 100 ||
    typeof value.channelName !== "string" ||
    value.channelName.length < 1 ||
    value.channelName.length > 100 ||
    !isDiscordRollChannelType(value.channelType)
  ) {
    throw new Error("Roll logging context is invalid");
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

export function validateRequest(value: unknown): RollWorkRequest {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["notation", "repetitions"]) ||
    !Array.isArray(value.notation) ||
    !value.notation.every((item) => typeof item === "string") ||
    typeof value.repetitions !== "number"
  ) {
    throw new Error("Roll work request is invalid");
  }
  return {
    notation: [...value.notation],
    repetitions: value.repetitions,
  };
}

export function validateDeliveryRequest(
  value: unknown,
): ValidatedRollDeliveryRequest {
  if (!isRecord(value)) throw new Error("Roll delivery request is invalid");
  const hasLogging = hasExactKeys(value, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
  ]);
  const hasAccounting = hasExactKeys(value, [
    "accounting",
    "interaction",
    "message",
    "request",
  ]);
  const isLegacy = hasExactKeys(value, ["interaction", "message", "request"]);
  if (
    (!hasLogging && !hasAccounting && !isLegacy) ||
    !isRecord(value.interaction) ||
    !hasExactKeys(value.interaction, ["applicationId", "id", "token"]) ||
    !SNOWFLAKE.test(String(value.interaction.id)) ||
    !SNOWFLAKE.test(String(value.interaction.applicationId)) ||
    typeof value.interaction.token !== "string" ||
    !INTERACTION_TOKEN.test(value.interaction.token) ||
    !isRecord(value.request) ||
    !hasExactKeys(value.request, ["notation", "repetitions"]) ||
    typeof value.request.notation !== "string" ||
    typeof value.request.repetitions !== "number" ||
    !isRecord(value.message) ||
    !hasExactKeys(value.message, ["title", "username"]) ||
    (value.message.title !== null &&
      (typeof value.message.title !== "string" ||
        value.message.title.length === 0 ||
        value.message.title.length > MAX_TITLE_LENGTH)) ||
    typeof value.message.username !== "string" ||
    value.message.username.length === 0 ||
    value.message.username.length > MAX_USERNAME_LENGTH
  ) {
    throw new Error("Roll delivery request is invalid");
  }

  let accounting: RollDeliveryRequest["accounting"] | null = null;
  if (hasLogging || hasAccounting) {
    if (
      !isRecord(value.accounting) ||
      !hasExactKeys(value.accounting, ["guildId", "receivedAt", "userId"]) ||
      (value.accounting.guildId !== null &&
        (typeof value.accounting.guildId !== "string" ||
          !SNOWFLAKE.test(value.accounting.guildId))) ||
      typeof value.accounting.userId !== "string" ||
      !SNOWFLAKE.test(value.accounting.userId) ||
      !Number.isSafeInteger(value.accounting.receivedAt) ||
      Number(value.accounting.receivedAt) !==
        interactionCreatedAt(String(value.interaction.id))
    ) {
      throw new Error("Roll delivery request is invalid");
    }
    accounting = {
      guildId: value.accounting.guildId,
      userId: value.accounting.userId,
      receivedAt: Number(value.accounting.receivedAt),
    };
  }

  let logging: RollDeliveryRequest["logging"] | null = null;
  if (hasLogging) {
    if (
      !isRecord(value.logging) ||
      (!hasExactKeys(value.logging, ["channelId", "notation", "source"]) &&
        !hasExactKeys(value.logging, [
          "channelId",
          "context",
          "notation",
          "source",
        ])) ||
      (value.logging.source !== "discord" && value.logging.source !== "web") ||
      typeof value.logging.channelId !== "string" ||
      !SNOWFLAKE.test(value.logging.channelId) ||
      typeof value.logging.notation !== "string" ||
      value.logging.notation.length < 1 ||
      value.logging.notation.length > MAX_NOTATION_LENGTH
    ) {
      throw new Error("Roll delivery request is invalid");
    }
    logging = {
      source: value.logging.source,
      channelId: value.logging.channelId,
      notation: value.logging.notation,
      ...(value.logging.context === undefined
        ? {}
        : {
            context: parseLoggingContext(
              value.logging.context,
              accounting?.guildId ?? null,
              value.logging.channelId,
            ),
          }),
    };
  }

  return {
    interaction: {
      id: String(value.interaction.id),
      applicationId: String(value.interaction.applicationId),
      token: value.interaction.token,
    },
    request: validateRequest({
      notation: parseNotationArgs(value.request.notation),
      repetitions: value.request.repetitions,
    }),
    message: {
      title: value.message.title,
      username: value.message.username,
    },
    accounting,
    logging,
  };
}

export function parseRecord(value: string): RollWorkRecord {
  const parsed: unknown = JSON.parse(value);
  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    !isRecord(parsed.request) ||
    typeof parsed.rollSeed !== "number" ||
    typeof parsed.renderSeed !== "number" ||
    !isRecord(parsed.outcome) ||
    parsed.outcome.version !== 1 ||
    parsed.outcome.seed !== parsed.rollSeed ||
    typeof parsed.createdAt !== "number"
  ) {
    throw new Error("Stored roll work is invalid");
  }
  return parsed as RollWorkRecord;
}

export function interactionCreatedAt(interactionId: string): number {
  const createdAt = Number(
    (BigInt(interactionId) >> 22n) + BigInt(DISCORD_EPOCH_MS),
  );
  if (!Number.isSafeInteger(createdAt)) {
    throw new Error("Interaction timestamp is invalid");
  }
  return createdAt;
}

export function interactionExpiresAt(interactionId: string): number {
  return interactionCreatedAt(interactionId) + INTERACTION_TOKEN_LIFETIME_MS;
}

function deliveryMetadataIdentity(metadata: DeliveryMetadata): string {
  return JSON.stringify({
    interactionId: metadata.interactionId,
    applicationId: metadata.applicationId,
    message: metadata.message,
    accounting: metadata.accounting,
    logging:
      metadata.logging === null
        ? null
        : {
            source: metadata.logging.source,
            channelId: metadata.logging.channelId,
            notation: metadata.logging.notation,
          },
  });
}

export function mergeCompatibleDeliveryMetadata(
  existingJson: string,
  incomingJson: string,
): string | null {
  const existing = parseDeliveryMetadata(existingJson);
  const incoming = parseDeliveryMetadata(incomingJson);
  if (
    deliveryMetadataIdentity(existing) !== deliveryMetadataIdentity(incoming)
  ) {
    return null;
  }
  const existingContext = existing.logging?.context;
  const incomingContext = incoming.logging?.context;
  if (
    existingContext !== undefined &&
    incomingContext !== undefined &&
    JSON.stringify(existingContext) !== JSON.stringify(incomingContext)
  ) {
    return null;
  }
  return existingContext === undefined && incomingContext !== undefined
    ? incomingJson
    : existingJson;
}

export async function tokenFingerprint(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function deliveryMetadata(
  request: ValidatedRollDeliveryRequest,
): string {
  return JSON.stringify({
    version: request.logging?.context === undefined ? 3 : 4,
    interactionId: request.interaction.id,
    applicationId: request.interaction.applicationId,
    message: request.message,
    accounting: request.accounting,
    logging: request.logging,
  });
}

export function parseDeliveryMetadata(value: string): DeliveryMetadata {
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) {
    throw new Error("Stored roll delivery metadata is invalid");
  }
  const currentKeys = [
    "accounting",
    "applicationId",
    "interactionId",
    "logging",
    "message",
    "version",
  ];
  const version4 = parsed.version === 4 && hasExactKeys(parsed, currentKeys);
  const version3 = parsed.version === 3 && hasExactKeys(parsed, currentKeys);
  const version2 =
    parsed.version === 2 &&
    hasExactKeys(parsed, [
      "accounting",
      "applicationId",
      "interactionId",
      "message",
      "version",
    ]);
  const legacy =
    parsed.version === undefined &&
    hasExactKeys(parsed, ["applicationId", "interactionId", "message"]);
  if (
    (!version4 && !version3 && !version2 && !legacy) ||
    !SNOWFLAKE.test(String(parsed.interactionId)) ||
    !SNOWFLAKE.test(String(parsed.applicationId)) ||
    !isRecord(parsed.message) ||
    (parsed.message.title !== null && typeof parsed.message.title !== "string") ||
    typeof parsed.message.username !== "string" ||
    (parsed.accounting !== undefined &&
      parsed.accounting !== null &&
      (!isRecord(parsed.accounting) ||
        (parsed.accounting.guildId !== null &&
          (typeof parsed.accounting.guildId !== "string" ||
            !SNOWFLAKE.test(parsed.accounting.guildId))) ||
        typeof parsed.accounting.userId !== "string" ||
        !SNOWFLAKE.test(parsed.accounting.userId) ||
        !Number.isSafeInteger(parsed.accounting.receivedAt) ||
        Number(parsed.accounting.receivedAt) < 0)) ||
    (parsed.logging !== undefined &&
      parsed.logging !== null &&
      (!isRecord(parsed.logging) ||
        (parsed.logging.source !== "discord" &&
          parsed.logging.source !== "web") ||
        typeof parsed.logging.channelId !== "string" ||
        !SNOWFLAKE.test(parsed.logging.channelId) ||
        typeof parsed.logging.notation !== "string" ||
        parsed.logging.notation.length < 1 ||
        parsed.logging.notation.length > MAX_NOTATION_LENGTH ||
        (version4 && parsed.logging.context === undefined) ||
        (!version4 && parsed.logging.context !== undefined)))
  ) {
    throw new Error("Stored roll delivery metadata is invalid");
  }
  return {
    interactionId: String(parsed.interactionId),
    applicationId: String(parsed.applicationId),
    message: {
      title: parsed.message.title,
      username: parsed.message.username,
    },
    accounting:
      parsed.accounting === undefined || parsed.accounting === null
        ? null
        : {
            guildId: parsed.accounting.guildId as string | null,
            userId: parsed.accounting.userId as string,
            receivedAt: Number(parsed.accounting.receivedAt),
          },
    logging:
      parsed.logging === undefined || parsed.logging === null
        ? null
        : {
            source: parsed.logging.source as "discord" | "web",
            channelId: parsed.logging.channelId as string,
            notation: parsed.logging.notation as string,
            ...(version4
              ? {
                  context: parseLoggingContext(
                    parsed.logging.context,
                    parsed.accounting === null
                      ? null
                      : (parsed.accounting as { guildId: string | null }).guildId,
                    parsed.logging.channelId as string,
                  ),
                }
              : {}),
          },
  };
}

export function retryDelayMs(attempts: number): number {
  return Math.min(
    2 ** Math.min(Math.max(attempts - 1, 0), 6) * 1_000,
    MAX_RETRY_DELAY_MS,
  );
}

export function retryAfterMs(response: Response, attempts: number): number {
  const value = response.headers.get("retry-after");
  if (value !== null) {
    const milliseconds = Number(value) * 1_000;
    if (Number.isFinite(milliseconds) && milliseconds >= 0) return milliseconds;
  }
  return retryDelayMs(attempts);
}
