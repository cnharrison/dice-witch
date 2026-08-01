import {
  parseRollLifecycleContext,
  parseRollLifecycleSnapshot,
  rollLifecycleContextJson,
  type RollLifecycleContextV1,
  type RollLifecycleDiagnosticsV2,
  type RollLifecycleSnapshot,
} from "../../../packages/discord-contracts/src";

export type RecordRollLifecycleResult = {
  status: "applied" | "existing" | "stale" | "conflict";
};

export type RollLifecycleAlertWorkItem = {
  version: 1 | 2;
  interactionId: string;
  revision: number;
  state: RollLifecycleSnapshot["state"];
  receivedAt: number;
  deferredAt: number;
  acceptedAt: number | null;
  deliveryStartedAt: number | null;
  terminalAt: number | null;
  attempts: number;
  httpStatus: number | null;
  failurePhase: string | null;
  failureCode: string | null;
  alertMessageId: string | null;
  diagnostics: RollLifecycleDiagnosticsV2 | null;
  context: RollLifecycleContextV1;
};

type StoredLifecycle = {
  revision: number;
  lifecycle_version: 1 | 2;
  request_fingerprint: string;
  command_name: "roll" | "library";
  scope: "guild" | "dm";
  received_at: number;
  deferred_at: number;
  accepted_at: number | null;
  delivery_started_at: number | null;
  terminal_at: number | null;
  state: RollLifecycleSnapshot["state"];
  attempts: number;
  http_status: number | null;
  failure_phase: string | null;
  failure_code: string | null;
  handler_started_at: number | null;
  acknowledgement_prepared_at: number | null;
  acknowledgement_type: 4 | 5 | 6 | null;
  first_provider_attempt_at: number | null;
  clatter_succeeded_at: number | null;
  discord_error_code: number | null;
  discord_operation: RollLifecycleDiagnosticsV2["discordOperation"];
  original_response_message_id: string | null;
  original_response_probe: RollLifecycleDiagnosticsV2["originalResponseProbe"];
  context_json: string;
  alert_state:
    | "none"
    | "sending"
    | "sent"
    | "update_due"
    | "updating"
    | "resolved"
    | "failed";
  alert_message_id: string | null;
};

const STATE_RANK: Record<RollLifecycleSnapshot["state"], number> = {
  deferred: 0,
  accepted: 1,
  delivery_started: 2,
  delivered: 3,
  failed: 3,
};

function identityContext(context: RollLifecycleContextV1): unknown {
  return { ...context, destinationPayload: null };
}

