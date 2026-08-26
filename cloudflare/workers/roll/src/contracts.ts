import {
  validateRenderRequestV4,
  type IconNameV4,
  type RenderDieV4,
  type RenderRequestV4,
} from "@dice-witch/dice-v4-model";
import { z } from "zod";
import {
  validateRenderRequestV2,
  validateRenderRequestV3,
  type RenderRequestV2,
  type RenderRequestV3,
  type RenderResult,
  type RenderResultV2,
  type RenderResultV3,
} from "../../../packages/dice-svg/src";
import type { RenderedDiceRequestV4 } from "../../../packages/dice-canvaskit/src";
import {
  parseRollLoggingContext,
  type RollDeliveryTelemetryV2,
  type RollLoggingContext,
} from "../../../packages/discord-contracts/src";
import {
  interactionTokenSchema,
  nonNegativeSafeIntegerSchema,
  safeIntegerSchema,
  type SchemaInput,
  seedSchema,
  snowflakeSchema,
} from "../../../packages/discord-contracts/src/schema-primitives";
import { renderedRollFaceV4 } from "../../../packages/roll-render-model/src";
import { parseSavedRollNameColorV2 } from "../../../packages/saved-rolls/src";
import type { RollViewPolicy } from "./render-version";
import {
  MAX_DIE_SIDES,
  MAX_NOTATION_EXPRESSIONS,
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
  parseNotationArgs,
  renderableRollOutcomes,
  type RollDie,
  type RollExecutionResult,
} from "../../../packages/roll-domain/src";

const DISCORD_EPOCH_MS = 1_420_070_400_000;
const INTERACTION_TOKEN_LIFETIME_MS = 15 * 60 * 1_000;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_TITLE_LENGTH = 256;
const MAX_USERNAME_LENGTH = 32;
const MAX_RETRY_DELAY_MS = 60_000;

export type RollWorkRequest = {
  notation: string[];
  repetitions: number;
};

type RollWorkRecordBase = {
  request: RollWorkRequest;
  rollSeed: number;
  renderSeed: number;
  outcome: RollExecutionResult;
  createdAt: number;
};

export type RollWorkRecordV1 = RollWorkRecordBase & {
  version: 1;
};

export type RollWorkRecordV2 = RollWorkRecordBase & {
  version: 2;
  renderRequest: RenderRequestV2 | null;
};

export type RollWorkRecordV3 = RollWorkRecordBase & {
  version: 3;
  renderRequest: RenderRequestV3 | null;
};

export type RollWorkRecordV4 = RollWorkRecordBase & {
  version: 4;
  renderRequest: RenderRequestV4 | null;
};

// V5 keeps roll identity durable while the immutable appearance snapshot is
// prepared during delivery. A null renderRequest is the only pending state.
export type RollWorkRecordV5 =
  | (RollWorkRecordBase & {
      version: 5;
      renderVersion: 3;
      renderRequest: RenderRequestV3 | null;
    })
  | (RollWorkRecordBase & {
      version: 5;
      renderVersion: 4;
      viewPolicy?: RollViewPolicy;
      renderRequest: RenderRequestV4 | null;
    });

export type RollWorkRecord =
  | RollWorkRecordV1
  | RollWorkRecordV2
  | RollWorkRecordV3
  | RollWorkRecordV4
  | RollWorkRecordV5;

export type RenderResultV4 = RenderedDiceRequestV4 & { version: 4 };

export type SavedRollInvocationV1 = {
  version: 1;
  id: string;
  scope: "personal" | "guild";
  name: string;
  notation: string;
  title: string | null;
  repetitions: number;
  revision: number;
  nameColor: string | null;
};

export type RollDeliveryResponseMode =
  | "channel-message"
  | "edit-original"
  | "followup";

export type RollDeliverySettings = {
  skipDiceDelay: boolean;
  hideRollResultText: boolean;
};

type LegacyRollDeliverySettings = Pick<
  RollDeliverySettings,
  "skipDiceDelay"
>;

type ParsedRollDeliverySettings = {
  skipDiceDelay: boolean;
  hideRollResultText: boolean | null;
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
  deferredAt?: number;
  rollSeed?: number;
  renderSeed?: number;
  clatter?: { deliveredAt: number };
  settings?: LegacyRollDeliverySettings | RollDeliverySettings;
  telemetry?: RollDeliveryTelemetryV2;
  logging: {
    source: "discord" | "web";
    channelId: string;
    notation: string;
    context?: RollLoggingContext;
  };
  responseMode?: RollDeliveryResponseMode;
  savedRoll?: SavedRollInvocationV1;
};

export type PrepareRollWorkResult =
  | { status: "created" | "existing"; record: RollWorkRecord }
  | { status: "conflict" };

export type RenderRollWorkResult =
  | ({ status: "rendered" } &
      (RenderResult | RenderResultV2 | RenderResultV3 | RenderResultV4))
  | { status: "conflict" };

