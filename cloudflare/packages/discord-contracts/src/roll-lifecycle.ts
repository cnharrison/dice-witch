import { z } from "zod";
import {
  boundedNameSchema,
  boundaryObjectSchema,
  exactEnumSchema,
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  safeIntegerSchema,
  type SchemaInput,
  seedSchema,
  snowflakeSchema,
  strictObjectSchema,
  timestampSchema,
} from "./schema-primitives";

const FAILURE_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
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

const RecursiveJsonSchema = z.json();
export type JsonValue = z.infer<typeof RecursiveJsonSchema>;
export const JsonObjectSchema = z.record(z.string(), RecursiveJsonSchema);
export type JsonObject = z.infer<typeof JsonObjectSchema>;
const PreservedJsonValueSchema = z.custom<JsonValue>(
  (value) => RecursiveJsonSchema.safeParse(value).success,
);

const RollLifecycleStateSchema = exactEnumSchema([
  "deferred",
  "accepted",
  "delivery_started",
  "delivered",
  "failed",
]);
export type RollLifecycleState = z.infer<typeof RollLifecycleStateSchema>;

const RollLifecycleDiscordOperationSchema = exactEnumSchema([
  "create-followup-clatter",
  "create-followup-result",
  "edit-followup-result",
  "edit-original-clatter",
  "edit-original-result",
]);
export type RollLifecycleDiscordOperation = z.infer<
  typeof RollLifecycleDiscordOperationSchema
>;

const RollLifecycleMessageProbeOutcomeSchema = exactEnumSchema([
  "exists",
  "missing",
  "inaccessible",
  "probe-failed",
]);
export type RollLifecycleMessageProbeOutcome = z.infer<
  typeof RollLifecycleMessageProbeOutcomeSchema
>;

const SavedRollSchema = strictObjectSchema({
  id: boundedNameSchema(1, 64),
  scope: exactEnumSchema(["personal", "guild"]),
  name: boundedNameSchema(1, 1_024),
  revision: positiveSafeIntegerSchema,
});

const RollLifecycleContextFields = {
  version: z.literal(1),
  applicationId: snowflakeSchema,
  notation: boundedNameSchema(1, MAX_NOTATION_LENGTH),
  request: strictObjectSchema({
    notation: z.array(z.string().min(1)).min(1).max(MAX_NOTATION_EXPRESSIONS),
    repetitions: positiveSafeIntegerSchema.max(MAX_REPETITIONS),
  }).refine((request) => request.notation.join(" ").length <= MAX_NOTATION_LENGTH),
  title: z.string().max(256).nullable(),
  savedRoll: SavedRollSchema.nullable(),
  userId: snowflakeSchema,
  username: boundedNameSchema(1, 32),
  guildId: snowflakeSchema.nullable(),
  channelId: snowflakeSchema,
  guildName: z.string().max(100).nullable(),
  channelName: z.string().max(100).nullable(),
  channelType: safeIntegerSchema.nullable(),
  rollSeed: seedSchema.nullable(),
  renderSeed: seedSchema.nullable(),
  renderVersion: safeIntegerSchema.min(1).max(4).nullable(),
  rendererRevision: boundedNameSchema(1, 64).nullable(),
};

function validRenderingContext(context: {
  rollSeed: number | null;
  renderSeed: number | null;
  renderVersion: number | null;
  rendererRevision: string | null;
  outcome: SchemaInput;
}): boolean {
  const renderingAbsent =
    context.rollSeed === null ||
    context.renderSeed === null ||
    context.renderVersion === null;
  return !renderingAbsent ||
    (context.rollSeed === null &&
      context.renderSeed === null &&
      context.renderVersion === null &&
      context.outcome === null &&
      context.rendererRevision === null);
}

const RollLifecycleContextCandidateSchema = strictObjectSchema({
  ...RollLifecycleContextFields,
  outcome: z.unknown(),
  destinationPayload: z.unknown(),
}).refine(validRenderingContext);
export const RollLifecycleContextSchema = strictObjectSchema({
  ...RollLifecycleContextFields,
  outcome: PreservedJsonValueSchema,
  destinationPayload: PreservedJsonValueSchema,
}).refine(validRenderingContext);
export type RollLifecycleContextV1 = z.infer<
  typeof RollLifecycleContextSchema
>;