async function fingerprintSnapshot(
  snapshot: RollLifecycleSnapshot,
): Promise<string> {
  const identity = JSON.stringify({
    interactionId: snapshot.interactionId,
    commandName: snapshot.commandName,
    scope: snapshot.scope,
    receivedAt: snapshot.receivedAt,
    deferredAt: snapshot.deferredAt,
    context: identityContext(snapshot.context),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function storedDiagnostics(
  stored: StoredLifecycle,
): RollLifecycleDiagnosticsV2 | null {
  if (stored.lifecycle_version === 1) return null;
  if (
    stored.handler_started_at === null ||
    stored.acknowledgement_prepared_at === null ||
    stored.acknowledgement_type === null
  ) {
    throw new Error("Stored roll lifecycle diagnostics are invalid");
  }
  return {
    handlerStartedAt: stored.handler_started_at,
    acknowledgementPreparedAt: stored.acknowledgement_prepared_at,
    acknowledgementType: stored.acknowledgement_type,
    firstProviderAttemptAt: stored.first_provider_attempt_at,
    clatterSucceededAt: stored.clatter_succeeded_at,
    discordErrorCode: stored.discord_error_code,
    discordOperation: stored.discord_operation,
    originalResponseMessageId: stored.original_response_message_id,
    originalResponseProbe: stored.original_response_probe,
  };
}

function sameDiagnostics(
  stored: StoredLifecycle,
  snapshot: RollLifecycleSnapshot,
): boolean {
  if (snapshot.version === 1) return true;
  const diagnostics = storedDiagnostics(stored);
  return diagnostics !== null &&
    diagnostics.handlerStartedAt === snapshot.diagnostics.handlerStartedAt &&
    diagnostics.acknowledgementPreparedAt ===
      snapshot.diagnostics.acknowledgementPreparedAt &&
    diagnostics.acknowledgementType ===
      snapshot.diagnostics.acknowledgementType &&
    diagnostics.firstProviderAttemptAt ===
      snapshot.diagnostics.firstProviderAttemptAt &&
    diagnostics.clatterSucceededAt ===
      snapshot.diagnostics.clatterSucceededAt &&
    diagnostics.discordErrorCode === snapshot.diagnostics.discordErrorCode &&
    diagnostics.discordOperation === snapshot.diagnostics.discordOperation &&
    diagnostics.originalResponseMessageId ===
      snapshot.diagnostics.originalResponseMessageId &&
    diagnostics.originalResponseProbe ===
      snapshot.diagnostics.originalResponseProbe;
}

function canFillDiagnostic<T>(stored: T | null, incoming: T | null): boolean {
  return stored === null || stored === incoming;
}

function canAdvanceDiagnostics(
  stored: StoredLifecycle,
  snapshot: RollLifecycleSnapshot,
): boolean {
  if (snapshot.version === 1 || stored.lifecycle_version === 1) return true;
  const incoming = snapshot.diagnostics;
  return stored.handler_started_at === incoming.handlerStartedAt &&
    stored.acknowledgement_prepared_at === incoming.acknowledgementPreparedAt &&
    stored.acknowledgement_type === incoming.acknowledgementType &&
    canFillDiagnostic(
      stored.first_provider_attempt_at,
      incoming.firstProviderAttemptAt,
    ) &&
    canFillDiagnostic(
      stored.clatter_succeeded_at,
      incoming.clatterSucceededAt,
    ) &&
    canFillDiagnostic(stored.discord_error_code, incoming.discordErrorCode) &&
    canFillDiagnostic(stored.discord_operation, incoming.discordOperation) &&
    canFillDiagnostic(
      stored.original_response_message_id,
      incoming.originalResponseMessageId,
    ) &&
    canFillDiagnostic(
      stored.original_response_probe,
      incoming.originalResponseProbe,
    );
}

function sameSnapshot(
  stored: StoredLifecycle,
  snapshot: RollLifecycleSnapshot,
  contextJson: string,
): boolean {
  return stored.revision === snapshot.revision &&
    stored.command_name === snapshot.commandName &&
    stored.scope === snapshot.scope &&
    stored.received_at === snapshot.receivedAt &&
    stored.deferred_at === snapshot.deferredAt &&
    stored.accepted_at === snapshot.acceptedAt &&
    stored.delivery_started_at === snapshot.deliveryStartedAt &&
    stored.terminal_at === snapshot.terminalAt &&
    stored.state === snapshot.state &&
    stored.attempts === snapshot.attempts &&
    stored.http_status === snapshot.httpStatus &&
    stored.failure_phase === snapshot.failurePhase &&
    stored.failure_code === snapshot.failureCode &&
    stored.context_json === contextJson &&
    sameDiagnostics(stored, snapshot);
}

function canAdvance(
  stored: StoredLifecycle,
  snapshot: RollLifecycleSnapshot,
): boolean {
  if (STATE_RANK[snapshot.state] < STATE_RANK[stored.state]) return false;
  if (
    (stored.state === "delivered" || stored.state === "failed") &&
    snapshot.state !== stored.state
  ) {
    return false;
  }
  return canAdvanceDiagnostics(stored, snapshot);
}

function workItem(row: StoredLifecycle & { interaction_id: string }): RollLifecycleAlertWorkItem {
  return {
    version: row.lifecycle_version,
    interactionId: row.interaction_id,
    revision: row.revision,
    state: row.state,
    receivedAt: row.received_at,
    deferredAt: row.deferred_at,
    acceptedAt: row.accepted_at,
    deliveryStartedAt: row.delivery_started_at,
    terminalAt: row.terminal_at,
    attempts: row.attempts,
    httpStatus: row.http_status,
    failurePhase: row.failure_phase,
    failureCode: row.failure_code,
    alertMessageId: row.alert_message_id,
    diagnostics: storedDiagnostics(row),
    context: parseRollLifecycleContext(JSON.parse(row.context_json)),
  };
}

export class D1RollLifecycleRepository {
  constructor(private readonly db: D1Database) {}

  async record(value: unknown): Promise<RecordRollLifecycleResult> {
    const snapshot = parseRollLifecycleSnapshot(value);
    const diagnostics = snapshot.version === 2 ? snapshot.diagnostics : null;
    const contextJson = rollLifecycleContextJson(snapshot.context);
    const fingerprint = await fingerprintSnapshot(snapshot);
    const existing = await this.read(snapshot.interactionId);
    if (existing === null) {
      try {
        const result = await this.db
          .prepare(
            `INSERT INTO roll_lifecycle_receipts (
               interaction_id, revision, lifecycle_version,
               request_fingerprint, command_name, scope, guild_id, user_id,
               channel_id, received_at, deferred_at, accepted_at,
               delivery_started_at, terminal_at, state, attempts, http_status,
               failure_phase, failure_code, handler_started_at,
               acknowledgement_prepared_at, acknowledgement_type,
               first_provider_attempt_at, clatter_succeeded_at,
               discord_error_code, discord_operation,
               original_response_message_id, original_response_probe,
               context_json, updated_at
             ) VALUES (
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             )`,
          )
          .bind(
            snapshot.interactionId,
            snapshot.revision,
            snapshot.version,
            fingerprint,
            snapshot.commandName,
            snapshot.scope,
            snapshot.context.guildId,
            snapshot.context.userId,
            snapshot.context.channelId,
            snapshot.receivedAt,
            snapshot.deferredAt,
            snapshot.acceptedAt,
            snapshot.deliveryStartedAt,
            snapshot.terminalAt,
            snapshot.state,
            snapshot.attempts,
            snapshot.httpStatus,
            snapshot.failurePhase,
            snapshot.failureCode,
            diagnostics?.handlerStartedAt ?? null,
            diagnostics?.acknowledgementPreparedAt ?? null,
            diagnostics?.acknowledgementType ?? null,
            diagnostics?.firstProviderAttemptAt ?? null,
            diagnostics?.clatterSucceededAt ?? null,
            diagnostics?.discordErrorCode ?? null,
            diagnostics?.discordOperation ?? null,
            diagnostics?.originalResponseMessageId ?? null,
            diagnostics?.originalResponseProbe ?? null,
            contextJson,
            Math.max(
              snapshot.acceptedAt ?? snapshot.deferredAt,
              snapshot.terminalAt ?? snapshot.deferredAt,
            ),
          )
          .run();
        if (result.meta.changes !== 1) {
          throw new Error("Roll lifecycle insert was not applied");
        }
        return { status: "applied" };
      } catch (error) {
        const concurrent = await this.read(snapshot.interactionId);
        if (concurrent === null) throw error;
        return this.existingResult(concurrent, snapshot, fingerprint, contextJson);
      }
    }
    const result = this.existingResult(
      existing,
      snapshot,
      fingerprint,
      contextJson,
    );
    if (result.status !== "applied") return result;

    const update = await this.db
      .prepare(
        `UPDATE roll_lifecycle_receipts
         SET revision = ?, lifecycle_version = MAX(lifecycle_version, ?),
             accepted_at = ?, delivery_started_at = ?, terminal_at = ?,
             state = ?, attempts = ?, http_status = ?, failure_phase = ?,
             failure_code = ?,
             handler_started_at = COALESCE(?, handler_started_at),
             acknowledgement_prepared_at =
               COALESCE(?, acknowledgement_prepared_at),
             acknowledgement_type = COALESCE(?, acknowledgement_type),
             first_provider_attempt_at =
               COALESCE(?, first_provider_attempt_at),
             clatter_succeeded_at = COALESCE(?, clatter_succeeded_at),
             discord_error_code = COALESCE(?, discord_error_code),
             discord_operation = COALESCE(?, discord_operation),
             original_response_message_id =
               COALESCE(?, original_response_message_id),
             original_response_probe = COALESCE(?, original_response_probe),
             context_json = ?, updated_at = ?,
             alert_state = CASE
               WHEN alert_state = 'sent' AND ? IN ('delivered', 'failed')
                 THEN 'update_due'
               ELSE alert_state
             END
         WHERE interaction_id = ? AND revision = ?`,
      )
      .bind(
        snapshot.revision,
        snapshot.version,
        snapshot.acceptedAt,
        snapshot.deliveryStartedAt,
        snapshot.terminalAt,
        snapshot.state,
        snapshot.attempts,
        snapshot.httpStatus,
        snapshot.failurePhase,
        snapshot.failureCode,
        diagnostics?.handlerStartedAt ?? null,
        diagnostics?.acknowledgementPreparedAt ?? null,
        diagnostics?.acknowledgementType ?? null,
        diagnostics?.firstProviderAttemptAt ?? null,
        diagnostics?.clatterSucceededAt ?? null,
        diagnostics?.discordErrorCode ?? null,
        diagnostics?.discordOperation ?? null,
        diagnostics?.originalResponseMessageId ?? null,
        diagnostics?.originalResponseProbe ?? null,
        contextJson,
        Math.max(
          snapshot.acceptedAt ?? snapshot.deferredAt,
          snapshot.terminalAt ?? snapshot.deferredAt,
        ),
        snapshot.state,
        snapshot.interactionId,
        existing.revision,
      )
      .run();
    if (update.meta.changes === 1) return { status: "applied" };
    const concurrent = await this.read(snapshot.interactionId);
    if (concurrent === null) {
      throw new Error("Roll lifecycle record disappeared during update");
    }
    return this.existingResult(
      concurrent,
      snapshot,
      fingerprint,
      contextJson,
    );
  }

  async claimAlerts(
    now: number,
    delayedAfterMs: number,
    leaseMs: number,
    limit: number,
  ): Promise<RollLifecycleAlertWorkItem[]> {
    if (
      !Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(delayedAfterMs) || delayedAfterMs < 1 ||
      !Number.isSafeInteger(leaseMs) || leaseMs < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    ) {
      throw new Error("Roll lifecycle alert claim is invalid");
    }
    const candidates = await this.db
      .prepare(
        `SELECT interaction_id
         FROM roll_lifecycle_receipts
         WHERE (
           (alert_state = 'none'
             AND (alert_lease_until IS NULL OR alert_lease_until <= ?))
           OR (alert_state = 'sending' AND alert_lease_until <= ?)
           OR (alert_state = 'failed' AND alert_message_id IS NULL
             AND alert_lease_until <= ?)
         ) AND (
           state = 'failed'
           OR (state IN ('deferred', 'accepted', 'delivery_started') AND deferred_at <= ?)
         )
         ORDER BY deferred_at, interaction_id
         LIMIT ?`,
      )
      .bind(now, now, now, now - delayedAfterMs, limit)
      .all<{ interaction_id: string }>();
    const claimed: RollLifecycleAlertWorkItem[] = [];
    for (const { interaction_id: interactionId } of candidates.results) {
      const update = await this.db
        .prepare(
          `UPDATE roll_lifecycle_receipts
           SET alert_state = 'sending', alert_lease_until = ?,
               alert_attempts = alert_attempts + 1, updated_at = ?
           WHERE interaction_id = ?
             AND (
               (alert_state = 'none'
                 AND (alert_lease_until IS NULL OR alert_lease_until <= ?))
               OR (alert_state = 'sending' AND alert_lease_until <= ?)
               OR (alert_state = 'failed' AND alert_message_id IS NULL
                 AND alert_lease_until <= ?)
             )`,
        )
        .bind(now + leaseMs, now, interactionId, now, now, now)
        .run();
      if (update.meta.changes !== 1) continue;
      const row = await this.readWithId(interactionId);
      if (row !== null) claimed.push(workItem(row));
    }
    return claimed;
  }

  async claimAlertUpdates(
    now: number,
    leaseMs: number,
    limit: number,
  ): Promise<RollLifecycleAlertWorkItem[]> {
    if (
      !Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(leaseMs) || leaseMs < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    ) {
      throw new Error("Roll lifecycle alert update claim is invalid");
    }
    const candidates = await this.db
      .prepare(
        `SELECT interaction_id
         FROM roll_lifecycle_receipts
         WHERE (alert_state = 'update_due'
                  AND (alert_lease_until IS NULL OR alert_lease_until <= ?))
            OR (alert_state = 'updating' AND alert_lease_until <= ?)
            OR (alert_state = 'failed' AND alert_message_id IS NOT NULL
                  AND alert_lease_until <= ?)
         ORDER BY terminal_at, interaction_id
         LIMIT ?`,
      )
      .bind(now, now, now, limit)
      .all<{ interaction_id: string }>();
    const claimed: RollLifecycleAlertWorkItem[] = [];
    for (const { interaction_id: interactionId } of candidates.results) {
      const update = await this.db
        .prepare(
          `UPDATE roll_lifecycle_receipts
           SET alert_state = 'updating', alert_lease_until = ?,
               alert_attempts = alert_attempts + 1, updated_at = ?
           WHERE interaction_id = ?
             AND (
               (alert_state = 'update_due'
                 AND (alert_lease_until IS NULL OR alert_lease_until <= ?))
               OR (alert_state = 'updating' AND alert_lease_until <= ?)
               OR (alert_state = 'failed' AND alert_message_id IS NOT NULL
                 AND alert_lease_until <= ?)
             )`,
        )
        .bind(now + leaseMs, now, interactionId, now, now, now)
        .run();
      if (update.meta.changes !== 1) continue;
      const row = await this.readWithId(interactionId);
      if (row !== null) claimed.push(workItem(row));
    }
    return claimed;
  }

  async markAlertSent(
    interactionId: string,
    messageId: string,
    sentRevision: number,
    sentAt: number,
  ): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE roll_lifecycle_receipts
         SET alert_state = CASE
               WHEN state IN ('delivered', 'failed') AND revision > ?
                 THEN 'update_due'
               WHEN state IN ('delivered', 'failed') THEN 'resolved'
               ELSE 'sent'
             END,
             alert_message_id = ?, alert_sent_at = ?,
             alert_resolved_at = CASE
               WHEN state IN ('delivered', 'failed') AND revision = ? THEN ?
               ELSE alert_resolved_at
             END,
             alert_lease_until = NULL, updated_at = ?
         WHERE interaction_id = ? AND alert_state = 'sending'`,
      )
      .bind(
        sentRevision,
        messageId,
        sentAt,
        sentRevision,
        sentAt,
        sentAt,
        interactionId,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new Error("Roll lifecycle alert send was not recorded");
    }
  }

  async markAlertUpdated(
    interactionId: string,
    updatedRevision: number,
    updatedAt: number,
  ): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE roll_lifecycle_receipts
         SET alert_state = CASE
               WHEN revision > ? THEN 'update_due'
               ELSE 'resolved'
             END,
             alert_resolved_at = CASE
               WHEN revision = ? THEN ?
               ELSE alert_resolved_at
             END,
             alert_lease_until = NULL, updated_at = ?
         WHERE interaction_id = ? AND alert_state = 'updating'`,
      )
      .bind(
        updatedRevision,
        updatedRevision,
        updatedAt,
        updatedAt,
        interactionId,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new Error("Roll lifecycle alert update was not recorded");
    }
  }

  async markAlertFailed(
    interactionId: string,
    operation: "send" | "update",
    retryAt: number,
  ): Promise<void> {
    const expected = operation === "send" ? "sending" : "updating";
    const result = await this.db
      .prepare(
        `UPDATE roll_lifecycle_receipts
         SET alert_state = 'failed', alert_lease_until = ?, updated_at = ?
         WHERE interaction_id = ? AND alert_state = ?`,
      )
      .bind(retryAt, retryAt, interactionId, expected)
      .run();
    if (result.meta.changes !== 1) {
      throw new Error("Roll lifecycle alert failure was not recorded");
    }
  }

  async releaseAlert(
    interactionId: string,
    operation: "send" | "update",
    retryAt: number,
  ): Promise<void> {
    const from = operation === "send" ? "sending" : "updating";
    const to = operation === "send" ? "none" : "update_due";
    const result = await this.db
      .prepare(
        `UPDATE roll_lifecycle_receipts
         SET alert_state = ?, alert_lease_until = ?, updated_at = ?
         WHERE interaction_id = ? AND alert_state = ?`,
      )
      .bind(to, retryAt, retryAt, interactionId, from)
      .run();
    if (result.meta.changes !== 1) {
      throw new Error("Roll lifecycle alert lease was not released");
    }
  }

  async deleteExpired(cutoff: number): Promise<number> {
    if (!Number.isSafeInteger(cutoff) || cutoff < 0) {
      throw new Error("Roll lifecycle retention cutoff is invalid");
    }
    const result = await this.db
      .prepare(
        `DELETE FROM roll_lifecycle_receipts
         WHERE received_at < ?`,
      )
      .bind(cutoff)
      .run();
    return result.meta.changes;
  }

  private existingResult(
    stored: StoredLifecycle,
    snapshot: RollLifecycleSnapshot,
    fingerprint: string,
    contextJson: string,
  ): RecordRollLifecycleResult {
    if (stored.request_fingerprint !== fingerprint) return { status: "conflict" };
    if (snapshot.revision < stored.revision) return { status: "stale" };
    if (snapshot.revision === stored.revision) {
      return { status: sameSnapshot(stored, snapshot, contextJson) ? "existing" : "conflict" };
    }
    return { status: canAdvance(stored, snapshot) ? "applied" : "conflict" };
  }

  private read(interactionId: string): Promise<StoredLifecycle | null> {
    return this.db
      .withSession("first-primary")
      .prepare(
        `SELECT revision, lifecycle_version, request_fingerprint, command_name,
                scope, received_at, deferred_at, accepted_at,
                delivery_started_at, terminal_at, state, attempts, http_status,
                failure_phase, failure_code, handler_started_at,
                acknowledgement_prepared_at, acknowledgement_type,
                first_provider_attempt_at, clatter_succeeded_at,
                discord_error_code, discord_operation,
                original_response_message_id,
                original_response_probe, context_json, alert_state,
                alert_message_id
         FROM roll_lifecycle_receipts WHERE interaction_id = ?`,
      )
      .bind(interactionId)
      .first<StoredLifecycle>();
  }

  private readWithId(
    interactionId: string,
  ): Promise<(StoredLifecycle & { interaction_id: string }) | null> {
    return this.db
      .withSession("first-primary")
      .prepare(
        `SELECT interaction_id, revision, lifecycle_version,
                request_fingerprint, command_name, scope, received_at,
                deferred_at, accepted_at, delivery_started_at, terminal_at,
                state, attempts, http_status, failure_phase, failure_code,
                handler_started_at, acknowledgement_prepared_at,
                acknowledgement_type, first_provider_attempt_at,
                clatter_succeeded_at, discord_error_code, discord_operation,
                original_response_message_id, original_response_probe,
                context_json, alert_state, alert_message_id
         FROM roll_lifecycle_receipts WHERE interaction_id = ?`,
      )
      .bind(interactionId)
      .first<StoredLifecycle & { interaction_id: string }>();
  }
}
