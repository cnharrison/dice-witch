import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
  LOG_WORK_RETENTION_MS,
  LOG_WORK_RETRY_WINDOW_MS,
  imageUnavailableLogArtifact,
  isComponentsV2Message,
  parseRollLoggingContext,
  rollLogTelemetryContext,
  storedLogArtifact,
  validateDiscordMessage,
  validateRollLogArtifact,
  type DeliverRollLogInputV1,
  type DeliverRollLogResultV1,
  type RollLogArtifact,
  type RollLogShardV1,
  type StoredLogArtifact,
} from "../../../packages/discord-contracts/src";
import { RollLogShardSchema } from "../../../packages/discord-contracts/src/roll-log";
import {
  nonNegativeSafeIntegerSchema,
  safeIntegerSchema,
  snowflakeSchema,
  timestampSchema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";

const INITIAL_DELIVERY_DELAY_MS = 1_000;
const MAX_PRIMARY_DELIVERY_ATTEMPTS = 12;
const MAX_RETRY_DELAY_MS = 60_000;

function retryDelayMs(attempts: number): number {
  return Math.min(
    1_000 * 2 ** Math.max(0, attempts - 1),
    MAX_RETRY_DELAY_MS,
  );
}

export type AcceptLogArtifactResult =
  | {
      status: "created" | "existing";
      state: "pending" | "delivered" | "failed";
      acceptedAt: number;
      retryUntil: number;
      expiresAt: number;
    }
  | { status: "conflict" };

export type LogArtifactStatus =
  | { state: "missing" }
  | {
      state: "pending" | "delivered" | "failed";
      acceptedAt: number;
      retryUntil: number;
      expiresAt: number;
      completedAt: number | null;
      attempts: number;
      lastHttpStatus: number | null;
      imageStatus: "available" | "unavailable";
      imageBytes: number;
      imageSha256: string | null;
    };

type StoredLogRow = z.output<typeof StoredLogRowSchema>;

type RollLogDeliveryServicePort = {
  deliverRollLogV1(input: DeliverRollLogInputV1): Promise<SchemaInput>;
};

type LogicalGuildShardServicePort = {
  getLogicalGuildShard(guildId: string): Promise<SchemaInput>;
};

type LogWorkEnv = Omit<RollBindings, "DISCORD_REST" | "GATEWAY_STATUS"> & {
  DISCORD_REST: RollLogDeliveryServicePort;
  GATEWAY_STATUS: LogicalGuildShardServicePort;
};

const StoredLogRowSchema = z.strictObject({
  identity_json: z.string(),
  artifact_identity_json: z.string(),
  artifact_json: z.string(),
  image_bytes: z.instanceof(ArrayBuffer).nullable(),
  state: z.enum(["pending", "delivered", "failed"]),
  accepted_at: nonNegativeSafeIntegerSchema,
  retry_until: nonNegativeSafeIntegerSchema,
  expires_at: nonNegativeSafeIntegerSchema,
  completed_at: nonNegativeSafeIntegerSchema.nullable(),
  attempts: nonNegativeSafeIntegerSchema,
  last_http_status: safeIntegerSchema.nullable(),
});
const StoredLogImageSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("available"),
    filename: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    bytes: nonNegativeSafeIntegerSchema,
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
]);
const StoredLogArtifactFields = {
  rollId: snowflakeSchema,
  source: z.enum(["discord", "web"]),
  notation: z.string(),
  user: z.strictObject({
    id: snowflakeSchema,
    username: z.string().min(1).max(32),
  }),
  guildId: snowflakeSchema.nullable(),
  channelId: snowflakeSchema,
  context: z.unknown().nullable(),
  destinationDeliveredAt: timestampSchema,
  payload: z.unknown(),
  image: StoredLogImageSchema,
};
const StoredLogArtifactSchema = z.union([
  z.strictObject({ version: z.literal(1), ...StoredLogArtifactFields }),
  z.strictObject({
    version: z.literal(2),
    ...StoredLogArtifactFields,
    presentation: z.strictObject({
      title: z.string().min(1).max(256).nullable(),
      result: z.string().min(1).max(4_096).nullable(),
      savedRoll: z.strictObject({
        scope: z.enum(["personal", "server"]),
        name: z.string().min(1).max(1_024),
      }).nullable(),
    }),
  }),
]);
const DeliverRollLogResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("delivered"),
    httpStatus: safeIntegerSchema,
  }),
  z.strictObject({
    status: z.literal("retryable"),
    httpStatus: safeIntegerSchema,
    retryAfterMs: nonNegativeSafeIntegerSchema.nullable(),
  }),
  z.strictObject({
    status: z.literal("image-rejected"),
    httpStatus: safeIntegerSchema,
  }),
  z.strictObject({
    status: z.literal("failed"),
    httpStatus: safeIntegerSchema,
  }),
]);