export type DeliverRollWorkResult =
  | {
      status:
        | "delivered"
        | "failed"
        | "expired"
        | "conflict"
        | "unavailable";
    }
  | { status: "pending"; retryAt: number };

export type AcceptRollDeliveryResult =
  | {
      status: "created" | "existing";
      delivery: "pending" | "delivered" | "failed";
      expiresAt: number;
    }
  | { status: "conflict" }
  | { status: "unavailable" }
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

export type RollDeliveryFailurePhase =
  | "record"
  | "render"
  | "response"
  | "deadline";

export type RollDeliveryDiagnostics =
  | { state: "missing" }
  | {
      state: "pending" | "delivered" | "failed";
      failurePhase: RollDeliveryFailurePhase | null;
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
  preflighted: boolean;
  responseMode: RollDeliveryResponseMode;
  savedRoll: SavedRollInvocationV1 | null;
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
  followup_message_id: string | null;
  skip_dice_delay: number | null;
  hide_roll_result_text: number | null;
  delay_ms: number | null;
  result_not_before: number | null;
  snapshot_ms: number | null;
  settings_ms: number | null;
  clatter_post_ms: number | null;
  lifecycle_sync_ms: number | null;
  accounting_ms: number | null;
  accounting_state: "pending" | "not_applicable" | "accounted" | "failed";
  accounting_occurred_at: number | null;
  accounting_http_status: number | null;
  accounting_attempts: number;
  logging_state: "pending" | "not_applicable" | "delivered" | "failed";
  logging_http_status: number | null;
  logging_attempts: number;
  helper_state: "pending" | "not_applicable" | "delivered" | "failed";
  helper_attempts: number;
  failure_phase: RollDeliveryFailurePhase | null;
};

type ValidatedRollDeliveryRequest = Omit<
  RollDeliveryRequest,
  | "accounting"
  | "clatter"
  | "deferredAt"
  | "logging"
  | "renderSeed"
  | "request"
  | "responseMode"
  | "rollSeed"
  | "savedRoll"
  | "settings"
  | "telemetry"
> & {
  request: RollWorkRequest;
  accounting: RollDeliveryRequest["accounting"] | null;
  deferredAt: number;
  rollSeed: number | null;
  telemetry: RollDeliveryTelemetryV2 | null;
  logging: RollDeliveryRequest["logging"] | null;
  responseMode: RollDeliveryResponseMode;
  savedRoll: SavedRollInvocationV1 | null;
  settings: ParsedRollDeliverySettings | null;
  renderSeed: number | null;
  clatter: { deliveredAt: number } | null;
};

const NumberValueSchema = z.union([
  z.number(),
  z.nan(),
  z.literal(Infinity),
  z.literal(-Infinity),
]);
const RollWorkRequestSchema = z.strictObject({
  notation: z.array(z.string()),
  repetitions: NumberValueSchema,
});
const CoercedSnowflakeSchema = z.coerce.string().regex(SNOWFLAKE);
const SavedRollInvocationSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().regex(UUID_V4),
  scope: z.enum(["personal", "guild"]),
  name: z.string().min(1).max(1024),
  nameColor: z.unknown().optional(),
  notation: z.string().min(1).max(MAX_NOTATION_LENGTH),
  title: z.nullable(z.string().min(1).max(MAX_TITLE_LENGTH)),
  repetitions: safeIntegerSchema.min(1).max(MAX_REPETITIONS),
  revision: safeIntegerSchema.min(1),
});
const RollDeliveryEnvelopeSchema = z.strictObject({
  interaction: z.strictObject({
    id: CoercedSnowflakeSchema,
    applicationId: CoercedSnowflakeSchema,
    token: interactionTokenSchema,
  }),
  request: z.strictObject({
    notation: z.string(),
    repetitions: NumberValueSchema,
  }),
  message: z.strictObject({
    title: z.nullable(z.string().min(1).max(MAX_TITLE_LENGTH)),
    username: z.string().min(1).max(MAX_USERNAME_LENGTH),
  }),
  accounting: z.unknown().optional(),
  deferredAt: z.unknown().optional(),
  rollSeed: z.unknown().optional(),
  renderSeed: z.unknown().optional(),
  clatter: z.unknown().optional(),
  settings: z.unknown().optional(),
  telemetry: z.unknown().optional(),
  logging: z.unknown().optional(),
  responseMode: z.unknown().optional(),
  savedRoll: z.unknown().optional(),
});
const RollDeliveryAccountingSchema = z.strictObject({
  guildId: z.nullable(snowflakeSchema),
  userId: snowflakeSchema,
  receivedAt: safeIntegerSchema,
});
const RollDeliveryTelemetrySchema = z.strictObject({
  version: z.literal(2),
  handlerStartedAt: safeIntegerSchema,
  acknowledgementPreparedAt: safeIntegerSchema,
  acknowledgementType: z.union([z.literal(4), z.literal(5), z.literal(6)]),
});
const LegacyDeliverySettingsSchema = z.strictObject({
  skipDiceDelay: z.boolean(),
});
const CurrentDeliverySettingsSchema = z.strictObject({
  skipDiceDelay: z.boolean(),
  hideRollResultText: z.boolean(),
});
const RollDeliverySettingsSchema = z.union([
  CurrentDeliverySettingsSchema,
  LegacyDeliverySettingsSchema,
]);
const RollDeliveryClatterSchema = z.strictObject({
  deliveredAt: safeIntegerSchema.positive(),
});
const RollDeliveryLoggingSchema = z.strictObject({
  source: z.enum(["discord", "web"]),
  channelId: snowflakeSchema,
  notation: z.string().min(1).max(MAX_NOTATION_LENGTH),
  context: z.unknown().optional(),
});
const RollDeliveryResponseModeSchema = z.enum([
  "channel-message",
  "edit-original",
  "followup",
]);

