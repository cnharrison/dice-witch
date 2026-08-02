import {
  validateRenderRequestV4,
  type IconNameV4,
  type RenderDieV4,
  type RenderRequestV4,
} from "@dice-witch/dice-v4-model";
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
import { renderedRollFaceV4 } from "../../../packages/roll-render-model/src";
import { parseSavedRollNameColorV2 } from "../../../packages/saved-rolls/src";
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
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
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

export type RollWorkRecord =
  | RollWorkRecordV1
  | RollWorkRecordV2
  | RollWorkRecordV3
  | RollWorkRecordV4;

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
  failure_phase: RollDeliveryFailurePhase | null;
};

type ValidatedRollDeliveryRequest = Omit<
  RollDeliveryRequest,
  | "accounting"
  | "deferredAt"
  | "logging"
  | "request"
  | "responseMode"
  | "rollSeed"
  | "savedRoll"
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

function parseSavedRollInvocation(value: unknown): SavedRollInvocationV1 {
  const keys = [
    "id",
    "name",
    "notation",
    "repetitions",
    "revision",
    "scope",
    "title",
    "version",
  ];
  if (
    !isRecord(value) ||
    (!hasExactKeys(value, keys) &&
      !hasExactKeys(value, [
        "id",
        "name",
        "nameColor",
        "notation",
        "repetitions",
        "revision",
        "scope",
        "title",
        "version",
      ])) ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !UUID_V4.test(value.id) ||
    (value.scope !== "personal" && value.scope !== "guild") ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 1024 ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > MAX_NOTATION_LENGTH ||
    (value.title !== null &&
      (typeof value.title !== "string" ||
        value.title.length < 1 ||
        value.title.length > MAX_TITLE_LENGTH)) ||
    typeof value.repetitions !== "number" ||
    !Number.isSafeInteger(value.repetitions) ||
    value.repetitions < 1 ||
    value.repetitions > MAX_REPETITIONS ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) {
    throw new Error("Saved roll invocation is invalid");
  }
  return {
    version: 1,
    id: value.id,
    scope: value.scope,
    name: value.name,
    notation: value.notation,
    title: value.title,
    repetitions: value.repetitions,
    revision: value.revision,
    nameColor: parseSavedRollNameColorV2(value.nameColor ?? null),
  };
}

