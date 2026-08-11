import { DurableObject } from "cloudflare:workers";
import { serializeRenderRequestV4 } from "@dice-witch/dice-v4-model";
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
  buildRollClatterMessage,
  buildRollResultMessage,
  rollResultText,
  buildSaveRollCustomId,
  DISCORD_COMPONENTS_V2_FLAG,
  DISCORD_EPHEMERAL_FLAG,
  parseSaveRollIntent,
  saveRollIntentIdentity,
  ROLL_SAVE_INTENT_RETENTION_MS,
  LOG_WORK_RETRY_WINDOW_MS,
  parseRollLifecycleSnapshot,
  validateRollLogArtifact,
  type DiscordComponentsV2Message,
  type RollLifecycleContextV1,
  type RollLifecycleDiagnosticsV2,
  type RollLogArtifact,
  type SaveRollIntent,
} from "../../../packages/discord-contracts/src";
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
  type RollDeliveryStatus,
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

export type RollEnv = RollBindings;
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

type ChannelRollMessageDeliveryResult =
  | { status: "delivered"; messageId: string; httpStatus: number }
  | { status: "invalid_response" }
  | {
      status: "retryable";
      httpStatus: number | null;
      retryAfterMs: number | null;
    }
  | {
      status: "failed";
      httpStatus: number;
      discordErrorCode: number | null;
    };

type ChannelRollMessageDeliveryService = {
  deliverChannelRollMessageV1(value: unknown): Promise<unknown>;
};

type ChannelRollMessageAttempt =
  | {
      delivery: Extract<
        ChannelRollMessageDeliveryResult,
        { status: "delivered" }
      >;
    }
  | { result: DeliverRollWorkResult };

function parseChannelRollMessageDeliveryResult(
  value: unknown,
): ChannelRollMessageDeliveryResult {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error("Channel roll message delivery response is invalid");
  }
  if (
    value.status === "delivered" &&
    hasExactKeys(value, ["httpStatus", "messageId", "status"]) &&
    typeof value.messageId === "string" &&
    SAVED_ROLL_SNOWFLAKE.test(value.messageId) &&
    Number.isSafeInteger(value.httpStatus) &&
    Number(value.httpStatus) >= 200 &&
    Number(value.httpStatus) < 300
  ) {
    return {
      status: value.status,
      messageId: value.messageId,
      httpStatus: Number(value.httpStatus),
    };
  }
  if (
    value.status === "invalid_response" &&
    hasExactKeys(value, ["status"])
  ) {
    return { status: value.status };
  }
  if (
    value.status === "retryable" &&
    hasExactKeys(value, ["httpStatus", "retryAfterMs", "status"]) &&
    (value.httpStatus === null ||
      (Number.isSafeInteger(value.httpStatus) &&
        isRetryableHttpStatus(Number(value.httpStatus)))) &&
    (value.retryAfterMs === null ||
      (Number.isSafeInteger(value.retryAfterMs) &&
        Number(value.retryAfterMs) >= 0))
  ) {
    return {
      status: value.status,
      httpStatus:
        value.httpStatus === null ? null : Number(value.httpStatus),
      retryAfterMs:
        value.retryAfterMs === null ? null : Number(value.retryAfterMs),
    };
  }
  if (
    value.status === "failed" &&
    hasExactKeys(value, [
      "discordErrorCode",
      "httpStatus",
      "status",
    ]) &&
    Number.isSafeInteger(value.httpStatus) &&
    Number(value.httpStatus) >= 400 &&
    Number(value.httpStatus) <= 599 &&
    !isRetryableHttpStatus(Number(value.httpStatus)) &&
    (value.discordErrorCode === null ||
      (Number.isSafeInteger(value.discordErrorCode) &&
        Number(value.discordErrorCode) >= 1))
  ) {
    return {
      status: value.status,
      httpStatus: Number(value.httpStatus),
      discordErrorCode: value.discordErrorCode === null
        ? null
        : Number(value.discordErrorCode),
    };
  }
  throw new Error("Channel roll message delivery response is invalid");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBoundedDiscordJson(
  response: Response,
): Promise<unknown> {
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
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
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
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return null;
  }
}