type RollDeliveryEnvelope = z.output<typeof RollDeliveryEnvelopeSchema>;
type DeliveryEnvelopeKey = keyof RollDeliveryEnvelope;

const ADDITIVE_DELIVERY_KEYS: ReadonlySet<string> = new Set([
  "deferredAt",
  "telemetry",
  "settings",
  "renderSeed",
  "clatter",
]);

function hasDeliveryKeys(
  delivery: RollDeliveryEnvelope,
  expected: readonly DeliveryEnvelopeKey[],
): boolean {
  const actual = Object.keys(delivery)
    .filter((key) => !ADDITIVE_DELIVERY_KEYS.has(key))
    .sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

export function validateRequest(value: SchemaInput): RollWorkRequest {
  const result = RollWorkRequestSchema.safeParse(value);
  if (!result.success) throw new Error("Roll work request is invalid");
  return result.data;
}

function parseSavedRollInvocation(
  value: SchemaInput,
): SavedRollInvocationV1 {
  const result = SavedRollInvocationSchema.safeParse(value);
  if (!result.success) throw new Error("Saved roll invocation is invalid");
  return {
    version: 1,
    id: result.data.id,
    scope: result.data.scope,
    name: result.data.name,
    notation: result.data.notation,
    title: result.data.title,
    repetitions: result.data.repetitions,
    revision: result.data.revision,
    nameColor: parseSavedRollNameColorV2(result.data.nameColor ?? null),
  };
}

export function validateDeliveryRequest(
  value: SchemaInput,
): ValidatedRollDeliveryRequest {
  const envelope = RollDeliveryEnvelopeSchema.safeParse(value);
  if (!envelope.success) throw new Error("Roll delivery request is invalid");
  const delivery = envelope.data;
  const hasDeferredAt = Object.hasOwn(delivery, "deferredAt");
  const hasTelemetry = Object.hasOwn(delivery, "telemetry");
  const hasSettings = Object.hasOwn(delivery, "settings");
  const hasRenderSeed = Object.hasOwn(delivery, "renderSeed");
  const hasClatter = Object.hasOwn(delivery, "clatter");
  const hasPreflightedDirectRoll = hasDeliveryKeys(delivery, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
    "rollSeed",
  ]);
  const hasSavedRoll = hasDeliveryKeys(delivery, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
    "responseMode",
    "savedRoll",
  ]);
  const hasLegacyPrivateDirectRoll = hasDeliveryKeys(delivery, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
    "responseMode",
  ]);
  const hasLogging = hasDeliveryKeys(delivery, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
  ]);
  const hasAccounting = hasDeliveryKeys(delivery, [
    "accounting",
    "interaction",
    "message",
    "request",
  ]);
  const isLegacy = hasDeliveryKeys(delivery, [
    "interaction",
    "message",
    "request",
  ]);
  if (
    !hasPreflightedDirectRoll &&
    !hasSavedRoll &&
    !hasLegacyPrivateDirectRoll &&
    !hasLogging &&
    !hasAccounting &&
    !isLegacy
  ) {
    throw new Error("Roll delivery request is invalid");
  }

  let accounting: RollDeliveryRequest["accounting"] | null = null;
  if (
    hasPreflightedDirectRoll ||
    hasSavedRoll ||
    hasLegacyPrivateDirectRoll ||
    hasLogging ||
    hasAccounting
  ) {
    const result = RollDeliveryAccountingSchema.safeParse(delivery.accounting);
    if (
      !result.success ||
      result.data.receivedAt !== interactionCreatedAt(delivery.interaction.id)
    ) {
      throw new Error("Roll delivery request is invalid");
    }
    accounting = result.data;
  }

  const receivedAt = accounting?.receivedAt ??
    interactionCreatedAt(delivery.interaction.id);
  const deferred = safeIntegerSchema.safeParse(
    hasDeferredAt ? delivery.deferredAt : receivedAt,
  );
  if (!deferred.success || deferred.data < receivedAt) {
    throw new Error("Roll delivery deferred timestamp is invalid");
  }
  const deferredAt = deferred.data;

  let telemetry: RollDeliveryTelemetryV2 | null = null;
  if (hasTelemetry) {
    const result = RollDeliveryTelemetrySchema.safeParse(delivery.telemetry);
    if (
      accounting === null ||
      !result.success ||
      result.data.handlerStartedAt < accounting.receivedAt ||
      result.data.handlerStartedAt > deferredAt ||
      result.data.acknowledgementPreparedAt < deferredAt
    ) {
      throw new Error("Roll delivery telemetry is invalid");
    }
    telemetry = result.data;
  }

  let rollSeed: number | null = null;
  if (hasPreflightedDirectRoll) {
    const result = seedSchema.safeParse(delivery.rollSeed);
    if (!result.success) throw new Error("Roll delivery seed is invalid");
    rollSeed = result.data;
  }

  let settings: ParsedRollDeliverySettings | null = null;
  if (hasSettings) {
    const result = RollDeliverySettingsSchema.safeParse(delivery.settings);
    if (!result.success) {
      throw new Error("Roll delivery settings are invalid");
    }
    settings = {
      skipDiceDelay: result.data.skipDiceDelay,
      hideRollResultText: "hideRollResultText" in result.data
        ? result.data.hideRollResultText
        : null,
    };
  }

  let renderSeed: number | null = null;
  if (hasRenderSeed) {
    const result = seedSchema.safeParse(delivery.renderSeed);
    if (!result.success) {
      throw new Error("Roll delivery render seed is invalid");
    }
    renderSeed = result.data;
  }

  let clatter: { deliveredAt: number } | null = null;
  if (hasClatter) {
    const result = RollDeliveryClatterSchema.safeParse(delivery.clatter);
    if (!result.success) throw new Error("Roll delivery clatter is invalid");
    if (renderSeed === null) {
      throw new Error("Roll delivery clatter has no render seed");
    }
    clatter = result.data;
  }

  let logging: RollDeliveryRequest["logging"] | null = null;
  if (
    hasPreflightedDirectRoll ||
    hasSavedRoll ||
    hasLegacyPrivateDirectRoll ||
    hasLogging
  ) {
    const result = RollDeliveryLoggingSchema.safeParse(delivery.logging);
    if (!result.success) throw new Error("Roll delivery request is invalid");
    logging = {
      source: result.data.source,
      channelId: result.data.channelId,
      notation: result.data.notation,
    };
    if (result.data.context !== undefined) {
      logging.context = parseRollLoggingContext(
        result.data.context,
        accounting?.guildId ?? null,
        result.data.channelId,
      );
    }
  }

  const parsedResponseMode = RollDeliveryResponseModeSchema.safeParse(
    delivery.responseMode,
  );
  if (
    (hasPreflightedDirectRoll && logging?.source !== "discord") ||
    (hasLegacyPrivateDirectRoll && logging?.source !== "discord") ||
    (hasLegacyPrivateDirectRoll &&
      (!parsedResponseMode.success || parsedResponseMode.data !== "followup")) ||
    (hasSavedRoll && !parsedResponseMode.success)
  ) {
    throw new Error("Roll delivery response mode is invalid");
  }
  let responseMode: RollDeliveryResponseMode = "edit-original";
  if (hasSavedRoll || hasLegacyPrivateDirectRoll) {
    if (!parsedResponseMode.success) {
      throw new Error("Roll delivery response mode is invalid");
    }
    responseMode = parsedResponseMode.data;
  }

  let savedRoll: SavedRollInvocationV1 | null = null;
  if (hasSavedRoll) {
    savedRoll = parseSavedRollInvocation(delivery.savedRoll);
    if (
      savedRoll.notation !== delivery.request.notation ||
      savedRoll.title !== delivery.message.title ||
      savedRoll.repetitions !== delivery.request.repetitions ||
      (savedRoll.scope === "guild" &&
        (accounting === null || accounting.guildId === null)) ||
      logging?.source !== "discord"
    ) {
      throw new Error("Saved roll delivery does not match its invocation");
    }
  }

  return {
    interaction: delivery.interaction,
    request: {
      notation: parseNotationArgs(delivery.request.notation),
      repetitions: delivery.request.repetitions,
    },
    message: delivery.message,
    accounting,
    deferredAt,
    rollSeed,
    telemetry,
    logging,
    responseMode,
    savedRoll,
    settings,
    renderSeed,
    clatter,
  };
}

