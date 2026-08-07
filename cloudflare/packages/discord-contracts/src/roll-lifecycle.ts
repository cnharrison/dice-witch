const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const FAILURE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CONTEXT_BYTES = 64 * 1_024;
const MAX_NOTATION_LENGTH = 6_000;
const MAX_NOTATION_EXPRESSIONS = 50;
const MAX_REPETITIONS = 50;
const FORBIDDEN_CONTEXT_KEYS = new Set([
  "authorization",
  "image_bytes",
  "png",
  "token",
  "token_fingerprint",
]);

export type RollLifecycleState =
  | "deferred"
  | "accepted"
  | "delivery_started"
  | "delivered"
  | "failed";

export type RollLifecycleContextV1 = {
  version: 1;
  applicationId: string;
  notation: string;
  request: {
    notation: string[];
    repetitions: number;
  };
  title: string | null;
  savedRoll: {
    id: string;
    scope: "personal" | "guild";
    name: string;
    revision: number;
  } | null;
  userId: string;
  username: string;
  guildId: string | null;
  channelId: string;
  guildName: string | null;
  channelName: string | null;
  channelType: number | null;
  outcome: unknown;
  rollSeed: number | null;
  renderSeed: number | null;
  renderVersion: number | null;
  rendererRevision: string | null;
  destinationPayload: unknown;
};

export type RollLifecycleDiscordOperation =
  | "create-followup-clatter"
  | "create-followup-result"
  | "edit-followup-result"
  | "edit-original-clatter"
  | "edit-original-result";

export type RollLifecycleMessageProbeOutcome =
  | "exists"
  | "missing"
  | "inaccessible"
  | "probe-failed";

export type RollLifecycleDiagnosticsV2 = {
  handlerStartedAt: number;
  acknowledgementPreparedAt: number;
  acknowledgementType: 4 | 5 | 6;
  firstProviderAttemptAt: number | null;
  clatterSucceededAt: number | null;
  discordErrorCode: number | null;
  discordOperation: RollLifecycleDiscordOperation | null;
  originalResponseMessageId: string | null;
  originalResponseProbe: RollLifecycleMessageProbeOutcome | null;
};

type RollLifecycleAlertBase = {
  interactionId: string;
  alertMessageId: string | null;
  state: RollLifecycleState;
  deferredAt: number;
  acceptedAt: number | null;
  deliveryStartedAt: number | null;
  terminalAt: number | null;
  attempts: number;
  httpStatus: number | null;
  failurePhase: string | null;
  failureCode: string | null;
  context: RollLifecycleContextV1;
};

export type RollLifecycleAlertV1 = RollLifecycleAlertBase & {
  version: 1;
};

export type RollLifecycleAlertV2 = RollLifecycleAlertBase & {
  version: 2;
  receivedAt: number;
  diagnostics: RollLifecycleDiagnosticsV2;
};

export type RollLifecycleAlert = RollLifecycleAlertV1 | RollLifecycleAlertV2;

type RollLifecycleSnapshotBase = {
  interactionId: string;
  revision: number;
  commandName: "roll" | "library";
  scope: "guild" | "dm";
  receivedAt: number;
  deferredAt: number;
  acceptedAt: number | null;
  deliveryStartedAt: number | null;
  terminalAt: number | null;
  state: RollLifecycleState;
  attempts: number;
  httpStatus: number | null;
  failurePhase: string | null;
  failureCode: string | null;
  context: RollLifecycleContextV1;
};

export type RollLifecycleSnapshotV1 = RollLifecycleSnapshotBase & {
  version: 1;
};

export type RollLifecycleSnapshotV2 = RollLifecycleSnapshotBase & {
  version: 2;
  diagnostics: RollLifecycleDiagnosticsV2;
};

export type RollLifecycleSnapshot =
  | RollLifecycleSnapshotV1
  | RollLifecycleSnapshotV2;

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

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nullableSnowflake(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && SNOWFLAKE.test(value));
}

function containsForbiddenContextKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenContextKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_CONTEXT_KEYS.has(key.toLowerCase()) ||
      containsForbiddenContextKey(nested),
  );
}

function validateJsonValue(value: unknown): void {
  let serialized: unknown;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("Roll lifecycle context is invalid");
  }
  if (
    typeof serialized !== "string" ||
    new TextEncoder().encode(serialized).byteLength > MAX_CONTEXT_BYTES ||
    containsForbiddenContextKey(value)
  ) {
    throw new Error("Roll lifecycle context is invalid");
  }
}