async function readDiscordErrorCode(response: Response): Promise<number | null> {
  const parsed = await readBoundedDiscordJson(response);
  if (!isRecord(parsed) || !Number.isSafeInteger(parsed.code)) return null;
  const code = Number(parsed.code);
  return code > 0 ? code : null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

const SAVED_ROLL_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAVED_ROLL_SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
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

type SavedRollPickerContext = {
  version: 1;
  interactionId: string;
  userId: string;
  guildId: string | null;
  channelId: string;
};

type SavedRollPickerRow = {
  user_id: string;
  guild_id: string | null;
  channel_id: string;
  expires_at: number;
  scope: "mine" | "server";
  page: number;
  selected_id: string | null;
  selected_revision: number | null;
  state: "open" | "reserved";
  run_interaction_id: string | null;
};

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

function parseSavedRollPickerContext(value: unknown): SavedRollPickerContext {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["channelId", "guildId", "interactionId", "userId", "version"]) ||
    value.version !== 1 ||
    typeof value.interactionId !== "string" ||
    !SAVED_ROLL_SNOWFLAKE.test(value.interactionId) ||
    typeof value.userId !== "string" ||
    !SAVED_ROLL_SNOWFLAKE.test(value.userId) ||
    (value.guildId !== null &&
      (typeof value.guildId !== "string" || !SAVED_ROLL_SNOWFLAKE.test(value.guildId))) ||
    typeof value.channelId !== "string" ||
    !SAVED_ROLL_SNOWFLAKE.test(value.channelId)
  ) {
    throw new Error("Saved roll picker context is invalid");
  }
  return {
    version: 1,
    interactionId: value.interactionId,
    userId: value.userId,
    guildId: value.guildId,
    channelId: value.channelId,
  };
}

function parseSavedRollSelection(value: unknown): SavedRollSelection {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "revision", "scope"]) ||
    (value.scope !== "mine" && value.scope !== "server") ||
    typeof value.id !== "string" ||
    !SAVED_ROLL_UUID_V4.test(value.id) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) {
    throw new Error("Saved roll selection is invalid");
  }
  return { scope: value.scope, id: value.id, revision: value.revision };
}

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
  destinationPayload: unknown,
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

