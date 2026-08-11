import { DurableObject } from "cloudflare:workers";
import {
  LOG_WORK_RETENTION_MS,
  LOG_WORK_RETRY_WINDOW_MS,
  MAX_LOG_ARTIFACT_PNG_BYTES,
  buildSaveRollCustomId,
  buildTextResultCustomId,
  parseSaveRollIntent,
  parseTextResultIntent,
  saveRollIntentIdentity,
  textResultIntentIdentity,
  ROLL_SAVE_INTENT_RETENTION_MS,
  validateRollLogArtifact,
  type RollLogArtifactV2,
  type SaveRollIntent,
  type TextResultIntentV1,
} from "../../../packages/discord-contracts/src";
import { selectRollDelayMs } from "../../../packages/roll-domain/src/random";
import {
  executeWebRoll,
  parseWebSavedRollAttribution,
  type WebRollResult,
  type WebSavedRollAttribution,
} from "./web-roll-service";

const DELIVERY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const MAX_PRIMARY_DELIVERY_ATTEMPTS = 12;
const MAX_RESULT_JSON_BYTES = 350_000;
const RESULT_ARTIFACT_RETENTION_MS = 15 * 60 * 1_000;
const INITIAL_ALARM_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;

type WebDeliveryState =
  | "delivered"
  | "failed"
  | "pending"
  | "permission_error";
type StoredWebDeliveryState = WebDeliveryState | "preparing";

type WebDeliveryInput = {
  deliveryId: string;
  applicationId: string | null;
  notation: string;
  repetitions: number;
  username: string;
  title: string | null;
  userId: string;
  guildId: string;
  channelId: string;
  skipDelay: boolean;
  hideRollResultText: boolean;
  savedRoll?: WebSavedRollAttribution;
  renderSeed?: number;
  appearanceDigest?: string;
};

type StoredWebDeliveryRow = {
  identity_sha256: string;
  request_json: string;
  result_json: string | null;
  image_bytes: ArrayBuffer | null;
  image_sha256: string;
  roll_id: string;
  state: StoredWebDeliveryState;
  render_seed: number;
  roll_seed: number;
  accepted_at: number;
  retry_until: number;
  artifact_cleanup_at: number;
  expires_at: number;
  destination_delivered_at: number | null;
  completed_at: number | null;
  attempts: number;
  last_http_status: number | null;
  logging_state: "accepted" | "failed" | "pending";
  logging_attempts: number;
};

type StoredRolledResult = Omit<WebRollResult & { status: "rolled" },
  "discord" | "renderedImage"
> & {
  renderedImage: Omit<
    (WebRollResult & { status: "rolled" })["renderedImage"],
    "png"
  >;
  discord: Omit<(WebRollResult & { status: "rolled" })["discord"], "png">;
};

export type WebDeliveryExecutionResult =
  | { status: "conflict" | "expired" }
  | {
      status: "invalid";
      roll: { status: "invalid"; message: string };
    }
  | {
      status: "stale";
      roll: { status: "stale"; message: string };
    }
  | {
      status: WebDeliveryState;
      roll: WebRollResult & { status: "rolled" };
    };

