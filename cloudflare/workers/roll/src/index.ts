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
  buildEditOriginalResponse,
  buildEditOriginalResponseWithFile,
  buildRollClatterMessage,
  buildRollErrorMessage,
  buildRollResultMessage,
  LOG_WORK_RETRY_WINDOW_MS,
  ROLL_HELPER_ANNOUNCEMENT,
  ROLL_HELPER_DM_ANNOUNCEMENT,
  validateRollLogArtifact,
  type DiscordMessage,
  type RollLogArtifactV1,
} from "../../../packages/discord-contracts/src";
import { buildRollRenderRequest } from "../../../packages/roll-render-model/src";
import {
  deliveryMetadata,
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
  type PrepareRollWorkResult,
  type RenderResultV4,
  type RenderRollWorkResult,
  type RollDeliveryDiagnostics,
  type RollDeliveryFailurePhase,
  type RollDeliveryRequest,
  type RollDeliveryStatus,
  type RollWorkRecord,
  type RollWorkRequest,
  type StoredDeliveryRow,
  type StoredWorkRow,
} from "./contracts";
import {
  buildRollRenderRequestForVersion,
  parseRollRenderVersion,
} from "./render-version";

export { LogWork } from "./log-work";
export type {
  AcceptLogArtifactResult,
  LogArtifactStatus,
} from "./log-work";
export type {
  LogArtifactImageV1,
  RollLogArtifactV1,
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
const ROLL_DELIVERY_FAILURE_MESSAGE =
  "This roll could not be completed. Please try again.";

type RetryableDeliveryPhase =
  | "settings"
  | "clatter"
  | "discord"
  | "terminal-response";

type RollDeliveryTarget = Readonly<{
  id: string;
  applicationId: string;
  token: string;
}>;

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function deliveryFinalizationAt(expiresAt: number): number {
  return expiresAt - DELIVERY_FINALIZATION_BUFFER_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type DeliveryRecordResolution =
  | { status: "ready"; record: RollWorkRecord }
  | { status: "conflict" }
  | { status: "unavailable" };

type StoredSourceLogRow = {
  artifact_json: string;
  image_bytes: ArrayBuffer;
  image_sha256: string;
  destination_delivered_at: number | null;
  handoff_until: number | null;
};

type SourceLogArtifact = { artifact: RollLogArtifactV1 };

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function rollLogArtifact(value: unknown): RollLogArtifactV1 {
  const validated = validateRollLogArtifact(value);
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

export class RollWork extends DurableObject<RollEnv> {
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
        skip_dice_delay INTEGER CHECK (skip_dice_delay IN (0, 1)),
        delay_ms INTEGER CHECK (delay_ms BETWEEN 1 AND 5000),
        result_not_before INTEGER CHECK (result_not_before >= 0),
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
    `);
    const deliveryColumns = this.ctx.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(interaction_delivery)")
      .toArray();
    const upgrades = [
      ["clatter_sent_at", "clatter_sent_at INTEGER"],
      [
        "skip_dice_delay",
        "skip_dice_delay INTEGER CHECK (skip_dice_delay IN (0, 1))",
      ],
      ["delay_ms", "delay_ms INTEGER CHECK (delay_ms BETWEEN 1 AND 5000)"],
      [
        "result_not_before",
        "result_not_before INTEGER CHECK (result_not_before >= 0)",
      ],
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

  async deliver(value: unknown): Promise<DeliverRollWorkResult> {
    const accepted = await this.acceptDelivery(value);
    if (
      accepted.status === "conflict" ||
      accepted.status === "expired" ||
      accepted.status === "unavailable"
    ) {
      return accepted;
    }
    if (accepted.delivery === "delivered" || accepted.delivery === "failed") {
      await this.runAccounting();
      await this.runHelper();
      await this.scheduleAfterAttempts(accepted.expiresAt);
      return { status: accepted.delivery };
    }
    await this.runAccounting();
    const result = await this.runDelivery();
    await this.runHelper();
    await this.scheduleAfterAttempts(accepted.expiresAt);
    return result;
  }

  async acceptDelivery(value: unknown): Promise<AcceptRollDeliveryResult> {
    const delivery = validateDeliveryRequest(value);
    if (this.ctx.id.name !== delivery.interaction.id) {
      return { status: "conflict" };
    }
    const expiresAt = interactionExpiresAt(delivery.interaction.id);
    if (expiresAt <= Date.now()) return { status: "expired" };

    const resolution = await this.recordForDelivery(
      delivery.request,
      delivery.accounting,
    );
    if (resolution.status !== "ready") return resolution;
    const metadataJson = deliveryMetadata(delivery);
    const fingerprint = await tokenFingerprint(delivery.interaction.token);
    const accepted = this.ctx.storage.transactionSync(
      (): AcceptRollDeliveryResult => {
        const prepared = this.prepareRequest(
          delivery.request,
          resolution.record,
        );
        if (prepared.status === "conflict") return prepared;

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
          accountingState === "pending" ? Date.now() : null;
        const loggingState =
          delivery.logging === null ? "not_applicable" : "pending";
        const helperState =
          prepared.record.outcome.errors.length > 0 &&
          !prepared.record.outcome.errors.some(({ code }) =>
            ["TOO_MANY_DICE", "TOO_MANY_SIDES", "UNSAFE_EXPLOSION"].includes(
              code,
            ),
          )
            ? "pending"
            : "not_applicable";
        this.ctx.storage.sql.exec(
          `INSERT INTO interaction_delivery (
             singleton, metadata_json, token, token_fingerprint, expires_at,
             state, accounting_state, accounting_occurred_at, logging_state,
             helper_state
           ) VALUES (1, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
          metadataJson,
          delivery.interaction.token,
          fingerprint,
          expiresAt,
          accountingState,
          accountingOccurredAt,
          loggingState,
          helperState,
        );
        return { status: "created", delivery: "pending", expiresAt };
      },
    );
    if (accepted.status === "created" || accepted.status === "existing") {
      await this.ctx.storage.setAlarm(expiresAt);
      if (accepted.delivery === "pending") {
        await this.ctx.storage.setAlarm(
          Math.min(
            Date.now() + retryDelayMs(1),
            deliveryFinalizationAt(expiresAt),
          ),
        );
      }
    }
    return accepted;
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

  async alarm(): Promise<void> {
    const delivery = this.readDelivery();
    if (delivery === undefined) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (Date.now() >= delivery.expires_at) {
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
        console.error(
          JSON.stringify({
            level: "error",
            message: "Roll delivery expired before a terminal response",
            attempt: delivery.attempts,
            failurePhase: delivery.failure_phase,
          }),
        );
      }
      this.deleteStoredWork();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.runAccounting();
    const current = this.readDelivery();
    if (current === undefined) return;
    if (current.state === "pending") {
      await this.runDelivery();
    }
    await this.runHelper();
    await this.runLogging();
    await this.scheduleAfterAttempts(current.expires_at);
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
          level: "error",
          message: "Roll helper delivery failed",
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
            level: "error",
            message: "Roll log durable handoff failed",
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
          level: "error",
          message: "Roll log durable handoff returned an invalid response",
          attempt: attempts,
        }),
      );
      return;
    }

    const attempts = delivery.logging_attempts + 1;
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET logging_attempts = ?
       WHERE singleton = 1`,
      attempts,
    );
    let result: unknown;
    try {
      const service = this.env.DISCORD_REST as unknown as {
        logRoll(value: unknown): Promise<unknown>;
      };
      result = await service.logRoll({
        rollId: metadata.interactionId,
        source: logging.source,
        notation: logging.notation,
        username: metadata.message.username,
        guildId: metadata.accounting?.guildId ?? null,
        channelId: logging.channelId,
        ...(logging.context === undefined
          ? {}
          : { context: logging.context }),
      });
    } catch {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Roll logging RPC failed",
          attempt: attempts,
        }),
      );
      return;
    }
    if (isRecord(result) && result.status === "delivered") {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET logging_state = 'delivered', logging_http_status = 200
         WHERE singleton = 1`,
      );
      return;
    }
    if (
      isRecord(result) &&
      (result.status === "retryable" || result.status === "failed") &&
      Number.isInteger(result.httpStatus)
    ) {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET logging_state = ?, logging_http_status = ?
         WHERE singleton = 1`,
        result.status === "failed" ? "failed" : "pending",
        result.httpStatus,
      );
      console.error(
        JSON.stringify({
          level: "error",
          message: "Discord rejected roll logging request",
          attempt: attempts,
          outcome: result.status,
          stage: result.stage,
          httpStatus: result.httpStatus,
        }),
      );
      return;
    }
    console.error(
      JSON.stringify({
        level: "error",
        message: "Roll logging RPC returned an invalid response",
        attempt: attempts,
      }),
    );
  }

  private async scheduleAfterAttempts(expiresAt: number): Promise<void> {
    const delivery = this.readDelivery();
    if (delivery === undefined || delivery.state === "pending") return;
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
      this.ctx.storage.sql.exec(
        "UPDATE interaction_delivery SET skip_dice_delay = 0 WHERE singleton = 1",
      );
      return false;
    }
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
    const skipDiceDelay = value.settings.skipDiceDelay;
    this.ctx.storage.sql.exec(
      "UPDATE interaction_delivery SET skip_dice_delay = ? WHERE singleton = 1",
      skipDiceDelay ? 1 : 0,
    );
    return skipDiceDelay;
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
    if (
      !isRecord(image) ||
      image.status !== "available" ||
      typeof image.filename !== "string"
    ) {
      throw new Error("Stored source roll log artifact is invalid");
    }
    if (
      (await sha256Hex(new Uint8Array(row.image_bytes))) !== row.image_sha256
    ) {
      throw new Error("Stored source roll log PNG hash is invalid");
    }
    const artifact = rollLogArtifact({
      ...stored,
      destinationDeliveredAt: row.destination_delivered_at ?? 0,
      image: {
        status: "available",
        filename: image.filename,
        png: new Uint8Array(row.image_bytes),
      },
    });
    return { artifact };
  }

  private async ensureSourceLogArtifact(
    artifact: RollLogArtifactV1,
  ): Promise<SourceLogArtifact> {
    const validated = rollLogArtifact(artifact);
    if (validated.image.status !== "available") {
      throw new Error("Source roll log artifact must contain a PNG");
    }
    const artifactJson = JSON.stringify({
      version: validated.version,
      rollId: validated.rollId,
      source: validated.source,
      notation: validated.notation,
      user: validated.user,
      guildId: validated.guildId,
      channelId: validated.channelId,
      context: validated.context,
      payload: validated.payload,
      image: {
        status: "available",
        filename: validated.image.filename,
      },
    });
    const imageSha256 = await sha256Hex(validated.image.png);
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
      validated.image.png,
      imageSha256,
    );
    return { artifact: validated };
  }

  private async prepareSourceLogArtifact(
    metadata: ReturnType<typeof parseDeliveryMetadata>,
    payload: DiscordMessage,
    filename: string,
    png: Uint8Array,
  ): Promise<SourceLogArtifact | undefined> {
    if (metadata.logging === null || metadata.accounting === null) {
      return undefined;
    }
    try {
      return await this.ensureSourceLogArtifact({
        version: 1,
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
        payload,
        image: { status: "available", filename, png },
      });
    } catch (error) {
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET logging_state = 'failed'
         WHERE singleton = 1`,
      );
      console.error(
        JSON.stringify({
          level: "error",
          message: "Roll log source artifact could not be persisted",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
      return undefined;
    }
  }

  private async attemptDelivery(): Promise<DeliverRollWorkResult> {
    const delivery = this.readDelivery();
    if (delivery === undefined) return { status: "conflict" };
    if (Date.now() >= delivery.expires_at) {
      this.deleteStoredWork();
      await this.ctx.storage.deleteAlarm();
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
      try {
        skipDiceDelay = await this.resolveSkipDiceDelay(delivery, metadata);
        if (!skipDiceDelay) {
          const delay = this.resolveRollDelay(delivery);
          delayMs = delay.delayMs;
          resultNotBefore = delay.resultNotBefore;
        }
      } catch {
        return this.scheduleRetry(
          attempts,
          delivery.expires_at,
          "settings",
        );
      }
    }

    let clatter: string | undefined;
    if (record.outcome.outcomes.length > 0) {
      try {
        clatter = buildRollClatterMessage(
          record.outcome,
          record.renderSeed,
        ).content;
        if (clatter === undefined) {
          throw new Error("Roll clatter message has no content");
        }
      } catch {
        return this.terminateDelivery(
          target,
          attempts,
          delivery.expires_at,
          "response",
        );
      }
      if (!skipDiceDelay && delivery.clatter_sent_at === null) {
        let clatterResponse: Response;
        try {
          clatterResponse = await fetch(
            buildEditOriginalResponse(target, { content: clatter }),
          );
        } catch {
          return this.scheduleRetry(
            attempts,
            delivery.expires_at,
            "clatter",
          );
        }
        if (!clatterResponse.ok) {
          if (isRetryableHttpStatus(clatterResponse.status)) {
            return this.scheduleRetry(
              attempts,
              delivery.expires_at,
              "clatter",
              retryAfterMs(clatterResponse, attempts),
              clatterResponse.status,
            );
          }
          return this.failDelivery(
            clatterResponse.status,
            delivery.expires_at,
          );
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
        this.ctx.storage.sql.exec(
          `UPDATE interaction_delivery
           SET clatter_sent_at = ?, result_not_before = ?,
               last_http_status = ?
           WHERE singleton = 1`,
          clatterSentAt,
          resultNotBefore,
          clatterResponse.status,
        );
      }
      if (
        !skipDiceDelay &&
        resultNotBefore !== null &&
        resultNotBefore > Date.now()
      ) {
        const retryAt = Math.min(
          resultNotBefore,
          deliveryFinalizationAt(delivery.expires_at),
        );
        await this.ctx.storage.setAlarm(retryAt);
        return { status: "pending", retryAt };
      }
    }

    let request: Request;
    if (record.outcome.outcomes.length === 0) {
      try {
        request = buildEditOriginalResponse(
          target,
          delivery.helper_state === "pending"
            ? {
                content:
                  metadata.accounting?.guildId === null
                    ? ROLL_HELPER_DM_ANNOUNCEMENT
                    : ROLL_HELPER_ANNOUNCEMENT,
              }
            : buildRollErrorMessage(record.outcome),
        );
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

      let payload: DiscordMessage;
      let filename: string;
      let png: Uint8Array;
      if (sourceArtifact !== undefined) {
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
          payload = buildRollResultMessage(record.outcome, {
            ...metadata.message,
            source: "discord",
            filename,
            ...(skipDiceDelay ? {} : { clatter }),
          });
          sourceArtifact = await this.prepareSourceLogArtifact(
            metadata,
            payload,
            filename,
            png,
          );
          if (sourceArtifact !== undefined) {
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
      request = buildEditOriginalResponseWithFile(target, payload, {
        filename,
        contentType: "image/png",
        bytes: png,
        description: "Rendered dice result",
      });
    }

    let response: Response;
    try {
      response = await fetch(request);
    } catch {
      return this.scheduleRetry(attempts, delivery.expires_at, "discord");
    }
    if (response.ok) {
      const deliveredAt = Date.now();
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec(
          `UPDATE interaction_delivery
           SET token = NULL, state = 'delivered', delivered_at = ?,
               last_http_status = ?, failure_phase = NULL
           WHERE singleton = 1`,
          deliveredAt,
          response.status,
        );
        this.ctx.storage.sql.exec(
          `UPDATE roll_log_outbox
           SET destination_delivered_at = ?, handoff_until = ?
           WHERE singleton = 1`,
          deliveredAt,
          deliveredAt + LOG_WORK_RETRY_WINDOW_MS,
        );
      });
      await this.ctx.storage.setAlarm(delivery.expires_at);
      return { status: "delivered" };
    }
    if (isRetryableHttpStatus(response.status)) {
      return this.scheduleRetry(
        attempts,
        delivery.expires_at,
        "discord",
        retryAfterMs(response, attempts),
        response.status,
      );
    }

    return this.failDelivery(response.status, delivery.expires_at);
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
    console.error(
      JSON.stringify({
        level: "error",
        message: "Roll delivery encountered a terminal internal failure",
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
      response = await fetch(
        buildEditOriginalResponse(target, {
          content: ROLL_DELIVERY_FAILURE_MESSAGE,
        }),
      );
    } catch {
      return this.scheduleRetry(
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
      await this.ctx.storage.setAlarm(expiresAt);
      return { status: "failed" };
    }
    if (isRetryableHttpStatus(response.status)) {
      return this.scheduleRetry(
        attempts,
        expiresAt,
        "terminal-response",
        retryAfterMs(response, attempts),
        response.status,
        true,
      );
    }
    return this.failDelivery(response.status, expiresAt);
  }

  private async failDelivery(
    httpStatus: number,
    expiresAt: number,
  ): Promise<DeliverRollWorkResult> {
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET token = NULL, state = 'failed', last_http_status = ?
       WHERE singleton = 1`,
      httpStatus,
    );
    await this.ctx.storage.setAlarm(expiresAt);
    return { status: "failed" };
  }

  private async scheduleRetry(
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
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "Roll delivery will retry",
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
    request: RollWorkRequest,
    accounting: RollDeliveryRequest["accounting"] | null,
  ): Promise<DeliveryRecordResolution> {
    const existing = this.storedPreparation(request);
    if (existing?.status === "conflict") return { status: "conflict" };
    if (existing?.status === "existing") {
      return { status: "ready", record: existing.record };
    }

    const rollSeed = randomSeed();
    const renderSeed = randomSeed();
    const outcome = executeRoll({ ...request, seed: rollSeed });
    const common = {
      request,
      rollSeed,
      renderSeed,
      outcome,
      createdAt: Date.now(),
    };
    if (accounting === null) {
      return { status: "ready", record: { version: 1, ...common } };
    }
    const renderVersion = parseRollRenderVersion(
      this.env.ROLL_RENDER_VERSION,
    );
    if (outcome.outcomes.length === 0) {
      return {
        status: "ready",
        record:
          renderVersion === 3
            ? { version: 3, ...common, renderRequest: null }
            : { version: 4, ...common, renderRequest: null },
      };
    }

    try {
      const renderRequest = await buildRollRenderRequestForVersion(
        this.env.DATA_SERVICE,
        renderVersion,
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
      };
    } catch {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Roll delivery preparation failed",
          phase: "render-request",
          renderVersion,
        }),
      );
      const concurrent = this.storedPreparation(request);
      if (concurrent?.status === "conflict") return { status: "conflict" };
      if (concurrent?.status === "existing") {
        return { status: "ready", record: concurrent.record };
      }
      return { status: "unavailable" };
    }
  }

  private async renderRecord(
    record: RollWorkRecord,
  ): Promise<RenderResult | RenderResultV2 | RenderResultV3 | RenderResultV4> {
    if (record.version === 1) {
      return renderDiceToPng(
        buildRollRenderRequest(record.outcome, record.renderSeed),
      );
    }
    if (record.renderRequest === null) {
      throw new Error("Roll work has no renderable outcome");
    }
    if (record.version === 2) {
      return renderDiceRequestV2ToPng(record.renderRequest);
    }
    if (record.version === 3) {
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
        outcome: executeRoll({ ...request, seed: rollSeed }),
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

  private deleteStoredWork(): void {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("DELETE FROM roll_log_outbox");
      this.ctx.storage.sql.exec("DELETE FROM interaction_delivery");
      this.ctx.storage.sql.exec("DELETE FROM roll_work");
    });
  }

  private readDelivery(): StoredDeliveryRow | undefined {
    return this.ctx.storage.sql
      .exec<StoredDeliveryRow>(
        `SELECT metadata_json, token, token_fingerprint, expires_at, state,
                delivered_at, last_http_status, attempts, clatter_sent_at,
                skip_dice_delay, delay_ms, result_not_before,
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
