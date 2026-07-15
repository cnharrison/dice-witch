import { DurableObject } from "cloudflare:workers";
import { renderDiceToPng } from "../../../packages/dice-svg/src";
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
  ROLL_HELPER_ANNOUNCEMENT,
  ROLL_HELPER_DM_ANNOUNCEMENT,
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
  type RenderRollWorkResult,
  type RollDeliveryDiagnostics,
  type RollDeliveryStatus,
  type RollWorkRecord,
  type RollWorkRequest,
  type StoredDeliveryRow,
  type StoredWorkRow,
} from "./contracts";

export { WebRollService } from "./web-roll-service";
export type { WebRollResult } from "./web-roll-service";

export type RollEnv = RollBindings;
export type {
  AcceptRollDeliveryResult,
  DeliverRollWorkResult,
  PrepareRollWorkResult,
  RenderRollWorkResult,
  RollDeliveryDiagnostics,
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

function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    if (accepted.status === "conflict" || accepted.status === "expired") {
      return accepted;
    }
    if (accepted.delivery === "delivered" || accepted.delivery === "failed") {
      await this.runAccounting();
      await this.runHelper();
      await this.runLogging();
      await this.scheduleAfterAttempts(accepted.expiresAt);
      return { status: accepted.delivery };
    }
    await this.runAccounting();
    const result = await this.runDelivery();
    await this.runHelper();
    await this.runLogging();
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

    const metadataJson = deliveryMetadata(delivery);
    const fingerprint = await tokenFingerprint(delivery.interaction.token);
    await this.ctx.storage.setAlarm(expiresAt);
    const accepted = this.ctx.storage.transactionSync(
      (): AcceptRollDeliveryResult => {
        const prepared = this.prepareRequest(delivery.request);
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
    if (
      (accepted.status === "created" || accepted.status === "existing") &&
      accepted.delivery === "pending"
    ) {
      await this.ctx.storage.setAlarm(
        Math.min(Date.now() + retryDelayMs(1), expiresAt),
      );
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
    const record = this.readWork();
    if (record === undefined) {
      throw new Error("Pending roll delivery has no roll record");
    }
    const attempts = delivery.attempts + 1;
    this.ctx.storage.sql.exec(
      "UPDATE interaction_delivery SET attempts = ? WHERE singleton = 1",
      attempts,
    );
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
        return this.scheduleRetry(attempts, delivery.expires_at);
      }
    }
    const target = {
      id: metadata.interactionId,
      applicationId: metadata.applicationId,
      token: delivery.token,
    };

    let clatter: string | undefined;
    if (record.outcome.outcomes.length > 0) {
      clatter = buildRollClatterMessage(
        record.outcome,
        record.renderSeed,
      ).content;
      if (clatter === undefined) {
        throw new Error("Roll clatter message has no content");
      }
      if (!skipDiceDelay && delivery.clatter_sent_at === null) {
        let clatterResponse: Response;
        try {
          clatterResponse = await fetch(
            buildEditOriginalResponse(target, { content: clatter }),
          );
        } catch {
          return this.scheduleRetry(attempts, delivery.expires_at);
        }
        if (!clatterResponse.ok) {
          if (isRetryableHttpStatus(clatterResponse.status)) {
            return this.scheduleRetry(
              attempts,
              delivery.expires_at,
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
          throw new Error("Pending roll delivery has no randomized delay");
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
        const retryAt = Math.min(resultNotBefore, delivery.expires_at);
        await this.ctx.storage.setAlarm(retryAt);
        return { status: "pending", retryAt };
      }
    }

    let request: Request;
    try {
      if (record.outcome.outcomes.length === 0) {
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
      } else {
        if (clatter === undefined) {
          throw new Error("Roll clatter message was not prepared");
        }
        const renderRequest = buildRollRenderRequest(
          record.outcome,
          record.renderSeed,
        );
        const rendered = await renderDiceToPng(renderRequest);
        const filename = `dice-${metadata.interactionId}.png`;
        request = buildEditOriginalResponseWithFile(
          target,
          buildRollResultMessage(record.outcome, {
            ...metadata.message,
            source: "discord",
            filename,
            ...(skipDiceDelay ? {} : { clatter }),
          }),
          {
            filename,
            contentType: "image/png",
            bytes: rendered.png,
            description: "Rendered dice result",
          },
        );
      }
    } catch {
      return this.scheduleRetry(attempts, delivery.expires_at);
    }

    let response: Response;
    try {
      response = await fetch(request);
    } catch {
      return this.scheduleRetry(attempts, delivery.expires_at);
    }
    if (response.ok) {
      const deliveredAt = Date.now();
      this.ctx.storage.sql.exec(
        `UPDATE interaction_delivery
         SET token = NULL, state = 'delivered', delivered_at = ?,
             last_http_status = ?
         WHERE singleton = 1`,
        deliveredAt,
        response.status,
      );
      await this.ctx.storage.setAlarm(delivery.expires_at);
      return { status: "delivered" };
    }
    if (isRetryableHttpStatus(response.status)) {
      return this.scheduleRetry(
        attempts,
        delivery.expires_at,
        retryAfterMs(response, attempts),
        response.status,
      );
    }

    return this.failDelivery(response.status, delivery.expires_at);
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
    delayMs = retryDelayMs(attempts),
    httpStatus: number | null = null,
  ): Promise<DeliverRollWorkResult> {
    const retryAt = Math.min(Date.now() + delayMs, expiresAt);
    this.ctx.storage.sql.exec(
      `UPDATE interaction_delivery
       SET state = 'pending', last_http_status = ?
       WHERE singleton = 1`,
      httpStatus,
    );
    await this.ctx.storage.setAlarm(retryAt);
    return { status: "pending", retryAt };
  }

  async render(value: unknown): Promise<RenderRollWorkResult> {
    const prepared = this.prepare(value);
    if (prepared.status === "conflict") return prepared;
    const request = buildRollRenderRequest(
      prepared.record.outcome,
      prepared.record.renderSeed,
    );
    return { status: "rendered", ...(await renderDiceToPng(request)) };
  }

  prepare(value: unknown): PrepareRollWorkResult {
    return this.ctx.storage.transactionSync(() =>
      this.prepareRequest(validateRequest(value)),
    );
  }

  private prepareRequest(request: RollWorkRequest): PrepareRollWorkResult {
    const requestJson = JSON.stringify(request);
    const existing = this.ctx.storage.sql
      .exec<StoredWorkRow>(
        `SELECT request_json, record_json
         FROM roll_work
         WHERE singleton = 1`,
      )
      .toArray()[0];
    if (existing !== undefined) {
      if (existing.request_json !== requestJson) return { status: "conflict" };
      return { status: "existing", record: parseRecord(existing.record_json) };
    }

    const rollSeed = randomSeed();
    const record: RollWorkRecord = {
      version: 1,
      request,
      rollSeed,
      renderSeed: randomSeed(),
      outcome: executeRoll({ ...request, seed: rollSeed }),
      createdAt: Date.now(),
    };
    this.ctx.storage.sql.exec(
      `INSERT INTO roll_work (singleton, request_json, record_json)
       VALUES (1, ?, ?)`,
      requestJson,
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
    return row === undefined ? undefined : parseRecord(row.record_json);
  }

  private deleteStoredWork(): void {
    this.ctx.storage.transactionSync(() => {
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
                helper_attempts
         FROM interaction_delivery
         WHERE singleton = 1`,
      )
      .toArray()[0];
  }
}

const worker = {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { ok: true, service: "dice-witch-roll" },
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