function rollLogArtifact(value: unknown): RollLogArtifact {
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
    return this.ctx.storage.sql
      .exec<SavedRollPickerRow>("SELECT * FROM saved_roll_picker WHERE singleton = 1")
      .toArray()[0];
  }

  openSavedRollPicker(value: unknown) {
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

  updateSavedRollPicker(value: unknown) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "action",
        "channelId",
        "guildId",
        "interactionId",
        "selection",
        "userId",
        "version",
      ]) ||
      !["mine", "server", "previous", "next", "select"].includes(String(value.action))
    ) {
      throw new Error("Saved roll picker update is invalid");
    }
    const context = parseSavedRollPickerContext({
      version: value.version,
      interactionId: value.interactionId,
      userId: value.userId,
      guildId: value.guildId,
      channelId: value.channelId,
    });
    const selection = value.selection === null ? null : parseSavedRollSelection(value.selection);
    return this.ctx.storage.transactionSync(() => {
      const row = this.readSavedRollPicker();
      if (row === undefined) return { status: "missing" as const };
      if (!samePickerContext(row, context)) return { status: "unauthorized" as const };
      if (row.expires_at <= Date.now()) return { status: "expired" as const };
      if (row.state !== "open") return { status: "consumed" as const };
      const action = value.action as "mine" | "server" | "previous" | "next" | "select";
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

  reserveSavedRollRun(value: unknown) {
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
                id: row.selected_id as string,
                revision: row.selected_revision as number,
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

  reserveDirectSavedRoll(value: unknown) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "channelId",
        "guildId",
        "interactionId",
        "selection",
        "userId",
        "version",
      ])
    ) {
      throw new Error("Direct saved roll reservation is invalid");
    }
    const context = parseSavedRollPickerContext({
      version: value.version,
      interactionId: value.interactionId,
      userId: value.userId,
      guildId: value.guildId,
      channelId: value.channelId,
    });
    const selection = parseSavedRollSelection(value.selection);
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
    const invocation = JSON.parse(row.invocation_json) as Omit<
      SavedRollInvocationV1,
      "nameColor"
    > & { nameColor?: string | null };
    return {
      ...invocation,
      nameColor: parseSavedRollNameColorV2(invocation.nameColor ?? null),
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
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      return "unavailable";
    }
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ["savedRoll", "status"]) ||
      value.status !== "found" ||
      !isRecord(value.savedRoll)
    ) {
      return "unavailable";
    }
    const savedRoll = value.savedRoll;
    if (
      !hasExactKeys(savedRoll, [
        "comparisonKey",
        "createdAt",
        "createdByUserId",
        "displayName",
        "id",
        "manualOrder",
        "nameColor",
        "notation",
        "owner",
        "pinned",
        "repetitions",
        "revision",
        "title",
        "updatedAt",
        "updatedByUserId",
        "version",
      ]) ||
      savedRoll.id !== selection.id ||
      !isRecord(savedRoll.owner) ||
      JSON.stringify(savedRoll.owner) !== JSON.stringify(owner) ||
      typeof savedRoll.pinned !== "boolean" ||
      !Number.isSafeInteger(savedRoll.manualOrder) ||
      !Number.isSafeInteger(savedRoll.revision)
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
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      return { status: "unavailable" };
    }
    if (
      !isRecord(value) ||
      value.status !== "found" ||
      !isRecord(value.savedRoll) ||
      value.savedRoll.id !== selection.id ||
      value.savedRoll.version !== 2 ||
      value.savedRoll.revision !== selection.revision
    ) {
      return { status: "unavailable" };
    }
    try {
      return {
        status: "found",
        nameColor: parseSavedRollNameColorV2(value.savedRoll.nameColor),
      };
    } catch {
      return { status: "unavailable" };
    }
  }

  async acceptSavedRollDelivery(value: unknown) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "actor",
        "deferredAt",
        "interaction",
        "responseMode",
        "selection",
        "sourceInteraction",
        "sessionId",
        "version",
      ]) ||
      value.version !== 1 ||
      value.sessionId !== this.ctx.id.name ||
      !Number.isSafeInteger(value.deferredAt) ||
      Number(value.deferredAt) < 0 ||
      (value.responseMode !== "channel-message" &&
        value.responseMode !== "followup" &&
        value.responseMode !== "edit-original") ||
      (value.sourceInteraction !== "command" &&
        value.sourceInteraction !== "component") ||
      !isRecord(value.interaction) ||
      !hasExactKeys(value.interaction, ["applicationId", "id", "token"]) ||
      !isRecord(value.actor) ||
      !hasExactKeys(value.actor, [
        "channelId",
        "guildId",
        "loggingContext",
        "userId",
        "username",
        "version",
      ]) ||
      typeof value.actor.username !== "string"
    ) {
      throw new Error("Saved roll delivery request is invalid");
    }
    const selection = parseSavedRollSelection(value.selection);
    const context = parseSavedRollPickerContext({
      version: value.actor.version,
      interactionId: value.interaction.id,
      userId: value.actor.userId,
      guildId: value.actor.guildId,
      channelId: value.actor.channelId,
    });
    // Components accept both legacy modes during the independently deployed
    // Interactions-to-Roll contract transition.
    const validResponseMode = value.sourceInteraction === "component" ||
      value.responseMode === "edit-original";
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
    const invocation = await this.resolveSavedRollInvocation(selection, picker);
    if (typeof invocation === "string") return { status: invocation } as const;
    const delivery = {
      interaction: value.interaction,
      request: {
        notation: invocation.notation,
        repetitions: invocation.repetitions,
      },
      message: { title: invocation.title, username: value.actor.username },
      accounting: {
        guildId: context.guildId,
        userId: context.userId,
        receivedAt: interactionExpiresAt(context.interactionId) - 15 * 60 * 1_000,
      },
      deferredAt: Number(value.deferredAt),
      logging: {
        source: "discord",
        channelId: context.channelId,
        notation: invocation.notation,
        ...(value.actor.loggingContext === null
          ? {}
          : { context: value.actor.loggingContext }),
      },
      responseMode: value.responseMode,
      savedRoll: invocation,
    };
    const accepted = await this.acceptDelivery(delivery);
    return accepted.status === "created" || accepted.status === "existing"
      ? { ...accepted, savedRoll: invocation }
      : accepted;
  }

  async copySavedRollToMine(value: unknown) {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "channelId",
        "guildId",
        "interactionId",
        "name",
        "userId",
        "username",
        "version",
      ])
    ) {
      throw new Error("Saved roll copy request is invalid");
    }
    const context = parseSavedRollPickerContext({
      version: value.version,
      interactionId: value.interactionId,
      userId: value.userId,
      guildId: value.guildId,
      channelId: value.channelId,
    });
    if (
      (value.name !== null && typeof value.name !== "string") ||
      typeof value.username !== "string" ||
      value.username.length < 1 ||
      value.username.length > 32
    ) {
      throw new Error("Saved roll copy request is invalid");
    }
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
    const resolved = await this.resolveSavedRollInvocation(
      selection,
      picker,
      picker.state === "reserved",
    );
    if (typeof resolved === "string") return { status: resolved } as const;
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
    if (value.name !== null) {
      try {
        displayName = parseSavedRollNameV1(value.name).displayName;
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
            username: value.username,
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
    let listValue: unknown;
    try {
      listValue = await listResponse.json();
    } catch {
      return { status: "unavailable" } as const;
    }
    let listRevision: number;
    if (
      isRecord(listValue) &&
      listValue.status === "found" &&
      Number.isSafeInteger(listValue.listRevision) &&
      Number(listValue.listRevision) >= 0
    ) {
      listRevision = Number(listValue.listRevision);
    } else if (isRecord(listValue) && listValue.status === "missing") {
      listRevision = 0;
    } else {
      return { status: "unavailable" } as const;
    }
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
    let result: unknown;
    try {
      result = await copyResponse.json();
    } catch {
      return { status: "unavailable" } as const;
    }
    if (!isRecord(result) || typeof result.status !== "string") {
      return { status: "unavailable" } as const;
    }
    if (result.status === "applied" || result.status === "existing") {
      return {
        status: "copied" as const,
        name: receipt.display_name,
        destinationId: receipt.destination_id,
      };
    }
    if (result.status === "name_conflict") {
      return { status: "name_conflict" as const, name: receipt.display_name };
    }
    if (result.status === "cap_reached") return { status: "cap_reached" as const };
    if (
      result.status === "list_revision_conflict" ||
      result.status === "mutation_conflict"
    ) {
      return { status: "conflict" as const };
    }
    return { status: "unavailable" } as const;
  }

  async deliver(value: unknown): Promise<DeliverRollWorkResult> {
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

  async acceptDelivery(value: unknown): Promise<AcceptRollDeliveryResult> {
    return this.acceptDeliveryInternal(value, false);
  }

  private async acceptDeliveryInternal(
    value: unknown,
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
      this.storeSkipDiceDelay(delivery.settings.skipDiceDelay);
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
               helper_state, clatter_sent_at
             ) VALUES (1, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
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
    let destinationPayload: unknown = null;
    try {
      const source = this.readSourceLogRow();
      if (source !== undefined) {
        const artifact: unknown = JSON.parse(source.artifact_json);
        if (isRecord(artifact) && artifact.payload !== undefined) {
          destinationPayload = artifact.payload;
        }
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

  private advanceLifecycle(input: {
    state: "delivery_started" | "delivered" | "failed";
    occurredAt: number;
    attempts: number;
    httpStatus: number | null;
    failurePhase?: string | null;
    failureCode?: string | null;
    destinationPayload?: unknown;
    diagnostics?: Partial<RollLifecycleDiagnosticsV2>;
  }): void {
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
    const next = parseRollLifecycleSnapshot({
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
      ...(current.version === 2
        ? {
            diagnostics: mergeLifecycleDiagnostics(
              current.diagnostics,
              input.diagnostics ?? {},
            ),
          }
        : {}),
      context: {
        ...current.context,
        ...(input.destinationPayload === undefined
          ? {}
          : { destinationPayload: input.destinationPayload }),
      },
    });
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
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      this.deferLifecycleSync(row.sync_attempts + 1);
      return;
    }
    if (
      response.ok &&
      isRecord(result) &&
      (result.status === "applied" ||
        result.status === "existing" ||
        result.status === "stale")
    ) {
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

  private readLifecycleTimings(): Readonly<{
    acknowledgementPreparedAt: number | null;
    acceptedAt: number | null;
    deliveryStartedAt: number | null;
  }> {
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

  private logDestinationCompletion(input: {
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
  }): void {
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
    this.deleteExpiredSaveRollIntent();
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
        await this.scheduleSaveRollIntentExpiry();
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
    await this.scheduleSaveRollIntentExpiry();
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
      let result: unknown;
      try {
        result = await response.json();
      } catch {
        return;
      }
      if (
        isRecord(result) &&
        (result.status === "applied" || result.status === "existing")
      ) {
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
      const service = this.env.DISCORD_REST as unknown as {
        sendRollHelper(value: unknown): Promise<unknown>;
      };
      const result = await service.sendRollHelper({
        rollId: metadata.interactionId,
        userId: metadata.accounting.userId,
      });
      if (isRecord(result) && result.status === "delivered") {
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
      let result: unknown;
      try {
        const source = await this.readSourceLogArtifact();
        if (source === undefined) {
          throw new Error("Source roll log artifact is missing");
        }
        result = await this.env.LOG_WORK
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
      if (
        isRecord(result) &&
        (result.status === "created" || result.status === "existing")
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
      if (isRecord(result) && result.status === "conflict") {
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

  private async resolveSkipDiceDelay(
    delivery: StoredDeliveryRow,
    metadata: ReturnType<typeof parseDeliveryMetadata>,
  ): Promise<boolean> {
    if (delivery.skip_dice_delay !== null) {
      return delivery.skip_dice_delay === 1;
    }
    const guildId = metadata.accounting?.guildId ?? null;
    if (guildId === null) {
      this.storeSkipDiceDelay(false);
      return false;
    }
    const skipDiceDelay = await this.fetchGuildSkipDiceDelay(guildId);
    this.storeSkipDiceDelay(skipDiceDelay);
    return skipDiceDelay;
  }

  private async fetchGuildSkipDiceDelay(guildId: string): Promise<boolean> {
    const response = await this.env.DATA_SERVICE.fetch(
      new Request("https://data.internal/internal/guilds/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guildId }),
      }),
    );
    if (!response.ok) throw new Error("Guild settings lookup failed");
    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      value.status !== "found" ||
      !isRecord(value.settings) ||
      typeof value.settings.skipDiceDelay !== "boolean"
    ) {
      throw new Error("Guild settings response is invalid");
    }
    return value.settings.skipDiceDelay;
  }

  private storeSkipDiceDelay(skipDiceDelay: boolean): void {
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET skip_dice_delay = ?
       WHERE singleton = 1 AND skip_dice_delay IS NULL`,
      skipDiceDelay ? 1 : 0,
    );
  }

  private resolveRollDelay(delivery: StoredDeliveryRow): {
    delayMs: number;
    resultNotBefore: number | null;
  } {
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
    const stored = JSON.parse(row.artifact_json) as Record<string, unknown>;
    const image = stored.image;
    const imageBytes = new Uint8Array(row.image_bytes);
    if (!isRecord(image)) {
      throw new Error("Stored source roll log artifact is invalid");
    }
    if ((await sha256Hex(imageBytes)) !== row.image_sha256) {
      throw new Error("Stored source roll log image hash is invalid");
    }
    let restoredImage: unknown;
    if (image.status === "available" && typeof image.filename === "string") {
      restoredImage = {
        status: "available",
        filename: image.filename,
        png: imageBytes,
      };
    } else if (image.status === "unavailable" && imageBytes.byteLength === 0) {
      restoredImage = image;
    } else {
      throw new Error("Stored source roll log artifact is invalid");
    }
    const artifact = rollLogArtifact({
      ...stored,
      destinationDeliveredAt: row.destination_delivered_at ?? 0,
      image: restoredImage,
    });
    return { artifact };
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
    const artifactJson = JSON.stringify({
      version: validated.version,
      rollId: validated.rollId,
      source: validated.source,
      notation: validated.notation,
      user: validated.user,
      guildId: validated.guildId,
      channelId: validated.channelId,
      context: validated.context,
      ...(validated.version === 2
        ? { presentation: validated.presentation }
        : {}),
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
    value: unknown,
  ): Promise<ChannelRollMessageDeliveryResult> {
    const service = this.env.DISCORD_REST as unknown as
      ChannelRollMessageDeliveryService;
    return parseChannelRollMessageDeliveryResult(
      await service.deliverChannelRollMessageV1(value),
    );
  }

  private async attemptChannelRollMessage(
    value: unknown,
    target: RollDeliveryTarget,
    attempts: number,
    expiresAt: number,
    phase: "clatter" | "discord",
    operation: DiscordOperation,
  ): Promise<ChannelRollMessageAttempt> {
    let delivery: ChannelRollMessageDeliveryResult;
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

    let skipDiceDelay = false;
    let delayMs: number | null = null;
    let resultNotBefore: number | null = null;
    if (record.outcome.outcomes.length > 0) {
      const settingsStartedAt = Date.now();
      try {
        skipDiceDelay = await this.resolveSkipDiceDelay(delivery, metadata);
        this.recordDeliverySegment("settings_ms", elapsedMs(settingsStartedAt));
        if (!skipDiceDelay) {
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
      if (!skipDiceDelay && delivery.clatter_sent_at === null) {
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
              const message = await readBoundedDiscordJson(clatterResponse);
              if (
                !isRecord(message) ||
                typeof message.id !== "string" ||
                !SAVED_ROLL_SNOWFLAKE.test(message.id)
              ) {
                throw new Error("Discord followup response is invalid");
              }
              followupMessageId = message.id;
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
              const message = await readBoundedDiscordJson(clatterResponse);
              if (
                isRecord(message) &&
                typeof message.id === "string" &&
                SAVED_ROLL_SNOWFLAKE.test(message.id)
              ) {
                originalResponseMessageId = message.id;
              }
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
          this.updateLifecycleDiagnostics(
            {
              clatterSucceededAt: clatterSentAt,
              ...(originalResponseMessageId === null
                ? {}
                : { originalResponseMessageId }),
            },
            clatterSentAt,
          );
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
          skipDiceDelay,
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
          payload = buildRollResultMessage(record.outcome, {
            ...metadata.message,
            source: "discord",
            repetitions: record.request.repetitions,
            filename,
            ...(skipDiceDelay ? {} : { clatter }),
            ...(saveRollIntent === null
              ? {}
              : {
                  saveRollCustomId: buildSaveRollCustomId({
                    kind: "discord",
                    id: this.saveRollSourceId(),
                  }),
                }),
            ...(metadata.savedRoll === null
              ? {}
              : {
                  savedRoll: {
                    scope: metadata.savedRoll.scope === "personal" ? "Mine" : "Server",
                    name: metadata.savedRoll.name,
                  },
                }),
          });
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
          skipDiceDelay,
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
          skipDiceDelay ? 0 : delayMs,
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
        skipDiceDelay ? 0 : delayMs,
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
    if (
      discordFailure.code !== 10_008 ||
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
    if (
      snapshot.version === 1 ||
      snapshot.diagnostics.originalResponseMessageId === null
    ) {
      return null;
    }
    let metadata: DeliveryMetadata;
    try {
      metadata = parseDeliveryMetadata(delivery.metadata_json);
    } catch {
      return null;
    }
    if (metadata.logging?.source !== "discord") return null;
    try {
      const service = this.env.DISCORD_MESSAGE_PROBE as unknown as {
        inspectDiscordMessageExistence(value: unknown): Promise<unknown>;
      };
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timeoutResult = new Promise<unknown>((resolve) => {
        timeout = setTimeout(
          () => {
            resolve({ outcome: "probe-failed" });
          },
          MESSAGE_PROBE_TIMEOUT_MS,
        );
      });
      const probe = service.inspectDiscordMessageExistence({
        channelId: metadata.logging.channelId,
        messageId: snapshot.diagnostics.originalResponseMessageId,
      });
      let result: unknown;
      try {
        result = await Promise.race([probe, timeoutResult]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
      if (
        isRecord(result) &&
        (result.outcome === "exists" ||
          result.outcome === "missing" ||
          result.outcome === "inaccessible" ||
          result.outcome === "probe-failed")
      ) {
        return result.outcome;
      }
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
    this.advanceLifecycle({
      state: "failed",
      occurredAt: completedAt,
      attempts,
      httpStatus,
      failurePhase,
      failureCode: `${failurePhase}-rejected`,
      ...(discordFailure === undefined
        ? {}
        : {
            diagnostics: {
              discordErrorCode: discordFailure.code,
              discordOperation: discordFailure.operation,
              ...(originalResponseProbe === null
                ? {}
                : { originalResponseProbe }),
            },
          }),
    });
    this.logDestinationCompletion({
      rollId,
      state: "failed",
      attempts,
      httpStatus,
      failurePhase,
      completedAt,
      ...(discordFailure === undefined ? {} : { discordFailure }),
    });
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
        record:
          renderVersion === 3
            ? { version: 3, ...common, renderRequest: null }
            : { version: 4, ...common, renderRequest: null },
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
        record:
          renderVersion === 3
            ? {
                version: 5,
                renderVersion: 3,
                ...common,
                renderRequest: null,
              }
            : {
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
    let candidate: RollWorkRecordV5;
    if (record.renderVersion === 3) {
      if (renderRequest.version !== 3) {
        throw new Error("Roll render snapshot version is invalid");
      }
      candidate = { ...record, renderVersion: 3, renderRequest };
    } else {
      if (renderRequest.version !== 4) {
        throw new Error("Roll render snapshot version is invalid");
      }
      candidate = { ...record, renderVersion: 4, renderRequest };
    }
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

  async render(value: unknown): Promise<RenderRollWorkResult> {
    const prepared = this.prepare(value);
    if (prepared.status === "conflict") return prepared;
    return {
      status: "rendered",
      ...(await this.renderRecord(prepared.record)),
    };
  }

  prepare(value: unknown): PrepareRollWorkResult {
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

  private deleteExpiredSaveRollIntent(): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM save_roll_intent WHERE expires_at <= ?",
      Date.now(),
    );
  }

  private async scheduleSaveRollIntentExpiry(): Promise<void> {
    const intent = this.readSaveRollIntent();
    if (intent !== undefined && intent.expiresAt > Date.now()) {
      await this.ctx.storage.setAlarm(intent.expiresAt);
      return;
    }
    this.ctx.storage.sql.exec("DELETE FROM save_roll_intent");
    await this.ctx.storage.deleteAlarm();
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
                followup_message_id, skip_dice_delay, delay_ms, result_not_before,
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
  fetch(request: Request, env: RollEnv): Response {
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
} satisfies ExportedHandler<RollEnv>;

export default worker;