export function validateDeliveryRequest(
  value: unknown,
): ValidatedRollDeliveryRequest {
  if (!isRecord(value)) throw new Error("Roll delivery request is invalid");
  const hasDeferredAt = Object.hasOwn(value, "deferredAt");
  const hasTelemetry = Object.hasOwn(value, "telemetry");
  const shape = { ...value };
  delete shape.deferredAt;
  delete shape.telemetry;
  const hasPreflightedDirectRoll = hasExactKeys(shape, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
    "rollSeed",
  ]);
  const hasSavedRoll = hasExactKeys(shape, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
    "responseMode",
    "savedRoll",
  ]);
  // Private-first direct rolls remain valid while accepted deliveries from the
  // coordinated Interactions/Roll rollout can still retry.
  const hasLegacyPrivateDirectRoll = hasExactKeys(shape, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
    "responseMode",
  ]);
  const hasLogging = hasExactKeys(shape, [
    "accounting",
    "interaction",
    "logging",
    "message",
    "request",
  ]);
  const hasAccounting = hasExactKeys(shape, [
    "accounting",
    "interaction",
    "message",
    "request",
  ]);
  const isLegacy = hasExactKeys(shape, ["interaction", "message", "request"]);
  if (
    (!hasPreflightedDirectRoll &&
      !hasSavedRoll &&
      !hasLegacyPrivateDirectRoll &&
      !hasLogging &&
      !hasAccounting &&
      !isLegacy) ||
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
  if (
    hasPreflightedDirectRoll ||
    hasSavedRoll ||
    hasLegacyPrivateDirectRoll ||
    hasLogging ||
    hasAccounting
  ) {
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

  const deferredAt = hasDeferredAt ? Number(value.deferredAt) : accounting?.receivedAt ?? interactionCreatedAt(String(value.interaction.id));
  if (
    !Number.isSafeInteger(deferredAt) ||
    deferredAt < (accounting?.receivedAt ?? interactionCreatedAt(String(value.interaction.id)))
  ) {
    throw new Error("Roll delivery deferred timestamp is invalid");
  }

  let telemetry: RollDeliveryTelemetryV2 | null = null;
  if (hasTelemetry) {
    if (
      accounting === null ||
      !isRecord(value.telemetry) ||
      !hasExactKeys(value.telemetry, [
        "acknowledgementPreparedAt",
        "acknowledgementType",
        "handlerStartedAt",
        "version",
      ]) ||
      value.telemetry.version !== 2 ||
      !Number.isSafeInteger(value.telemetry.handlerStartedAt) ||
      Number(value.telemetry.handlerStartedAt) < accounting.receivedAt ||
      Number(value.telemetry.handlerStartedAt) > deferredAt ||
      !Number.isSafeInteger(value.telemetry.acknowledgementPreparedAt) ||
      Number(value.telemetry.acknowledgementPreparedAt) < deferredAt ||
      (value.telemetry.acknowledgementType !== 4 &&
        value.telemetry.acknowledgementType !== 5 &&
        value.telemetry.acknowledgementType !== 6)
    ) {
      throw new Error("Roll delivery telemetry is invalid");
    }
    telemetry = {
      version: 2,
      handlerStartedAt: Number(value.telemetry.handlerStartedAt),
      acknowledgementPreparedAt: Number(
        value.telemetry.acknowledgementPreparedAt,
      ),
      acknowledgementType: value.telemetry.acknowledgementType,
    };
  }

  let rollSeed: number | null = null;
  if (hasPreflightedDirectRoll) {
    const candidate = value.rollSeed;
    if (
      typeof candidate !== "number" ||
      !Number.isSafeInteger(candidate) ||
      candidate < 0 ||
      candidate > 0xffff_ffff
    ) {
      throw new Error("Roll delivery seed is invalid");
    }
    rollSeed = candidate;
  }

  let logging: RollDeliveryRequest["logging"] | null = null;
  if (
    hasPreflightedDirectRoll ||
    hasSavedRoll ||
    hasLegacyPrivateDirectRoll ||
    hasLogging
  ) {
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
            context: parseRollLoggingContext(
              value.logging.context,
              accounting?.guildId ?? null,
              value.logging.channelId,
            ),
          }),
    };
  }

  let responseMode: RollDeliveryResponseMode = "edit-original";
  let savedRoll: SavedRollInvocationV1 | null = null;
  if (
    (hasPreflightedDirectRoll && logging?.source !== "discord") ||
    (hasLegacyPrivateDirectRoll && logging?.source !== "discord") ||
    (hasLegacyPrivateDirectRoll && value.responseMode !== "followup") ||
    (hasSavedRoll &&
      value.responseMode !== "channel-message" &&
      value.responseMode !== "followup" &&
      value.responseMode !== "edit-original")
  ) {
    throw new Error("Roll delivery response mode is invalid");
  }
  if (hasSavedRoll || hasLegacyPrivateDirectRoll) {
    responseMode = value.responseMode as RollDeliveryResponseMode;
  }
  if (hasSavedRoll) {
    savedRoll = parseSavedRollInvocation(value.savedRoll);
    if (
      savedRoll.notation !== value.request.notation ||
      savedRoll.title !== value.message.title ||
      savedRoll.repetitions !== value.request.repetitions ||
      (savedRoll.scope === "guild" &&
        (accounting === null || accounting.guildId === null)) ||
      logging?.source !== "discord"
    ) {
      throw new Error("Saved roll delivery does not match its invocation");
    }
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
    deferredAt,
    rollSeed,
    telemetry,
    logging,
    responseMode,
    savedRoll,
  };
}