function validateRenderSnapshot(
  renderRequest: RenderRequestV2 | RenderRequestV3 | RenderRequestV4,
  outcome: RollExecutionResult,
): void {
  const renderableOutcomes = renderableRollOutcomes(outcome);
  if (
    renderRequest.groups.length !== renderableOutcomes.length ||
    renderRequest.groups.some(
      (group, index) =>
        group.length !== renderableOutcomes[index]?.outcome.dice.length,
    )
  ) {
    throw new Error("Stored roll work render snapshot does not match outcome");
  }
}

function validateStoredRequestV4(request: RollWorkRequest): void {
  const notationLength = request.notation.reduce(
    (length, value) => length + value.length,
    Math.max(0, request.notation.length - 1),
  );
  if (
    request.notation.length > MAX_NOTATION_EXPRESSIONS ||
    notationLength > MAX_NOTATION_LENGTH ||
    !Number.isSafeInteger(request.repetitions) ||
    request.repetitions <= 0 ||
    request.repetitions > MAX_REPETITIONS
  ) {
    throw new Error("Stored roll work is invalid");
  }
}

const StoredRollDieFields = {
  sides: z.union([
    safeIntegerSchema.min(1).max(MAX_DIE_SIDES),
    z.literal("%"),
    z.literal("F"),
  ]),
  rolled: safeIntegerSchema,
  modifiers: z.array(z.string()),
};
const StoredAppearanceIdentityFields = {
  appearanceGroupIdentity: z.string().min(1).max(256),
  appearanceDieIdentity: z.string().min(1).max(512),
};
const StoredRollDieSchema = z.union([
  z.strictObject(StoredRollDieFields),
  z.strictObject({
    ...StoredRollDieFields,
    physicalFace: safeIntegerSchema,
  }),
  z.strictObject({
    ...StoredRollDieFields,
    ...StoredAppearanceIdentityFields,
  }),
  z.strictObject({
    ...StoredRollDieFields,
    physicalFace: safeIntegerSchema,
    ...StoredAppearanceIdentityFields,
  }),
]);
const StoredRollOutcomeSchema = z.strictObject({
  notation: z.string(),
  output: z.string(),
  total: z.number(),
  dice: z.array(StoredRollDieSchema),
});
const StoredRollExecutionErrorSchema = z.discriminatedUnion("code", [
  z.strictObject({
    code: z.enum([
      "INVALID_NOTATION",
      "NON_FINITE_TOTAL",
      "TOTAL_TOO_LARGE",
    ]),
    notation: z.string(),
  }),
  z.strictObject({
    code: z.enum([
      "TOO_MANY_DICE",
      "TOO_MANY_SIDES",
      "UNSAFE_EXPLOSION",
      "NO_DICE",
    ]),
    message: z.string(),
  }),
]);
const StoredRollExecutionResultSchema = z.strictObject({
  version: z.literal(1),
  seed: seedSchema,
  outcomes: z.array(StoredRollOutcomeSchema),
  errors: z.array(StoredRollExecutionErrorSchema),
});