const RollLifecycleDiagnosticsSchema = strictObjectSchema({
  handlerStartedAt: timestampSchema,
  acknowledgementPreparedAt: timestampSchema,
  acknowledgementType: z.union([z.literal(4), z.literal(5), z.literal(6)]),
  firstProviderAttemptAt: timestampSchema.nullable(),
  clatterSucceededAt: timestampSchema.nullable(),
  discordErrorCode: positiveSafeIntegerSchema.nullable(),
  discordOperation: RollLifecycleDiscordOperationSchema.nullable(),
  originalResponseMessageId: snowflakeSchema.nullable(),
  originalResponseProbe: RollLifecycleMessageProbeOutcomeSchema.nullable(),
});
export type RollLifecycleDiagnosticsV2 = z.infer<
  typeof RollLifecycleDiagnosticsSchema
>;

const SnapshotBaseSchema = {
  interactionId: snowflakeSchema,
  revision: positiveSafeIntegerSchema,
  commandName: exactEnumSchema(["roll", "library"]),
  scope: exactEnumSchema(["guild", "dm"]),
  receivedAt: timestampSchema,
  deferredAt: timestampSchema,
  acceptedAt: timestampSchema.nullable(),
  deliveryStartedAt: timestampSchema.nullable(),
  terminalAt: timestampSchema.nullable(),
  state: RollLifecycleStateSchema,
  attempts: nonNegativeSafeIntegerSchema,
  httpStatus: safeIntegerSchema.min(100).max(599).nullable(),
  failurePhase: z.string().regex(FAILURE_CODE).max(64).nullable(),
  failureCode: z.string().regex(FAILURE_CODE).max(64).nullable(),
  context: z.unknown(),
};

const AlertBaseSchema = {
  interactionId: snowflakeSchema,
  alertMessageId: snowflakeSchema.nullable(),
  state: RollLifecycleStateSchema,
  deferredAt: timestampSchema,
  acceptedAt: timestampSchema.nullable(),
  deliveryStartedAt: timestampSchema.nullable(),
  terminalAt: timestampSchema.nullable(),
  attempts: nonNegativeSafeIntegerSchema,
  httpStatus: safeIntegerSchema.min(100).max(599).nullable(),
  failurePhase: z.string().regex(FAILURE_CODE).nullable(),
  failureCode: z.string().regex(FAILURE_CODE).nullable(),
  context: z.unknown(),
};

function validLifecycleState(value: {
  state: RollLifecycleState;
  acceptedAt: number | null;
  deliveryStartedAt: number | null;
  terminalAt: number | null;
  failurePhase: string | null;
  failureCode: string | null;
}): boolean {
  return !(
    (value.state === "deferred" &&
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
      (value.failurePhase !== null || value.failureCode !== null))
  );
}

function validSnapshotTimes(value: {
  receivedAt: number;
  deferredAt: number;
  acceptedAt: number | null;
  deliveryStartedAt: number | null;
  terminalAt: number | null;
}): boolean {
  const lifecycleStart = value.acceptedAt ?? value.deferredAt;
  return value.receivedAt <= value.deferredAt &&
    (value.acceptedAt === null || value.deferredAt <= value.acceptedAt) &&
    (value.deliveryStartedAt === null ||
      value.deliveryStartedAt >= lifecycleStart) &&
    (value.terminalAt === null || value.terminalAt >= lifecycleStart);
}

const RollLifecycleSnapshotV1Schema = strictObjectSchema({
  version: z.literal(1),
  ...SnapshotBaseSchema,
}).refine(
  (snapshot) => validSnapshotTimes(snapshot) && validLifecycleState(snapshot),
);
const RollLifecycleSnapshotV2Schema = strictObjectSchema({
  version: z.literal(2),
  ...SnapshotBaseSchema,
  diagnostics: z.unknown(),
}).refine(
  (snapshot) => validSnapshotTimes(snapshot) && validLifecycleState(snapshot),
);

type SnapshotEnvelopeV1 = z.infer<typeof RollLifecycleSnapshotV1Schema>;
type SnapshotEnvelopeV2 = z.infer<typeof RollLifecycleSnapshotV2Schema>;

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