export class LogWork extends DurableObject<LogWorkEnv> {
  constructor(ctx: DurableObjectState, env: LogWorkEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS log_artifact (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        identity_json TEXT NOT NULL,
        artifact_identity_json TEXT NOT NULL,
        artifact_json TEXT NOT NULL,
        image_bytes BLOB,
        state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'failed')),
        accepted_at INTEGER NOT NULL CHECK (accepted_at >= 0),
        retry_until INTEGER NOT NULL CHECK (retry_until >= accepted_at),
        expires_at INTEGER NOT NULL CHECK (expires_at >= retry_until),
        completed_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        last_http_status INTEGER
      );
    `);
  }

  async accept(value: SchemaInput): Promise<AcceptLogArtifactResult> {
    const input = validateRollLogArtifact(value);
    if (this.ctx.id.name !== input.rollId) return { status: "conflict" };
    const stored = await storedLogArtifact(input);
    const existing = this.readRow();
    if (existing !== null) {
      if (existing.identity_json !== stored.identity) {
        return { status: "conflict" };
      }
      await this.schedule(existing);
      return this.acceptedResult("existing", existing);
    }

    const acceptedAt = Date.now();
    const retryUntil = acceptedAt + LOG_WORK_RETRY_WINDOW_MS;
    const expiresAt = retryUntil + LOG_WORK_RETENTION_MS;
    const insertion = this.ctx.storage.sql.exec(
      `INSERT OR IGNORE INTO log_artifact (
        singleton,
        identity_json,
        artifact_identity_json,
        artifact_json,
        image_bytes,
        state,
        accepted_at,
        retry_until,
        expires_at
      ) VALUES (1, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      stored.identity,
      stored.identity,
      JSON.stringify(stored.artifact),
      stored.png,
      acceptedAt,
      retryUntil,
      expiresAt,
    );

    const inserted = this.readRow();
    if (inserted === null) throw new Error("Log artifact storage failed");
    if (inserted.identity_json !== stored.identity) {
      return { status: "conflict" };
    }
    await this.schedule(inserted);
    return this.acceptedResult(
      insertion.rowsWritten === 1 ? "created" : "existing",
      inserted,
    );
  }

  artifactStatus(): LogArtifactStatus {
    const row = this.readRow();
    if (row === null) return { state: "missing" };
    const artifact = this.parseStoredArtifact(row.artifact_json);
    return {
      state: row.state,
      acceptedAt: row.accepted_at,
      retryUntil: row.retry_until,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      attempts: row.attempts,
      lastHttpStatus: row.last_http_status,
      imageStatus: artifact.image.status,
      imageBytes: row.image_bytes?.byteLength ?? 0,
      imageSha256:
        artifact.image.status === "available" ? artifact.image.sha256 : null,
    };
  }

  async alarm(): Promise<void> {
    const row = this.readRow();
    if (row === null) return;
    const now = Date.now();
    if (row.state !== "pending") {
      if (now >= row.expires_at) {
        this.ctx.storage.sql.exec("DELETE FROM log_artifact WHERE singleton = 1");
        return;
      }
      await this.ctx.storage.setAlarm(row.expires_at);
      return;
    }
    const stored = this.parseStoredArtifact(row.artifact_json);
    const finalImageFallbackPending =
      row.attempts === MAX_PRIMARY_DELIVERY_ATTEMPTS &&
      stored.image.status === "unavailable" &&
      stored.image.reason === "discord-rejected";
    if (
      now >= row.retry_until ||
      (row.attempts >= MAX_PRIMARY_DELIVERY_ATTEMPTS &&
        !finalImageFallbackPending)
    ) {
      await this.finish({
        state: "failed",
        httpStatus: row.last_http_status,
        completedAt: now,
        artifact: stored,
        attempts: row.attempts,
        acceptedAt: row.accepted_at,
        logicalShard: null,
      });
      return;
    }

    const attempts = row.attempts + 1;
    await this.ctx.storage.setAlarm(
      Math.min(row.retry_until, Date.now() + retryDelayMs(attempts)),
    );
    let result: DeliverRollLogResultV1;
    let logicalShard: RollLogShardV1 | null = null;
    try {
      const artifact = await this.deliveryArtifact(row, stored);
      logicalShard = await this.resolveLogicalShard(artifact);
      const response = await this.env.DISCORD_REST.deliverRollLogV1({
        artifact,
        logicalShard,
      });
      const parsed = DeliverRollLogResultSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error("Roll log delivery response is invalid");
      }
      result = parsed.data;
    } catch (error) {
      this.ctx.storage.sql.exec(
        "UPDATE log_artifact SET attempts = ? WHERE singleton = 1",
        attempts,
      );
      console.error(
        JSON.stringify({
          telemetryVersion: 2,
          level: "error",
          message: "Private roll log delivery attempt failed",
          subsystem: "private-roll-log",
          ...rollLogTelemetryContext(stored, logicalShard),
          state: "pending",
          userImpact: "none",
          failureKind: "exception",
          attempt: attempts,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
      );
      await this.scheduleRetry(row.retry_until, attempts, null, null);
      return;
    }

    if (result.status === "image-rejected") {
      await this.replaceWithImageUnavailable(
        row,
        stored,
        result.httpStatus,
        attempts,
      );
      const current = this.readRow();
      if (current !== null) await this.schedule(current, Date.now());
      return;
    }
    this.ctx.storage.sql.exec(
      "UPDATE log_artifact SET attempts = ? WHERE singleton = 1",
      attempts,
    );
    if (result.status === "delivered") {
      await this.finish({
        state: "delivered",
        httpStatus: result.httpStatus,
        completedAt: Date.now(),
        artifact: stored,
        attempts,
        acceptedAt: row.accepted_at,
        logicalShard,
      });
      return;
    }
    if (result.status === "failed") {
      await this.finish({
        state: "failed",
        httpStatus: result.httpStatus,
        completedAt: Date.now(),
        artifact: stored,
        attempts,
        acceptedAt: row.accepted_at,
        logicalShard,
      });
      return;
    }
    console.warn(
      JSON.stringify({
        telemetryVersion: 2,
        level: "warn",
        message: "Private roll log delivery will retry",
        subsystem: "private-roll-log",
        ...rollLogTelemetryContext(stored, logicalShard),
        state: "pending",
        userImpact: "none",
        failureKind: "discord-retryable",
        attempt: attempts,
        httpStatus: result.httpStatus,
        retryAfterMs: result.retryAfterMs,
      }),
    );
    await this.scheduleRetry(
      row.retry_until,
      attempts,
      result.httpStatus,
      result.retryAfterMs,
    );
  }

  private async deliveryArtifact(
    row: StoredLogRow,
    stored: StoredLogArtifact,
  ): Promise<RollLogArtifact> {
    let image: RollLogArtifact["image"];
    if (stored.image.status === "available") {
      if (row.image_bytes === null) {
        throw new Error("Stored roll log PNG is missing");
      }
      image = {
        status: "available",
        filename: stored.image.filename,
        png: new Uint8Array(row.image_bytes),
      };
    } else {
      image = stored.image;
    }
    const validated = validateRollLogArtifact({
      ...stored,
      image,
    });
    const verified = await storedLogArtifact(validated);
    if (verified.identity !== row.artifact_identity_json) {
      throw new Error("Stored roll log artifact identity is invalid");
    }
    const artifact = { ...validated };
    Reflect.deleteProperty(artifact, "payloadJson");
    return artifact;
  }

  private async resolveLogicalShard(
    artifact: RollLogArtifact,
  ): Promise<RollLogShardV1> {
    if (artifact.guildId === null) return { status: "not-applicable" };
    try {
      const response = await this.env.GATEWAY_STATUS.getLogicalGuildShard(
        artifact.guildId,
      );
      const result = RollLogShardSchema.safeParse(response);
      if (!result.success || result.data.status === "not-applicable") {
        throw new Error("Logical guild shard response is invalid");
      }
      return result.data;
    } catch {
      console.warn(
        JSON.stringify({
          telemetryVersion: 2,
          level: "warn",
          message: "Logical guild shard is unavailable for private roll log",
          subsystem: "private-roll-log",
          ...rollLogTelemetryContext(artifact, { status: "unavailable" }),
          state: "pending",
          userImpact: "none",
          failureKind: "shard-unavailable",
        }),
      );
      return { status: "unavailable" };
    }
  }

  private async replaceWithImageUnavailable(
    row: StoredLogRow,
    artifact: StoredLogArtifact,
    httpStatus: number,
    attempts: number,
  ): Promise<void> {
    const fallback = imageUnavailableLogArtifact(
      await this.deliveryArtifact(row, artifact),
      "discord-rejected",
    );
    const stored = await storedLogArtifact({
      ...validateRollLogArtifact(fallback),
    });
    this.ctx.storage.sql.exec(
      `UPDATE log_artifact
       SET artifact_json = ?, artifact_identity_json = ?, image_bytes = NULL,
           last_http_status = ?, attempts = ?
       WHERE singleton = 1`,
      JSON.stringify(stored.artifact),
      stored.identity,
      httpStatus,
      attempts,
    );
  }

  private async finish(input: {
    state: "delivered" | "failed";
    httpStatus: number | null;
    completedAt: number;
    artifact: StoredLogArtifact;
    attempts: number;
    acceptedAt: number;
    logicalShard: RollLogShardV1 | null;
  }): Promise<void> {
    const {
      state,
      httpStatus,
      completedAt,
      artifact,
      attempts,
      acceptedAt,
      logicalShard,
    } = input;
    const expiresAt = completedAt + LOG_WORK_RETENTION_MS;
    this.ctx.storage.sql.exec(
      `UPDATE log_artifact
       SET state = ?, completed_at = ?, expires_at = ?,
           last_http_status = ?, image_bytes = NULL
       WHERE singleton = 1`,
      state,
      completedAt,
      expiresAt,
      httpStatus,
    );
    const event = JSON.stringify({
      telemetryVersion: 2,
      level: state === "delivered" ? "info" : "error",
      message: "Private roll log delivery completed",
      subsystem: "private-roll-log",
      ...rollLogTelemetryContext(artifact, logicalShard),
      state,
      userImpact: "none",
      attempts,
      httpStatus,
      elapsedMs: Math.max(0, completedAt - acceptedAt),
      imageSha256:
        artifact.image.status === "available" ? artifact.image.sha256 : null,
    });
    if (state === "delivered") console.info(event);
    else console.error(event);
    await this.ctx.storage.setAlarm(expiresAt);
  }

  private async scheduleRetry(
    retryUntil: number,
    attempts: number,
    httpStatus: number | null,
    retryAfterMs: number | null,
  ): Promise<void> {
    this.ctx.storage.sql.exec(
      "UPDATE log_artifact SET last_http_status = ? WHERE singleton = 1",
      httpStatus,
    );
    const delay = Math.max(retryDelayMs(attempts), retryAfterMs ?? 0);
    await this.ctx.storage.setAlarm(Math.min(Date.now() + delay, retryUntil));
  }

  private async schedule(
    row: StoredLogRow,
    pendingAt = Date.now() + INITIAL_DELIVERY_DELAY_MS,
  ): Promise<void> {
    await this.ctx.storage.setAlarm(
      row.state === "pending" ? pendingAt : row.expires_at,
    );
  }

  private readRow(): StoredLogRow | null {
    const value: SchemaInput = this.ctx.storage.sql
      .exec(
        `SELECT
          identity_json,
          artifact_identity_json,
          artifact_json,
          image_bytes,
          state,
          accepted_at,
          retry_until,
          expires_at,
          completed_at,
          attempts,
          last_http_status
        FROM log_artifact
        WHERE singleton = 1`,
      )
      .toArray()[0];
    if (value === undefined) return null;
    const row = StoredLogRowSchema.safeParse(value);
    if (!row.success) throw new Error("Stored roll log row is invalid");
    return row.data;
  }

  private parseStoredArtifact(value: string): StoredLogArtifact {
    const input: SchemaInput = JSON.parse(value);
    const result = StoredLogArtifactSchema.safeParse(input);
    if (!result.success) {
      throw new Error("Stored roll log artifact is invalid");
    }
    const stored = result.data;
    const context = stored.context === null
      ? null
      : parseRollLoggingContext(
          stored.context,
          stored.guildId,
          stored.channelId,
        );
    const payload = validateDiscordMessage(stored.payload);
    if (stored.version === 2) {
      if (!isComponentsV2Message(payload)) {
        throw new Error("Stored roll log artifact is invalid");
      }
      return { ...stored, context, payload };
    }
    if (isComponentsV2Message(payload)) {
      throw new Error("Stored roll log artifact is invalid");
    }
    return { ...stored, context, payload };
  }

  private acceptedResult(
    status: "created" | "existing",
    row: StoredLogRow,
  ): AcceptLogArtifactResult {
    return {
      status,
      state: row.state,
      acceptedAt: row.accepted_at,
      retryUntil: row.retry_until,
      expiresAt: row.expires_at,
    };
  }
}
