import { DurableObject } from "cloudflare:workers";
import { serializeRenderRequestV4 } from "@dice-witch/dice-v4-model";
import { z } from "zod";
import {
  createCanvasKitRequestRendererV4,
  renderV4WithSingleRetry,
} from "../../../packages/dice-canvaskit/src";
import {
  renderDiceRequestV2ToPng,
  renderDiceRequestV3ToPng,
  renderDiceToPng,
  type RenderResult,
  type RenderResultV2,
  type RenderResultV3,
} from "../../../packages/dice-svg/src";
import {
  executeRoll,
  selectRollDelayMs,
} from "../../../packages/roll-domain/src";
import {
  parseSavedRollDraftV2,
  parseSavedRollNameColorV2,
  parseSavedRollNameV1,
} from "../../../packages/saved-rolls/src";
import {
  buildDeleteOriginalResponse,
  buildEditFollowupResponseWithFile,
  buildEditOriginalResponse,
  buildEditOriginalResponseWithFile,
  buildFollowupResponseWithFile,
  buildPublicFollowupResponse,
  buildInvalidRollHelpMessage,
  buildReadOriginalResponse,
  buildRollClatterMessage,
  buildRollResultMessage,
  rollResultText,
  buildSaveRollCustomId,
  buildTextResultCustomId,
  DISCORD_COMPONENTS_V2_FLAG,
  DISCORD_EPHEMERAL_FLAG,
  parseSaveRollIntent,
  parseTextResultIntent,
  saveRollIntentIdentity,
  textResultIntentIdentity,
  ROLL_SAVE_INTENT_RETENTION_MS,
  LOG_WORK_RETRY_WINDOW_MS,
  parseRollLifecycleSnapshot,
  parseRollLoggingContext,
  validateRollLogArtifact,
  type DiscordComponentsV2Message,
  type RollLifecycleContextV1,
  type RollLifecycleDiagnosticsV2,
  type RollLogArtifact,
  type RollResultMessageOptions,
  type SaveRollIntent,
  type TextResultIntentV1,
} from "../../../packages/discord-contracts/src";
import {
  interactionTokenSchema,
  nonNegativeSafeIntegerSchema,
  safeIntegerSchema,
  snowflakeSchema,
  uuidV4Schema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";
import type {
  ChannelRollMessageDeliveryInputV1,
  ChannelRollMessageDeliveryResultV1,
  DiscordMessageExistenceResult,
} from "../../discord-rest/src/index";
import {
  buildRollRenderRequest,
  ROLL_RENDERER_REVISION_R20_V4,
  ROLL_RENDERER_REVISION_R21_V4,
  ROLL_RENDERER_REVISION_R22_V4,
  ROLL_RENDERER_REVISION_R23_V4,
  ROLL_RENDERER_REVISION_R24_V4,
  ROLL_RENDERER_REVISION_R25_V4,
  ROLL_RENDERER_REVISION_R26_V4,
  ROLL_RENDERER_REVISION_R27_V4,
  ROLL_RENDERER_REVISION_R28_V4,
  ROLL_RENDERER_REVISION_R29_V4,
  ROLL_RENDERER_REVISION_R30_V4,
  ROLL_RENDERER_REVISION_R31_V4,
  ROLL_RENDERER_REVISION_R32_V4,
  ROLL_RENDERER_REVISION_R33_V4,
  ROLL_RENDERER_REVISION_R34_V4,
  ROLL_RENDERER_REVISION_R35_V4,
  ROLL_RENDERER_REVISION_R36_V4,
  ROLL_RENDERER_REVISION_R37_V4,
  ROLL_RENDERER_REVISION_R38_V4,
  ROLL_RENDERER_REVISION_R39_V4,
  ROLL_RENDERER_REVISION_R40_V4,
  ROLL_RENDERER_REVISION_R41_V4,
  ROLL_RENDERER_REVISION_R42_V4,
  ROLL_RENDERER_REVISION_V4,
} from "../../../packages/roll-render-model/src";
import {
  deliveryMetadata,
  interactionCreatedAt,
  interactionExpiresAt,
  mergeCompatibleDeliveryMetadata,
  parseDeliveryMetadata,
  parseRecord,
  retryAfterMs,
  retryDelayMs,
  tokenFingerprint,
  validateDeliveryRequest,
  validateRequest,
  type AcceptRollDeliveryResult,
  type DeliverRollWorkResult,
  type DeliveryMetadata,
  type PrepareRollWorkResult,
  type RenderResultV4,
  type RenderRollWorkResult,
  type RollDeliveryDiagnostics,
  type RollDeliveryFailurePhase,
  type RollDeliverySettings,
  type RollDeliveryStatus,
  type RollDeliveryRequest,
  type RollWorkRecord,
  type RollWorkRecordV5,
  type RollWorkRequest,
  type StoredDeliveryRow,
  type StoredWorkRow,
} from "./contracts";
import {
  buildRollRenderRequestForVersion,
  parseRollRenderVersion,
  parseRollViewPolicy,
  type RollViewPolicy,
} from "./render-version";

export { LogWork } from "./log-work";
export type {
  AcceptLogArtifactResult,
  LogArtifactStatus,
} from "./log-work";
export type {
  LogArtifactImageV1,
  RollLogArtifact,
  RollLogArtifactV1,
  RollLogArtifactV2,
} from "../../../packages/discord-contracts/src";
export { WebDeliveryWork } from "./web-delivery-work";
export type { WebDeliveryExecutionResult } from "./web-delivery-work";
export { WebRollService } from "./web-roll-service";
export type {
  WebRollPreparationResult,
  WebRollResult,
} from "./web-roll-service";

type DiscordRestServicePort = {
  deliverChannelRollMessageV1(
    value: ChannelRollMessageDeliveryInputV1,
  ): Promise<SchemaInput>;
  sendRollHelper(value: RollHelperRequest): Promise<SchemaInput>;
};

type DiscordMessageProbeServicePort = {
  inspectDiscordMessageExistence(
    value: DiscordMessageProbeRequest,
  ): Promise<SchemaInput>;
};

export type RollEnv = Omit<
  RollBindings,
  "DISCORD_MESSAGE_PROBE" | "DISCORD_REST"
> & {
  DISCORD_MESSAGE_PROBE: DiscordMessageProbeServicePort;
  DISCORD_REST: DiscordRestServicePort;
};
export type {
  AcceptRollDeliveryResult,
  DeliverRollWorkResult,
  PrepareRollWorkResult,
  RenderRollWorkResult,
  RollDeliveryDiagnostics,
  RollDeliveryFailurePhase,
  RollDeliveryRequest,
  RollDeliveryStatus,
  RollWorkRecord,
  RollWorkRequest,
} from "./contracts";

function randomSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error("Roll seed generation failed");
  return seed;
}

const DELIVERY_FINALIZATION_BUFFER_MS = 60_000;
const DELIVERY_LAST_ATTEMPT_BUFFER_MS = 1_000;
const MAX_DISCORD_RESPONSE_BODY_BYTES = 8 * 1_024;
const MESSAGE_PROBE_TIMEOUT_MS = 1_500;
const ROLL_DELIVERY_FAILURE_MESSAGE =
  "This roll could not be completed. Please try again.";

function privateTextMessage(
  content: string,
  accentColor: number,
): DiscordComponentsV2Message {
  return {
    flags: DISCORD_COMPONENTS_V2_FLAG | DISCORD_EPHEMERAL_FLAG,
    components: [
      {
        type: 17,
        accent_color: accentColor,
        components: [{ type: 10, content }],
      },
    ],
  };
}

function rollDeliveryFailureMessage(): DiscordComponentsV2Message {
  return privateTextMessage(ROLL_DELIVERY_FAILURE_MESSAGE, 0xe7_4c_3c);
}

type RetryableDeliveryPhase =
  | "settings"
  | "clatter"
  | "snapshot"
  | "discord"
  | "terminal-response";

type DestinationCompletionPhase =
  | RetryableDeliveryPhase
  | RollDeliveryFailurePhase
  | "expired";

type DiscordOperation =
  | "create-followup-clatter"
  | "create-followup-result"
  | "edit-followup-result"
  | "edit-original-clatter"
  | "edit-original-result";

type DiscordFailureDetails = Readonly<{
  code: number | null;
  operation: DiscordOperation;
}>;

type ChannelRollMessageAttempt =
  | {
      delivery: Extract<
        ChannelRollMessageDeliveryResultV1,
        { status: "delivered" }
      >;
    }
  | { result: DeliverRollWorkResult };

const ChannelRollMessageDeliveryResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("delivered"),
    messageId: snowflakeSchema,
    httpStatus: safeIntegerSchema.min(200).max(299),
  }),
  z.strictObject({ status: z.literal("invalid_response") }),
  z.strictObject({
    status: z.literal("retryable"),
    httpStatus: safeIntegerSchema
      .refine(isRetryableHttpStatus)
      .nullable(),
    retryAfterMs: nonNegativeSafeIntegerSchema.nullable(),
  }),
  z.strictObject({
    status: z.literal("failed"),
    httpStatus: safeIntegerSchema
      .min(400)
      .max(599)
      .refine((status) => !isRetryableHttpStatus(status)),
    discordErrorCode: safeIntegerSchema.positive().nullable(),
  }),
]);

function parseChannelRollMessageDeliveryResult(
  value: SchemaInput,
): ChannelRollMessageDeliveryResultV1 {
  const result = ChannelRollMessageDeliveryResultSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Channel roll message delivery response is invalid");
  }
  return result.data;
}

function mergeLifecycleDiagnostics(
  current: RollLifecycleDiagnosticsV2,
  incoming: Partial<RollLifecycleDiagnosticsV2>,
): RollLifecycleDiagnosticsV2 {
  return {
    handlerStartedAt: current.handlerStartedAt,
    acknowledgementPreparedAt: current.acknowledgementPreparedAt,
    acknowledgementType: current.acknowledgementType,
    firstProviderAttemptAt:
      current.firstProviderAttemptAt ?? incoming.firstProviderAttemptAt ?? null,
    clatterSucceededAt:
      current.clatterSucceededAt ?? incoming.clatterSucceededAt ?? null,
    discordErrorCode:
      current.discordErrorCode ?? incoming.discordErrorCode ?? null,
    discordOperation:
      current.discordOperation ?? incoming.discordOperation ?? null,
    originalResponseMessageId:
      current.originalResponseMessageId ??
      incoming.originalResponseMessageId ??
      null,
    originalResponseProbe:
      current.originalResponseProbe ?? incoming.originalResponseProbe ?? null,
  };
}

type RollDeliveryTarget = Readonly<{
  id: string;
  applicationId: string;
  token: string;
}>;

function lifecycleFailureCode(phase: RollDeliveryFailurePhase): string {
  switch (phase) {
    case "record":
      return "stored-record-invalid";
    case "render":
      return "render-failed";
    case "response":
      return "response-build-failed";
    case "deadline":
      return "delivery-deadline";
  }
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function deliveryFinalizationAt(expiresAt: number): number {
  return expiresAt - DELIVERY_FINALIZATION_BUFFER_MS;
}

const DiscordErrorSchema = z.looseObject({ code: safeIntegerSchema });
const DiscordMessageSchema = z.looseObject({ id: snowflakeSchema });
const DiscordBodyStreamSchema = z.custom<ReadableStream<Uint8Array>>(
  (value) => value instanceof ReadableStream,
);

async function readBoundedDiscordJson(
  response: Response,
): Promise<SchemaInput> {
  const contentType = response.headers.get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json" || response.body === null) return null;
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > MAX_DISCORD_RESPONSE_BODY_BYTES)
  ) {
    return null;
  }
  const stream = DiscordBodyStreamSchema.safeParse(response.body);
  if (!stream.success) return null;
  const reader = stream.data.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAX_DISCORD_RESPONSE_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } catch {
    return null;
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: SchemaInput = JSON.parse(new TextDecoder().decode(body));
    return parsed;
  } catch {
    return null;
  }
}

async function readDiscordErrorCode(response: Response): Promise<number | null> {
  const result = DiscordErrorSchema.safeParse(
    await readBoundedDiscordJson(response),
  );
  if (!result.success || result.data.code <= 0) return null;
  return result.data.code;
}

const SAVED_ROLL_SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

async function readDiscordMessageId(response: Response): Promise<string | null> {
  const result = DiscordMessageSchema.safeParse(
    await readBoundedDiscordJson(response),
  );
  return result.success ? result.data.id : null;
}
const SAVED_ROLL_PICKER_MAX_PAGE = { mine: 2, server: 4 } as const;
const SAVED_ROLL_PICKER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS saved_roll_picker (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    user_id TEXT NOT NULL,
    guild_id TEXT,
    channel_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('mine', 'server')),
    page INTEGER NOT NULL CHECK (page BETWEEN 0 AND 4),
    selected_id TEXT,
    selected_revision INTEGER,
    state TEXT NOT NULL CHECK (state IN ('open', 'reserved')),
    run_interaction_id TEXT
  );