export type RollLifecycleAlertV1 = RollLifecycleAlertBase & { version: 1 };
export type RollLifecycleAlertV2 = RollLifecycleAlertBase & {
  version: 2;
  receivedAt: number;
  diagnostics: RollLifecycleDiagnosticsV2;
};
export type RollLifecycleAlert = RollLifecycleAlertV1 | RollLifecycleAlertV2;

type SerializedJsonValue = {
  serialized: string;
  value: JsonValue;
};

function serializeJsonValue(value: SchemaInput): SerializedJsonValue {
  const validation = { containsForbiddenKey: false };
  let serialized: SchemaInput;
  try {
    serialized = JSON.stringify(
      value,
      (key: string, nestedValue: SchemaInput): SchemaInput => {
        if (FORBIDDEN_CONTEXT_KEYS.has(key.toLowerCase())) {
          validation.containsForbiddenKey = true;
        }
        return nestedValue;
      },
    );
  } catch {
    throw new Error("Roll lifecycle context is invalid");
  }
  const json = PreservedJsonValueSchema.safeParse(value);
  const encoded = z.string().safeParse(serialized);
  if (
    !encoded.success ||
    !json.success ||
    validation.containsForbiddenKey ||
    new TextEncoder().encode(encoded.data).byteLength > MAX_CONTEXT_BYTES
  ) {
    throw new Error("Roll lifecycle context is invalid");
  }
  return { serialized: encoded.data, value: json.data };
}

export function parseRollLifecycleContext(
  value: SchemaInput,
): RollLifecycleContextV1 {
  const candidate = RollLifecycleContextCandidateSchema.safeParse(value);
  if (!candidate.success) throw new Error("Roll lifecycle context is invalid");

  const outcome = serializeJsonValue(candidate.data.outcome).value;
  const destinationPayload = serializeJsonValue(
    candidate.data.destinationPayload,
  ).value;
  const parsed = RollLifecycleContextSchema.safeParse({
    ...candidate.data,
    outcome,
    destinationPayload,
  });
  if (!parsed.success) throw new Error("Roll lifecycle context is invalid");
  serializeJsonValue(parsed.data);
  return parsed.data;
}

function parseRollLifecycleDiagnostics(
  value: SchemaInput,
  receivedAt: number,
  deferredAt: number,
  acceptedAt: number | null,
): RollLifecycleDiagnosticsV2 {
  const parsed = RollLifecycleDiagnosticsSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Roll lifecycle diagnostics are invalid");
  }
  const diagnostics = parsed.data;
  if (
    diagnostics.handlerStartedAt < receivedAt ||
    diagnostics.handlerStartedAt > deferredAt ||
    diagnostics.acknowledgementPreparedAt < deferredAt ||
    (acceptedAt !== null &&
      diagnostics.acknowledgementPreparedAt > acceptedAt) ||
    (diagnostics.firstProviderAttemptAt !== null &&
      diagnostics.firstProviderAttemptAt <
        (acceptedAt ?? diagnostics.acknowledgementPreparedAt)) ||
    (diagnostics.clatterSucceededAt !== null &&
      diagnostics.clatterSucceededAt < diagnostics.acknowledgementPreparedAt) ||
    (diagnostics.originalResponseMessageId !== null &&
      diagnostics.clatterSucceededAt === null)
  ) {
    throw new Error("Roll lifecycle diagnostics are invalid");
  }
  return diagnostics;
}

function snapshotBase(
  snapshot: SnapshotEnvelopeV1 | SnapshotEnvelopeV2,
): RollLifecycleSnapshotBase {
  const context = parseRollLifecycleContext(snapshot.context);
  if ((snapshot.scope === "guild") !== (context.guildId !== null)) {
    throw new Error("Roll lifecycle snapshot is invalid");
  }
  return {
    interactionId: snapshot.interactionId,
    revision: snapshot.revision,
    commandName: snapshot.commandName,
    scope: snapshot.scope,
    receivedAt: snapshot.receivedAt,
    deferredAt: snapshot.deferredAt,
    acceptedAt: snapshot.acceptedAt,
    deliveryStartedAt: snapshot.deliveryStartedAt,
    terminalAt: snapshot.terminalAt,
    state: snapshot.state,
    attempts: snapshot.attempts,
    httpStatus: snapshot.httpStatus,
    failurePhase: snapshot.failurePhase,
    failureCode: snapshot.failureCode,
    context,
  };
}