function hasValidStoredFace(die: RollDie): boolean {
  const { rolled, physicalFace } = die;
  if (die.sides === "F") {
    if (
      physicalFace !== undefined &&
      (physicalFace < -1 || physicalFace > 1)
    ) {
      return false;
    }
    return (rolled >= -1 && rolled <= 1) || physicalFace !== undefined;
  }
  if (die.sides === "%") {
    if (
      physicalFace !== undefined &&
      (physicalFace < 0 || physicalFace > 90 || physicalFace % 10 !== 0)
    ) {
      return false;
    }
    return (
      (rolled >= 0 && rolled <= 90 && rolled % 10 === 0) ||
      physicalFace !== undefined
    );
  }
  if (
    physicalFace !== undefined &&
    (physicalFace < 1 || physicalFace > die.sides)
  ) {
    return false;
  }
  return (
    (rolled >= (die.sides === 10 ? 0 : 1) && rolled <= die.sides) ||
    physicalFace !== undefined
  );
}

function parseStoredOutcome(value: SchemaInput): RollExecutionResult {
  const result = StoredRollExecutionResultSchema.safeParse(value);
  if (
    !result.success ||
    result.data.outcomes.some((outcome) =>
      outcome.dice.some((die) => !hasValidStoredFace(die))
    )
  ) {
    throw new Error("Stored roll work is invalid");
  }
  return result.data;
}

function normalizedStoredNotation(value: string): string {
  return value.toLowerCase().replace(/df/g, "dF");
}

function validateStoredOutcomeV4(
  value: RollExecutionResult,
  request: RollWorkRequest,
  rollSeed: number,
): void {
  if (value.seed !== rollSeed) throw new Error("Stored roll work is invalid");

  const remainingNotation = new Map<string, number>();
  for (const notation of request.notation) {
    const normalized = normalizedStoredNotation(notation);
    remainingNotation.set(
      normalized,
      (remainingNotation.get(normalized) ?? 0) + request.repetitions,
    );
  }
  const consumeNotation = (notation: string): void => {
    const remaining = remainingNotation.get(notation) ?? 0;
    if (remaining === 0) throw new Error("Stored roll work is invalid");
    remainingNotation.set(notation, remaining - 1);
  };

  for (const outcome of value.outcomes) consumeNotation(outcome.notation);

  let terminalErrorCount = 0;
  for (const error of value.errors) {
    if ("notation" in error) {
      consumeNotation(error.notation);
      continue;
    }
    terminalErrorCount += 1;
  }

  const hasUnconsumedNotation = [...remainingNotation.values()].some(
    (remaining) => remaining !== 0,
  );
  if (
    terminalErrorCount > 1 ||
    (terminalErrorCount === 1
      ? value.outcomes.length !== 0 || value.errors.length !== 1
      : hasUnconsumedNotation)
  ) {
    throw new Error("Stored roll work is invalid");
  }
}