function validateRenderSnapshotShape(
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

function isStoredRollDieV4(value: unknown): value is RollDie {
  if (!isRecord(value)) return false;
  const hasPhysicalFace = value.physicalFace !== undefined;
  const hasAppearanceIdentity =
    value.appearanceGroupIdentity !== undefined ||
    value.appearanceDieIdentity !== undefined;
  const expectedKeys = [
    "modifiers",
    "rolled",
    "sides",
    ...(hasPhysicalFace ? ["physicalFace"] : []),
    ...(hasAppearanceIdentity
      ? ["appearanceDieIdentity", "appearanceGroupIdentity"]
      : []),
  ].sort();
  if (
    !hasExactKeys(value, expectedKeys) ||
    (hasAppearanceIdentity &&
      (typeof value.appearanceGroupIdentity !== "string" ||
        value.appearanceGroupIdentity.length < 1 ||
        value.appearanceGroupIdentity.length > 256 ||
        typeof value.appearanceDieIdentity !== "string" ||
        value.appearanceDieIdentity.length < 1 ||
        value.appearanceDieIdentity.length > 512)) ||
    typeof value.rolled !== "number" ||
    !Number.isSafeInteger(value.rolled) ||
    !Array.isArray(value.modifiers) ||
    !value.modifiers.every((modifier) => typeof modifier === "string")
  ) {
    return false;
  }
  const rolled = value.rolled;
  const physicalFace = value.physicalFace;
  if (value.sides === "F") {
    if (
      physicalFace !== undefined &&
      (typeof physicalFace !== "number" ||
        !Number.isSafeInteger(physicalFace) ||
        physicalFace < -1 ||
        physicalFace > 1)
    ) {
      return false;
    }
    return (rolled >= -1 && rolled <= 1) || physicalFace !== undefined;
  }
  if (value.sides === "%") {
    if (
      physicalFace !== undefined &&
      (typeof physicalFace !== "number" ||
        !Number.isSafeInteger(physicalFace) ||
        physicalFace < 0 ||
        physicalFace > 90 ||
        physicalFace % 10 !== 0)
    ) {
      return false;
    }
    return (
      (rolled >= 0 && rolled <= 90 && rolled % 10 === 0) ||
      physicalFace !== undefined
    );
  }
  if (
    typeof value.sides !== "number" ||
    !Number.isSafeInteger(value.sides) ||
    value.sides < 1 ||
    value.sides > MAX_DIE_SIDES
  ) {
    return false;
  }
  if (
    physicalFace !== undefined &&
    (typeof physicalFace !== "number" ||
      !Number.isSafeInteger(physicalFace) ||
      physicalFace < 1 ||
      physicalFace > value.sides)
  ) {
    return false;
  }
  return (
    (rolled >= (value.sides === 10 ? 0 : 1) && rolled <= value.sides) ||
    physicalFace !== undefined
  );
}

function normalizedStoredNotation(value: string): string {
  return value.toLowerCase().replace(/df/g, "dF");
}

function validateStoredOutcomeV4(
  value: unknown,
  request: RollWorkRequest,
  rollSeed: number,
): asserts value is RollExecutionResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["errors", "outcomes", "seed", "version"]) ||
    value.version !== 1 ||
    value.seed !== rollSeed ||
    !Array.isArray(value.outcomes) ||
    !Array.isArray(value.errors)
  ) {
    throw new Error("Stored roll work is invalid");
  }

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

  for (const outcome of value.outcomes) {
    if (
      !isRecord(outcome) ||
      !hasExactKeys(outcome, ["dice", "notation", "output", "total"]) ||
      typeof outcome.notation !== "string" ||
      typeof outcome.output !== "string" ||
      typeof outcome.total !== "number" ||
      !Number.isFinite(outcome.total) ||
      !Array.isArray(outcome.dice) ||
      !outcome.dice.every(isStoredRollDieV4)
    ) {
      throw new Error("Stored roll work is invalid");
    }
    consumeNotation(outcome.notation);
  }

  let terminalErrorCount = 0;
  for (const error of value.errors) {
    if (!isRecord(error) || typeof error.code !== "string") {
      throw new Error("Stored roll work is invalid");
    }
    if (error.code === "INVALID_NOTATION" || error.code === "NON_FINITE_TOTAL") {
      if (
        !hasExactKeys(error, ["code", "notation"]) ||
        typeof error.notation !== "string"
      ) {
        throw new Error("Stored roll work is invalid");
      }
      consumeNotation(error.notation);
      continue;
    }
    if (
      (error.code !== "TOO_MANY_DICE" &&
        error.code !== "TOO_MANY_SIDES" &&
        error.code !== "UNSAFE_EXPLOSION" &&
        error.code !== "NO_DICE") ||
      !hasExactKeys(error, ["code", "message"]) ||
      typeof error.message !== "string"
    ) {
      throw new Error("Stored roll work is invalid");
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
  validateRenderSnapshotShape(renderRequest, outcome);
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
      if (
        renderDie.target !== target ||
        renderDie.result !== renderedRollFaceV4(rollDie) ||
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

export function parseRecord(value: string): RollWorkRecord {
  const parsed: unknown = JSON.parse(value);
  if (
    !isRecord(parsed) ||
    (parsed.version !== 1 &&
      parsed.version !== 2 &&
      parsed.version !== 3 &&
      parsed.version !== 4) ||
    !isRecord(parsed.request) ||
    !Number.isInteger(parsed.rollSeed) ||
    Number(parsed.rollSeed) < 0 ||
    Number(parsed.rollSeed) > 0xffff_ffff ||
    !Number.isInteger(parsed.renderSeed) ||
    Number(parsed.renderSeed) < 0 ||
    Number(parsed.renderSeed) > 0xffff_ffff ||
    !isRecord(parsed.outcome) ||
    parsed.outcome.version !== 1 ||
    parsed.outcome.seed !== parsed.rollSeed ||
    !Array.isArray(parsed.outcome.outcomes) ||
    !Array.isArray(parsed.outcome.errors) ||
    !Number.isSafeInteger(parsed.createdAt) ||
    Number(parsed.createdAt) < 0
  ) {
    throw new Error("Stored roll work is invalid");
  }
  const request = validateRequest(parsed.request);
  const common = {
    request,
    rollSeed: Number(parsed.rollSeed),
    renderSeed: Number(parsed.renderSeed),
    outcome: parsed.outcome as RollExecutionResult,
    createdAt: Number(parsed.createdAt),
  };
  if (parsed.version === 1) return { version: 1, ...common };
  if (
    !hasExactKeys(parsed, [
      "createdAt",
      "outcome",
      "renderRequest",
      "renderSeed",
      "request",
      "rollSeed",
      "version",
    ])
  ) {
    throw new Error("Stored roll work is invalid");
  }
  const snapshotVersion = parsed.version;
  if (snapshotVersion === 4) {
    validateStoredRequestV4(request);
    validateStoredOutcomeV4(parsed.outcome, request, common.rollSeed);
  }
  if (common.outcome.outcomes.length === 0) {
    if (parsed.renderRequest !== null) {
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
    const renderRequest = validateRenderRequestV2(parsed.renderRequest);
    validateRenderSnapshotShape(renderRequest, common.outcome);
    return { version: 2, ...common, renderRequest };
  }
  if (snapshotVersion === 3) {
    const renderRequest = validateRenderRequestV3(parsed.renderRequest);
    validateRenderSnapshotShape(renderRequest, common.outcome);
    return { version: 3, ...common, renderRequest };
  }
  const renderRequest = validateRenderRequestV4(parsed.renderRequest);
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

export function deliveryMetadata(
  request: ValidatedRollDeliveryRequest,
): string {
  return JSON.stringify({
    version: deliveryMetadataVersion(request),
    interactionId: request.interaction.id,
    applicationId: request.interaction.applicationId,
    message: request.message,
    accounting: request.accounting,
    logging: request.logging,
    ...(request.rollSeed === null ? {} : { preflighted: true }),
    ...(request.savedRoll === null
      ? request.responseMode === "followup"
        ? { responseMode: request.responseMode }
        : {}
      : {
          responseMode: request.responseMode,
          savedRoll: request.savedRoll,
        }),
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
  const version8 =
    parsed.version === 8 &&
    hasExactKeys(parsed, [
      "accounting",
      "applicationId",
      "interactionId",
      "logging",
      "message",
      "responseMode",
      "savedRoll",
      "version",
    ]);
  const version7 =
    parsed.version === 7 &&
    hasExactKeys(parsed, [
      "accounting",
      "applicationId",
      "interactionId",
      "logging",
      "message",
      "preflighted",
      "version",
    ]);
  const version6 =
    parsed.version === 6 &&
    hasExactKeys(parsed, [
      "accounting",
      "applicationId",
      "interactionId",
      "logging",
      "message",
      "responseMode",
      "version",
    ]);
  const version5 =
    parsed.version === 5 &&
    hasExactKeys(parsed, [
      "accounting",
      "applicationId",
      "interactionId",
      "logging",
      "message",
      "responseMode",
      "savedRoll",
      "version",
    ]);
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
    (!version8 &&
      !version7 &&
      !version6 &&
      !version5 &&
      !version4 &&
      !version3 &&
      !version2 &&
      !legacy) ||
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
        (!version8 &&
          !version7 &&
          !version6 &&
          !version5 &&
          !version4 &&
          parsed.logging.context !== undefined))) ||
    (version8 &&
      (parsed.responseMode !== "channel-message" ||
        !isRecord(parsed.logging) ||
        parsed.logging.source !== "discord")) ||
    (version7 &&
      (parsed.preflighted !== true ||
        !isRecord(parsed.logging) ||
        parsed.logging.source !== "discord")) ||
    (version6 &&
      (parsed.responseMode !== "followup" ||
        !isRecord(parsed.logging) ||
        parsed.logging.source !== "discord")) ||
    (version5 &&
      parsed.responseMode !== "edit-original" &&
      parsed.responseMode !== "followup")
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
            ...(parsed.logging.context === undefined
              ? {}
              : {
                  context: parseRollLoggingContext(
                    parsed.logging.context,
                    parsed.accounting === null
                      ? null
                      : (parsed.accounting as { guildId: string | null }).guildId,
                    parsed.logging.channelId as string,
                  ),
                }),
          },
    preflighted: version7,
    responseMode: version8 || version6 || version5
      ? (parsed.responseMode as RollDeliveryResponseMode)
      : "edit-original",
    savedRoll: version8 || version5
      ? parseSavedRollInvocation(parsed.savedRoll)
      : null,
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