export function parseRollLifecycleSnapshot(
  value: SchemaInput,
): RollLifecycleSnapshot {
  const boundary = boundaryObjectSchema.safeParse(value);
  if (!boundary.success) throw new Error("Roll lifecycle snapshot is invalid");

  if (boundary.data.version === 2) {
    const parsed = RollLifecycleSnapshotV2Schema.safeParse(boundary.data);
    if (!parsed.success) throw new Error("Roll lifecycle snapshot is invalid");
    const common = snapshotBase(parsed.data);
    return {
      version: 2,
      ...common,
      diagnostics: parseRollLifecycleDiagnostics(
        parsed.data.diagnostics,
        parsed.data.receivedAt,
        parsed.data.deferredAt,
        parsed.data.acceptedAt,
      ),
    };
  }

  const parsed = RollLifecycleSnapshotV1Schema.safeParse(boundary.data);
  if (!parsed.success) throw new Error("Roll lifecycle snapshot is invalid");
  return { version: 1, ...snapshotBase(parsed.data) };
}

function validAlertTimes(value: {
  deferredAt: number;
  acceptedAt: number | null;
  deliveryStartedAt: number | null;
  terminalAt: number | null;
}): boolean {
  const lifecycleStart = value.acceptedAt ?? value.deferredAt;
  return (value.acceptedAt === null || value.acceptedAt >= value.deferredAt) &&
    (value.deliveryStartedAt === null ||
      value.deliveryStartedAt >= lifecycleStart) &&
    (value.terminalAt === null || value.terminalAt >= lifecycleStart);
}

const RollLifecycleAlertV1Schema = strictObjectSchema({
  version: z.literal(1),
  ...AlertBaseSchema,
}).refine((alert) => validAlertTimes(alert) && validLifecycleState(alert));
const RollLifecycleAlertV2Schema = strictObjectSchema({
  version: z.literal(2),
  ...AlertBaseSchema,
  receivedAt: z.unknown(),
  diagnostics: z.unknown(),
}).refine((alert) => validAlertTimes(alert) && validLifecycleState(alert));

type AlertEnvelopeV1 = z.infer<typeof RollLifecycleAlertV1Schema>;
type AlertEnvelopeV2 = z.infer<typeof RollLifecycleAlertV2Schema>;

function alertBase(
  alert: AlertEnvelopeV1 | AlertEnvelopeV2,
): RollLifecycleAlertBase {
  return {
    interactionId: alert.interactionId,
    alertMessageId: alert.alertMessageId,
    state: alert.state,
    deferredAt: alert.deferredAt,
    acceptedAt: alert.acceptedAt,
    deliveryStartedAt: alert.deliveryStartedAt,
    terminalAt: alert.terminalAt,
    attempts: alert.attempts,
    httpStatus: alert.httpStatus,
    failurePhase: alert.failurePhase,
    failureCode: alert.failureCode,
    context: parseRollLifecycleContext(alert.context),
  };
}

export function parseRollLifecycleAlert(
  value: SchemaInput,
): RollLifecycleAlert {
  const boundary = boundaryObjectSchema.safeParse(value);
  if (!boundary.success) throw new Error("Roll lifecycle alert is invalid");

  if (boundary.data.version === 2) {
    const parsed = RollLifecycleAlertV2Schema.safeParse(boundary.data);
    if (!parsed.success) throw new Error("Roll lifecycle alert is invalid");
    const common = alertBase(parsed.data);
    const receivedAt = timestampSchema.safeParse(parsed.data.receivedAt);
    if (!receivedAt.success || receivedAt.data > parsed.data.deferredAt) {
      throw new Error("Roll lifecycle alert is invalid");
    }
    return {
      version: 2,
      ...common,
      receivedAt: receivedAt.data,
      diagnostics: parseRollLifecycleDiagnostics(
        parsed.data.diagnostics,
        receivedAt.data,
        parsed.data.deferredAt,
        parsed.data.acceptedAt,
      ),
    };
  }

  const parsed = RollLifecycleAlertV1Schema.safeParse(boundary.data);
  if (!parsed.success) throw new Error("Roll lifecycle alert is invalid");
  return { version: 1, ...alertBase(parsed.data) };
}

export function rollLifecycleContextJson(
  context: RollLifecycleContextV1,
): string {
  const parsed = parseRollLifecycleContext(context);
  return serializeJsonValue(parsed).serialized;
}