const TARGET_BY_SIDES_V4: Readonly<
  Partial<Record<number, RenderDieV4["target"]>>
> = Object.freeze({
  4: "d4",
  6: "d6",
  8: "d8",
  10: "d10",
  12: "d12",
  20: "d20",
});

function renderTargetForRollDieV4(die: RollDie): RenderDieV4["target"] {
  if (die.sides === "%") return "percentile";
  if (die.sides === "F") return "fudge";
  return TARGET_BY_SIDES_V4[die.sides] ?? "other";
}

function modifierIconsForRollDieV4(
  modifiers: readonly string[],
): IconNameV4[] {
  const modifierSet = new Set(modifiers);
  const icons: IconNameV4[] = [];
  if (modifierSet.has("drop")) icons.push("trashcan");
  if (modifierSet.has("penetrate")) icons.push("penetrate");
  else if (modifierSet.has("explode")) icons.push("explosion");
  if (modifierSet.has("critical-success")) icons.push("critical-success");
  if (modifierSet.has("critical-failure")) icons.push("critical-failure");
  if (modifierSet.has("target-success")) icons.push("target-success");
  if (
    modifierSet.has("re-roll") ||
    modifierSet.has("re-roll-once") ||
    modifierSet.has("reroll")
  ) {
    icons.push("recycle");
  }
  if (modifierSet.has("min")) icons.push("chevronUp");
  if (modifierSet.has("max")) icons.push("chevronDown");
  if (modifierSet.has("unique")) icons.push("unique");
  return icons.length <= 3 ? icons : [];
}

function validateRenderSnapshotV4(
  renderRequest: RenderRequestV4,
  outcome: RollExecutionResult,
): void {
  validateRenderSnapshot(renderRequest, outcome);
  const renderableOutcomes = renderableRollOutcomes(outcome);
  for (const [groupIndex, group] of renderRequest.groups.entries()) {
    const rollGroup = renderableOutcomes[groupIndex]?.outcome;
    if (rollGroup === undefined) {
      throw new Error("Stored roll work render snapshot does not match outcome");
    }
    for (const [dieIndex, renderDie] of group.entries()) {
      const rollDie = rollGroup.dice[dieIndex];
      if (rollDie === undefined) {
        throw new Error("Stored roll work render snapshot does not match outcome");
      }
      const target = renderTargetForRollDieV4(rollDie);
      const expectedIcons = modifierIconsForRollDieV4(rollDie.modifiers);
      const invalidFaceLabelSet =
        renderDie.target === "d10" &&
        renderDie.faceLabelSet !== undefined &&
        !rollDie.appearanceDieIdentity?.endsWith(":ones");
      if (
        renderDie.target !== target ||
        renderDie.result !== renderedRollFaceV4(rollDie) ||
        invalidFaceLabelSet ||
        (target === "other" &&
          (renderDie.target !== "other" || renderDie.sides !== rollDie.sides)) ||
        renderDie.icons.length !== expectedIcons.length ||
        renderDie.icons.some((icon, index) => icon !== expectedIcons[index])
      ) {
        throw new Error("Stored roll work render snapshot does not match outcome");
      }
    }
  }
}

const StoredRecordCommonFields = {
  request: z.unknown(),
  rollSeed: seedSchema,
  renderSeed: seedSchema,
  outcome: z.unknown(),
  createdAt: nonNegativeSafeIntegerSchema,
};
const StoredRecordEnvelopeSchema = z.looseObject({
  version: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  ...StoredRecordCommonFields,
});
const StoredSnapshotRecordSchema = z.strictObject({
  version: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  ...StoredRecordCommonFields,
  renderRequest: z.unknown(),
});
const StoredRollViewPolicySchema = z.enum([
  "r19",
  "r20",
  "r21",
  "r22",
  "r23",
  "r24",
  "r25",
  "r26",
  "r27",
  "r28",
  "r29",
  "r30",
  "r31",
  "r32",
  "r33",
  "r34",
  "r35",
  "r36",
  "r37",
  "r38",
  "r39",
  "r40",
  "r41",
]);
const StoredV5RecordSchema = z.union([
  z.strictObject({
    version: z.literal(5),
    ...StoredRecordCommonFields,
    renderVersion: z.literal(3),
    renderRequest: z.unknown(),
  }),
  z.strictObject({
    version: z.literal(5),
    ...StoredRecordCommonFields,
    renderVersion: z.literal(4),
    renderRequest: z.unknown(),
  }),
  z.strictObject({
    version: z.literal(5),
    ...StoredRecordCommonFields,
    renderVersion: z.literal(4),
    viewPolicy: StoredRollViewPolicySchema,
    renderRequest: z.unknown(),
  }),
]);