function parseSavedRoll(
  value: unknown,
): RollLifecycleContextV1["savedRoll"] {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "name", "revision", "scope"]) ||
    typeof value.id !== "string" ||
    value.id.length < 1 ||
    value.id.length > 64 ||
    (value.scope !== "personal" && value.scope !== "guild") ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 1_024 ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1
  ) {
    throw new Error("Roll lifecycle context is invalid");
  }
  return {
    id: value.id,
    scope: value.scope,
    name: value.name,
    revision: Number(value.revision),
  };
}

export function parseRollLifecycleContext(
  value: unknown,
): RollLifecycleContextV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "applicationId",
      "channelId",
      "channelName",
      "channelType",
      "destinationPayload",
      "guildId",
      "guildName",
      "notation",
      "outcome",
      "renderSeed",
      "renderVersion",
      "rendererRevision",
      "request",
      "rollSeed",
      "savedRoll",
      "title",
      "userId",
      "username",
      "version",
    ]) ||
    value.version !== 1 ||
    typeof value.applicationId !== "string" ||
    !SNOWFLAKE.test(value.applicationId) ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > MAX_NOTATION_LENGTH ||
    !isRecord(value.request) ||
    !hasExactKeys(value.request, ["notation", "repetitions"]) ||
    !Array.isArray(value.request.notation) ||
    value.request.notation.length < 1 ||
    value.request.notation.length > MAX_NOTATION_EXPRESSIONS ||
    !value.request.notation.every(
      (notation) => typeof notation === "string" && notation.length > 0,
    ) ||
    value.request.notation.join(" ").length > MAX_NOTATION_LENGTH ||
    !Number.isSafeInteger(value.request.repetitions) ||
    Number(value.request.repetitions) < 1 ||
    Number(value.request.repetitions) > MAX_REPETITIONS ||
    (value.title !== null &&
      (typeof value.title !== "string" || value.title.length > 256)) ||
    typeof value.userId !== "string" ||
    !SNOWFLAKE.test(value.userId) ||
    typeof value.username !== "string" ||
    value.username.length < 1 ||
    value.username.length > 32 ||
    !nullableSnowflake(value.guildId) ||
    typeof value.channelId !== "string" ||
    !SNOWFLAKE.test(value.channelId) ||
    (value.guildName !== null &&
      (typeof value.guildName !== "string" || value.guildName.length > 100)) ||
    (value.channelName !== null &&
      (typeof value.channelName !== "string" || value.channelName.length > 100)) ||
    (value.channelType !== null && !Number.isSafeInteger(value.channelType)) ||
    (value.rollSeed !== null &&
      (!Number.isSafeInteger(value.rollSeed) ||
        Number(value.rollSeed) < 0 ||
        Number(value.rollSeed) > 0xffff_ffff)) ||
    (value.renderSeed !== null &&
      (!Number.isSafeInteger(value.renderSeed) ||
        Number(value.renderSeed) < 0 ||
        Number(value.renderSeed) > 0xffff_ffff)) ||
    (value.renderVersion !== null &&
      (!Number.isSafeInteger(value.renderVersion) ||
        Number(value.renderVersion) < 1 ||
        Number(value.renderVersion) > 4)) ||
    ((value.rollSeed === null ||
      value.renderSeed === null ||
      value.renderVersion === null) &&
      !(value.rollSeed === null &&
        value.renderSeed === null &&
        value.renderVersion === null &&
        value.outcome === null &&
        value.rendererRevision === null)) ||
    (value.rendererRevision !== null &&
      (typeof value.rendererRevision !== "string" ||
        value.rendererRevision.length < 1 ||
        value.rendererRevision.length > 64))
  ) {
    throw new Error("Roll lifecycle context is invalid");
  }
  validateJsonValue(value.outcome);
  validateJsonValue(value.destinationPayload);
  const context: RollLifecycleContextV1 = {
    version: 1,
    applicationId: value.applicationId,
    notation: value.notation,
    request: {
      notation: value.request.notation.map((notation) => String(notation)),
      repetitions: Number(value.request.repetitions),
    },
    title: value.title,
    savedRoll: parseSavedRoll(value.savedRoll),
    userId: value.userId,
    username: value.username,
    guildId: value.guildId,
    channelId: value.channelId,
    guildName: value.guildName,
    channelName: value.channelName,
    channelType: value.channelType === null ? null : Number(value.channelType),
    outcome: value.outcome,
    rollSeed: value.rollSeed === null ? null : Number(value.rollSeed),
    renderSeed: value.renderSeed === null ? null : Number(value.renderSeed),
    renderVersion:
      value.renderVersion === null ? null : Number(value.renderVersion),
    rendererRevision: value.rendererRevision,
    destinationPayload: value.destinationPayload,
  };
  validateJsonValue(context);
  return context;
}