type WebDeliveryService = {
  deliverWebRoll(value: {
    rollId: string;
    guildId: string;
    channelId: string;
    payload: unknown;
    clatter: string;
    filename: string;
    png: Uint8Array;
    skipDelay: boolean;
    delayMs: number;
  }): Promise<
    | { status: "delivered"; messageId: string }
    | { status: "permission_error" }
    | { status: "failed"; httpStatus: number }
    | {
        status: "retryable";
        httpStatus: number;
        retryAfterMs: number | null;
      }
  >;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

const LEGACY_INPUT_KEYS = [
  "channelId",
  "deliveryId",
  "guildId",
  "notation",
  "repetitions",
  "skipDelay",
  "title",
  "userId",
  "username",
] as const;

function parseInput(
  value: unknown,
  acceptPersistedLegacy: boolean,
): WebDeliveryInput {
  if (!isRecord(value)) throw new Error("Web delivery request is invalid");
  const hasSavedRoll = value.savedRoll !== undefined;
  const legacyKeys = hasSavedRoll
    ? [...LEGACY_INPUT_KEYS, "savedRoll"]
    : LEGACY_INPUT_KEYS;
  const currentKeys = [
    ...legacyKeys,
    "applicationId",
    "hideRollResultText",
  ];
  const currentPrepared = hasExactKeys(value, [
    ...currentKeys,
    "appearanceDigest",
    "renderSeed",
  ]);
  const current = hasExactKeys(value, currentKeys) || currentPrepared;
  const legacyPrepared = acceptPersistedLegacy && hasExactKeys(value, [
    ...legacyKeys,
    "appearanceDigest",
    "renderSeed",
  ]);
  const legacy = acceptPersistedLegacy &&
    (hasExactKeys(value, legacyKeys) || legacyPrepared);
  const prepared = currentPrepared || legacyPrepared;
  if (
    (!current && !legacy) ||
    typeof value.deliveryId !== "string" ||
    !DELIVERY_ID.test(value.deliveryId) ||
    (current &&
      (typeof value.applicationId !== "string" ||
        !SNOWFLAKE.test(value.applicationId) ||
        typeof value.hideRollResultText !== "boolean")) ||
    typeof value.guildId !== "string" ||
    !SNOWFLAKE.test(value.guildId) ||
    typeof value.channelId !== "string" ||
    !SNOWFLAKE.test(value.channelId) ||
    typeof value.userId !== "string" ||
    !SNOWFLAKE.test(value.userId) ||
    typeof value.username !== "string" ||
    value.username.length < 1 ||
    value.username.length > 32 ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    value.notation.length > 1_000 ||
    !Number.isSafeInteger(value.repetitions) ||
    Number(value.repetitions) < 1 ||
    Number(value.repetitions) > 50 ||
    (value.title !== null &&
      (typeof value.title !== "string" ||
        value.title.length < 1 ||
        value.title.length > 256)) ||
    typeof value.skipDelay !== "boolean" ||
    (prepared &&
      (typeof value.renderSeed !== "number" ||
        !Number.isInteger(value.renderSeed) ||
        value.renderSeed < 0 ||
        value.renderSeed > 0xffff_ffff ||
        typeof value.appearanceDigest !== "string" ||
        !/^[0-9a-f]{64}$/i.test(value.appearanceDigest)))
  ) {
    throw new Error("Web delivery request is invalid");
  }
  return {
    deliveryId: value.deliveryId,
    applicationId:
      current && typeof value.applicationId === "string"
        ? value.applicationId
        : null,
    notation: value.notation,
    repetitions: Number(value.repetitions),
    username: value.username,
    title: value.title,
    userId: value.userId,
    guildId: value.guildId,
    channelId: value.channelId,
    skipDelay: value.skipDelay,
    hideRollResultText: current && value.hideRollResultText === true,
    ...(hasSavedRoll
      ? { savedRoll: parseWebSavedRollAttribution(value.savedRoll) }
      : {}),
    ...(prepared
      ? {
          renderSeed: Number(value.renderSeed),
          appearanceDigest: String(value.appearanceDigest),
        }
      : {}),
  };
}

function validateInput(value: unknown): WebDeliveryInput {
  return parseInput(value, false);
}

function validateStoredInput(value: unknown): WebDeliveryInput {
  return parseInput(value, true);
}

function matchesStoredInput(
  stored: WebDeliveryInput,
  current: WebDeliveryInput,
): boolean {
  const comparable = stored.applicationId === null
    ? { ...current, applicationId: null }
    : current;
  return JSON.stringify(stored) === JSON.stringify(comparable);
}

function randomSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error("Web delivery seed generation failed");
  return seed;
}

function retryDelayMs(attempts: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** Math.max(0, attempts - 1));
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value));
}

function hex(value: Uint8Array): string {
  return [...value]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function deliveryIdentity(
  requestJson: string,
  resultJson: string | null,
  imageSha256: string,
  rollId: string,
  renderSeed: number,
  rollSeed: number,
): Promise<string> {
  return hex(
    await sha256(
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          requestJson,
          resultJson,
          imageSha256,
          rollId,
          renderSeed,
          rollSeed,
        }),
      ),
    ),
  );
}

async function deliveryRollId(deliveryId: string): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(deliveryId));
  let value = 0n;
  for (const byte of digest.slice(0, 8)) value = (value << 8n) | BigInt(byte);
  return (
    10_000_000_000_000_000n +
    (value % 9_000_000_000_000_000_000n)
  ).toString();
}