export function parseRecord(value: string): RollWorkRecord {
  const input: SchemaInput = JSON.parse(value);
  const envelope = StoredRecordEnvelopeSchema.safeParse(input);
  if (!envelope.success) throw new Error("Stored roll work is invalid");

  const request = validateRequest(envelope.data.request);
  const outcome = parseStoredOutcome(envelope.data.outcome);
  if (outcome.seed !== envelope.data.rollSeed) {
    throw new Error("Stored roll work is invalid");
  }
  const common: RollWorkRecordBase = {
    request,
    rollSeed: envelope.data.rollSeed,
    renderSeed: envelope.data.renderSeed,
    outcome,
    createdAt: envelope.data.createdAt,
  };
  if (envelope.data.version === 1) return { version: 1, ...common };

  if (envelope.data.version === 5) {
    const stored = StoredV5RecordSchema.safeParse(input);
    if (!stored.success || common.outcome.outcomes.length === 0) {
      throw new Error("Stored roll work is invalid");
    }
    if (stored.data.renderVersion === 4) {
      validateStoredRequestV4(request);
      validateStoredOutcomeV4(outcome, request, common.rollSeed);
    }
    if (stored.data.renderRequest === null) {
      if (stored.data.renderVersion === 3) {
        return { version: 5, renderVersion: 3, ...common, renderRequest: null };
      }
      if ("viewPolicy" in stored.data) {
        return {
          version: 5,
          renderVersion: 4,
          viewPolicy: stored.data.viewPolicy,
          ...common,
          renderRequest: null,
        };
      }
      return {
        version: 5,
        renderVersion: 4,
        ...common,
        renderRequest: null,
      };
    }
    if (stored.data.renderVersion === 3) {
      const renderRequest = validateRenderRequestV3(stored.data.renderRequest);
      validateRenderSnapshot(renderRequest, common.outcome);
      return { version: 5, renderVersion: 3, ...common, renderRequest };
    }
    const renderRequest = validateRenderRequestV4(stored.data.renderRequest);
    validateRenderSnapshotV4(renderRequest, common.outcome);
    if ("viewPolicy" in stored.data) {
      return {
        version: 5,
        renderVersion: 4,
        viewPolicy: stored.data.viewPolicy,
        ...common,
        renderRequest,
      };
    }
    return { version: 5, renderVersion: 4, ...common, renderRequest };
  }

  const stored = StoredSnapshotRecordSchema.safeParse(input);
  if (!stored.success) throw new Error("Stored roll work is invalid");
  const snapshotVersion = stored.data.version;
  if (snapshotVersion === 4) {
    validateStoredRequestV4(request);
    validateStoredOutcomeV4(outcome, request, common.rollSeed);
  }
  if (common.outcome.outcomes.length === 0) {
    if (stored.data.renderRequest !== null) {
      throw new Error("Stored roll work is invalid");
    }
    if (snapshotVersion === 2) {
      return { version: 2, ...common, renderRequest: null };
    }
    return snapshotVersion === 3
      ? { version: 3, ...common, renderRequest: null }
      : { version: 4, ...common, renderRequest: null };
  }
  if (snapshotVersion === 2) {
    const renderRequest = validateRenderRequestV2(stored.data.renderRequest);
    validateRenderSnapshot(renderRequest, common.outcome);
    return { version: 2, ...common, renderRequest };
  }
  if (snapshotVersion === 3) {
    const renderRequest = validateRenderRequestV3(stored.data.renderRequest);
    validateRenderSnapshot(renderRequest, common.outcome);
    return { version: 3, ...common, renderRequest };
  }
  const renderRequest = validateRenderRequestV4(stored.data.renderRequest);
  validateRenderSnapshotV4(renderRequest, common.outcome);
  return { version: 4, ...common, renderRequest };
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
    preflighted: metadata.preflighted,
    responseMode: metadata.responseMode,
    savedRoll: metadata.savedRoll,
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

function deliveryMetadataVersion(
  request: ValidatedRollDeliveryRequest,
): 3 | 4 | 5 | 6 | 7 | 8 {
  if (request.rollSeed !== null) return 7;
  if (request.responseMode === "channel-message") return 8;
  if (request.savedRoll !== null) return 5;
  if (request.responseMode === "followup") return 6;
  return request.logging?.context === undefined ? 3 : 4;
}

type SerializedDeliveryMetadata = {
  version: 3 | 4 | 5 | 6 | 7 | 8;
  interactionId: string;
  applicationId: string;
  message: RollDeliveryRequest["message"];
  accounting: RollDeliveryRequest["accounting"] | null;
  logging: RollDeliveryRequest["logging"] | null;
  preflighted?: true;
  responseMode?: RollDeliveryResponseMode;
  savedRoll?: SavedRollInvocationV1;
};

export function deliveryMetadata(
  request: ValidatedRollDeliveryRequest,
): string {
  const metadata: SerializedDeliveryMetadata = {
    version: deliveryMetadataVersion(request),
    interactionId: request.interaction.id,
    applicationId: request.interaction.applicationId,
    message: request.message,
    accounting: request.accounting,
    logging: request.logging,
  };
  if (request.rollSeed !== null) metadata.preflighted = true;
  if (request.savedRoll !== null) {
    metadata.responseMode = request.responseMode;
    metadata.savedRoll = request.savedRoll;
  } else if (request.responseMode === "followup") {
    metadata.responseMode = request.responseMode;
  }
  return JSON.stringify(metadata);
}

const StoredDeliveryMessageSchema = z.looseObject({
  title: z.nullable(z.string()),
  username: z.string(),
});
const StoredDeliveryAccountingSchema = z.nullable(
  z.looseObject({
    guildId: z.nullable(snowflakeSchema),
    userId: snowflakeSchema,
    receivedAt: nonNegativeSafeIntegerSchema,
  }),
);
const StoredDeliveryLoggingSchema = z.nullable(
  z.looseObject({
    source: z.enum(["discord", "web"]),
    channelId: snowflakeSchema,
    notation: z.string().min(1).max(MAX_NOTATION_LENGTH),
    context: z.unknown().optional(),
  }),
);
const StoredDeliveryMetadataFields = {
  interactionId: CoercedSnowflakeSchema,
  applicationId: CoercedSnowflakeSchema,
  message: StoredDeliveryMessageSchema,
};
const StoredCurrentDeliveryMetadataFields = {
  ...StoredDeliveryMetadataFields,
  accounting: StoredDeliveryAccountingSchema,
  logging: StoredDeliveryLoggingSchema,
};
const StoredDeliveryMetadataSchema = z.union([
  z.strictObject(StoredDeliveryMetadataFields),
  z.strictObject({
    version: z.literal(2),
    ...StoredDeliveryMetadataFields,
    accounting: StoredDeliveryAccountingSchema,
  }),
  z.strictObject({
    version: z.literal(3),
    ...StoredCurrentDeliveryMetadataFields,
  }),
  z.strictObject({
    version: z.literal(4),
    ...StoredCurrentDeliveryMetadataFields,
  }),
  z.strictObject({
    version: z.literal(5),
    ...StoredCurrentDeliveryMetadataFields,
    responseMode: RollDeliveryResponseModeSchema,
    savedRoll: z.unknown(),
  }),
  z.strictObject({
    version: z.literal(6),
    ...StoredCurrentDeliveryMetadataFields,
    responseMode: z.literal("followup"),
  }),
  z.strictObject({
    version: z.literal(7),
    ...StoredCurrentDeliveryMetadataFields,
    preflighted: z.literal(true),
  }),
  z.strictObject({
    version: z.literal(8),
    ...StoredCurrentDeliveryMetadataFields,
    responseMode: z.literal("channel-message"),
    savedRoll: z.unknown(),
  }),
]);

function invalidStoredDeliveryMetadata(): Error {
  return new Error("Stored roll delivery metadata is invalid");
}

export function parseDeliveryMetadata(value: string): DeliveryMetadata {
  const input: SchemaInput = JSON.parse(value);
  const result = StoredDeliveryMetadataSchema.safeParse(input);
  if (!result.success) throw invalidStoredDeliveryMetadata();
  const stored = result.data;
  const version = "version" in stored ? stored.version : undefined;
  const storedAccounting = "accounting" in stored ? stored.accounting : null;
  const accounting: RollDeliveryRequest["accounting"] | null =
    storedAccounting === null
      ? null
      : {
          guildId: storedAccounting.guildId,
          userId: storedAccounting.userId,
          receivedAt: storedAccounting.receivedAt,
        };
  const storedLogging = "logging" in stored ? stored.logging : null;
  if (
    (storedLogging !== null &&
      ((version === 4 && storedLogging.context === undefined) ||
        ((version === undefined || version === 3) &&
          storedLogging.context !== undefined))) ||
    ((version === 6 || version === 7 || version === 8) &&
      (storedLogging === null || storedLogging.source !== "discord")) ||
    (version === 5 &&
      "responseMode" in stored &&
      stored.responseMode === "channel-message")
  ) {
    throw invalidStoredDeliveryMetadata();
  }

  let logging: RollDeliveryRequest["logging"] | null = null;
  if (storedLogging !== null) {
    logging = {
      source: storedLogging.source,
      channelId: storedLogging.channelId,
      notation: storedLogging.notation,
    };
    if (storedLogging.context !== undefined) {
      logging.context = parseRollLoggingContext(
        storedLogging.context,
        accounting?.guildId ?? null,
        storedLogging.channelId,
      );
    }
  }

  let responseMode: RollDeliveryResponseMode = "edit-original";
  if ("responseMode" in stored) responseMode = stored.responseMode;
  const savedRoll = "savedRoll" in stored
    ? parseSavedRollInvocation(stored.savedRoll)
    : null;
  return {
    interactionId: stored.interactionId,
    applicationId: stored.applicationId,
    message: {
      title: stored.message.title,
      username: stored.message.username,
    },
    accounting,
    logging,
    preflighted: version === 7,
    responseMode,
    savedRoll,
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