const DISCORD_OPERATIONS = new Set<RollLifecycleDiscordOperation>([
  "create-followup-clatter",
  "create-followup-result",
  "edit-followup-result",
  "edit-original-clatter",
  "edit-original-result",
]);
const MESSAGE_PROBE_OUTCOMES = new Set<RollLifecycleMessageProbeOutcome>([
  "exists",
  "missing",
  "inaccessible",
  "probe-failed",
]);

function parseRollLifecycleDiagnostics(
  value: unknown,
  receivedAt: number,
  deferredAt: number,
  acceptedAt: number | null,
): RollLifecycleDiagnosticsV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "acknowledgementPreparedAt",
      "acknowledgementType",
      "clatterSucceededAt",
      "discordErrorCode",
      "discordOperation",
      "firstProviderAttemptAt",
      "handlerStartedAt",
      "originalResponseMessageId",
      "originalResponseProbe",
    ]) ||
    !timestamp(value.handlerStartedAt) ||
    value.handlerStartedAt < receivedAt ||
    value.handlerStartedAt > deferredAt ||
    !timestamp(value.acknowledgementPreparedAt) ||
    value.acknowledgementPreparedAt < deferredAt ||
    (acceptedAt !== null && value.acknowledgementPreparedAt > acceptedAt) ||
    (value.acknowledgementType !== 4 &&
      value.acknowledgementType !== 5 &&
      value.acknowledgementType !== 6) ||
    (value.firstProviderAttemptAt !== null &&
      (!timestamp(value.firstProviderAttemptAt) ||
        value.firstProviderAttemptAt < (acceptedAt ?? value.acknowledgementPreparedAt))) ||
    // The acknowledgement itself can carry the clatter, in which case it
    // succeeds before any provider attempt this roll makes. The acknowledgement
    // is the true lower bound for either delivery route.
    (value.clatterSucceededAt !== null &&
      (!timestamp(value.clatterSucceededAt) ||
        value.clatterSucceededAt < value.acknowledgementPreparedAt)) ||
    (value.discordErrorCode !== null &&
      (!Number.isSafeInteger(value.discordErrorCode) ||
        Number(value.discordErrorCode) < 1)) ||
    (value.discordOperation !== null &&
      (typeof value.discordOperation !== "string" ||
        !DISCORD_OPERATIONS.has(value.discordOperation as RollLifecycleDiscordOperation))) ||
    !nullableSnowflake(value.originalResponseMessageId) ||
    (value.originalResponseProbe !== null &&
      (typeof value.originalResponseProbe !== "string" ||
        !MESSAGE_PROBE_OUTCOMES.has(
          value.originalResponseProbe as RollLifecycleMessageProbeOutcome,
        ))) ||
    (value.originalResponseMessageId !== null &&
      value.clatterSucceededAt === null) ||
    (value.originalResponseProbe !== null &&
      value.originalResponseMessageId === null)
  ) {
    throw new Error("Roll lifecycle diagnostics are invalid");
  }
  return {
    handlerStartedAt: value.handlerStartedAt,
    acknowledgementPreparedAt: value.acknowledgementPreparedAt,
    acknowledgementType: value.acknowledgementType,
    firstProviderAttemptAt: value.firstProviderAttemptAt,
    clatterSucceededAt: value.clatterSucceededAt,
    discordErrorCode: value.discordErrorCode as number | null,
    discordOperation:
      value.discordOperation as RollLifecycleDiscordOperation | null,
    originalResponseMessageId: value.originalResponseMessageId,
    originalResponseProbe:
      value.originalResponseProbe as RollLifecycleMessageProbeOutcome | null,
  };
}