function serializeResult(result: WebRollResult & { status: "rolled" }): string {
  const stored: StoredRolledResult = {
    ...result,
    renderedImage: {
      contentType: result.renderedImage.contentType,
      width: result.renderedImage.width,
      height: result.renderedImage.height,
    },
    discord: {
      payload: result.discord.payload,
      clatter: result.discord.clatter,
      resultText: result.discord.resultText,
      filename: result.discord.filename,
    },
  };
  const json = JSON.stringify(stored);
  if (new TextEncoder().encode(json).byteLength > MAX_RESULT_JSON_BYTES) {
    throw new Error("Web delivery result metadata is too large");
  }
  return json;
}

function restoreResult(
  resultJson: string,
  png: ArrayBuffer,
): WebRollResult & { status: "rolled" } {
  const parsed: unknown = JSON.parse(resultJson);
  if (
    !isRecord(parsed) ||
    parsed.status !== "rolled" ||
    !isRecord(parsed.renderedImage) ||
    parsed.renderedImage.contentType !== "image/png" ||
    !isRecord(parsed.discord) ||
    typeof parsed.discord.filename !== "string" ||
    typeof parsed.discord.clatter !== "string" ||
    typeof parsed.discord.resultText !== "string" ||
    parsed.discord.resultText.length < 1 ||
    parsed.discord.resultText.length > 4_000 ||
    !Number.isSafeInteger(parsed.renderedImage.width) ||
    Number(parsed.renderedImage.width) < 1 ||
    !Number.isSafeInteger(parsed.renderedImage.height) ||
    Number(parsed.renderedImage.height) < 1 ||
    !Array.isArray(parsed.diceArray) ||
    !Array.isArray(parsed.resultArray) ||
    !Array.isArray(parsed.appearanceIdentities) ||
    !Array.isArray(parsed.rerolledAppearanceIdentities)
  ) {
    throw new Error("Stored web delivery result is invalid");
  }
  const stored = parsed as unknown as StoredRolledResult;
  const bytes = new Uint8Array(png);
  return {
    ...stored,
    renderedImage: { ...stored.renderedImage, png: bytes.slice() },
    discord: { ...stored.discord, png: bytes.slice() },
  };
}

function sourceLogArtifact(
  input: WebDeliveryInput,
  rollId: string,
  result: WebRollResult & { status: "rolled" },
  destinationDeliveredAt: number,
): RollLogArtifactV2 {
  const artifact = validateRollLogArtifact({
    version: 2,
    rollId,
    source: "web",
    notation: input.notation,
    user: { id: input.userId, username: input.username },
    guildId: input.guildId,
    channelId: input.channelId,
    context: null,
    destinationDeliveredAt,
    presentation: {
      title: input.title,
      result: result.discord.resultText,
      savedRoll:
        input.savedRoll === undefined
          ? null
          : {
              scope:
                input.savedRoll.scope === "personal" ? "personal" : "server",
              name: input.savedRoll.name,
            },
    },
    payload: result.discord.payload,
    image: {
      status: "available",
      filename: result.discord.filename,
      png: result.discord.png,
    },
  });
  if (artifact.version !== 2) {
    throw new Error("Web roll log artifact version is invalid");
  }
  return {
    version: artifact.version,
    rollId: artifact.rollId,
    source: artifact.source,
    notation: artifact.notation,
    user: artifact.user,
    guildId: artifact.guildId,
    channelId: artifact.channelId,
    context: artifact.context,
    destinationDeliveredAt: artifact.destinationDeliveredAt,
    presentation: artifact.presentation,
    payload: artifact.payload,
    image: artifact.image,
  };
}