`;

type SavedRollSelection = {
  scope: "mine" | "server";
  id: string;
  revision: number;
};

const LowercaseUuidV4Schema = uuidV4Schema.refine(
  (value) => value === value.toLowerCase(),
);

const SavedRollPickerContextSchema = z.strictObject({
  version: z.literal(1),
  interactionId: snowflakeSchema,
  userId: snowflakeSchema,
  guildId: snowflakeSchema.nullable(),
  channelId: snowflakeSchema,
});
type SavedRollPickerContext = z.output<typeof SavedRollPickerContextSchema>;

const SavedRollPickerRowFields = {
  singleton: z.literal(1),
  user_id: snowflakeSchema,
  guild_id: snowflakeSchema.nullable(),
  channel_id: snowflakeSchema,
  expires_at: nonNegativeSafeIntegerSchema,
  scope: z.enum(["mine", "server"]),
  page: safeIntegerSchema.min(0).max(4),
};
const SavedRollPickerRowSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...SavedRollPickerRowFields,
    selected_id: LowercaseUuidV4Schema.nullable(),
    selected_revision: safeIntegerSchema.positive().nullable(),
    state: z.literal("open"),
    run_interaction_id: z.null(),
  }),
  z.strictObject({
    ...SavedRollPickerRowFields,
    selected_id: LowercaseUuidV4Schema,
    selected_revision: safeIntegerSchema.positive(),
    state: z.literal("reserved"),
    run_interaction_id: snowflakeSchema,
  }),
]);
type SavedRollPickerRow = z.output<typeof SavedRollPickerRowSchema>;

type SavedRollInvocationV1 = {
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

const StoredSavedRollInvocationSchema = z.strictObject({
  version: z.literal(1),
  id: LowercaseUuidV4Schema,
  scope: z.enum(["personal", "guild"]),
  name: z.string(),
  notation: z.string(),
  title: z.string().nullable(),
  repetitions: safeIntegerSchema.positive(),
  revision: safeIntegerSchema.positive(),
  nameColor: z.unknown().optional(),
});
const SavedRollOwnerSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("user"), userId: snowflakeSchema }),
  z.strictObject({ type: z.literal("guild"), guildId: snowflakeSchema }),
]);
const SavedRollDataRecordSchema = z.strictObject({
  comparisonKey: z.unknown(),
  createdAt: z.unknown(),
  createdByUserId: z.unknown(),
  displayName: z.unknown(),
  id: LowercaseUuidV4Schema,
  manualOrder: safeIntegerSchema,
  nameColor: z.unknown(),
  notation: z.unknown(),
  owner: SavedRollOwnerSchema,
  pinned: z.boolean(),
  repetitions: z.unknown(),
  revision: safeIntegerSchema,
  title: z.unknown(),
  updatedAt: z.unknown(),
  updatedByUserId: z.unknown(),
  version: z.unknown(),
});
const SavedRollDataResponseSchema = z.strictObject({
  status: z.literal("found"),
  savedRoll: SavedRollDataRecordSchema,
});
const SavedRollColorResponseSchema = z.looseObject({
  status: z.literal("found"),
  savedRoll: z.looseObject({
    id: LowercaseUuidV4Schema,
    version: z.literal(2),
    revision: safeIntegerSchema,
    nameColor: z.unknown(),
  }),
});
const SavedRollListResponseSchema = z.union([
  z.looseObject({
    status: z.literal("found"),
    listRevision: nonNegativeSafeIntegerSchema,
  }),
  z.looseObject({ status: z.literal("missing") }),
]);
const SavedRollCopyResponseSchema = z.looseObject({
  status: z.enum([
    "applied",
    "existing",
    "name_conflict",
    "cap_reached",
    "list_revision_conflict",
    "mutation_conflict",
  ]),
});

const SavedRollSelectionSchema = z.strictObject({
  scope: z.enum(["mine", "server"]),
  id: LowercaseUuidV4Schema,
  revision: safeIntegerSchema.positive(),
});

function parseSavedRollPickerContext(
  value: SchemaInput,
): SavedRollPickerContext {
  const result = SavedRollPickerContextSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Saved roll picker context is invalid");
  }
  return result.data;
}

const SavedRollPickerUpdateSchema = SavedRollPickerContextSchema.extend({
  action: z.enum(["mine", "server", "previous", "next", "select"]),
  selection: SavedRollSelectionSchema.nullable(),
});
const DirectSavedRollReservationSchema = SavedRollPickerContextSchema.extend({
  selection: SavedRollSelectionSchema,
});
const SavedRollDeliveryRequestSchema = z.strictObject({
  version: z.literal(1),
  sessionId: snowflakeSchema,
  selection: SavedRollSelectionSchema,
  deferredAt: nonNegativeSafeIntegerSchema,
  interaction: z.strictObject({
    id: snowflakeSchema,
    applicationId: snowflakeSchema,
    token: interactionTokenSchema,
  }),
  actor: z.strictObject({
    version: z.literal(1),
    userId: snowflakeSchema,
    guildId: snowflakeSchema.nullable(),
    channelId: snowflakeSchema,
    username: z.string(),
    loggingContext: z.unknown().nullable(),
  }),
  sourceInteraction: z.enum(["command", "component"]),
  responseMode: z.enum(["channel-message", "edit-original", "followup"]),
});
const SavedRollCopyRequestSchema = SavedRollPickerContextSchema.extend({
  username: z.string().min(1).max(32),
  name: z.string().nullable(),
});
const TextResultRequestSchema = z.strictObject({
  applicationId: snowflakeSchema,
  guildId: snowflakeSchema,
  channelId: snowflakeSchema,
  messageId: snowflakeSchema,
});

type RollHelperRequest = Readonly<{ rollId: string; userId: string }>;
type DiscordMessageProbeRequest = Readonly<{
  channelId: string;
  messageId: string;
}>;

const RollHelperResultSchema = z.looseObject({
  status: z.literal("delivered"),
});
const DiscordMessageExistenceResultSchema = z.looseObject({
  outcome: z.enum(["exists", "missing", "inaccessible", "probe-failed"]),
});

function parseDiscordMessageExistenceResult(
  value: SchemaInput,
): DiscordMessageExistenceResult {
  const result = DiscordMessageExistenceResultSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Discord message existence response is invalid");
  }
  return result.data;
}

const StoredTelemetryArtifactSchema = z.looseObject({ payload: z.json() });
const LifecycleSyncResponseSchema = z.looseObject({
  status: z.enum(["applied", "existing", "stale"]),
});
const AccountingResponseSchema = z.looseObject({
  status: z.enum(["applied", "existing"]),
});
const LogAcceptanceResponseSchema = z.looseObject({
  status: z.enum(["created", "existing", "conflict"]),
});
const GuildDeliverySettingsResponseSchema = z.looseObject({
  status: z.literal("found"),
  settings: z.looseObject({
    skipDiceDelay: z.boolean(),
    hideRollResultText: z.boolean(),
  }),
});
const StoredSourceLogArtifactSchema = z.looseObject({
  image: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("available"),
      filename: z.string(),
    }),
    z.strictObject({
      status: z.literal("unavailable"),
      reason: z.enum([
        "corrupt",
        "discord-rejected",
        "missing",
        "not-applicable",
        "oversized",
      ]),
    }),
  ]),
});

function samePickerContext(row: SavedRollPickerRow, context: SavedRollPickerContext): boolean {
  return row.user_id === context.userId &&
    row.guild_id === context.guildId &&
    row.channel_id === context.channelId;
}

function pickerState(row: SavedRollPickerRow) {
  return {
    scope: row.scope,
    page: row.page,
    selectedId: row.selected_id,
    selectedRevision: row.selected_revision,
  };
}

type DeliveryRecordResolution =
  | {
      status: "ready";
      record: RollWorkRecord;
      renderSnapshotPreparationMs: number | null;
    }
  | { status: "conflict" }
  | { status: "unavailable" };

type FinishedDeliveryAcceptance = Readonly<{
  result: AcceptRollDeliveryResult;
  recoveryAlarmWriteMs: number;
  expiryAlarmWriteMs: number;
}>;

type LifecycleTimings = Readonly<{
  acknowledgementPreparedAt: number | null;
  acceptedAt: number | null;
  deliveryStartedAt: number | null;
}>;

type RollDelay = Readonly<{
  delayMs: number;
  resultNotBefore: number | null;
}>;

type LifecycleAdvance = {
  state: "delivery_started" | "delivered" | "failed";
  occurredAt: number;
  attempts: number;
  httpStatus: number | null;
  failurePhase?: string | null;
  failureCode?: string | null;
  destinationPayload?:
    | RollLifecycleContextV1["destinationPayload"]
    | DiscordComponentsV2Message;
  diagnostics?: Partial<RollLifecycleDiagnosticsV2>;
};

type DestinationCompletion = {
  rollId: string;
  state: "delivered" | "failed";
  attempts: number;
  httpStatus: number | null;
  failurePhase: DestinationCompletionPhase | null;
  completedAt: number;
  record?: RollWorkRecord;
  delayMs?: number | null;
  resultUploadMs?: number | null;
  discordFailure?: DiscordFailureDetails;
};

// Deployed Workers clocks advance only after I/O, so these spans do not
// claim to measure CPU-only work.
function elapsedMs(startedAt: number, completedAt = Date.now()): number {
  return Math.max(0, completedAt - startedAt);
}

function rollRecordRenderVersion(record: RollWorkRecord): 1 | 2 | 3 | 4 {
  return record.version === 5 ? record.renderVersion : record.version;
}

function rollRecordV5ViewPolicy(
  record: RollWorkRecordV5,
): RollViewPolicy {
  return record.renderVersion === 4 ? (record.viewPolicy ?? "r19") : "r19";
}

function rollRecordRendererRevision(record: RollWorkRecord): string | null {
  if (record.version === 4 && record.renderRequest !== null) {
    return record.renderRequest.rendererRevision;
  }
  if (record.version === 5 && record.renderVersion === 4) {
    if (record.renderRequest !== null) {
      return record.renderRequest.rendererRevision;
    }
    const viewPolicy = rollRecordV5ViewPolicy(record);
    if (viewPolicy === "r42") return ROLL_RENDERER_REVISION_R42_V4;
    if (viewPolicy === "r41") return ROLL_RENDERER_REVISION_R41_V4;
    if (viewPolicy === "r40") return ROLL_RENDERER_REVISION_R40_V4;
    if (viewPolicy === "r39") return ROLL_RENDERER_REVISION_R39_V4;
    if (viewPolicy === "r38") return ROLL_RENDERER_REVISION_R38_V4;
    if (viewPolicy === "r37") return ROLL_RENDERER_REVISION_R37_V4;
    if (viewPolicy === "r36") return ROLL_RENDERER_REVISION_R36_V4;
    if (viewPolicy === "r35") return ROLL_RENDERER_REVISION_R35_V4;
    if (viewPolicy === "r34") return ROLL_RENDERER_REVISION_R34_V4;
    if (viewPolicy === "r33") return ROLL_RENDERER_REVISION_R33_V4;
    if (viewPolicy === "r32") return ROLL_RENDERER_REVISION_R32_V4;
    if (viewPolicy === "r31") return ROLL_RENDERER_REVISION_R31_V4;
    if (viewPolicy === "r30") return ROLL_RENDERER_REVISION_R30_V4;
    if (viewPolicy === "r29") return ROLL_RENDERER_REVISION_R29_V4;
    if (viewPolicy === "r28") return ROLL_RENDERER_REVISION_R28_V4;
    if (viewPolicy === "r27") return ROLL_RENDERER_REVISION_R27_V4;
    if (viewPolicy === "r26") return ROLL_RENDERER_REVISION_R26_V4;
    if (viewPolicy === "r25") return ROLL_RENDERER_REVISION_R25_V4;
    if (viewPolicy === "r24") return ROLL_RENDERER_REVISION_R24_V4;
    if (viewPolicy === "r23") return ROLL_RENDERER_REVISION_R23_V4;
    if (viewPolicy === "r22") return ROLL_RENDERER_REVISION_R22_V4;
    if (viewPolicy === "r21") return ROLL_RENDERER_REVISION_R21_V4;
    if (viewPolicy === "r20") return ROLL_RENDERER_REVISION_R20_V4;
    return ROLL_RENDERER_REVISION_V4;
  }
  return null;
}

function rollRecordV5Identity(record: RollWorkRecordV5): string {
  return JSON.stringify({
    request: record.request,
    rollSeed: record.rollSeed,
    renderSeed: record.renderSeed,
    outcome: record.outcome,
    createdAt: record.createdAt,
    renderVersion: record.renderVersion,
    viewPolicy: rollRecordV5ViewPolicy(record),
  });
}

function logDurableAcceptanceTiming(input: Readonly<{
  acknowledgementPreparedAt: number;
  acknowledgementType: 4 | 5 | 6;
  handlerStartedAt: number;
  handlerCompletedAt: number;
  recordPreparationMs: number;
  renderSnapshotPreparationMs: number | null;
  recoveryAlarmWriteMs: number;
  expiryAlarmWriteMs: number;
  deliveryAlarmWriteMs: number | null;
}>): void {
  // This new event starts at schema version 1 and is emitted only for
  // validated RollDeliveryTelemetryV2 input.
  try {
    console.info({
      telemetryVersion: 1,
      level: "info",
      message: "Roll durable acceptance completed",
      subsystem: "roll-acceptance",
      acceptanceStatus: "created",
      acknowledgementType: input.acknowledgementType,
      timingClock: "workers-io",
      acknowledgementToHandlerStartMs: elapsedMs(
        input.acknowledgementPreparedAt,
        input.handlerStartedAt,
      ),
      recordPreparationMs: input.recordPreparationMs,
      renderSnapshotPreparationMs: input.renderSnapshotPreparationMs,
      recoveryAlarmWriteMs: input.recoveryAlarmWriteMs,
      expiryAlarmWriteMs: input.expiryAlarmWriteMs,
      deliveryAlarmWriteMs: input.deliveryAlarmWriteMs,
      handlerElapsedMs: elapsedMs(
        input.handlerStartedAt,
        input.handlerCompletedAt,
      ),
      acknowledgementToHandlerCompleteMs: elapsedMs(
        input.acknowledgementPreparedAt,
        input.handlerCompletedAt,
      ),
    });
  } catch {
    // Observability must not turn durable acceptance into a failure.
  }
}

function deliveryTelemetryContext(
  metadata: DeliveryMetadata | null,
  record: RollWorkRecord | undefined,
  destinationPayload: RollLifecycleContextV1["destinationPayload"],
  destinationDeliveredAt: number | null,
) {
  const logging = metadata?.logging ?? null;
  const accounting = metadata?.accounting ?? null;
  const context = logging?.context ?? null;
  const guildContext = context?.kind === "guild" ? context : null;
  return {
    interactionId: metadata?.interactionId ?? null,
    applicationId: metadata?.applicationId ?? null,
    source: logging?.source ?? null,
    notation: logging?.notation ?? null,
    request: record?.request ?? null,
    outcome: record?.outcome ?? null,
    rollSeed: record?.rollSeed ?? null,
    renderSeed: record?.renderSeed ?? null,
    title: metadata?.message.title ?? null,
    savedRoll: metadata?.savedRoll ?? null,
    userId: accounting?.userId ?? null,
    username: metadata?.message.username ?? null,
    guildId: accounting?.guildId ?? null,
    channelId: logging?.channelId ?? null,
    context,
    guildName: guildContext?.guildName ?? null,
    channelName: guildContext?.channelName ?? null,
    channelType: guildContext?.channelType ?? null,
    destinationPayload,
    destinationDeliveredAt,
  };
}

type StoredLifecycleOutboxRow = {
  snapshot_json: string;
  synced_revision: number;
  sync_attempts: number;
  next_sync_at: number;
};

type StoredSourceLogRow = {
  artifact_json: string;
  image_bytes: ArrayBuffer;
  image_sha256: string;
  destination_delivered_at: number | null;
  handoff_until: number | null;
};

type SourceLogArtifact = { artifact: RollLogArtifact };

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rollLogArtifact(value: SchemaInput): RollLogArtifact {
  const artifact = { ...validateRollLogArtifact(value) };
  Reflect.deleteProperty(artifact, "payloadJson");
  return artifact;
}

export class RollWork extends DurableObject<RollEnv> {
  private activeAcceptances = 0;
  private activeDelivery: Promise<DeliverRollWorkResult> | null = null;
  private activeAccounting: Promise<void> | null = null;
  private activeLogging: Promise<void> | null = null;
  private activeHelper: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: RollEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS roll_work (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        request_json TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS interaction_delivery (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        metadata_json TEXT NOT NULL,
        token TEXT,
        token_fingerprint TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'failed')),
        delivered_at INTEGER,
        last_http_status INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        failure_phase TEXT CHECK (failure_phase IN (
          'record', 'render', 'response', 'deadline'
        )),
        clatter_sent_at INTEGER,
        followup_message_id TEXT,
        skip_dice_delay INTEGER CHECK (skip_dice_delay IN (0, 1)),
        hide_roll_result_text INTEGER
          CHECK (hide_roll_result_text IN (0, 1)),
        delay_ms INTEGER CHECK (delay_ms BETWEEN 1 AND 5000),
        result_not_before INTEGER CHECK (result_not_before >= 0),
        snapshot_ms INTEGER CHECK (snapshot_ms >= 0),
        settings_ms INTEGER CHECK (settings_ms >= 0),
        clatter_post_ms INTEGER CHECK (clatter_post_ms >= 0),
        lifecycle_sync_ms INTEGER CHECK (lifecycle_sync_ms >= 0),
        accounting_ms INTEGER CHECK (accounting_ms >= 0),
        accounting_state TEXT NOT NULL DEFAULT 'not_applicable'
          CHECK (accounting_state IN (
            'pending', 'not_applicable', 'accounted', 'failed'
          )),
        accounting_occurred_at INTEGER,
        accounting_http_status INTEGER,
        accounting_attempts INTEGER NOT NULL DEFAULT 0,
        logging_state TEXT NOT NULL DEFAULT 'not_applicable'
          CHECK (logging_state IN (
            'pending', 'not_applicable', 'delivered', 'failed'
          )),
        logging_http_status INTEGER,
        logging_attempts INTEGER NOT NULL DEFAULT 0,
        helper_state TEXT NOT NULL DEFAULT 'not_applicable'
          CHECK (helper_state IN (
            'pending', 'not_applicable', 'delivered', 'failed'
          )),
        helper_attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS roll_log_outbox (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        artifact_json TEXT NOT NULL,
        image_bytes BLOB NOT NULL,
        image_sha256 TEXT NOT NULL,
        destination_delivered_at INTEGER,
        handoff_until INTEGER
      );
      CREATE TABLE IF NOT EXISTS roll_lifecycle_outbox (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        snapshot_json TEXT NOT NULL,
        synced_revision INTEGER NOT NULL DEFAULT 0,
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        next_sync_at INTEGER NOT NULL
      );
      ${SAVED_ROLL_PICKER_SCHEMA}
      CREATE TABLE IF NOT EXISTS saved_roll_invocation (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        invocation_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_roll_copy_receipt (
        interaction_id TEXT PRIMARY KEY,
        destination_id TEXT NOT NULL,
        mutation_id TEXT NOT NULL,
        expected_list_revision INTEGER NOT NULL,
        display_name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS save_roll_intent (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        intent_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS text_result_intent (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        intent_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
    const savedRollPickerSchema = this.ctx.storage.sql
      .exec<{ sql: string | null }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'saved_roll_picker'",
      )
      .one().sql;
    if (savedRollPickerSchema === null) {
      throw new Error("Saved roll picker schema is unavailable");
    }
    if (savedRollPickerSchema.includes("page BETWEEN 0 AND 3")) {
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          "ALTER TABLE saved_roll_picker RENAME TO saved_roll_picker_v1",
        );
        this.ctx.storage.sql.exec(SAVED_ROLL_PICKER_SCHEMA);
        this.ctx.storage.sql.exec(`
          INSERT INTO saved_roll_picker (
            singleton, user_id, guild_id, channel_id, expires_at, scope, page,
            selected_id, selected_revision, state, run_interaction_id
          )
          SELECT
            singleton, user_id, guild_id, channel_id, expires_at, scope, page,
            selected_id, selected_revision, state, run_interaction_id
          FROM saved_roll_picker_v1;
          DROP TABLE saved_roll_picker_v1;
        `);
      });
    }
    const deliveryColumns = this.ctx.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(interaction_delivery)")
      .toArray();
    const upgrades = [
      ["clatter_sent_at", "clatter_sent_at INTEGER"],
      ["followup_message_id", "followup_message_id TEXT"],
      [
        "skip_dice_delay",
        "skip_dice_delay INTEGER CHECK (skip_dice_delay IN (0, 1))",
      ],
      [
        "hide_roll_result_text",
        `hide_roll_result_text INTEGER
          CHECK (hide_roll_result_text IN (0, 1))`,
      ],
      ["delay_ms", "delay_ms INTEGER CHECK (delay_ms BETWEEN 1 AND 5000)"],
      [
        "result_not_before",
        "result_not_before INTEGER CHECK (result_not_before >= 0)",
      ],
      ["snapshot_ms", "snapshot_ms INTEGER CHECK (snapshot_ms >= 0)"],
      ["settings_ms", "settings_ms INTEGER CHECK (settings_ms >= 0)"],
      [
        "clatter_post_ms",
        "clatter_post_ms INTEGER CHECK (clatter_post_ms >= 0)",
      ],
      [
        "lifecycle_sync_ms",
        "lifecycle_sync_ms INTEGER CHECK (lifecycle_sync_ms >= 0)",
      ],
      ["accounting_ms", "accounting_ms INTEGER CHECK (accounting_ms >= 0)"],
      [
        "accounting_state",
        "accounting_state TEXT NOT NULL DEFAULT 'not_applicable'",
      ],
      ["accounting_occurred_at", "accounting_occurred_at INTEGER"],
      ["accounting_http_status", "accounting_http_status INTEGER"],
      [
        "accounting_attempts",
        "accounting_attempts INTEGER NOT NULL DEFAULT 0",
      ],
      [
        "logging_state",
        "logging_state TEXT NOT NULL DEFAULT 'not_applicable'",
      ],
      ["logging_http_status", "logging_http_status INTEGER"],
      [
        "logging_attempts",
        "logging_attempts INTEGER NOT NULL DEFAULT 0",
      ],
      [
        "helper_state",
        "helper_state TEXT NOT NULL DEFAULT 'not_applicable'",
      ],
      ["helper_attempts", "helper_attempts INTEGER NOT NULL DEFAULT 0"],
      [
        "failure_phase",
        `failure_phase TEXT CHECK (failure_phase IN (
          'record', 'render', 'response', 'deadline'
        ))`,
      ],
    ] as const;
    for (const [name, definition] of upgrades) {
      if (!deliveryColumns.some((column) => column.name === name)) {
        this.ctx.storage.sql.exec(
          `ALTER TABLE interaction_delivery ADD COLUMN ${definition}`,
        );
      }
    }
  }

  private readSavedRollPicker(): SavedRollPickerRow | undefined {
    const row: SchemaInput = this.ctx.storage.sql
      .exec("SELECT * FROM saved_roll_picker WHERE singleton = 1")
      .toArray()[0];
    if (row === undefined) return undefined;
    const result = SavedRollPickerRowSchema.safeParse(row);
    if (!result.success) throw new Error("Stored saved roll picker is invalid");
    return result.data;
  }

  openSavedRollPicker(value: SchemaInput) {
    const context = parseSavedRollPickerContext(value);
    if (this.ctx.id.name !== context.interactionId) return { status: "conflict" } as const;
    const expiresAt = interactionExpiresAt(context.interactionId);
    if (expiresAt <= Date.now()) return { status: "expired" } as const;
    return this.ctx.storage.transactionSync(() => {
      const existing = this.readSavedRollPicker();
      if (existing !== undefined) {
        return samePickerContext(existing, context)
          ? { status: "existing" as const, ...pickerState(existing) }
          : { status: "conflict" as const };
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO saved_roll_picker (
           singleton, user_id, guild_id, channel_id, expires_at, scope, page,
           selected_id, selected_revision, state, run_interaction_id
         ) VALUES (1, ?, ?, ?, ?, 'mine', 0, NULL, NULL, 'open', NULL)`,
        context.userId,
        context.guildId,
        context.channelId,
        expiresAt,
      );
      return {
        status: "created" as const,
        scope: "mine" as const,
        page: 0,
        selectedId: null,
        selectedRevision: null,
      };
    });
  }

  updateSavedRollPicker(value: SchemaInput) {
    const result = SavedRollPickerUpdateSchema.safeParse(value);
    if (!result.success) {
      throw new Error("Saved roll picker update is invalid");
    }
    const update = result.data;
    const context: SavedRollPickerContext = {
      version: update.version,
      interactionId: update.interactionId,
      userId: update.userId,
      guildId: update.guildId,
      channelId: update.channelId,
    };
    const selection = update.selection;
    return this.ctx.storage.transactionSync(() => {
      const row = this.readSavedRollPicker();
      if (row === undefined) return { status: "missing" as const };
      if (!samePickerContext(row, context)) return { status: "unauthorized" as const };
      if (row.expires_at <= Date.now()) return { status: "expired" as const };
      if (row.state !== "open") return { status: "consumed" as const };
      const { action } = update;
      if (
        (action === "server" && context.guildId === null) ||
        (action === "select" &&
          (selection === null ||
            selection.scope !== row.scope ||
            (selection.scope === "server" && context.guildId === null)))
      ) {
        return { status: "invalid_selection" as const };
      }
      let scope = row.scope;
      let page = row.page;
      let selectedId = row.selected_id;
      let selectedRevision = row.selected_revision;
      if (action === "mine" || action === "server") {
        scope = action;
        page = 0;
        selectedId = null;
        selectedRevision = null;
      } else if (action === "previous") {
        page = Math.max(0, page - 1);
        selectedId = null;
        selectedRevision = null;
      } else if (action === "next") {
        page = Math.min(SAVED_ROLL_PICKER_MAX_PAGE[scope], page + 1);
        selectedId = null;
        selectedRevision = null;
      } else if (selection !== null) {
        selectedId = selection.id;
        selectedRevision = selection.revision;
      }
      this.ctx.storage.sql.exec(
        `UPDATE saved_roll_picker
         SET scope = ?, page = ?, selected_id = ?, selected_revision = ?
         WHERE singleton = 1`,
        scope,
        page,
        selectedId,
        selectedRevision,
      );
      return { status: "updated" as const, scope, page, selectedId, selectedRevision };
    });
  }

  reserveSavedRollRun(value: SchemaInput) {
    const context = parseSavedRollPickerContext(value);
    return this.ctx.storage.transactionSync(() => {
      const row = this.readSavedRollPicker();
      if (row === undefined) return { status: "missing" as const };
      if (!samePickerContext(row, context)) return { status: "unauthorized" as const };
      if (row.expires_at <= Date.now()) return { status: "expired" as const };
      if (row.state === "reserved") {
        return row.run_interaction_id === context.interactionId
          ? {
              status: "existing" as const,
              selection: {
                scope: row.scope,
                id: row.selected_id,
                revision: row.selected_revision,
              },
            }
          : { status: "consumed" as const };
      }
      if (row.selected_id === null || row.selected_revision === null) {
        return { status: "invalid_selection" as const };
      }
      this.ctx.storage.sql.exec(
        `UPDATE saved_roll_picker
         SET state = 'reserved', run_interaction_id = ?
         WHERE singleton = 1`,
        context.interactionId,
      );
      return {
        status: "reserved" as const,
        selection: {
          scope: row.scope,
          id: row.selected_id,
          revision: row.selected_revision,
        },
      };
    });
  }

  reserveDirectSavedRoll(value: SchemaInput) {
    const result = DirectSavedRollReservationSchema.safeParse(value);
    if (!result.success) {
      throw new Error("Direct saved roll reservation is invalid");
    }
    const reservation = result.data;
    const context: SavedRollPickerContext = {
      version: reservation.version,
      interactionId: reservation.interactionId,
      userId: reservation.userId,
      guildId: reservation.guildId,
      channelId: reservation.channelId,
    };
    const selection = reservation.selection;
    if (
      this.ctx.id.name !== context.interactionId ||
      (selection.scope === "server" && context.guildId === null)
    ) {
      return { status: "conflict" } as const;
    }
    const expiresAt = interactionExpiresAt(context.interactionId);
    if (expiresAt <= Date.now()) return { status: "expired" } as const;
    return this.ctx.storage.transactionSync(() => {
      const existing = this.readSavedRollPicker();
      if (existing !== undefined) {
        if (!samePickerContext(existing, context)) return { status: "conflict" as const };
        const sameSelection = existing.scope === selection.scope &&
          existing.selected_id === selection.id &&
          existing.selected_revision === selection.revision &&
          existing.run_interaction_id === context.interactionId;
        return sameSelection
          ? { status: "existing" as const, selection }
          : { status: "conflict" as const };
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO saved_roll_picker (
           singleton, user_id, guild_id, channel_id, expires_at, scope, page,
           selected_id, selected_revision, state, run_interaction_id
         ) VALUES (1, ?, ?, ?, ?, ?, 0, ?, ?, 'reserved', ?)`,
        context.userId,
        context.guildId,
        context.channelId,
        expiresAt,
        selection.scope,
        selection.id,
        selection.revision,
        context.interactionId,
      );
      return { status: "reserved" as const, selection };
    });
  }

  private readSavedRollInvocation(): SavedRollInvocationV1 | undefined {
    const row = this.ctx.storage.sql
      .exec<{ invocation_json: string }>(
        "SELECT invocation_json FROM saved_roll_invocation WHERE singleton = 1",
      )
      .toArray()[0];
    if (row === undefined) return undefined;
    const input: SchemaInput = JSON.parse(row.invocation_json);
    const result = StoredSavedRollInvocationSchema.safeParse(input);
    if (!result.success) {
      throw new Error("Stored saved roll invocation is invalid");
    }
    return {
      ...result.data,
      nameColor: parseSavedRollNameColorV2(result.data.nameColor ?? null),
    };
  }

  private async resolveSavedRollInvocation(
    selection: SavedRollSelection,
    row: SavedRollPickerRow,
    persist = true,
  ): Promise<SavedRollInvocationV1 | "missing" | "stale" | "unavailable" | "conflict"> {
    const existing = this.readSavedRollInvocation();
    if (existing !== undefined) {
      const expectedScope = selection.scope === "mine" ? "personal" : "guild";
      return existing.id === selection.id &&
        existing.scope === expectedScope &&
        existing.revision === selection.revision
        ? existing
        : "conflict";
    }
    let owner:
      | { type: "user"; userId: string }
      | { type: "guild"; guildId: string };
    if (selection.scope === "mine") {
      owner = { type: "user", userId: row.user_id };
    } else {
      if (row.guild_id === null) return "conflict";
      owner = { type: "guild", guildId: row.guild_id };
    }
    let response: Response;
    try {
      response = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/saved-rolls/v2/get", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner, id: selection.id }),
        }),
      );
    } catch {
      return "unavailable";
    }
    if (response.status === 404) return "missing";
    if (!response.ok) return "unavailable";
    let value: SchemaInput;
    try {
      value = await response.json();
    } catch {
      return "unavailable";
    }
    const result = SavedRollDataResponseSchema.safeParse(value);
    if (!result.success) return "unavailable";
    const { savedRoll } = result.data;
    if (
      savedRoll.id !== selection.id ||
      JSON.stringify(savedRoll.owner) !== JSON.stringify(owner)
    ) {
      return "unavailable";
    }
    let draft;
    try {
      draft = parseSavedRollDraftV2({
        version: savedRoll.version,
        name: savedRoll.displayName,
        notation: savedRoll.notation,
        title: savedRoll.title,
        repetitions: savedRoll.repetitions,
        nameColor: savedRoll.nameColor,
      });
    } catch {
      return "unavailable";
    }
    if (savedRoll.revision !== selection.revision) return "stale";
    const invocation: SavedRollInvocationV1 = {
      version: 1,
      id: selection.id,
      scope: selection.scope === "mine" ? "personal" : "guild",
      name: draft.displayName,
      notation: draft.notation,
      title: draft.title,
      repetitions: draft.repetitions,
      revision: selection.revision,
      nameColor: draft.nameColor,
    };
    if (!persist) return invocation;
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO saved_roll_invocation (singleton, invocation_json) VALUES (1, ?)",
      JSON.stringify(invocation),
    );
    const stored = this.readSavedRollInvocation();
    return stored !== undefined && JSON.stringify(stored) === JSON.stringify(invocation)
      ? stored
      : "conflict";
  }

  private async resolveSavedRollNameColor(
    owner: { type: "guild"; guildId: string },
    selection: SavedRollSelection,
  ): Promise<
    | { status: "found"; nameColor: string | null }
    | { status: "unavailable" }
  > {
    let response: Response;
    try {
      response = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/saved-rolls/v2/get", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner, id: selection.id }),
        }),
      );
    } catch {
      return { status: "unavailable" };
    }
    if (!response.ok) return { status: "unavailable" };
    let value: SchemaInput;
    try {
      value = await response.json();
    } catch {
      return { status: "unavailable" };
    }
    const result = SavedRollColorResponseSchema.safeParse(value);
    if (
      !result.success ||
      result.data.savedRoll.id !== selection.id ||
      result.data.savedRoll.revision !== selection.revision
    ) {
      return { status: "unavailable" };
    }
    try {
      return {
        status: "found",
        nameColor: parseSavedRollNameColorV2(
          result.data.savedRoll.nameColor,
        ),
      };
    } catch {
      return { status: "unavailable" };
    }
  }

  async acceptSavedRollDelivery(value: SchemaInput) {
    const result = SavedRollDeliveryRequestSchema.safeParse(value);
    if (!result.success || result.data.sessionId !== this.ctx.id.name) {
      throw new Error("Saved roll delivery request is invalid");
    }
    const request = result.data;
    const selection = request.selection;
    const context: SavedRollPickerContext = {
      version: request.actor.version,
      interactionId: request.interaction.id,
      userId: request.actor.userId,
      guildId: request.actor.guildId,
      channelId: request.actor.channelId,
    };
    // Components accept both legacy modes during the independently deployed
    // Interactions-to-Roll contract transition.
    const validResponseMode = request.sourceInteraction === "component" ||
      request.responseMode === "edit-original";
    if (!validResponseMode) {
      throw new Error("Saved roll delivery response mode is invalid");
    }
    const picker = this.readSavedRollPicker();
    if (picker === undefined) return { status: "missing" } as const;
    if (!samePickerContext(picker, context)) return { status: "unauthorized" } as const;
    if (
      picker.state !== "reserved" ||
      picker.run_interaction_id !== context.interactionId ||
      picker.selected_id !== selection.id ||
      picker.selected_revision !== selection.revision ||
      picker.scope !== selection.scope
    ) {
      return { status: "conflict" } as const;
    }
    const resolution = await this.resolveSavedRollInvocation(selection, picker);
    switch (resolution) {
      case "missing":
      case "stale":
      case "unavailable":
      case "conflict":
        return { status: resolution } as const;
    }
    const invocation = resolution;
    const logging: RollDeliveryRequest["logging"] = {
      source: "discord",
      channelId: context.channelId,
      notation: invocation.notation,
    };
    if (request.actor.loggingContext !== null) {
      logging.context = parseRollLoggingContext(
        request.actor.loggingContext,
        context.guildId,
        context.channelId,
      );
    }
    const delivery = {
      interaction: request.interaction,
      request: {
        notation: invocation.notation,
        repetitions: invocation.repetitions,
      },
      message: { title: invocation.title, username: request.actor.username },
      accounting: {
        guildId: context.guildId,
        userId: context.userId,
        receivedAt: interactionExpiresAt(context.interactionId) - 15 * 60 * 1_000,
      },
      deferredAt: request.deferredAt,
      logging,
      responseMode: request.responseMode,
      savedRoll: invocation,
    };
    const accepted = await this.acceptDelivery(delivery);
    return accepted.status === "created" || accepted.status === "existing"
      ? { ...accepted, savedRoll: invocation }
      : accepted;
  }

  async copySavedRollToMine(value: SchemaInput) {
    const result = SavedRollCopyRequestSchema.safeParse(value);
    if (!result.success) {
      throw new Error("Saved roll copy request is invalid");
    }
    const request = result.data;
    const context: SavedRollPickerContext = {
      version: request.version,
      interactionId: request.interactionId,
      userId: request.userId,
      guildId: request.guildId,
      channelId: request.channelId,
    };
    const picker = this.readSavedRollPicker();
    if (picker === undefined) return { status: "missing" } as const;
    if (!samePickerContext(picker, context)) return { status: "unauthorized" } as const;
    if (picker.expires_at <= Date.now()) return { status: "expired" } as const;
    if (
      picker.scope !== "server" ||
      picker.selected_id === null ||
      picker.selected_revision === null
    ) {
      return { status: "invalid_selection" } as const;
    }
    const selection: SavedRollSelection = {
      scope: "server",
      id: picker.selected_id,
      revision: picker.selected_revision,
    };
    const resolution = await this.resolveSavedRollInvocation(
      selection,
      picker,
      picker.state === "reserved",
    );
    switch (resolution) {
      case "missing":
      case "stale":
      case "unavailable":
      case "conflict":
        return { status: resolution } as const;
    }
    const resolved = resolution;
    if (picker.guild_id === null) return { status: "invalid_selection" } as const;
    const colorResult = await this.resolveSavedRollNameColor(
      { type: "guild", guildId: picker.guild_id },
      selection,
    );
    if (colorResult.status === "unavailable") {
      return { status: "unavailable" } as const;
    }
    const { nameColor } = colorResult;
    let displayName = resolved.name;
    if (request.name !== null) {
      try {
        displayName = parseSavedRollNameV1(request.name).displayName;
      } catch {
        return { status: "invalid_name" } as const;
      }
    }
    const owner = { type: "user" as const, userId: context.userId };
    try {
      const ensureResponse = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/saved-rolls/v1/ensure-user", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            userId: context.userId,
            username: request.username,
            occurredAt: interactionCreatedAt(context.interactionId),
          }),
        }),
      );
      if (!ensureResponse.ok) return { status: "unavailable" } as const;
    } catch {
      return { status: "unavailable" } as const;
    }
    let listResponse: Response;
    try {
      listResponse = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/saved-rolls/v1/list", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ owner }),
        }),
      );
    } catch {
      return { status: "unavailable" } as const;
    }
    if (!listResponse.ok && listResponse.status !== 404) {
      return { status: "unavailable" } as const;
    }
    let listValue: SchemaInput;
    try {
      listValue = await listResponse.json();
    } catch {
      return { status: "unavailable" } as const;
    }
    const listResult = SavedRollListResponseSchema.safeParse(listValue);
    if (!listResult.success) return { status: "unavailable" } as const;
    const listRevision = listResult.data.status === "found"
      ? listResult.data.listRevision
      : 0;
    const receipt = this.ctx.storage.transactionSync(() => {
      const existing = this.ctx.storage.sql
        .exec<{
          destination_id: string;
          mutation_id: string;
          expected_list_revision: number;
          display_name: string;
        }>(
          `SELECT destination_id, mutation_id, expected_list_revision, display_name
           FROM saved_roll_copy_receipt WHERE interaction_id = ?`,
          context.interactionId,
        )
        .toArray()[0];
      if (existing !== undefined) return existing;
      const created = {
        destination_id: crypto.randomUUID(),
        mutation_id: `discord-saved-roll-copy:${this.ctx.id.name}:${context.interactionId}`,
        expected_list_revision: listRevision,
        display_name: displayName,
      };
      this.ctx.storage.sql.exec(
        `INSERT INTO saved_roll_copy_receipt (
           interaction_id, destination_id, mutation_id,
           expected_list_revision, display_name
         ) VALUES (?, ?, ?, ?, ?)`,
        context.interactionId,
        created.destination_id,
        created.mutation_id,
        created.expected_list_revision,
        created.display_name,
      );
      return created;
    });
    if (receipt.display_name !== displayName) return { status: "conflict" } as const;
    let copyResponse: Response;
    try {
      copyResponse = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/saved-rolls/v2/copy", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            owner,
            actorUserId: context.userId,
            authorizationUpdatedAt: null,
            expectedListRevision: receipt.expected_list_revision,
            id: receipt.destination_id,
            mutationId: receipt.mutation_id,
            occurredAt: interactionCreatedAt(context.interactionId),
            pinned: false,
            draft: {
              version: 2,
              name: receipt.display_name,
              nameColor,
              notation: resolved.notation,
              title: resolved.title,
              repetitions: resolved.repetitions,
            },
          }),
        }),
      );
    } catch {
      return { status: "unavailable" } as const;
    }
    let copyResponseValue: SchemaInput;
    try {
      copyResponseValue = await copyResponse.json();
    } catch {
      return { status: "unavailable" } as const;
    }
    const copyResult = SavedRollCopyResponseSchema.safeParse(copyResponseValue);
    if (!copyResult.success) return { status: "unavailable" } as const;
    const { status } = copyResult.data;
    if (status === "applied" || status === "existing") {
      return {
        status: "copied" as const,
        name: receipt.display_name,
        destinationId: receipt.destination_id,
      };
    }
    if (status === "name_conflict") {
      return { status: "name_conflict" as const, name: receipt.display_name };
    }
    if (status === "cap_reached") return { status: "cap_reached" as const };
    return { status: "conflict" as const };
  }

  async deliver(value: SchemaInput): Promise<DeliverRollWorkResult> {
    const accepted = await this.acceptDeliveryInternal(value, true);
    if (
      accepted.status === "conflict" ||
      accepted.status === "expired" ||
      accepted.status === "unavailable"
    ) {
      return accepted;
    }
    const result =
      accepted.delivery === "delivered" || accepted.delivery === "failed"
        ? { status: accepted.delivery }
        : await this.runDelivery();
    await this.runDeliveryBookkeeping();
    await this.runHelper();
    await this.scheduleAfterAttempts(accepted.expiresAt);
    return result;
  }

  async acceptDelivery(value: SchemaInput): Promise<AcceptRollDeliveryResult> {
    return this.acceptDeliveryInternal(value, false);
  }

  private async acceptDeliveryInternal(
    value: SchemaInput,
    deliverInline: boolean,
  ): Promise<AcceptRollDeliveryResult> {
    const handlerStartedAt = Date.now();
    const delivery = validateDeliveryRequest(value);
    if (this.ctx.id.name !== delivery.interaction.id) {
      const picker = this.readSavedRollPicker();
      if (
        picker === undefined ||
        picker.state !== "reserved" ||
        picker.run_interaction_id !== delivery.interaction.id
      ) {
        return { status: "conflict" };
      }
    }
    const expiresAt = interactionExpiresAt(delivery.interaction.id);
    if (expiresAt <= Date.now()) return { status: "expired" };

    const recordPreparationStartedAt = Date.now();
    const resolution = await this.recordForDelivery(delivery);
    const recordPreparationMs = elapsedMs(recordPreparationStartedAt);
    if (resolution.status !== "ready") return resolution;

    this.activeAcceptances += 1;
    const acceptance = await this.finishDeliveryAcceptance(
      delivery,
      resolution.record,
      expiresAt,
    ).finally(() => {
      this.activeAcceptances -= 1;
    });
    const accepted = acceptance.result;
    if (delivery.settings !== null) {
      this.storeDeliverySettings(delivery.settings);
    }
    const continuesInline =
      deliverInline &&
      (accepted.status === "created" || accepted.status === "existing") &&
      accepted.delivery === "pending";
    let deliveryAlarmWriteMs: number | null = null;
    if (this.activeAcceptances === 0 && !continuesInline) {
      const pendingDelivery = this.readDelivery();
      if (pendingDelivery?.state === "pending") {
        const alarmWriteStartedAt = Date.now();
        await this.ctx.storage.setAlarm(
          Math.min(
            Date.now(),
            deliveryFinalizationAt(pendingDelivery.expires_at),
          ),
        );
        deliveryAlarmWriteMs = elapsedMs(alarmWriteStartedAt);
      }
    }
    if (
      !deliverInline &&
      accepted.status === "created" &&
      delivery.telemetry !== null
    ) {
      logDurableAcceptanceTiming({
        acknowledgementPreparedAt:
          delivery.telemetry.acknowledgementPreparedAt,
        acknowledgementType: delivery.telemetry.acknowledgementType,
        handlerStartedAt,
        handlerCompletedAt: Date.now(),
        recordPreparationMs,
        renderSnapshotPreparationMs:
          resolution.renderSnapshotPreparationMs,
        recoveryAlarmWriteMs: acceptance.recoveryAlarmWriteMs,
        expiryAlarmWriteMs: acceptance.expiryAlarmWriteMs,
        deliveryAlarmWriteMs,
      });
    }
    return accepted;
  }

  private async finishDeliveryAcceptance(
    delivery: ReturnType<typeof validateDeliveryRequest>,
    record: RollWorkRecord,
    expiresAt: number,
  ): Promise<FinishedDeliveryAcceptance> {
    this.initializeLifecycleSnapshot(delivery, record);
    const recoveryAlarmWriteStartedAt = Date.now();
    await this.ctx.storage.setAlarm(Date.now() + retryDelayMs(1));
    const recoveryAlarmWriteMs = elapsedMs(recoveryAlarmWriteStartedAt);
    const metadataJson = deliveryMetadata(delivery);
    const fingerprint = await tokenFingerprint(delivery.interaction.token);
    const acceptedAt = Date.now();
    let accepted: AcceptRollDeliveryResult;
    try {
      accepted = this.ctx.storage.transactionSync(
        (): AcceptRollDeliveryResult => {
          const prepared = this.prepareRequest(delivery.request, record);
          if (
            prepared.status === "conflict" ||
            prepared.record.rollSeed !== record.rollSeed
          ) {
            return { status: "conflict" };
          }

          const existing = this.readDelivery();
          if (existing !== undefined) {
            const compatibleMetadata = mergeCompatibleDeliveryMetadata(
              existing.metadata_json,
              metadataJson,
            );
            if (
              compatibleMetadata === null ||
              existing.token_fingerprint !== fingerprint
            ) {
              return { status: "conflict" };
            }
            if (compatibleMetadata !== existing.metadata_json) {
              this.ctx.storage.sql.exec(
                "UPDATE interaction_delivery SET metadata_json = ? WHERE singleton = 1",
                compatibleMetadata,
              );
            }
            return {
              status: "existing",
              delivery: existing.state,
              expiresAt: existing.expires_at,
            };
          }

          const accountingState =
            delivery.accounting === null || delivery.accounting.guildId === null
              ? "not_applicable"
              : "pending";
          const accountingOccurredAt =
            accountingState === "pending" ? acceptedAt : null;
          const loggingState =
            delivery.logging === null ? "not_applicable" : "pending";
          this.ctx.storage.sql.exec(
            `INSERT INTO interaction_delivery (
               singleton, metadata_json, token, token_fingerprint, expires_at,
               state, accounting_state, accounting_occurred_at, logging_state,
               helper_state, clatter_sent_at, hide_roll_result_text
             ) VALUES (1, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL)`,
            metadataJson,
            delivery.interaction.token,
            fingerprint,
            expiresAt,
            accountingState,
            accountingOccurredAt,
            loggingState,
            "not_applicable",
            // An acknowledged clatter is already on screen, so delivery must
            // neither post it again nor anchor the delay window on itself.
            delivery.clatter?.deliveredAt ?? null,
          );
          this.acceptLifecycleSnapshot(acceptedAt);
          return { status: "created", delivery: "pending", expiresAt };
        },
      );
    } catch (error) {
      this.advanceLifecycle({
        state: "failed",
        occurredAt: Date.now(),
        attempts: 0,
        httpStatus: null,
        failurePhase: "record",
        failureCode: "acceptance-failed",
      });
      await this.syncLifecycle();
      throw error;
    }
    const expiryAlarmWriteStartedAt = Date.now();
    if (accepted.status === "created" || accepted.status === "existing") {
      await this.ctx.storage.setAlarm(expiresAt);
    }
    return {
      result: accepted,
      recoveryAlarmWriteMs,
      expiryAlarmWriteMs: elapsedMs(expiryAlarmWriteStartedAt),
    };
  }

  deliveryStatus(): RollDeliveryStatus {
    const delivery = this.readDelivery();
    if (delivery === undefined) return { state: "missing" };
    return {
      state: delivery.state,
      expiresAt: delivery.expires_at,
      deliveredAt: delivery.delivered_at,
      lastHttpStatus: delivery.last_http_status,
      attempts: delivery.attempts,
    };
  }

  deliveryDiagnostics(): RollDeliveryDiagnostics {
    const delivery = this.readDelivery();
    if (delivery === undefined) return { state: "missing" };
    return {
      state: delivery.state,
      failurePhase: delivery.failure_phase,
      accountingState: delivery.accounting_state,
      accountingHttpStatus: delivery.accounting_http_status,
      accountingAttempts: delivery.accounting_attempts,
      loggingState: delivery.logging_state,
      loggingHttpStatus: delivery.logging_http_status,
      loggingAttempts: delivery.logging_attempts,
      helperState: delivery.helper_state,
      helperAttempts: delivery.helper_attempts,
    };
  }

  private destinationTelemetryContext(record: RollWorkRecord | undefined) {
    const delivery = this.readDelivery();
    let metadata: DeliveryMetadata | null = null;
    if (delivery !== undefined) {
      try {
        metadata = parseDeliveryMetadata(delivery.metadata_json);
      } catch {
        // Telemetry must not interrupt durable delivery recovery.
      }
    }
    let destinationPayload: RollLifecycleContextV1["destinationPayload"] = null;
    try {
      const source = this.readSourceLogRow();
      if (source !== undefined) {
        const input: SchemaInput = JSON.parse(source.artifact_json);
        const artifact = StoredTelemetryArtifactSchema.safeParse(input);
        if (artifact.success) destinationPayload = artifact.data.payload;
      }
    } catch {
      // Telemetry must not interrupt durable delivery recovery.
    }
    return deliveryTelemetryContext(
      metadata,
      record,
      destinationPayload,
      delivery?.delivered_at ?? null,
    );
  }

  private lifecycleContext(
    delivery: ReturnType<typeof validateDeliveryRequest>,
    record: RollWorkRecord,
  ): RollLifecycleContextV1 {
    const guildContext = delivery.logging?.context?.kind === "guild"
      ? delivery.logging.context
      : null;
    return {
      version: 1,
      applicationId: delivery.interaction.applicationId,
      notation: delivery.logging?.notation ?? delivery.request.notation.join(" "),
      request: record.request,
      title: delivery.message.title,
      savedRoll: delivery.savedRoll === null
        ? null
        : {
            id: delivery.savedRoll.id,
            scope: delivery.savedRoll.scope,
            name: delivery.savedRoll.name,
            revision: delivery.savedRoll.revision,
          },
      userId: delivery.accounting?.userId ?? "",
      username: delivery.message.username,
      guildId: delivery.accounting?.guildId ?? null,
      channelId: delivery.logging?.channelId ?? "",
      guildName: guildContext?.guildName ?? null,
      channelName: guildContext?.channelName ?? null,
      channelType:
        delivery.logging?.context?.kind === "dm"
          ? 1
          : guildContext?.channelType ?? null,
      outcome: record.outcome,
      rollSeed: record.rollSeed,
      renderSeed: record.renderSeed,
      renderVersion: rollRecordRenderVersion(record),
      rendererRevision: rollRecordRendererRevision(record),
      destinationPayload: null,
    };
  }

  private initializeLifecycleSnapshot(
    delivery: ReturnType<typeof validateDeliveryRequest>,
    record: RollWorkRecord,
  ): void {
    if (
      delivery.logging?.source !== "discord" ||
      delivery.accounting === null
    ) {
      return;
    }
    const common = {
      interactionId: delivery.interaction.id,
      revision: 1,
      commandName: delivery.savedRoll === null ? "roll" : "library",
      scope: delivery.accounting.guildId === null ? "dm" : "guild",
      receivedAt: delivery.accounting.receivedAt,
      deferredAt: delivery.deferredAt,
      acceptedAt: null,
      deliveryStartedAt: null,
      terminalAt: null,
      state: "deferred",
      attempts: 0,
      httpStatus: null,
      failurePhase: null,
      failureCode: null,
      context: this.lifecycleContext(delivery, record),
    } as const;
    const snapshot = parseRollLifecycleSnapshot(
      delivery.telemetry === null
        ? { version: 1, ...common }
        : {
            version: 2,
            ...common,
            diagnostics: {
              handlerStartedAt: delivery.telemetry.handlerStartedAt,
              acknowledgementPreparedAt:
                delivery.telemetry.acknowledgementPreparedAt,
              acknowledgementType: delivery.telemetry.acknowledgementType,
              firstProviderAttemptAt: null,
              // The acknowledgement delivered the clatter, so its success time
              // is already known and no provider attempt will report it later.
              clatterSucceededAt: delivery.clatter?.deliveredAt ?? null,
              discordErrorCode: null,
              discordOperation: null,
              originalResponseMessageId: null,
              originalResponseProbe: null,
            },
          },
    );
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO roll_lifecycle_outbox (
         singleton, snapshot_json, next_sync_at
       ) VALUES (1, ?, ?)`,
      JSON.stringify(snapshot),
      delivery.deferredAt,
    );
  }

  private acceptLifecycleSnapshot(acceptedAt: number): void {
    const row = this.readLifecycleOutbox();
    if (row === undefined) return;
    const current = parseRollLifecycleSnapshot(JSON.parse(row.snapshot_json));
    if (current.state !== "deferred") return;
    const accepted = parseRollLifecycleSnapshot({
      ...current,
      revision: current.revision + 1,
      state: "accepted",
      acceptedAt,
    });
    this.ctx.storage.sql.exec(
      `UPDATE roll_lifecycle_outbox
       SET snapshot_json = ?, next_sync_at = ?
       WHERE singleton = 1`,
      JSON.stringify(accepted),
      acceptedAt,
    );
  }

  private readLifecycleOutbox(): StoredLifecycleOutboxRow | undefined {
    return this.ctx.storage.sql
      .exec<StoredLifecycleOutboxRow>(
        `SELECT snapshot_json, synced_revision, sync_attempts, next_sync_at
         FROM roll_lifecycle_outbox WHERE singleton = 1`,
      )
      .toArray()[0];
  }

  private advanceLifecycle(input: LifecycleAdvance): void {
    const row = this.readLifecycleOutbox();
    if (row === undefined) return;
    const current = parseRollLifecycleSnapshot(JSON.parse(row.snapshot_json));
    if (
      (current.state === "delivered" || current.state === "failed") &&
      current.state !== input.state
    ) {
      return;
    }
    const terminal = input.state === "delivered" || input.state === "failed";
    const context = input.destinationPayload === undefined
      ? current.context
      : {
          ...current.context,
          destinationPayload: input.destinationPayload,
        };
    const common = {
      ...current,
      revision: current.revision + 1,
      state: input.state,
      deliveryStartedAt:
        current.deliveryStartedAt ??
        (input.state === "delivery_started"
          ? input.occurredAt
          : current.acceptedAt),
      terminalAt: terminal ? current.terminalAt ?? input.occurredAt : null,
      attempts: input.attempts,
      httpStatus: input.httpStatus,
      failurePhase:
        input.state === "failed" ? input.failurePhase ?? "unknown" : null,
      failureCode:
        input.state === "failed" ? input.failureCode ?? "internal-failure" : null,
      context,
    };
    const next = current.version === 2
      ? parseRollLifecycleSnapshot({
          ...common,
          diagnostics: mergeLifecycleDiagnostics(
            current.diagnostics,
            input.diagnostics ?? {},
          ),
        })
      : parseRollLifecycleSnapshot(common);
    this.ctx.storage.sql.exec(
      `UPDATE roll_lifecycle_outbox
       SET snapshot_json = ?, next_sync_at = ?
       WHERE singleton = 1`,
      JSON.stringify(next),
      input.occurredAt,
    );
  }

  private updateLifecycleDiagnostics(
    diagnostics: Partial<RollLifecycleDiagnosticsV2>,
    occurredAt: number,
  ): void {
    const row = this.readLifecycleOutbox();
    if (row === undefined) return;
    const current = parseRollLifecycleSnapshot(JSON.parse(row.snapshot_json));
    if (current.version === 1) return;
    const next = parseRollLifecycleSnapshot({
      ...current,
      revision: current.revision + 1,
      diagnostics: mergeLifecycleDiagnostics(
        current.diagnostics,
        diagnostics,
      ),
    });
    this.ctx.storage.sql.exec(
      `UPDATE roll_lifecycle_outbox
       SET snapshot_json = ?, next_sync_at = ?
       WHERE singleton = 1`,
      JSON.stringify(next),
      occurredAt,
    );
  }

  private validateLifecycleRenderSnapshot(record: RollWorkRecordV5): void {
    const rendererRevision = rollRecordRendererRevision(record);
    if (rendererRevision === null) return;
    const row = this.readLifecycleOutbox();
    if (row === undefined) return;
    const current = parseRollLifecycleSnapshot(JSON.parse(row.snapshot_json));
    if (current.context.renderVersion !== record.renderVersion) {
      throw new Error("Roll lifecycle render snapshot conflicts with stored work");
    }
    if (current.context.rendererRevision === null) {
      // This may already be part of Data's accepted fingerprint for V5 work
      // written before producers predeclared the renderer revision.
      return;
    }
    if (current.context.rendererRevision !== rendererRevision) {
      throw new Error("Roll lifecycle render snapshot conflicts with stored work");
    }
  }

  private recordProviderAttempt(): void {
    const row = this.readLifecycleOutbox();
    if (row === undefined) return;
    const current = parseRollLifecycleSnapshot(JSON.parse(row.snapshot_json));
    if (
      current.version === 2 &&
      current.diagnostics.firstProviderAttemptAt === null
    ) {
      const occurredAt = Date.now();
      this.updateLifecycleDiagnostics(
        { firstProviderAttemptAt: occurredAt },
        occurredAt,
      );
    }
  }

  private async syncLifecycle(): Promise<void> {
    const row = this.readLifecycleOutbox();
    if (row === undefined || row.next_sync_at > Date.now()) return;
    const snapshot = parseRollLifecycleSnapshot(JSON.parse(row.snapshot_json));
    if (row.synced_revision >= snapshot.revision) return;
    let response: Response;
    try {
      response = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/roll-lifecycle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(snapshot),
        }),
      );
    } catch {
      this.deferLifecycleSync(row.sync_attempts + 1);
      return;
    }
    let value: SchemaInput;
    try {
      value = await response.json();
    } catch {
      this.deferLifecycleSync(row.sync_attempts + 1);
      return;
    }
    const result = LifecycleSyncResponseSchema.safeParse(value);
    if (response.ok && result.success) {
      this.ctx.storage.sql.exec(
        `UPDATE roll_lifecycle_outbox
         SET synced_revision = ?, sync_attempts = 0
         WHERE singleton = 1`,
        snapshot.revision,
      );
      return;
    }
    if (response.status === 409) {
      this.ctx.storage.sql.exec(
        `UPDATE roll_lifecycle_outbox
         SET synced_revision = ?
         WHERE singleton = 1`,
        snapshot.revision,
      );
      console.error(
        JSON.stringify({
          level: "error",
          message: "Roll lifecycle synchronization conflicted",
          interactionId: snapshot.interactionId,
          revision: snapshot.revision,
        }),
      );
      return;
    }
    this.deferLifecycleSync(row.sync_attempts + 1);
  }

  private deferLifecycleSync(attempts: number): void {
    this.ctx.storage.sql.exec(
      `UPDATE roll_lifecycle_outbox
       SET sync_attempts = ?, next_sync_at = ?
       WHERE singleton = 1`,
      attempts,
      Date.now() + retryDelayMs(attempts),
    );
  }

  // Delivery spans several alarm wakes, so segments measured in an earlier
  // wake are persisted and read back when the completion event is emitted.
  private recordDeliverySegment(
    column:
      | "snapshot_ms"
      | "settings_ms"
      | "clatter_post_ms"
      | "lifecycle_sync_ms"
      | "accounting_ms",
    value: number,
  ): void {
    // A later wake can repeat the same step against already stored state, so
    // only the first measurement describes what the roll actually waited for.
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET ${column} = ?
       WHERE singleton = 1 AND ${column} IS NULL`,
      value,
    );
  }

  private readLifecycleTimings(): LifecycleTimings {
    const row = this.readLifecycleOutbox();
    if (row === undefined) {
      return {
        acknowledgementPreparedAt: null,
        acceptedAt: null,
        deliveryStartedAt: null,
      };
    }
    const snapshot = parseRollLifecycleSnapshot(JSON.parse(row.snapshot_json));
    return {
      acknowledgementPreparedAt:
        snapshot.version === 2
          ? snapshot.diagnostics.acknowledgementPreparedAt
          : null,
      acceptedAt: snapshot.acceptedAt,
      deliveryStartedAt: snapshot.deliveryStartedAt,
    };
  }

  private logDestinationCompletion(input: DestinationCompletion): void {
    const record = input.record ?? this.tryReadWork();
    const source = this.readSourceLogRow();
    const delivery = this.readDelivery();
    const lifecycle = this.readLifecycleTimings();
    const clatterSentAt = delivery?.clatter_sent_at ?? null;
    // Named for the span it covers: acceptance through the start of delivery,
    // not the alarm hop alone.
    const acceptanceToDeliveryStartMs =
      lifecycle.acceptedAt === null || lifecycle.deliveryStartedAt === null
        ? null
        : lifecycle.deliveryStartedAt - lifecycle.acceptedAt;
    const resultNotBefore = delivery?.skip_dice_delay === 1
      ? null
      : delivery?.result_not_before ?? null;
    // Raw differences: a negative span means an invariant broke and must stay
    // visible instead of being clamped into the healthy range.
    const ackToClatterMs =
      clatterSentAt === null || lifecycle.acknowledgementPreparedAt === null
        ? null
        : clatterSentAt - lifecycle.acknowledgementPreparedAt;
    const postDelayMs =
      resultNotBefore === null ? null : input.completedAt - resultNotBefore;
    const rendererRevision =
      record === undefined ? null : rollRecordRendererRevision(record);
    const image =
      source !== undefined && source.image_bytes.byteLength > 0 ? source : null;
    const imageByteLength = image?.image_bytes.byteLength ?? null;
    const imageSha256 = image?.image_sha256 ?? null;
    const event = JSON.stringify({
      telemetryVersion: 5,
      level: input.state === "delivered" ? "info" : "error",
      message: "Roll destination delivery completed",
      subsystem: "roll-destination",
      rollId: input.rollId,
      ...this.destinationTelemetryContext(record),
      state: input.state,
      userImpact: input.state === "delivered" ? "none" : "failed",
      attempts: input.attempts,
      httpStatus: input.httpStatus,
      failurePhase: input.failurePhase,
      discordErrorCode: input.discordFailure?.code ?? null,
      discordOperation: input.discordFailure?.operation ?? null,
      elapsedMs:
        record === undefined
          ? null
          : Math.max(0, input.completedAt - record.createdAt),
      delayMs: input.delayMs ?? null,
      ackToClatterMs,
      acceptanceToDeliveryStartMs,
      lifecycleSyncMs: delivery?.lifecycle_sync_ms ?? null,
      accountingMs: delivery?.accounting_ms ?? null,
      guildSettingsMs: delivery?.settings_ms ?? null,
      clatterPostMs: delivery?.clatter_post_ms ?? null,
      // Image rendering is deliberately absent: it is pure computation, and a
      // Workers clock does not advance without I/O, so it cannot be timed here.
      renderSnapshotPreparationMs: delivery?.snapshot_ms ?? null,
      resultUploadMs: input.resultUploadMs ?? null,
      postDelayMs,
      imageByteLength,
      renderVersion:
        record === undefined ? null : rollRecordRenderVersion(record),
      rendererRevision,
      imageSha256,
    });
    if (input.state === "delivered") console.info(event);
    else console.error(event);
  }

  async alarm(): Promise<void> {
    try {
      await this.processAlarm();
    } catch {
      await this.handleUnexpectedAlarmFailure();
    }
  }

  private async rescheduleAlarmForActiveWork(): Promise<boolean> {
    // Alarm work must not overtake durable acceptance or provider side effects.
    if (this.activeAcceptances === 0 && this.activeDelivery === null) return false;
    await this.ctx.storage.setAlarm(Date.now() + retryDelayMs(1));
    return true;
  }

  private async processAlarm(): Promise<void> {
    this.deleteExpiredRetainedIntents();
    if (await this.rescheduleAlarmForActiveWork()) return;
    let delivery = this.readDelivery();
    if (delivery === undefined) {
      await this.syncLifecycle();
      if (await this.rescheduleAlarmForActiveWork()) return;
      // Lifecycle I/O yields, so acceptance may have stored delivery meanwhile.
      delivery = this.readDelivery();
      if (delivery === undefined) {
        const lifecycle = this.readLifecycleOutbox();
        if (
          lifecycle !== undefined &&
          lifecycle.synced_revision <
            parseRollLifecycleSnapshot(JSON.parse(lifecycle.snapshot_json)).revision
        ) {
          await this.ctx.storage.setAlarm(lifecycle.next_sync_at);
          return;
        }
        this.deleteStoredWork();
        await this.scheduleRetainedIntentExpiry();
        return;
      }
    }
    if (Date.now() >= delivery.expires_at) {
      await this.finalizeExpiredDelivery(delivery);
      return;
    }
    const current = this.readDelivery();
    if (current === undefined) return;
    if (current.state === "pending") {
      await this.runDelivery();
    }
    await this.runDeliveryBookkeeping();
    await this.runHelper();
    await this.runLogging();
    await this.scheduleAfterAttempts(current.expires_at);
  }

  private async finalizeExpiredDelivery(
    delivery: StoredDeliveryRow,
  ): Promise<void> {
    if (
      delivery.state === "delivered" &&
      delivery.logging_state === "pending" &&
      this.readSourceLogRow() !== undefined
    ) {
      await this.runLogging();
      const current = this.readDelivery();
      const source = this.readSourceLogRow();
      if (
        current?.logging_state === "pending" &&
        source?.handoff_until !== null &&
        source?.handoff_until !== undefined &&
        Date.now() < source.handoff_until
      ) {
        await this.ctx.storage.setAlarm(
          Math.min(
            Date.now() + retryDelayMs(current.logging_attempts),
            source.handoff_until,
          ),
        );
        return;
      }
    }
    if (delivery.state === "pending") {
      const completedAt = Date.now();
      const failurePhase = delivery.failure_phase ?? "expired";
      this.advanceLifecycle({
        state: "failed",
        occurredAt: completedAt,
        attempts: delivery.attempts,
        httpStatus: delivery.last_http_status,
        failurePhase,
        failureCode: "delivery-expired",
      });
      this.logDestinationCompletion({
        rollId: parseDeliveryMetadata(delivery.metadata_json).interactionId,
        state: "failed",
        attempts: delivery.attempts,
        httpStatus: delivery.last_http_status,
        failurePhase,
        completedAt,
      });
    }
    await this.syncLifecycle();
    const lifecycle = this.readLifecycleOutbox();
    if (
      lifecycle !== undefined &&
      lifecycle.synced_revision <
        parseRollLifecycleSnapshot(JSON.parse(lifecycle.snapshot_json)).revision
    ) {
      this.deleteSensitiveWorkPreservingLifecycle();
      await this.ctx.storage.setAlarm(lifecycle.next_sync_at);
      return;
    }
    this.deleteStoredWork();
    await this.scheduleRetainedIntentExpiry();
  }

  private async handleUnexpectedAlarmFailure(): Promise<void> {
    console.error(
      JSON.stringify({
        telemetryVersion: 1,
        level: "error",
        message: "Roll lifecycle alarm failed unexpectedly",
        interactionId: this.ctx.id.name,
        failureCode: "alarm-unhandled",
      }),
    );
    const delivery = this.readDelivery();
    if (delivery?.state === "pending" && delivery.token !== null) {
      try {
        const metadata = parseDeliveryMetadata(delivery.metadata_json);
        await this.terminateDelivery(
          {
            id: metadata.interactionId,
            applicationId: metadata.applicationId,
            token: delivery.token,
          },
          delivery.attempts,
          delivery.expires_at,
          "response",
        );
      } catch {
        this.advanceLifecycle({
          state: "failed",
          occurredAt: Date.now(),
          attempts: delivery.attempts,
          httpStatus: delivery.last_http_status,
          failurePhase: "response",
          failureCode: "alarm-unhandled",
        });
      }
    }
    await this.syncLifecycle();
    await this.ctx.storage.setAlarm(Date.now() + retryDelayMs(1));
  }

  private async runDeliveryBookkeeping(): Promise<void> {
    // Neither record is read on the roll's own timescale, so both settle after
    // Discord has the message rather than delaying what the user sees.
    const startedAt = Date.now();
    await Promise.all([
      this.syncLifecycle().finally(() => {
        this.recordDeliverySegment("lifecycle_sync_ms", elapsedMs(startedAt));
      }),
      this.runAccounting().finally(() => {
        this.recordDeliverySegment("accounting_ms", elapsedMs(startedAt));
      }),
    ]);
  }

  private runAccounting(): Promise<void> {
    if (this.activeAccounting === null) {
      const accounting = this.attemptAccounting();
      this.activeAccounting = accounting.finally(() => {
        this.activeAccounting = null;
      });
    }
    return this.activeAccounting;
  }

  private async attemptAccounting(): Promise<void> {
    const delivery = this.readDelivery();
    if (delivery === undefined || delivery.accounting_state !== "pending") {
      return;
    }
    const metadata = parseDeliveryMetadata(delivery.metadata_json);
    const accounting = metadata.accounting;
    if (
      accounting === null ||
      accounting.guildId === null ||
      delivery.accounting_occurred_at === null
    ) {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET accounting_state = 'failed'
         WHERE singleton = 1`,
      );
      return;
    }
    const attempts = delivery.accounting_attempts + 1;
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET accounting_attempts = ?
       WHERE singleton = 1`,
      attempts,
    );

    let response: Response;
    try {
      response = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/roll-accounting", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            interactionId: metadata.interactionId,
            guildId: accounting.guildId,
            userId: accounting.userId,
            username: metadata.message.username,
            receivedAt: accounting.receivedAt,
            accountedAt: delivery.accounting_occurred_at,
          }),
        }),
      );
    } catch {
      return;
    }

    if (response.ok) {
      let value: SchemaInput;
      try {
        value = await response.json();
      } catch {
        return;
      }
      if (AccountingResponseSchema.safeParse(value).success) {
        this.ctx.storage.sql.exec(
          `UPDATE interaction_delivery
           SET accounting_state = 'accounted', accounting_http_status = ?
           WHERE singleton = 1`,
          response.status,
        );
      }
      return;
    }
    if (isRetryableHttpStatus(response.status)) {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET accounting_http_status = ?
         WHERE singleton = 1`,
        response.status,
      );
      return;
    }
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET accounting_state = 'failed', accounting_http_status = ?
       WHERE singleton = 1`,
      response.status,
    );
  }

  private runHelper(): Promise<void> {
    if (this.activeHelper === null) {
      const helper = this.attemptHelper();
      this.activeHelper = helper.finally(() => {
        this.activeHelper = null;
      });
    }
    return this.activeHelper;
  }

  private async attemptHelper(): Promise<void> {
    const delivery = this.readDelivery();
    if (
      delivery === undefined ||
      delivery.state !== "delivered" ||
      delivery.helper_state !== "pending"
    ) {
      return;
    }
    const metadata = parseDeliveryMetadata(delivery.metadata_json);
    if (metadata.accounting === null) {
      this.ctx.storage.sql.exec(
        "UPDATE interaction_delivery SET helper_state = 'failed' WHERE singleton = 1",
      );
      return;
    }
    const attempts = delivery.helper_attempts + 1;
    this.ctx.storage.sql.exec(
      "UPDATE interaction_delivery SET helper_attempts = ? WHERE singleton = 1",
      attempts,
    );
    try {
      const value = await this.env.DISCORD_REST.sendRollHelper({
        rollId: metadata.interactionId,
        userId: metadata.accounting.userId,
      });
      if (RollHelperResultSchema.safeParse(value).success) {
        this.ctx.storage.sql.exec(
          "UPDATE interaction_delivery SET helper_state = 'delivered' WHERE singleton = 1",
        );
      }
    } catch {
      console.error(
        JSON.stringify({
          telemetryVersion: 1,
          level: "error",
          message: "Roll helper delivery failed",
          subsystem: "roll-helper",
          rollId: metadata.interactionId,
          userImpact: "none",
          attempt: attempts,
        }),
      );
    }
  }

  private runLogging(): Promise<void> {
    if (this.activeLogging === null) {
      const logging = this.attemptLogging();
      this.activeLogging = logging.finally(() => {
        this.activeLogging = null;
      });
    }
    return this.activeLogging;
  }

  private async attemptLogging(): Promise<void> {
    const delivery = this.readDelivery();
    if (
      delivery === undefined ||
      delivery.state !== "delivered" ||
      delivery.logging_state !== "pending"
    ) {
      return;
    }
    const metadata = parseDeliveryMetadata(delivery.metadata_json);
    const logging = metadata.logging;
    if (logging === null) {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET logging_state = 'failed'
         WHERE singleton = 1`,
      );
      return;
    }

    const sourceRow = this.readSourceLogRow();
    if (sourceRow !== undefined) {
      const attempts = delivery.logging_attempts + 1;
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET logging_attempts = ?
         WHERE singleton = 1`,
        attempts,
      );
      if (
        sourceRow.destination_delivered_at === null ||
        sourceRow.handoff_until === null
      ) {
        return;
      }
      if (Date.now() >= sourceRow.handoff_until) {
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec("DELETE FROM roll_log_outbox");
          this.ctx.storage.sql.exec(
            `UPDATE interaction_delivery
             SET logging_state = 'failed'
             WHERE singleton = 1`,
          );
        });
        return;
      }
      let value: SchemaInput;
      try {
        const source = await this.readSourceLogArtifact();
        if (source === undefined) {
          throw new Error("Source roll log artifact is missing");
        }
        value = await this.env.LOG_WORK
          .getByName(metadata.interactionId)
          .accept(source.artifact);
      } catch {
        console.error(
          JSON.stringify({
            telemetryVersion: 2,
            level: "error",
            message: "Roll log durable handoff failed",
            subsystem: "private-roll-log",
            rollId: metadata.interactionId,
            ...this.destinationTelemetryContext(this.tryReadWork()),
            userImpact: "none",
            attempt: attempts,
          }),
        );
        return;
      }
      const result = LogAcceptanceResponseSchema.safeParse(value);
      if (
        result.success &&
        (result.data.status === "created" || result.data.status === "existing")
      ) {
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec("DELETE FROM roll_log_outbox");
          this.ctx.storage.sql.exec(
            `UPDATE interaction_delivery
             SET logging_state = 'delivered', logging_http_status = 200
             WHERE singleton = 1`,
          );
        });
        return;
      }
      if (result.success && result.data.status === "conflict") {
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec("DELETE FROM roll_log_outbox");
          this.ctx.storage.sql.exec(
            `UPDATE interaction_delivery
             SET logging_state = 'failed', logging_http_status = 409
             WHERE singleton = 1`,
          );
        });
        return;
      }
      console.error(
        JSON.stringify({
          telemetryVersion: 2,
          level: "error",
          message: "Roll log durable handoff returned an invalid response",
          subsystem: "private-roll-log",
          rollId: metadata.interactionId,
          ...this.destinationTelemetryContext(this.tryReadWork()),
          userImpact: "none",
          attempt: attempts,
        }),
      );
      return;
    }

    const attempts = delivery.logging_attempts + 1;
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET logging_state = 'failed', logging_attempts = ?
       WHERE singleton = 1`,
      attempts,
    );
    console.error(
      JSON.stringify({
        telemetryVersion: 2,
        level: "error",
        message: "Roll log source artifact is unavailable",
        subsystem: "private-roll-log",
        rollId: metadata.interactionId,
        ...this.destinationTelemetryContext(this.tryReadWork()),
        userImpact: "none",
        attempt: attempts,
      }),
    );
  }

  private async scheduleAfterAttempts(expiresAt: number): Promise<void> {
    const delivery = this.readDelivery();
    const lifecycle = this.readLifecycleOutbox();
    const lifecycleRetryAt =
      lifecycle !== undefined &&
      lifecycle.synced_revision <
        parseRollLifecycleSnapshot(JSON.parse(lifecycle.snapshot_json)).revision
        ? lifecycle.next_sync_at
        : expiresAt;
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (delivery === undefined || delivery.state === "pending") {
      if (lifecycleRetryAt < (currentAlarm ?? expiresAt)) {
        await this.ctx.storage.setAlarm(lifecycleRetryAt);
      }
      return;
    }
    const retryAt = [
      delivery.accounting_state === "pending"
        ? Date.now() + retryDelayMs(delivery.accounting_attempts)
        : expiresAt,
      delivery.logging_state === "pending"
        ? Date.now() + retryDelayMs(delivery.logging_attempts)
        : expiresAt,
      delivery.helper_state === "pending"
        ? Date.now() + retryDelayMs(delivery.helper_attempts)
        : expiresAt,
      lifecycleRetryAt,
      expiresAt,
    ];
    await this.ctx.storage.setAlarm(Math.min(...retryAt));
  }

  private runDelivery(): Promise<DeliverRollWorkResult> {
    if (this.activeDelivery === null) {
      const delivery = this.attemptDelivery();
      this.activeDelivery = delivery.finally(() => {
        this.activeDelivery = null;
      });
    }
    return this.activeDelivery;
  }

  private async resolveDeliverySettings(
    delivery: StoredDeliveryRow,
    metadata: ReturnType<typeof parseDeliveryMetadata>,
  ): Promise<RollDeliverySettings> {
    if (
      delivery.skip_dice_delay !== null &&
      delivery.hide_roll_result_text !== null
    ) {
      return {
        skipDiceDelay: delivery.skip_dice_delay === 1,
        hideRollResultText: delivery.hide_roll_result_text === 1,
      };
    }
    const guildId = metadata.accounting?.guildId ?? null;
    const fetched = guildId === null
      ? { skipDiceDelay: false, hideRollResultText: false }
      : await this.fetchGuildDeliverySettings(guildId);
    const settings = {
      skipDiceDelay: delivery.skip_dice_delay === null
        ? fetched.skipDiceDelay
        : delivery.skip_dice_delay === 1,
      hideRollResultText: delivery.hide_roll_result_text === null
        ? fetched.hideRollResultText
        : delivery.hide_roll_result_text === 1,
    };
    this.storeDeliverySettings(settings);
    return settings;
  }

  private async fetchGuildDeliverySettings(
    guildId: string,
  ): Promise<RollDeliverySettings> {
    const response = await this.env.DATA_SERVICE.fetch(
      new Request("https://data.internal/internal/guilds/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guildId, version: 2 }),
      }),
    );
    if (!response.ok) throw new Error("Guild settings lookup failed");
    const value: SchemaInput = await response.json();
    const result = GuildDeliverySettingsResponseSchema.safeParse(value);
    if (!result.success) {
      throw new Error("Guild settings response is invalid");
    }
    return result.data.settings;
  }

  private storeDeliverySettings(settings: {
    skipDiceDelay: boolean;
    hideRollResultText: boolean | null;
  }): void {
    const hideRollResultText = settings.hideRollResultText === null
      ? null
      : Number(settings.hideRollResultText);
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET skip_dice_delay = COALESCE(skip_dice_delay, ?),
           hide_roll_result_text = COALESCE(hide_roll_result_text, ?)
       WHERE singleton = 1`,
      Number(settings.skipDiceDelay),
      hideRollResultText,
    );
  }

  private resolveRollDelay(delivery: StoredDeliveryRow): RollDelay {
    const delayMs =
      delivery.delay_ms ?? selectRollDelayMs(randomSeed() / 2 ** 32);
    let resultNotBefore = delivery.result_not_before;
    if (delivery.delay_ms === null) {
      this.ctx.storage.sql.exec(
        "UPDATE interaction_delivery SET delay_ms = ? WHERE singleton = 1",
        delayMs,
      );
    }
    if (delivery.clatter_sent_at !== null && resultNotBefore === null) {
      resultNotBefore = delivery.clatter_sent_at + delayMs;
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET result_not_before = ?
         WHERE singleton = 1`,
        resultNotBefore,
      );
    }
    return { delayMs, resultNotBefore };
  }

  private async deferUntilResultNotBefore(
    skipDiceDelay: boolean,
    resultNotBefore: number | null,
    expiresAt: number,
  ): Promise<{ status: "pending"; retryAt: number } | null> {
    if (
      skipDiceDelay ||
      resultNotBefore === null ||
      resultNotBefore <= Date.now()
    ) {
      return null;
    }
    const retryAt = Math.min(
      resultNotBefore,
      deliveryFinalizationAt(expiresAt),
    );
    await this.ctx.storage.setAlarm(retryAt);
    return { status: "pending", retryAt };
  }

  private async finalizeIfResultWindowClosed(
    delivery: StoredDeliveryRow,
    target: RollDeliveryTarget,
    attempts: number,
  ): Promise<DeliverRollWorkResult | null> {
    const now = Date.now();
    if (now >= delivery.expires_at) {
      const current = this.readDelivery();
      if (current === undefined) {
        throw new Error("Active roll delivery disappeared before expiry");
      }
      await this.finalizeExpiredDelivery(current);
      return { status: "expired" };
    }
    if (now >= deliveryFinalizationAt(delivery.expires_at)) {
      return this.attemptTerminalResponse(
        target,
        attempts,
        delivery.expires_at,
        "deadline",
      );
    }
    return null;
  }

  private readSourceLogRow(): StoredSourceLogRow | undefined {
    return this.ctx.storage.sql
      .exec<StoredSourceLogRow>(
        `SELECT artifact_json, image_bytes, image_sha256,
                destination_delivered_at, handoff_until
         FROM roll_log_outbox
         WHERE singleton = 1`,
      )
      .toArray()[0];
  }

  private async readSourceLogArtifact(): Promise<
    SourceLogArtifact | undefined
  > {
    const row = this.readSourceLogRow();
    if (row === undefined) return undefined;
    const input: SchemaInput = JSON.parse(row.artifact_json);
    const result = StoredSourceLogArtifactSchema.safeParse(input);
    if (!result.success) {
      throw new Error("Stored source roll log artifact is invalid");
    }
    const stored = result.data;
    const imageBytes = new Uint8Array(row.image_bytes);
    if ((await sha256Hex(imageBytes)) !== row.image_sha256) {
      throw new Error("Stored source roll log image hash is invalid");
    }
    if (stored.image.status === "available") {
      return {
        artifact: rollLogArtifact({
          ...stored,
          destinationDeliveredAt: row.destination_delivered_at ?? 0,
          image: {
            status: "available",
            filename: stored.image.filename,
            png: imageBytes,
          },
        }),
      };
    }
    if (imageBytes.byteLength !== 0) {
      throw new Error("Stored source roll log artifact is invalid");
    }
    return {
      artifact: rollLogArtifact({
        ...stored,
        destinationDeliveredAt: row.destination_delivered_at ?? 0,
        image: stored.image,
      }),
    };
  }

  private async ensureSourceLogArtifact(
    artifact: RollLogArtifact,
  ): Promise<SourceLogArtifact> {
    const validated = rollLogArtifact(artifact);
    const image =
      validated.image.status === "available"
        ? {
            status: "available" as const,
            filename: validated.image.filename,
          }
        : validated.image;
    const imageBytes =
      validated.image.status === "available"
        ? validated.image.png
        : new Uint8Array();
    const artifactJson = validated.version === 2
      ? JSON.stringify({
          version: validated.version,
          rollId: validated.rollId,
          source: validated.source,
          notation: validated.notation,
          user: validated.user,
          guildId: validated.guildId,
          channelId: validated.channelId,
          context: validated.context,
          presentation: validated.presentation,
          payload: validated.payload,
          image,
        })
      : JSON.stringify({
          version: validated.version,
          rollId: validated.rollId,
          source: validated.source,
          notation: validated.notation,
          user: validated.user,
          guildId: validated.guildId,
          channelId: validated.channelId,
          context: validated.context,
          payload: validated.payload,
          image,
        });
    const imageSha256 = await sha256Hex(imageBytes);
    const existing = this.readSourceLogRow();
    if (existing !== undefined) {
      if (
        existing.artifact_json !== artifactJson ||
        existing.image_sha256 !== imageSha256
      ) {
        throw new Error("Source roll log artifact conflicts with stored work");
      }
      const restored = await this.readSourceLogArtifact();
      if (restored === undefined) {
        throw new Error("Stored source roll log artifact is missing");
      }
      return restored;
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO roll_log_outbox (
         singleton, artifact_json, image_bytes, image_sha256
       ) VALUES (1, ?, ?, ?)`,
      artifactJson,
      imageBytes,
      imageSha256,
    );
    return { artifact: validated };
  }

  private async prepareSourceLogArtifact(
    metadata: ReturnType<typeof parseDeliveryMetadata>,
    payload: DiscordComponentsV2Message,
    image: RollLogArtifact["image"],
    result: string | null,
  ): Promise<SourceLogArtifact | undefined> {
    if (metadata.logging === null || metadata.accounting === null) {
      return undefined;
    }
    try {
      return await this.ensureSourceLogArtifact({
        version: 2,
        rollId: metadata.interactionId,
        source: metadata.logging.source,
        notation: metadata.logging.notation,
        user: {
          id: metadata.accounting.userId,
          username: metadata.message.username,
        },
        guildId: metadata.accounting.guildId,
        channelId: metadata.logging.channelId,
        context: metadata.logging.context ?? null,
        destinationDeliveredAt: 0,
        presentation: {
          title: metadata.message.title,
          result,
          savedRoll:
            metadata.savedRoll === null
              ? null
              : {
                  scope:
                    metadata.savedRoll.scope === "personal"
                      ? "personal"
                      : "server",
                  name: metadata.savedRoll.name,
                },
        },
        payload,
        image,
      });
    } catch (error) {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET logging_state = 'failed'
         WHERE singleton = 1`,
      );
      console.error(
        JSON.stringify({
          telemetryVersion: 2,
          level: "error",
          message: "Roll log source artifact could not be persisted",
          subsystem: "private-roll-log",
          rollId: metadata.interactionId,
          ...this.destinationTelemetryContext(this.tryReadWork()),
          userImpact: "none",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
      return undefined;
    }
  }

  private async deliverChannelRollMessage(
    value: ChannelRollMessageDeliveryInputV1,
  ): Promise<ChannelRollMessageDeliveryResultV1> {
    return parseChannelRollMessageDeliveryResult(
      await this.env.DISCORD_REST.deliverChannelRollMessageV1(value),
    );
  }

  private async attemptChannelRollMessage(
    value: ChannelRollMessageDeliveryInputV1,
    target: RollDeliveryTarget,
    attempts: number,
    expiresAt: number,
    phase: "clatter" | "discord",
    operation: DiscordOperation,
  ): Promise<ChannelRollMessageAttempt> {
    let delivery: ChannelRollMessageDeliveryResultV1;
    try {
      this.recordProviderAttempt();
      delivery = await this.deliverChannelRollMessage(value);
    } catch {
      return {
        result: await this.scheduleRetry(
          target.id,
          attempts,
          expiresAt,
          phase,
        ),
      };
    }
    if (delivery.status === "retryable") {
      return {
        result: await this.scheduleRetry(
          target.id,
          attempts,
          expiresAt,
          phase,
          delivery.retryAfterMs ?? retryDelayMs(attempts),
          delivery.httpStatus,
        ),
      };
    }
    if (delivery.status === "invalid_response") {
      return {
        result: await this.terminateDelivery(
          target,
          attempts,
          expiresAt,
          "response",
        ),
      };
    }
    if (delivery.status === "failed") {
      return {
        result: await this.failDelivery(
          target.id,
          attempts,
          delivery.httpStatus,
          expiresAt,
          phase,
          { code: delivery.discordErrorCode, operation },
        ),
      };
    }
    return { delivery };
  }

  private async attemptDelivery(): Promise<DeliverRollWorkResult> {
    const delivery = this.readDelivery();
    if (delivery === undefined) return { status: "conflict" };
    if (Date.now() >= delivery.expires_at) {
      await this.finalizeExpiredDelivery(delivery);
      return { status: "expired" };
    }
    if (delivery.state !== "pending") return { status: delivery.state };
    if (delivery.token === null) {
      throw new Error("Pending roll delivery has no interaction token");
    }

    const metadata = parseDeliveryMetadata(delivery.metadata_json);
    const target = {
      id: metadata.interactionId,
      applicationId: metadata.applicationId,
      token: delivery.token,
    };
    const attempts = delivery.attempts + 1;
    this.ctx.storage.sql.exec(
      "UPDATE interaction_delivery SET attempts = ? WHERE singleton = 1",
      attempts,
    );
    this.advanceLifecycle({
      state: "delivery_started",
      occurredAt: Date.now(),
      attempts,
      httpStatus: delivery.last_http_status,
    });

    const failurePhase = delivery.failure_phase ??
      (Date.now() >= deliveryFinalizationAt(delivery.expires_at)
        ? "deadline"
        : null);
    if (failurePhase !== null) {
      return this.attemptTerminalResponse(
        target,
        attempts,
        delivery.expires_at,
        failurePhase,
      );
    }

    let record: RollWorkRecord;
    try {
      const stored = this.readWork();
      if (stored === undefined) {
        throw new Error("Pending roll delivery has no roll record");
      }
      record = stored;
    } catch {
      return this.terminateDelivery(
        target,
        attempts,
        delivery.expires_at,
        "record",
      );
    }

    let settings: RollDeliverySettings = {
      skipDiceDelay: false,
      hideRollResultText: false,
    };
    let delayMs: number | null = null;
    let resultNotBefore: number | null = null;
    if (record.outcome.outcomes.length > 0) {
      const settingsStartedAt = Date.now();
      try {
        settings = await this.resolveDeliverySettings(delivery, metadata);
        this.recordDeliverySegment("settings_ms", elapsedMs(settingsStartedAt));
        if (!settings.skipDiceDelay) {
          const delay = this.resolveRollDelay(delivery);
          delayMs = delay.delayMs;
          resultNotBefore = delay.resultNotBefore;
        }
      } catch {
        return this.scheduleRetry(
          target.id,
          attempts,
          delivery.expires_at,
          "settings",
        );
      }
    }

    let clatter: string | undefined;
    let clatterPayload: DiscordComponentsV2Message | undefined;
    let followupMessageId = delivery.followup_message_id;
    const legacyDirectPrivateDefer =
      metadata.responseMode === "followup" && metadata.savedRoll === null;
    if (
      record.outcome.outcomes.length > 0 &&
      legacyDirectPrivateDefer &&
      delivery.clatter_sent_at === null
    ) {
      let response: Response;
      try {
        this.recordProviderAttempt();
        response = await fetch(
          buildEditOriginalResponse(target, {
            flags: DISCORD_COMPONENTS_V2_FLAG,
            components: [{ type: 10, content: "Preparing your roll." }],
          }),
        );
      } catch {
        return this.scheduleRetry(
          target.id,
          attempts,
          delivery.expires_at,
          "discord",
        );
      }
      if (!response.ok) {
        if (isRetryableHttpStatus(response.status)) {
          return this.scheduleRetry(
            target.id,
            attempts,
            delivery.expires_at,
            "discord",
            retryAfterMs(response, attempts),
            response.status,
          );
        }
        const code = await readDiscordErrorCode(response);
        return this.failDelivery(
          target.id,
          attempts,
          response.status,
          delivery.expires_at,
          "response",
          { code, operation: "edit-original-result" },
        );
      }
    }
    if (record.outcome.outcomes.length > 0) {
      try {
        clatterPayload = buildRollClatterMessage(
          record.outcome,
          record.renderSeed,
        );
        const clatterComponent = clatterPayload.components[0];
        if (clatterComponent?.type !== 10) {
          throw new Error("Roll clatter message has no text display");
        }
        clatter = clatterComponent.content;
      } catch {
        return this.terminateDelivery(
          target,
          attempts,
          delivery.expires_at,
          "response",
        );
      }
      if (!settings.skipDiceDelay && delivery.clatter_sent_at === null) {
        const discordOperation: DiscordOperation =
          metadata.responseMode === "edit-original"
            ? "edit-original-clatter"
            : "create-followup-clatter";
        let clatterHttpStatus: number;
        let originalResponseMessageId: string | null = null;
        const clatterPostStartedAt = Date.now();
        if (metadata.responseMode === "channel-message") {
          if (metadata.logging === null) {
            return this.terminateDelivery(
              target,
              attempts,
              delivery.expires_at,
              "response",
            );
          }
          const attempt = await this.attemptChannelRollMessage(
            {
              version: 1,
              operation: "create-clatter",
              rollId: target.id,
              channelId: metadata.logging.channelId,
              payload: clatterPayload,
            },
            target,
            attempts,
            delivery.expires_at,
            "clatter",
            discordOperation,
          );
          if ("result" in attempt) return attempt.result;
          this.recordDeliverySegment(
            "clatter_post_ms",
            elapsedMs(clatterPostStartedAt),
          );
          followupMessageId = attempt.delivery.messageId;
          clatterHttpStatus = attempt.delivery.httpStatus;
        } else {
          let clatterResponse: Response;
          try {
            const request = metadata.responseMode === "followup"
              ? buildPublicFollowupResponse(target, clatterPayload)
              : buildEditOriginalResponse(target, clatterPayload);
            this.recordProviderAttempt();
            clatterResponse = await fetch(request);
          } catch {
            // A failed post is retried, so only a successful one is timed.
            return this.scheduleRetry(
              target.id,
              attempts,
              delivery.expires_at,
              "clatter",
            );
          }
          if (!clatterResponse.ok) {
            if (isRetryableHttpStatus(clatterResponse.status)) {
              return this.scheduleRetry(
                target.id,
                attempts,
                delivery.expires_at,
                "clatter",
                retryAfterMs(clatterResponse, attempts),
                clatterResponse.status,
              );
            }
            const code = await readDiscordErrorCode(clatterResponse);
            return this.failDelivery(
              target.id,
              attempts,
              clatterResponse.status,
              delivery.expires_at,
              "clatter",
              { code, operation: discordOperation },
            );
          }
          this.recordDeliverySegment(
            "clatter_post_ms",
            elapsedMs(clatterPostStartedAt),
          );
          clatterHttpStatus = clatterResponse.status;
          if (metadata.responseMode === "followup") {
            try {
              const messageId = await readDiscordMessageId(clatterResponse);
              if (messageId === null) {
                throw new Error("Discord followup response is invalid");
              }
              followupMessageId = messageId;
            } catch {
              return this.terminateDelivery(
                target,
                attempts,
                delivery.expires_at,
                "response",
              );
            }
          } else {
            try {
              originalResponseMessageId = await readDiscordMessageId(
                clatterResponse,
              );
            } catch {
              // Diagnostics must not alter successful delivery behavior.
            }
          }
        }
        if (delayMs === null) {
          return this.terminateDelivery(
            target,
            attempts,
            delivery.expires_at,
            "response",
          );
        }
        const clatterSentAt = Date.now();
        resultNotBefore = clatterSentAt + delayMs;
        this.ctx.storage.transactionSync(() => {
          const diagnostics: Partial<RollLifecycleDiagnosticsV2> = {
            clatterSucceededAt: clatterSentAt,
          };
          if (originalResponseMessageId !== null) {
            diagnostics.originalResponseMessageId = originalResponseMessageId;
          }
          this.updateLifecycleDiagnostics(diagnostics, clatterSentAt);
          this.ctx.storage.sql.exec(
            `UPDATE interaction_delivery
             SET clatter_sent_at = ?, followup_message_id = ?,
                 result_not_before = ?, last_http_status = ?
             WHERE singleton = 1`,
            clatterSentAt,
            followupMessageId,
            resultNotBefore,
            clatterHttpStatus,
          );
        });
      }
      if (record.version === 5 && record.renderRequest === null) {
        let finalized: RollWorkRecordV5 | null;
        const snapshotStartedAt = Date.now();
        try {
          finalized = await this.finalizeRenderSnapshot(record, metadata);
        } catch {
          return this.terminateDelivery(
            target,
            attempts,
            delivery.expires_at,
            "record",
          );
        }
        if (finalized === null) {
          return this.scheduleRetry(
            target.id,
            attempts,
            delivery.expires_at,
            "snapshot",
          );
        }
        this.recordDeliverySegment("snapshot_ms", elapsedMs(snapshotStartedAt));
        record = finalized;
      }
      const terminal = await this.finalizeIfResultWindowClosed(
        delivery,
        target,
        attempts,
      );
      if (terminal !== null) return terminal;
      if (record.version !== 5) {
        const pending = await this.deferUntilResultNotBefore(
          settings.skipDiceDelay,
          resultNotBefore,
          delivery.expires_at,
        );
        if (pending !== null) return pending;
      }
    }

    let request: Request;
    let discordOperation: DiscordOperation;
    if (record.outcome.outcomes.length === 0) {
      try {
        const payload = buildInvalidRollHelpMessage(record.outcome, target.id);
        await this.prepareSourceLogArtifact(
          metadata,
          payload,
          { status: "unavailable", reason: "not-applicable" },
          null,
        );
        if (metadata.preflighted) {
          // A preflighted invalid roll is answered without a result upload.
          return await this.completeDelivery(
            target,
            attempts,
            delivery,
            record,
            200,
            null,
            null,
          );
        }
        request = buildEditOriginalResponse(target, payload);
        discordOperation = "edit-original-result";
      } catch {
        return this.terminateDelivery(
          target,
          attempts,
          delivery.expires_at,
          "response",
        );
      }
    } else {
      let sourceArtifact: SourceLogArtifact | undefined;
      try {
        sourceArtifact = await this.readSourceLogArtifact();
        if (sourceArtifact?.artifact.version === 1) {
          this.ctx.storage.sql.exec("DELETE FROM roll_log_outbox");
          sourceArtifact = undefined;
        }
      } catch {
        this.ctx.storage.transactionSync(() => {
          this.ctx.storage.sql.exec("DELETE FROM roll_log_outbox");
          this.ctx.storage.sql.exec(
            `UPDATE interaction_delivery
             SET logging_state = 'failed'
             WHERE singleton = 1`,
          );
        });
      }

      let payload: DiscordComponentsV2Message;
      let filename: string;
      let png: Uint8Array;
      if (sourceArtifact !== undefined) {
        if (sourceArtifact.artifact.version !== 2) {
          throw new Error("Source roll log artifact was not upgraded");
        }
        payload = sourceArtifact.artifact.payload;
        filename = sourceArtifact.artifact.image.status === "available"
          ? sourceArtifact.artifact.image.filename
          : "";
        png = sourceArtifact.artifact.image.status === "available"
          ? sourceArtifact.artifact.image.png
          : new Uint8Array();
      } else {
        let rendered:
          | RenderResult
          | RenderResultV2
          | RenderResultV3
          | RenderResultV4;
        try {
          rendered = await this.renderRecord(record);
        } catch {
          return this.terminateDelivery(
            target,
            attempts,
            delivery.expires_at,
            "render",
          );
        }
        try {
          if (clatter === undefined) {
            throw new Error("Roll clatter message was not prepared");
          }
          filename = `dice-${metadata.interactionId}.png`;
          png = rendered.png;
          const saveRollIntent = this.ensureSaveRollIntent(record, metadata);
          const textResultIntent = settings.hideRollResultText
            ? this.ensureTextResultIntent(record, metadata)
            : null;
          const messageOptions: RollResultMessageOptions = {
            ...metadata.message,
            source: "discord",
            repetitions: record.request.repetitions,
            filename,
          };
          if (!settings.skipDiceDelay) messageOptions.clatter = clatter;
          if (textResultIntent !== null) {
            messageOptions.textResultCustomId = buildTextResultCustomId({
              kind: "discord",
              id: this.saveRollSourceId(),
            });
          }
          if (saveRollIntent !== null) {
            messageOptions.saveRollCustomId = buildSaveRollCustomId({
              kind: "discord",
              id: this.saveRollSourceId(),
            });
          }
          if (metadata.savedRoll !== null) {
            messageOptions.savedRoll = {
              scope: metadata.savedRoll.scope === "personal" ? "Mine" : "Server",
              name: metadata.savedRoll.name,
            };
          }
          payload = buildRollResultMessage(record.outcome, messageOptions);
          sourceArtifact = await this.prepareSourceLogArtifact(
            metadata,
            payload,
            { status: "available", filename, png },
            rollResultText(record.outcome),
          );
          if (sourceArtifact !== undefined) {
            if (sourceArtifact.artifact.version !== 2) {
              throw new Error("Source roll log artifact version is invalid");
            }
            payload = sourceArtifact.artifact.payload;
            if (sourceArtifact.artifact.image.status === "available") {
              filename = sourceArtifact.artifact.image.filename;
              png = sourceArtifact.artifact.image.png;
            }
          }
        } catch {
          return this.terminateDelivery(
            target,
            attempts,
            delivery.expires_at,
            "response",
          );
        }
      }
      const attachment = {
        filename,
        contentType: "image/png" as const,
        bytes: png,
        description: "Rendered dice result",
      };
      const terminal = await this.finalizeIfResultWindowClosed(
        delivery,
        target,
        attempts,
      );
      if (terminal !== null) return terminal;
      if (record.version === 5) {
        const pending = await this.deferUntilResultNotBefore(
          settings.skipDiceDelay,
          resultNotBefore,
          delivery.expires_at,
        );
        if (pending !== null) return pending;
      }
      if (metadata.responseMode === "channel-message") {
        if (metadata.logging === null) {
          return this.terminateDelivery(
            target,
            attempts,
            delivery.expires_at,
            "response",
          );
        }
        discordOperation = followupMessageId === null
          ? "create-followup-result"
          : "edit-followup-result";
        const channelUploadStartedAt = Date.now();
        const attempt = await this.attemptChannelRollMessage(
          followupMessageId === null
            ? {
                version: 1,
                operation: "create-result",
                rollId: target.id,
                channelId: metadata.logging.channelId,
                payload,
                filename,
                png,
              }
            : {
                version: 1,
                operation: "edit-result",
                channelId: metadata.logging.channelId,
                messageId: followupMessageId,
                payload,
                filename,
                png,
              },
          target,
          attempts,
          delivery.expires_at,
          "discord",
          discordOperation,
        );
        if ("result" in attempt) return attempt.result;
        if (settings.hideRollResultText) {
          this.bindTextResultMessage(attempt.delivery.messageId);
        }
        try {
          const cleanupResponse = await fetch(buildDeleteOriginalResponse(target));
          if (!cleanupResponse.ok) {
            throw new Error("Saved roll picker cleanup failed");
          }
        } catch {
          console.warn(
            JSON.stringify({
              level: "warn",
              message: "Saved roll picker cleanup failed",
              rollId: target.id,
            }),
          );
        }
        return this.completeDelivery(
          target,
          attempts,
          delivery,
          record,
          attempt.delivery.httpStatus,
          settings.skipDiceDelay ? 0 : delayMs,
          elapsedMs(channelUploadStartedAt),
        );
      }
      if (metadata.responseMode === "edit-original") {
        request = buildEditOriginalResponseWithFile(target, payload, attachment);
        discordOperation = "edit-original-result";
      } else if (followupMessageId !== null) {
        request = buildEditFollowupResponseWithFile(
          target,
          followupMessageId,
          payload,
          attachment,
        );
        discordOperation = "edit-followup-result";
      } else {
        request = buildFollowupResponseWithFile(target, payload, attachment);
        discordOperation = "create-followup-result";
      }
    }

    let response: Response;
    const resultUploadStartedAt = Date.now();
    try {
      this.recordProviderAttempt();
      response = await fetch(request);
    } catch {
      return this.scheduleRetry(
        target.id,
        attempts,
        delivery.expires_at,
        "discord",
      );
    }
    const resultUploadMs = elapsedMs(resultUploadStartedAt);
    if (response.ok) {
      if (settings.hideRollResultText && record.outcome.outcomes.length > 0) {
        const messageId = followupMessageId ??
          await readDiscordMessageId(response);
        if (messageId === null) {
          return this.scheduleRetry(
            target.id,
            attempts,
            delivery.expires_at,
            "discord",
            undefined,
            response.status,
          );
        }
        this.bindTextResultMessage(messageId);
      }
      if (
        metadata.responseMode === "followup" &&
        record.outcome.outcomes.length > 0
      ) {
        try {
          const cleanupResponse = await fetch(
            legacyDirectPrivateDefer
              ? buildDeleteOriginalResponse(target)
              : buildEditOriginalResponse(
                  target,
                  privateTextMessage("Saved roll posted.", 0x2e_cc_71),
                ),
          );
          if (!cleanupResponse.ok) {
            throw new Error("Private interaction cleanup failed");
          }
        } catch {
          console.warn(
            JSON.stringify({
              level: "warn",
              message: legacyDirectPrivateDefer
                ? "Direct roll private defer cleanup failed"
                : "Saved roll private confirmation failed",
              rollId: target.id,
            }),
          );
        }
      }
      return this.completeDelivery(
        target,
        attempts,
        delivery,
        record,
        response.status,
        settings.skipDiceDelay ? 0 : delayMs,
        resultUploadMs,
      );
    }
    if (isRetryableHttpStatus(response.status)) {
      return this.scheduleRetry(
        target.id,
        attempts,
        delivery.expires_at,
        "discord",
        retryAfterMs(response, attempts),
        response.status,
      );
    }

    const code = await readDiscordErrorCode(response);
    return this.failDelivery(
      target.id,
      attempts,
      response.status,
      delivery.expires_at,
      "discord",
      { code, operation: discordOperation },
    );
  }

  private async completeDelivery(
    target: RollDeliveryTarget,
    attempts: number,
    delivery: StoredDeliveryRow,
    record: RollWorkRecord,
    httpStatus: number,
    delayMs: number | null,
    resultUploadMs: number | null,
  ): Promise<DeliverRollWorkResult> {
    const deliveredAt = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET token = NULL, state = 'delivered', delivered_at = ?,
             last_http_status = ?, failure_phase = NULL
         WHERE singleton = 1`,
        deliveredAt,
        httpStatus,
      );
      this.ctx.storage.sql.exec(
        `UPDATE roll_log_outbox
         SET destination_delivered_at = ?, handoff_until = ?
         WHERE singleton = 1`,
        deliveredAt,
        deliveredAt + LOG_WORK_RETRY_WINDOW_MS,
      );
    });
    this.advanceLifecycle({
      state: "delivered",
      occurredAt: deliveredAt,
      attempts,
      httpStatus,
      destinationPayload:
        this.destinationTelemetryContext(record).destinationPayload,
    });
    this.logDestinationCompletion({
      rollId: target.id,
      state: "delivered",
      attempts,
      httpStatus,
      failurePhase: null,
      completedAt: deliveredAt,
      record,
      delayMs,
      resultUploadMs,
    });
    await this.ctx.storage.setAlarm(delivery.expires_at);
    return { status: "delivered" };
  }

  private async terminateDelivery(
    target: RollDeliveryTarget,
    attempts: number,
    expiresAt: number,
    phase: RollDeliveryFailurePhase,
  ): Promise<DeliverRollWorkResult> {
    this.ctx.storage.sql.exec(
      "UPDATE interaction_delivery SET failure_phase = ? WHERE singleton = 1",
      phase,
    );
    this.advanceLifecycle({
      state: "failed",
      occurredAt: Date.now(),
      attempts,
      httpStatus: null,
      failurePhase: phase,
      failureCode: lifecycleFailureCode(phase),
      destinationPayload: rollDeliveryFailureMessage(),
    });
    console.error(
      JSON.stringify({
        telemetryVersion: 2,
        level: "error",
        message: "Roll delivery encountered a terminal internal failure",
        subsystem: "roll-destination",
        rollId: target.id,
        ...this.destinationTelemetryContext(this.tryReadWork()),
        userImpact: "failed",
        phase,
        attempt: attempts,
      }),
    );
    return this.attemptTerminalResponse(target, attempts, expiresAt, phase);
  }

  private async attemptTerminalResponse(
    target: RollDeliveryTarget,
    attempts: number,
    expiresAt: number,
    phase: RollDeliveryFailurePhase,
  ): Promise<DeliverRollWorkResult> {
    this.ctx.storage.sql.exec(
      "UPDATE interaction_delivery SET failure_phase = ? WHERE singleton = 1",
      phase,
    );
    let response: Response;
    try {
      this.recordProviderAttempt();
      response = await fetch(
        buildEditOriginalResponse(target, rollDeliveryFailureMessage()),
      );
    } catch {
      return this.scheduleRetry(
        target.id,
        attempts,
        expiresAt,
        "terminal-response",
        retryDelayMs(attempts),
        null,
        true,
      );
    }
    if (response.ok) {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET token = NULL, state = 'failed', last_http_status = ?,
             failure_phase = ?
         WHERE singleton = 1`,
        response.status,
        phase,
      );
      const completedAt = Date.now();
      this.advanceLifecycle({
        state: "failed",
        occurredAt: completedAt,
        attempts,
        httpStatus: response.status,
        failurePhase: phase,
        failureCode: lifecycleFailureCode(phase),
        destinationPayload: rollDeliveryFailureMessage(),
      });
      this.logDestinationCompletion({
        rollId: target.id,
        state: "failed",
        attempts,
        httpStatus: response.status,
        failurePhase: phase,
        completedAt,
      });
      await this.ctx.storage.setAlarm(expiresAt);
      return { status: "failed" };
    }
    if (isRetryableHttpStatus(response.status)) {
      return this.scheduleRetry(
        target.id,
        attempts,
        expiresAt,
        "terminal-response",
        retryAfterMs(response, attempts),
        response.status,
        true,
      );
    }
    return this.failDelivery(
      target.id,
      attempts,
      response.status,
      expiresAt,
      "terminal-response",
    );
  }

  private async probeOriginalResponse(
    discordFailure: DiscordFailureDetails,
  ): Promise<RollLifecycleDiagnosticsV2["originalResponseProbe"]> {
    // Probe both known failure modes so diagnostics can separate "the
    // original message is gone" (10008) from "the token/webhook went bad
    // while the message still exists" (10015).
    if (
      (discordFailure.code !== 10_008 && discordFailure.code !== 10_015) ||
      discordFailure.operation !== "edit-original-result"
    ) {
      return null;
    }
    const lifecycle = this.readLifecycleOutbox();
    const delivery = this.readDelivery();
    if (lifecycle === undefined || delivery === undefined) return null;
    const snapshot = parseRollLifecycleSnapshot(
      JSON.parse(lifecycle.snapshot_json),
    );
    if (snapshot.version === 1) return null;
    let metadata: DeliveryMetadata;
    try {
      metadata = parseDeliveryMetadata(delivery.metadata_json);
    } catch {
      return null;
    }
    if (metadata.logging?.source !== "discord") return null;

    const probe =
      snapshot.diagnostics.originalResponseMessageId !== null
        ? this.probeStoredMessage(
            metadata.logging.channelId,
            snapshot.diagnostics.originalResponseMessageId,
          )
        : delivery.token === null
          ? null
          : this.probeInteractionWebhook(
              snapshot.interactionId,
              metadata.applicationId,
              delivery.token,
            );
    if (probe === null) return null;

    try {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutResult = new Promise<"probe-failed">((resolve) => {
        timeout = setTimeout(() => {
          resolve("probe-failed");
        }, MESSAGE_PROBE_TIMEOUT_MS);
      });
      let outcome: RollLifecycleDiagnosticsV2["originalResponseProbe"];
      try {
        outcome = await Promise.race([probe, timeoutResult]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
      return outcome;
    } catch {
      // The diagnostic probe must never change delivery behavior.
      return "probe-failed";
    }
  }

  private async probeStoredMessage(
    channelId: string,
    messageId: string,
  ): Promise<RollLifecycleDiagnosticsV2["originalResponseProbe"]> {
    try {
      const result = parseDiscordMessageExistenceResult(
        await this.env.DISCORD_MESSAGE_PROBE.inspectDiscordMessageExistence({
          channelId,
          messageId,
        }),
      );
      return result.outcome;
    } catch {
      // The diagnostic probe must never change delivery behavior.
    }
    return "probe-failed";
  }

  private async probeInteractionWebhook(
    interactionId: string,
    applicationId: string,
    token: string,
  ): Promise<RollLifecycleDiagnosticsV2["originalResponseProbe"]> {
    // Without a stored original message id, ask Discord whether the
    // interaction webhook still resolves @original: success means the
    // delivery rejection was transient, 10008 means the message is gone,
    // and 10015 means the webhook/token itself stopped resolving.
    try {
      const response = await fetch(
        buildReadOriginalResponse({ id: interactionId, applicationId, token }),
      );
      if (response.ok) return "exists";
      const code = await readDiscordErrorCode(response);
      if (code === 10_008) return "missing";
      if (code === 10_015) return "inaccessible";
    } catch {
      // The diagnostic probe must never change delivery behavior.
    }
    return "probe-failed";
  }

  private async failDelivery(
    rollId: string,
    attempts: number,
    httpStatus: number,
    expiresAt: number,
    failurePhase: DestinationCompletionPhase,
    discordFailure?: DiscordFailureDetails,
  ): Promise<DeliverRollWorkResult> {
    const originalResponseProbe = discordFailure === undefined
      ? null
      : await this.probeOriginalResponse(discordFailure);
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET token = NULL, state = 'failed', last_http_status = ?
       WHERE singleton = 1`,
      httpStatus,
    );
    const completedAt = Date.now();
    const lifecycleFailure: LifecycleAdvance = {
      state: "failed",
      occurredAt: completedAt,
      attempts,
      httpStatus,
      failurePhase,
      failureCode: `${failurePhase}-rejected`,
    };
    if (discordFailure !== undefined) {
      const diagnostics: Partial<RollLifecycleDiagnosticsV2> = {
        discordErrorCode: discordFailure.code,
        discordOperation: discordFailure.operation,
      };
      if (originalResponseProbe !== null) {
        diagnostics.originalResponseProbe = originalResponseProbe;
      }
      lifecycleFailure.diagnostics = diagnostics;
    }
    this.advanceLifecycle(lifecycleFailure);
    const completion: DestinationCompletion = {
      rollId,
      state: "failed",
      attempts,
      httpStatus,
      failurePhase,
      completedAt,
    };
    if (discordFailure !== undefined) completion.discordFailure = discordFailure;
    this.logDestinationCompletion(completion);
    await this.ctx.storage.setAlarm(expiresAt);
    return { status: "failed" };
  }

  private async scheduleRetry(
    rollId: string,
    attempts: number,
    expiresAt: number,
    phase: RetryableDeliveryPhase,
    delayMs = retryDelayMs(attempts),
    httpStatus: number | null = null,
    finalizing = false,
  ): Promise<DeliverRollWorkResult> {
    const now = Date.now();
    const cutoff = finalizing
      ? expiresAt - DELIVERY_LAST_ATTEMPT_BUFFER_MS
      : deliveryFinalizationAt(expiresAt);
    const retryAt = Math.max(now, Math.min(now + delayMs, cutoff));
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET state = 'pending', last_http_status = ?
       WHERE singleton = 1`,
      httpStatus,
    );
    this.advanceLifecycle({
      state: "delivery_started",
      occurredAt: Date.now(),
      attempts,
      httpStatus,
    });
    console.warn(
      JSON.stringify({
        telemetryVersion: 2,
        level: "warn",
        message: "Roll delivery will retry",
        subsystem: "roll-destination",
        rollId,
        ...this.destinationTelemetryContext(this.tryReadWork()),
        state: "pending",
        userImpact: "delayed",
        phase,
        attempt: attempts,
        httpStatus,
        finalizing,
        retryAt,
      }),
    );
    await this.ctx.storage.setAlarm(retryAt);
    return { status: "pending", retryAt };
  }

  private storedPreparation(
    request: RollWorkRequest,
  ): PrepareRollWorkResult | undefined {
    const row = this.ctx.storage.sql
      .exec<StoredWorkRow>(
        `SELECT request_json, record_json
         FROM roll_work
         WHERE singleton = 1`,
      )
      .toArray()[0];
    if (row === undefined) return undefined;
    if (row.request_json !== JSON.stringify(request)) {
      return { status: "conflict" };
    }
    const record = parseRecord(row.record_json);
    if (JSON.stringify(record.request) !== row.request_json) {
      throw new Error("Stored roll work request does not match its record");
    }
    return { status: "existing", record };
  }

  private async recordForDelivery(
    delivery: ReturnType<typeof validateDeliveryRequest>,
  ): Promise<DeliveryRecordResolution> {
    const { request, accounting } = delivery;
    const rollId = delivery.interaction.id;
    const existing = this.storedPreparation(request);
    if (existing?.status === "conflict") return { status: "conflict" };
    if (existing?.status === "existing") {
      if (
        delivery.rollSeed !== null &&
        existing.record.rollSeed !== delivery.rollSeed
      ) {
        return { status: "conflict" };
      }
      return {
        status: "ready",
        record: existing.record,
        renderSnapshotPreparationMs: null,
      };
    }

    const rollSeed = delivery.rollSeed ?? randomSeed();
    // The acknowledgement already rendered clatter text from this seed, so the
    // result message must reuse it rather than contradict what users saw.
    const renderSeed = delivery.renderSeed ?? randomSeed();
    const renderVersion = accounting === null
      ? null
      : parseRollRenderVersion(this.env.ROLL_RENDER_VERSION);
    const outcome = executeRoll({
      ...request,
      seed: rollSeed,
      stableAppearanceIdentities: true,
      preserveOutOfRangePhysicalFaces: renderVersion === 4,
    });
    const common = {
      request,
      rollSeed,
      renderSeed,
      outcome,
      createdAt: Date.now(),
    };
    if (accounting === null) {
      return {
        status: "ready",
        record: { version: 1, ...common },
        renderSnapshotPreparationMs: null,
      };
    }
    if (renderVersion === null) {
      throw new Error("Roll render version is unavailable");
    }
    if (outcome.outcomes.length === 0) {
      return {
        status: "ready",
        record: { version: 4, ...common, renderRequest: null },
        renderSnapshotPreparationMs: null,
      };
    }
    // Every rollback target must parse and recover V5 before this producer ships.
    if (
      delivery.rollSeed !== null &&
      delivery.savedRoll === null &&
      delivery.responseMode === "edit-original" &&
      delivery.logging?.source === "discord"
    ) {
      return {
        status: "ready",
        record: {
          version: 5,
          renderVersion: 4,
          viewPolicy: parseRollViewPolicy(this.env.ROLL_VIEW_POLICY),
          ...common,
          renderRequest: null,
        },
        renderSnapshotPreparationMs: null,
      };
    }

    const renderSnapshotPreparationStartedAt = Date.now();
    try {
      // The dice-delay setting rides along with the appearance lookup so that
      // delivery never pays for a data service round trip of its own.
      const renderRequest = await buildRollRenderRequestForVersion(
        this.env.DATA_SERVICE,
        renderVersion,
        parseRollViewPolicy(this.env.ROLL_VIEW_POLICY),
        accounting.userId,
        accounting.guildId,
        outcome,
        renderSeed,
      );
      return {
        status: "ready",
        record:
          renderRequest.version === 3
            ? { version: 3, ...common, renderRequest }
            : { version: 4, ...common, renderRequest },
        renderSnapshotPreparationMs: elapsedMs(
          renderSnapshotPreparationStartedAt,
        ),
      };
    } catch {
      console.error(
        JSON.stringify({
          telemetryVersion: 2,
          level: "error",
          message: "Roll delivery preparation failed",
          subsystem: "roll-destination",
          rollId,
          ...deliveryTelemetryContext(
            {
              interactionId: rollId,
              applicationId: delivery.interaction.applicationId,
              message: delivery.message,
              accounting,
              logging: delivery.logging,
              preflighted: delivery.rollSeed !== null,
              responseMode: delivery.responseMode,
              savedRoll: delivery.savedRoll,
            },
            undefined,
            null,
            null,
          ),
          userImpact: "failed",
          phase: "render-request",
          renderVersion,
        }),
      );
      const concurrent = this.storedPreparation(request);
      if (concurrent?.status === "conflict") return { status: "conflict" };
      if (concurrent?.status === "existing") {
        return {
          status: "ready",
          record: concurrent.record,
          renderSnapshotPreparationMs: null,
        };
      }
      return { status: "unavailable" };
    }
  }

  private async finalizeRenderSnapshot(
    record: RollWorkRecordV5,
    metadata: DeliveryMetadata,
  ): Promise<RollWorkRecordV5 | null> {
    if (record.renderRequest !== null) return record;
    if (record.renderVersion === 3) return null;
    if (metadata.accounting === null) {
      throw new Error("Roll render snapshot accounting context is unavailable");
    }
    let renderRequest: Awaited<
      ReturnType<typeof buildRollRenderRequestForVersion>
    >;
    try {
      renderRequest = await buildRollRenderRequestForVersion(
        this.env.DATA_SERVICE,
        record.renderVersion,
        rollRecordV5ViewPolicy(record),
        metadata.accounting.userId,
        metadata.accounting.guildId,
        record.outcome,
        record.renderSeed,
      );
    } catch {
      return null;
    }
    if (renderRequest.version !== 4) {
      throw new Error("Roll render snapshot version is invalid");
    }
    const candidate: RollWorkRecordV5 = {
      ...record,
      renderVersion: 4,
      renderRequest,
    };
    const finalized = parseRecord(JSON.stringify(candidate));
    if (finalized.version !== 5 || finalized.renderRequest === null) {
      throw new Error("Finalized roll render snapshot is invalid");
    }

    return this.ctx.storage.transactionSync(() => {
      const current = this.readWork();
      if (
        current === undefined ||
        current.version !== 5 ||
        rollRecordV5Identity(current) !== rollRecordV5Identity(record)
      ) {
        throw new Error("Roll render snapshot conflicts with stored work");
      }
      if (current.renderRequest !== null) return current;
      this.validateLifecycleRenderSnapshot(finalized);
      this.ctx.storage.sql.exec(
        "UPDATE roll_work SET record_json = ? WHERE singleton = 1",
        JSON.stringify(finalized),
      );
      return finalized;
    });
  }

  private async renderRecord(
    record: RollWorkRecord,
  ): Promise<RenderResult | RenderResultV2 | RenderResultV3 | RenderResultV4> {
    if (record.version === 1) {
      return renderDiceToPng(
        buildRollRenderRequest(record.outcome, record.renderSeed),
      );
    }
    if (record.version === 5 && record.renderRequest === null) {
      throw new Error("Roll render snapshot is pending");
    }
    if (record.renderRequest === null) {
      throw new Error("Roll work has no renderable outcome");
    }
    if (record.version === 2) {
      return renderDiceRequestV2ToPng(record.renderRequest);
    }
    if (
      record.version === 3 ||
      (record.version === 5 && record.renderVersion === 3)
    ) {
      return renderDiceRequestV3ToPng(record.renderRequest);
    }
    return {
      version: 4,
      ...(await renderV4WithSingleRetry(
        serializeRenderRequestV4(record.renderRequest),
        createCanvasKitRequestRendererV4,
      )),
    };
  }

  async render(value: SchemaInput): Promise<RenderRollWorkResult> {
    const prepared = this.prepare(value);
    if (prepared.status === "conflict") return prepared;
    return {
      status: "rendered",
      ...(await this.renderRecord(prepared.record)),
    };
  }

  prepare(value: SchemaInput): PrepareRollWorkResult {
    return this.ctx.storage.transactionSync(() =>
      this.prepareRequest(validateRequest(value)),
    );
  }

  private prepareRequest(
    request: RollWorkRequest,
    candidate?: RollWorkRecord,
  ): PrepareRollWorkResult {
    const existing = this.storedPreparation(request);
    if (existing !== undefined) return existing;

    let record = candidate;
    if (record === undefined) {
      const rollSeed = randomSeed();
      record = {
        version: 1,
        request,
        rollSeed,
        renderSeed: randomSeed(),
        outcome: executeRoll({
          ...request,
          seed: rollSeed,
          stableAppearanceIdentities: true,
        }),
        createdAt: Date.now(),
      };
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO roll_work (singleton, request_json, record_json)
       VALUES (1, ?, ?)`,
      JSON.stringify(request),
      JSON.stringify(record),
    );
    return { status: "created", record };
  }

  private readWork(): RollWorkRecord | undefined {
    const row = this.ctx.storage.sql
      .exec<StoredWorkRow>(
        `SELECT request_json, record_json
         FROM roll_work
         WHERE singleton = 1`,
      )
      .toArray()[0];
    if (row === undefined) return undefined;
    const record = parseRecord(row.record_json);
    if (JSON.stringify(record.request) !== row.request_json) {
      throw new Error("Stored roll work request does not match its record");
    }
    return record;
  }

  private tryReadWork(): RollWorkRecord | undefined {
    try {
      return this.readWork();
    } catch {
      return undefined;
    }
  }

  private saveRollSourceId(): string {
    const id = this.ctx.id.name;
    if (id === undefined) throw new Error("RollWork must have a named id");
    return id;
  }

  private ensureSaveRollIntent(
    record: RollWorkRecord,
    metadata: DeliveryMetadata,
  ): SaveRollIntent | null {
    const savedRoll = metadata.savedRoll;
    if (
      savedRoll === null &&
      metadata.message.title === null &&
      record.request.repetitions === 1
    ) {
      return null;
    }
    const notation = savedRoll?.notation ?? metadata.logging?.notation;
    if (notation === undefined) {
      throw new Error("Save roll notation is unavailable");
    }
    const createdAt = record.createdAt;
    const intent = parseSaveRollIntent({
      version: 2,
      source: savedRoll === null ? "fresh" : "library",
      notation,
      title: metadata.message.title,
      repetitions: record.request.repetitions,
      defaultName: savedRoll?.name ?? metadata.message.title,
      nameColor: savedRoll?.nameColor ?? null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO save_roll_intent (singleton, intent_json, expires_at)
       VALUES (1, ?, ?)`,
      JSON.stringify(intent),
      intent.expiresAt,
    );
    const stored = this.readSaveRollIntent();
    if (
      stored === undefined ||
      saveRollIntentIdentity(stored) !== saveRollIntentIdentity(intent)
    ) {
      throw new Error("Save roll intent conflicts with stored delivery");
    }
    return stored;
  }

  private readSaveRollIntent(): SaveRollIntent | undefined {
    const row = this.ctx.storage.sql
      .exec<{ intent_json: string }>(
        "SELECT intent_json FROM save_roll_intent WHERE singleton = 1",
      )
      .toArray()[0];
    return row === undefined
      ? undefined
      : parseSaveRollIntent(JSON.parse(row.intent_json));
  }

  getSaveRollIntent() {
    const intent = this.readSaveRollIntent();
    if (intent === undefined) return { status: "missing" as const };
    if (intent.expiresAt <= Date.now()) return { status: "expired" as const };
    return { status: "available" as const, intent };
  }

  private ensureTextResultIntent(
    record: RollWorkRecord,
    metadata: DeliveryMetadata,
  ): TextResultIntentV1 {
    const guildId = metadata.accounting?.guildId ?? null;
    const channelId = metadata.logging?.channelId ?? null;
    if (guildId === null || channelId === null) {
      throw new Error("Text result message context is unavailable");
    }
    const intent = parseTextResultIntent({
      version: 1,
      resultText: rollResultText(record.outcome),
      applicationId: metadata.applicationId,
      guildId,
      channelId,
      messageId: null,
      createdAt: record.createdAt,
      expiresAt: record.createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
    });
    this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO text_result_intent (
         singleton, intent_json, expires_at
       ) VALUES (1, ?, ?)`,
      JSON.stringify(intent),
      intent.expiresAt,
    );
    const stored = this.readTextResultIntent();
    if (
      stored === undefined ||
      textResultIntentIdentity(stored) !== textResultIntentIdentity(intent)
    ) {
      throw new Error("Text result intent conflicts with stored delivery");
    }
    return stored;
  }

  private readTextResultIntent(): TextResultIntentV1 | undefined {
    const row = this.ctx.storage.sql
      .exec<{ intent_json: string }>(
        "SELECT intent_json FROM text_result_intent WHERE singleton = 1",
      )
      .toArray()[0];
    return row === undefined
      ? undefined
      : parseTextResultIntent(JSON.parse(row.intent_json));
  }

  private bindTextResultMessage(messageId: string): void {
    if (!SAVED_ROLL_SNOWFLAKE.test(messageId)) {
      throw new Error("Text result message id is invalid");
    }
    const intent = this.readTextResultIntent();
    if (intent === undefined) {
      throw new Error("Text result intent is unavailable");
    }
    if (intent.messageId !== null && intent.messageId !== messageId) {
      throw new Error("Text result message conflicts with stored delivery");
    }
    if (intent.messageId === null) {
      this.ctx.storage.sql.exec(
        `UPDATE text_result_intent
         SET intent_json = ?
         WHERE singleton = 1`,
        JSON.stringify({ ...intent, messageId }),
      );
    }
  }

  getTextResult(value: SchemaInput) {
    const intent = this.readTextResultIntent();
    if (intent === undefined) return { status: "missing" as const };
    if (intent.expiresAt <= Date.now()) return { status: "expired" as const };
    const result = TextResultRequestSchema.safeParse(value);
    if (
      !result.success ||
      intent.applicationId !== result.data.applicationId ||
      intent.guildId !== result.data.guildId ||
      intent.channelId !== result.data.channelId ||
      intent.messageId !== result.data.messageId
    ) {
      return { status: "missing" as const };
    }
    return { status: "available" as const, resultText: intent.resultText };
  }

  private deleteExpiredRetainedIntents(): void {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "DELETE FROM save_roll_intent WHERE expires_at <= ?",
      now,
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM text_result_intent WHERE expires_at <= ?",
      now,
    );
  }

  private async scheduleRetainedIntentExpiry(): Promise<void> {
    this.deleteExpiredRetainedIntents();
    const expiries = [
      this.readSaveRollIntent()?.expiresAt,
      this.readTextResultIntent()?.expiresAt,
    ].filter((value): value is number => value !== undefined);
    if (expiries.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.min(...expiries));
  }

  private deleteSensitiveWorkPreservingLifecycle(): void {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM roll_log_outbox");
      this.ctx.storage.sql.exec("DELETE FROM interaction_delivery");
      this.ctx.storage.sql.exec("DELETE FROM roll_work");
      this.ctx.storage.sql.exec("DELETE FROM saved_roll_copy_receipt");
      this.ctx.storage.sql.exec("DELETE FROM saved_roll_invocation");
      this.ctx.storage.sql.exec("DELETE FROM saved_roll_picker");
    });
  }

  private deleteStoredWork(): void {
    this.deleteSensitiveWorkPreservingLifecycle();
    this.ctx.storage.sql.exec("DELETE FROM roll_lifecycle_outbox");
  }

  private readDelivery(): StoredDeliveryRow | undefined {
    return this.ctx.storage.sql
      .exec<StoredDeliveryRow>(
        `SELECT metadata_json, token, token_fingerprint, expires_at, state,
                delivered_at, last_http_status, attempts, clatter_sent_at,
                followup_message_id, skip_dice_delay, hide_roll_result_text,
                delay_ms, result_not_before,
                snapshot_ms, settings_ms, clatter_post_ms,
                lifecycle_sync_ms, accounting_ms,
                accounting_state, accounting_occurred_at,
                accounting_http_status, accounting_attempts, logging_state,
                logging_http_status, logging_attempts, helper_state,
                helper_attempts, failure_phase
         FROM interaction_delivery
         WHERE singleton = 1`,
      )
      .toArray()[0];
  }
}

const worker = {
  fetch(request: Request, env: RollBindings): Response {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        {
          ok: true,
          service: "dice-witch-roll",
          renderVersion: parseRollRenderVersion(env.ROLL_RENDER_VERSION),
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(
      { error: "Not found" },
      {
        status: 404,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  },
} satisfies ExportedHandler<RollBindings>;

export default worker;