export function parseRollLifecycleSnapshot(
  value: unknown,
): RollLifecycleSnapshot {
  const expectedKeys = [
    "acceptedAt",
    "attempts",
    "commandName",
    "context",
    "deferredAt",
    "deliveryStartedAt",
    "failureCode",
    "failurePhase",
    "httpStatus",
    "interactionId",
    "receivedAt",
    "revision",
    "scope",
    "state",
    "terminalAt",
    "version",
    ...(isRecord(value) && value.version === 2 ? ["diagnostics"] : []),
  ];
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.interactionId !== "string" ||
    !SNOWFLAKE.test(value.interactionId) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    (value.commandName !== "roll" && value.commandName !== "library") ||
    (value.scope !== "guild" && value.scope !== "dm") ||
    !timestamp(value.receivedAt) ||
    !timestamp(value.deferredAt) ||
    (value.acceptedAt !== null && !timestamp(value.acceptedAt)) ||
    value.receivedAt > value.deferredAt ||
    (value.acceptedAt !== null && value.deferredAt > value.acceptedAt) ||
    (value.deliveryStartedAt !== null &&
      (!timestamp(value.deliveryStartedAt) ||
        value.deliveryStartedAt < (value.acceptedAt ?? value.deferredAt))) ||
    (value.terminalAt !== null &&
      (!timestamp(value.terminalAt) ||
        value.terminalAt < (value.acceptedAt ?? value.deferredAt))) ||
    (value.state !== "deferred" &&
      value.state !== "accepted" &&
      value.state !== "delivery_started" &&
      value.state !== "delivered" &&
      value.state !== "failed") ||
    !Number.isSafeInteger(value.attempts) ||
    Number(value.attempts) < 0 ||
    (value.httpStatus !== null &&
      (!Number.isSafeInteger(value.httpStatus) ||
        Number(value.httpStatus) < 100 ||
        Number(value.httpStatus) > 599)) ||
    (value.failurePhase !== null &&
      (typeof value.failurePhase !== "string" ||
        !FAILURE_CODE.test(value.failurePhase) ||
        value.failurePhase.length > 64)) ||
    (value.failureCode !== null &&
      (typeof value.failureCode !== "string" ||
        !FAILURE_CODE.test(value.failureCode) ||
        value.failureCode.length > 64)) ||
    ((value.state === "deferred" &&
      (value.acceptedAt !== null ||
        value.deliveryStartedAt !== null ||
        value.terminalAt !== null)) ||
      (value.state === "accepted" &&
        (value.acceptedAt === null ||
          value.deliveryStartedAt !== null ||
          value.terminalAt !== null)) ||
      (value.state === "delivery_started" &&
        (value.acceptedAt === null ||
          value.deliveryStartedAt === null ||
          value.terminalAt !== null)) ||
      ((value.state === "delivered" || value.state === "failed") &&
        value.terminalAt === null) ||
      (value.state === "delivered" && value.acceptedAt === null) ||
      (value.state === "failed" &&
        (value.failurePhase === null || value.failureCode === null)) ||
      (value.state !== "failed" &&
        (value.failurePhase !== null || value.failureCode !== null)))
  ) {
    throw new Error("Roll lifecycle snapshot is invalid");
  }
  const context = parseRollLifecycleContext(value.context);
  if (
    context.userId.length === 0 ||
    (value.scope === "guild") !== (context.guildId !== null)
  ) {
    throw new Error("Roll lifecycle snapshot is invalid");
  }
  const common: RollLifecycleSnapshotBase = {
    interactionId: value.interactionId,
    revision: Number(value.revision),
    commandName: value.commandName,
    scope: value.scope,
    receivedAt: value.receivedAt,
    deferredAt: value.deferredAt,
    acceptedAt: value.acceptedAt,
    deliveryStartedAt: value.deliveryStartedAt,
    terminalAt: value.terminalAt,
    state: value.state,
    attempts: Number(value.attempts),
    httpStatus: value.httpStatus as number | null,
    failurePhase: value.failurePhase,
    failureCode: value.failureCode,
    context,
  };
  return value.version === 1
    ? { version: 1, ...common }
    : {
        version: 2,
        ...common,
        diagnostics: parseRollLifecycleDiagnostics(
          value.diagnostics,
          value.receivedAt,
          value.deferredAt,
          value.acceptedAt,
        ),
      };
}