export class WebDeliveryWork extends DurableObject<RollBindings> {
  private operationTail: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: RollBindings) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
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
      CREATE TABLE IF NOT EXISTS web_delivery (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        identity_sha256 TEXT NOT NULL,
        request_json TEXT NOT NULL,
        result_json TEXT,
        image_bytes BLOB,
        image_sha256 TEXT NOT NULL,
        roll_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN (
          'preparing', 'pending', 'delivered', 'permission_error', 'failed'
        )),
        render_seed INTEGER NOT NULL,
        roll_seed INTEGER NOT NULL,
        accepted_at INTEGER NOT NULL,
        retry_until INTEGER NOT NULL,
        artifact_cleanup_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        destination_delivered_at INTEGER,
        completed_at INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_http_status INTEGER,
        logging_state TEXT NOT NULL DEFAULT 'pending'
          CHECK (logging_state IN ('pending', 'accepted', 'failed')),
        logging_attempts INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  execute(value: unknown): Promise<WebDeliveryExecutionResult> {
    return this.serialize(() => this.executeSerialized(value));
  }

  private async executeSerialized(
    value: unknown,
  ): Promise<WebDeliveryExecutionResult> {
    const input = validateInput(value);
    const objectName = `${input.userId}:${input.deliveryId}`;
    if (this.ctx.id.name !== objectName) return { status: "conflict" };
    const requestJson = JSON.stringify(input);
    const existing = this.readRow();
    if (existing !== undefined) {
      await this.verifyIdentity(existing);
      const storedInput = validateStoredInput(JSON.parse(existing.request_json));
      if (!matchesStoredInput(storedInput, input)) return { status: "conflict" };
      return this.resume(existing);
    }

    const rollId = await deliveryRollId(objectName);
    const renderSeed = input.renderSeed ?? randomSeed();
    const rollSeed = randomSeed();
    const identity = await deliveryIdentity(
      requestJson,
      null,
      "",
      rollId,
      renderSeed,
      rollSeed,
    );
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO web_delivery (
         singleton, identity_sha256, request_json, result_json, image_bytes,
         image_sha256, roll_id, state, render_seed, roll_seed, accepted_at,
         retry_until, artifact_cleanup_at, expires_at
       ) VALUES (1, ?, ?, NULL, NULL, '', ?, 'preparing', ?, ?, ?, ?, ?, ?)`,
      identity,
      requestJson,
      rollId,
      renderSeed,
      rollSeed,
      now,
      now + LOG_WORK_RETRY_WINDOW_MS,
      now + RESULT_ARTIFACT_RETENTION_MS,
      now + LOG_WORK_RETRY_WINDOW_MS + LOG_WORK_RETENTION_MS,
    );
    await this.ctx.storage.setAlarm(now + retryDelayMs(1));
    const inserted = this.readRow();
    if (inserted === undefined) throw new Error("Web delivery storage failed");
    return this.prepareResult(input, inserted);
  }

  private async prepareResult(
    input: WebDeliveryInput,
    row: StoredWebDeliveryRow,
  ): Promise<WebDeliveryExecutionResult> {
    const saveRollEligible = input.savedRoll !== undefined ||
      input.title !== null ||
      input.repetitions > 1;
    const roll = await executeWebRoll(
      {
        notation: input.notation,
        repetitions: input.repetitions,
        username: input.username,
        title: input.title,
        userId: input.userId,
        guildId: input.guildId,
        ...(saveRollEligible
          ? {
              saveRollCustomId: buildSaveRollCustomId({
                kind: "web",
                id: input.deliveryId,
                userId: input.userId,
              }),
            }
          : {}),
        ...(input.hideRollResultText
          ? {
              textResultCustomId: buildTextResultCustomId({
                kind: "web",
                id: input.deliveryId,
                userId: input.userId,
              }),
            }
          : {}),
        ...(input.savedRoll === undefined ? {} : { savedRoll: input.savedRoll }),
        ...(input.appearanceDigest === undefined
          ? {}
          : {
              renderSeed: row.render_seed,
              appearanceDigest: input.appearanceDigest,
            }),
      },
      this.env.DATA_SERVICE,
      this.env.ROLL_RENDER_VERSION,
      this.env.ROLL_VIEW_POLICY,
      () => row.roll_seed,
      () => row.render_seed,
    );
    if (roll.status === "invalid") {
      this.ctx.storage.sql.exec("DELETE FROM web_delivery WHERE singleton = 1");
      await this.ctx.storage.deleteAlarm();
      return {
        status: "invalid",
        roll: { status: "invalid", message: roll.message },
      };
    }
    if (roll.status === "stale") {
      this.ctx.storage.sql.exec("DELETE FROM web_delivery WHERE singleton = 1");
      await this.ctx.storage.deleteAlarm();
      return {
        status: "stale",
        roll: { status: "stale", message: roll.message },
      };
    }
    if (roll.status !== "rolled") {
      throw new Error("Web roll execution returned an unexpected status");
    }
    if (roll.renderedImage.png.byteLength > MAX_LOG_ARTIFACT_PNG_BYTES) {
      throw new Error("Web delivery PNG exceeds the durable artifact limit");
    }
    if (saveRollEligible) this.ensureSaveRollIntent(input, row.accepted_at);
    if (input.hideRollResultText) {
      this.ensureTextResultIntent(input, roll.discord.resultText, row.accepted_at);
    }

    sourceLogArtifact(input, row.roll_id, roll, 0);
    const resultJson = serializeResult(roll);
    const imageSha256 = hex(await sha256(roll.renderedImage.png));
    const identity = await deliveryIdentity(
      row.request_json,
      resultJson,
      imageSha256,
      row.roll_id,
      row.render_seed,
      row.roll_seed,
    );
    this.ctx.storage.sql.exec(
      `UPDATE web_delivery
       SET identity_sha256 = ?, result_json = ?, image_bytes = ?,
           image_sha256 = ?, state = 'pending'
       WHERE singleton = 1 AND state = 'preparing'`,
      identity,
      resultJson,
      roll.renderedImage.png,
      imageSha256,
    );
    await this.ctx.storage.setAlarm(Date.now() + retryDelayMs(1));
    return this.attemptDestination();
  }

  alarm(): Promise<void> {
    return this.serialize(() => this.runAlarm());
  }

  private async runAlarm(): Promise<void> {
    const row = this.readRow();
    if (row === undefined) {
      await this.scheduleRetainedIntentExpiry();
      return;
    }
    await this.verifyIdentity(row);
    const now = Date.now();
    if (now >= row.expires_at) {
      this.ctx.storage.sql.exec("DELETE FROM web_delivery WHERE singleton = 1");
      await this.scheduleRetainedIntentExpiry();
      return;
    }
    if (row.state === "preparing") {
      await this.prepareResult(
        validateStoredInput(JSON.parse(row.request_json)),
        row,
      );
      return;
    }
    if (row.state === "pending") {
      await this.attemptDestination();
      return;
    }
    if (row.state === "delivered" && row.logging_state === "pending") {
      await this.attemptLogHandoff(row);
    }
    await this.cleanupOrSchedule();
  }

  private async resume(
    row: StoredWebDeliveryRow,
  ): Promise<WebDeliveryExecutionResult> {
    if (row.state === "preparing") {
      return this.prepareResult(
        validateStoredInput(JSON.parse(row.request_json)),
        row,
      );
    }
    if (row.result_json === null || row.image_bytes === null) {
      return { status: "expired" };
    }
    await this.verifyImage(row);
    if (row.state === "pending") return this.attemptDestination();
    return {
      status: row.state,
      roll: restoreResult(row.result_json, row.image_bytes),
    };
  }

  private async attemptDestination(): Promise<WebDeliveryExecutionResult> {
    const row = this.readRow();
    if (row === undefined) return { status: "expired" };
    if (row.state !== "pending") return this.resume(row);
    if (row.result_json === null || row.image_bytes === null) {
      return { status: "expired" };
    }
    await this.verifyImage(row);
    const result = restoreResult(row.result_json, row.image_bytes);
    const input = validateStoredInput(JSON.parse(row.request_json));
    sourceLogArtifact(
      input,
      row.roll_id,
      result,
      row.destination_delivered_at ?? 0,
    );
    const now = Date.now();
    if (
      now >= row.retry_until ||
      row.attempts >= MAX_PRIMARY_DELIVERY_ATTEMPTS
    ) {
      await this.finishDestination("failed", row.last_http_status, now);
      return { status: "failed", roll: result };
    }

    const attempts = row.attempts + 1;
    this.ctx.storage.sql.exec(
      "UPDATE web_delivery SET attempts = ? WHERE singleton = 1",
      attempts,
    );
    await this.ctx.storage.setAlarm(
      Math.min(row.retry_until, now + retryDelayMs(attempts)),
    );
    let delivery: Awaited<ReturnType<WebDeliveryService["deliverWebRoll"]>>;
    try {
      const service = this.env.DISCORD_REST as unknown as WebDeliveryService;
      delivery = await service.deliverWebRoll({
        rollId: row.roll_id,
        guildId: input.guildId,
        channelId: input.channelId,
        payload: result.discord.payload,
        clatter: result.discord.clatter,
        filename: result.discord.filename,
        png: result.discord.png,
        skipDelay: input.skipDelay,
        delayMs: input.skipDelay
          ? 0
          : selectRollDelayMs(row.roll_seed / 2 ** 32),
      });
    } catch {
      await this.scheduleRetry(row.retry_until, attempts, null, null);
      return { status: "pending", roll: result };
    }

    if (delivery.status === "delivered") {
      if (input.hideRollResultText) {
        this.bindTextResultMessage(delivery.messageId);
      }
      const deliveredAt = Date.now();
      this.ctx.storage.sql.exec(
        `UPDATE web_delivery
         SET state = 'delivered', destination_delivered_at = ?,
             completed_at = ?, last_http_status = 200,
             artifact_cleanup_at = ?
         WHERE singleton = 1`,
        deliveredAt,
        deliveredAt,
        deliveredAt + RESULT_ARTIFACT_RETENTION_MS,
      );
      await this.ctx.storage.setAlarm(deliveredAt + INITIAL_ALARM_DELAY_MS);
      return { status: "delivered", roll: result };
    }
    if (delivery.status === "permission_error") {
      await this.finishDestination("permission_error", 403, Date.now());
      return { status: "permission_error", roll: result };
    }
    if (delivery.status === "failed") {
      await this.finishDestination("failed", delivery.httpStatus, Date.now());
      return { status: "failed", roll: result };
    }
    await this.scheduleRetry(
      row.retry_until,
      attempts,
      delivery.httpStatus,
      delivery.retryAfterMs,
    );
    return { status: "pending", roll: result };
  }

  private async attemptLogHandoff(row: StoredWebDeliveryRow): Promise<void> {
    if (
      row.destination_delivered_at === null ||
      row.result_json === null ||
      row.image_bytes === null
    ) {
      return;
    }
    await this.verifyImage(row);
    const attempts = row.logging_attempts + 1;
    this.ctx.storage.sql.exec(
      "UPDATE web_delivery SET logging_attempts = ? WHERE singleton = 1",
      attempts,
    );
    let accepted: unknown;
    try {
      const input = validateStoredInput(JSON.parse(row.request_json));
      const result = restoreResult(row.result_json, row.image_bytes);
      accepted = await this.env.LOG_WORK.getByName(row.roll_id).accept(
        sourceLogArtifact(
          input,
          row.roll_id,
          result,
          row.destination_delivered_at,
        ),
      );
    } catch {
      return;
    }
    if (
      isRecord(accepted) &&
      (accepted.status === "created" || accepted.status === "existing")
    ) {
      this.ctx.storage.sql.exec(
        "UPDATE web_delivery SET logging_state = 'accepted' WHERE singleton = 1",
      );
      return;
    }
    if (isRecord(accepted) && accepted.status === "conflict") {
      this.ctx.storage.sql.exec(
        "UPDATE web_delivery SET logging_state = 'failed' WHERE singleton = 1",
      );
    }
  }

  private async scheduleRetry(
    retryUntil: number,
    attempts: number,
    httpStatus: number | null,
    retryAfterMs: number | null,
  ): Promise<void> {
    const now = Date.now();
    const retryAt = Math.min(
      retryUntil,
      now + Math.max(retryDelayMs(attempts), retryAfterMs ?? 0),
    );
    this.ctx.storage.sql.exec(
      "UPDATE web_delivery SET last_http_status = ? WHERE singleton = 1",
      httpStatus,
    );
    await this.ctx.storage.setAlarm(retryAt);
  }

  private async finishDestination(
    state: "failed" | "permission_error",
    httpStatus: number | null,
    now: number,
  ): Promise<void> {
    this.ctx.storage.sql.exec(
      `UPDATE web_delivery
       SET state = ?, completed_at = ?, last_http_status = ?,
           logging_state = 'failed'
       WHERE singleton = 1`,
      state,
      now,
      httpStatus,
    );
    const expiresAt = this.readRow()?.expires_at ?? now;
    await this.ctx.storage.setAlarm(
      Math.min(now + RESULT_ARTIFACT_RETENTION_MS, expiresAt),
    );
  }

  private async cleanupOrSchedule(): Promise<void> {
    const row = this.readRow();
    if (row === undefined) return;
    const now = Date.now();
    if (row.state === "delivered" && row.logging_state === "pending") {
      if (now >= row.retry_until) {
        this.ctx.storage.sql.exec(
          "UPDATE web_delivery SET logging_state = 'failed' WHERE singleton = 1",
        );
      } else {
        await this.ctx.storage.setAlarm(
          Math.min(
            row.retry_until,
            now + retryDelayMs(row.logging_attempts),
          ),
        );
        return;
      }
    }
    if (now >= row.artifact_cleanup_at) {
      const identity = await deliveryIdentity(
        row.request_json,
        null,
        "",
        row.roll_id,
        row.render_seed,
        row.roll_seed,
      );
      this.ctx.storage.sql.exec(
        `UPDATE web_delivery
         SET identity_sha256 = ?, result_json = NULL, image_bytes = NULL,
             image_sha256 = ''
         WHERE singleton = 1`,
        identity,
      );
      await this.ctx.storage.setAlarm(row.expires_at);
      return;
    }
    await this.ctx.storage.setAlarm(row.artifact_cleanup_at);
  }

  private ensureSaveRollIntent(
    input: WebDeliveryInput,
    createdAt: number,
  ): SaveRollIntent {
    const intent = parseSaveRollIntent({
      version: 2,
      source: input.savedRoll === undefined ? "fresh" : "library",
      notation: input.notation,
      title: input.title,
      repetitions: input.repetitions,
      defaultName: input.savedRoll?.name ?? input.title,
      nameColor: input.savedRoll?.nameColor ?? null,
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
      throw new Error("Save roll intent conflicts with stored web delivery");
    }
    return stored;
  }

  private ensureTextResultIntent(
    input: WebDeliveryInput,
    resultText: string,
    createdAt: number,
  ): TextResultIntentV1 {
    if (input.applicationId === null) {
      throw new Error("Text result application context is unavailable");
    }
    const intent = parseTextResultIntent({
      version: 1,
      resultText,
      applicationId: input.applicationId,
      guildId: input.guildId,
      channelId: input.channelId,
      messageId: null,
      createdAt,
      expiresAt: createdAt + ROLL_SAVE_INTENT_RETENTION_MS,
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
      throw new Error("Text result intent conflicts with stored web delivery");
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
    if (!SNOWFLAKE.test(messageId)) {
      throw new Error("Text result message id is invalid");
    }
    const intent = this.readTextResultIntent();
    if (intent === undefined) {
      throw new Error("Text result intent is unavailable");
    }
    if (intent.messageId !== null && intent.messageId !== messageId) {
      throw new Error("Text result message conflicts with stored web delivery");
    }
    if (intent.messageId === null) {
      this.ctx.storage.sql.exec(
        "UPDATE text_result_intent SET intent_json = ? WHERE singleton = 1",
        JSON.stringify({ ...intent, messageId }),
      );
    }
  }

  getTextResult(value: unknown) {
    const intent = this.readTextResultIntent();
    if (intent === undefined) return { status: "missing" as const };
    if (intent.expiresAt <= Date.now()) return { status: "expired" as const };
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "applicationId",
        "channelId",
        "guildId",
        "messageId",
      ]) ||
      typeof value.applicationId !== "string" ||
      typeof value.guildId !== "string" ||
      typeof value.channelId !== "string" ||
      typeof value.messageId !== "string" ||
      intent.applicationId !== value.applicationId ||
      intent.guildId !== value.guildId ||
      intent.channelId !== value.channelId ||
      intent.messageId !== value.messageId
    ) {
      return { status: "missing" as const };
    }
    return { status: "available" as const, resultText: intent.resultText };
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

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async verifyIdentity(row: StoredWebDeliveryRow): Promise<void> {
    const identity = await deliveryIdentity(
      row.request_json,
      row.result_json,
      row.image_sha256,
      row.roll_id,
      row.render_seed,
      row.roll_seed,
    );
    if (identity !== row.identity_sha256) {
      throw new Error("Stored web delivery identity is invalid");
    }
  }

  private async verifyImage(row: StoredWebDeliveryRow): Promise<void> {
    if (row.image_bytes === null) {
      throw new Error("Stored web delivery PNG is missing");
    }
    if (hex(await sha256(new Uint8Array(row.image_bytes))) !== row.image_sha256) {
      throw new Error("Stored web delivery PNG hash is invalid");
    }
  }

  private readRow(): StoredWebDeliveryRow | undefined {
    return this.ctx.storage.sql
      .exec<StoredWebDeliveryRow>(
        `SELECT identity_sha256, request_json, result_json, image_bytes,
                image_sha256, roll_id,
                state, render_seed, roll_seed, accepted_at, retry_until,
                artifact_cleanup_at,
                expires_at, destination_delivered_at, completed_at, attempts,
                last_http_status, logging_state, logging_attempts
         FROM web_delivery
         WHERE singleton = 1`,
      )
      .toArray()[0];
  }
}