export function parseRollLifecycleAlert(value: unknown): RollLifecycleAlert {
  const expectedKeys = [
    "acceptedAt",
    "alertMessageId",
    "attempts",
    "context",
    "deferredAt",
    "deliveryStartedAt",
    "failureCode",
    "failurePhase",
    "httpStatus",
    "interactionId",
    "state",
    "terminalAt",
    "version",
    ...(isRecord(value) && value.version === 2
      ? ["diagnostics", "receivedAt"]
      : []),
  ];
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.interactionId !== "string" ||
    !SNOWFLAKE.test(value.interactionId) ||
    !nullableSnowflake(value.alertMessageId) ||
    (value.state !== "deferred" &&
      value.state !== "accepted" &&
      value.state !== "delivery_started" &&
      value.state !== "delivered" &&
      value.state !== "failed") ||
    !timestamp(value.deferredAt) ||
    (value.acceptedAt !== null &&
      (!timestamp(value.acceptedAt) || value.acceptedAt < value.deferredAt)) ||
    (value.deliveryStartedAt !== null &&
      (!timestamp(value.deliveryStartedAt) ||
        value.deliveryStartedAt < (value.acceptedAt ?? value.deferredAt))) ||
    (value.terminalAt !== null &&
      (!timestamp(value.terminalAt) ||
        value.terminalAt < (value.acceptedAt ?? value.deferredAt))) ||
    !Number.isSafeInteger(value.attempts) ||
    Number(value.attempts) < 0 ||
    (value.httpStatus !== null &&
      (!Number.isSafeInteger(value.httpStatus) ||
        Number(value.httpStatus) < 100 ||
        Number(value.httpStatus) > 599)) ||
    (value.failurePhase !== null &&
      (typeof value.failurePhase !== "string" ||
        !FAILURE_CODE.test(value.failurePhase))) ||
    (value.failureCode !== null &&
      (typeof value.failureCode !== "string" ||
        !FAILURE_CODE.test(value.failureCode))) ||
    ((value.state === "deferred" &&
      (value.acceptedAt !== null ||
        value.deliveryStartedAt !== null ||
        value.terminalAt !== null)) ||
      (value.state === "accepted" &&
        (value.acceptedAt === null ||
          value.deliveryStartedAt !== null ||
          value.terminalAt !== null)) ||
      (value.state === "delivery_started" &&
        (value.acceptedAt === null ||
          value.deliveryStartedAt === null ||
          value.terminalAt !== null)) ||
      ((value.state === "delivered" || value.state === "failed") &&
        value.terminalAt === null) ||
      (value.state === "delivered" && value.acceptedAt === null) ||
      (value.state === "failed" &&
        (value.failurePhase === null || value.failureCode === null)) ||
      (value.state !== "failed" &&
        (value.failurePhase !== null || value.failureCode !== null)))
  ) {
    throw new Error("Roll lifecycle alert is invalid");
  }
  const common: RollLifecycleAlertBase = {
    interactionId: value.interactionId,
    alertMessageId: value.alertMessageId,
    state: value.state,
    deferredAt: value.deferredAt,
    acceptedAt: value.acceptedAt,
    deliveryStartedAt: value.deliveryStartedAt,
    terminalAt: value.terminalAt,
    attempts: Number(value.attempts),
    httpStatus: value.httpStatus as number | null,
    failurePhase: value.failurePhase,
    failureCode: value.failureCode,
    context: parseRollLifecycleContext(value.context),
  };
  if (value.version === 1) return { version: 1, ...common };
  if (!timestamp(value.receivedAt) || value.receivedAt > value.deferredAt) {
    throw new Error("Roll lifecycle alert is invalid");
  }
  return {
    version: 2,
    ...common,
    receivedAt: value.receivedAt,
    diagnostics: parseRollLifecycleDiagnostics(
      value.diagnostics,
      value.receivedAt,
      value.deferredAt,
      value.acceptedAt,
    ),
  };
}

export function rollLifecycleContextJson(
  context: RollLifecycleContextV1,
): string {
  const serialized = JSON.stringify(parseRollLifecycleContext(context));
  if (new TextEncoder().encode(serialized).byteLength > MAX_CONTEXT_BYTES) {
    throw new Error("Roll lifecycle context is invalid");
  }
  return serialized;
}
