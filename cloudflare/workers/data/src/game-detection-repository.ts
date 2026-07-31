import {
  buildGameDetectionCandidateSignatureInputV1,
  buildGameDetectionCandidateSignatureInputV2,
  extractNarrationGameFeaturesV1,
  NARRATION_GAME_CATALOG_V1,
  prepareGameDetectionV2,
  type GameDetectionSessionContextV1,
  type NarrationGameConfidenceV1,
  type NarrationGameFeatureRequestV1,
  type NarrationGameRankingRequestV1,
  type NarrationGameRankingResponseV1,
} from "../../../packages/roll-domain/src";

const SESSION_INACTIVITY_MS = 3 * 60 * 60 * 1_000;
const RAW_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const ANNOUNCEMENT_LEASE_MS = 2 * 60 * 1_000;
const MAX_INGEST_BATCH = 100;
const MAX_CONTEXT_ROLLS = 16;
const MAX_FEATURE_ROLLS = 256;

export type GameDetectionIngestionResult = Readonly<{
  ingested: number;
  backlog: boolean;
  closedSessions: number;
}>;

export type ClaimedGameDetectionRankJob = Readonly<{
  sessionId: string;
  candidateSignature: string;
  ranking: NarrationGameRankingRequestV1;
  context: GameDetectionSessionContextV1;
}>;

export type ClaimedGameDetectionAnnouncement = Readonly<{
  detectionId: string;
  sessionId: string;
  previousGameId: string | null;
  gameId: string;
  gameName: string;
  confidence: Exclude<NarrationGameConfidenceV1, "weak">;
  detectedAt: number;
  scope: "guild" | "dm";
  guildId: string | null;
  channelId: string;
  guildName: string | null;
  channelName: string | null;
  rollCount: number;
  sessionStartedAt: number;
  sessionLastRollAt: number;
}>;

type LifecycleRow = Readonly<{
  interaction_id: string;
  command_name: string;
  scope: string;
  received_at: number;
  context_json: string;
}>;

type SessionRow = Readonly<{
  session_id: string;
  scope: "guild" | "dm";
  guild_id: string | null;
  channel_id: string;
  started_at: number;
  last_roll_at: number;
  roll_count: number;
  state: "open" | "closed";
  current_game_id: string | null;
  current_confidence: Exclude<NarrationGameConfidenceV1, "weak"> | null;
  current_game_detected_at: number | null;
  last_candidate_signature: string | null;
  last_candidate_disposition: "selected" | "unknown" | null;
}>;

type StoredRollContext = Readonly<{
  channelId: string;
  guildId: string | null;
  guildName: string | null;
  channelName: string | null;
  channelType: number | null;
  username: string;
  title: string | null;
  savedRollName: string | null;
  notation: readonly string[];
  repetitions: number;
  total: number;
}>;

type ContextRow = Readonly<{
  command_name: "roll" | "library";
  scope: "guild" | "dm";
  context_json: string;
}>;

type RankJobRow = Readonly<{
  session_id: string;
  candidate_signature: string;
  feature_request_json: string;
}>;

type AnnouncementRow = Readonly<{
  detection_id: string;
  session_id: string;
  previous_game_id: string | null;
  game_id: string;
  confidence: Exclude<NarrationGameConfidenceV1, "weak">;
  detected_at: number;
  scope: "guild" | "dm";
  guild_id: string | null;
  channel_id: string;
  roll_count: number;
  started_at: number;
  last_roll_at: number;
  context_json: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength
  ) {
    throw new Error(`Stored game-detection ${field} is invalid`);
  }
  return value;
}

function nullableString(
  value: unknown,
  field: string,
  maximumLength: number,
): string | null {
  return value === null ? null : requiredString(value, field, maximumLength);
}

function parseChannelType(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("Stored game-detection channel type is invalid");
  }
  return value;
}

function parseOutcomeTotal(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value.outcomes)) {
    throw new Error("Stored game-detection outcome is invalid");
  }
  const total = value.outcomes.reduce((sum: number, outcome: unknown) => {
    if (
      !isRecord(outcome) ||
      typeof outcome.total !== "number" ||
      !Number.isSafeInteger(outcome.total)
    ) {
      throw new Error("Stored game-detection outcome total is invalid");
    }
    return sum + outcome.total;
  }, 0);
  if (!Number.isSafeInteger(total) || Math.abs(total) > 1_000_000_000) {
    throw new Error("Stored game-detection combined total is invalid");
  }
  return total;
}

function parseStoredRollContext(raw: string): StoredRollContext {
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    !isRecord(value.request) ||
    !Array.isArray(value.request.notation) ||
    value.request.notation.length < 1 ||
    !value.request.notation.every((notation) => typeof notation === "string") ||
    typeof value.request.repetitions !== "number" ||
    !Number.isSafeInteger(value.request.repetitions) ||
    (!isRecord(value.savedRoll) && value.savedRoll !== null)
  ) {
    throw new Error("Stored game-detection roll context is invalid");
  }

  return {
    channelId: requiredString(value.channelId, "channel ID", 32),
    guildId: nullableString(value.guildId, "guild ID", 32),
    guildName: nullableString(value.guildName, "guild name", 100),
    channelName: nullableString(value.channelName, "channel name", 100),
    channelType: parseChannelType(value.channelType),
    username: requiredString(value.username, "username", 32),
    title: nullableString(value.title, "title", 256),
    savedRollName:
      value.savedRoll === null
        ? null
        : nullableString(value.savedRoll.name, "saved-roll name", 256),
    notation: value.request.notation,
    repetitions: value.request.repetitions,
    total: parseOutcomeTotal(value.outcome),
  };
}

function changes(result: D1Result): number {
  return result.meta.changes;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseRankingRequest(raw: string): NarrationGameRankingRequestV1 {
  const value: unknown = JSON.parse(raw);
  buildGameDetectionCandidateSignatureInputV1(
    value as NarrationGameRankingRequestV1,
  );
  return value as NarrationGameRankingRequestV1;
}

function gameName(gameId: string): string {
  const system = NARRATION_GAME_CATALOG_V1.systems.find(
    ({ id }) => id === gameId,
  );
  if (system === undefined) {
    throw new Error("Detected game is absent from the curated catalogue");
  }
  return system.displayName;
}

export class D1GameDetectionRepository {
  constructor(private readonly db: D1Database) {}

  async ingestDeliveredRolls(
    now: number,
    limit = MAX_INGEST_BATCH,
  ): Promise<GameDetectionIngestionResult> {
    if (!Number.isSafeInteger(now) || now < 0 || limit < 1 || limit > 500) {
      throw new Error("Game-detection ingestion request is invalid");
    }

    const rows = await this.db.prepare(
      `SELECT r.interaction_id, r.command_name, r.scope,
              r.received_at, r.context_json
       FROM roll_lifecycle_receipts AS r
       CROSS JOIN game_detection_control AS control
       WHERE control.singleton = 1
         AND r.state = 'delivered'
         AND r.received_at >= control.started_at
         AND NOT EXISTS (
           SELECT 1 FROM game_detection_rolls AS observed
           WHERE observed.interaction_id = r.interaction_id
         )
       ORDER BY r.received_at, r.interaction_id
       LIMIT ?`,
    ).bind(limit).all<LifecycleRow>();

    let ingested = 0;
    for (const row of rows.results) {
      if (await this.ingestRow(row, now)) ingested += 1;
    }

    const backlog = await this.hasBacklog();
    const closedSessions = backlog ? 0 : await this.closeExpiredSessions(now);
    return { ingested, backlog, closedSessions };
  }

  private async hasBacklog(): Promise<boolean> {
    const row = await this.db.prepare(
      `SELECT EXISTS (
         SELECT 1
         FROM roll_lifecycle_receipts AS r
         CROSS JOIN game_detection_control AS control
         WHERE control.singleton = 1
           AND r.state = 'delivered'
           AND r.received_at >= control.started_at
           AND NOT EXISTS (
             SELECT 1 FROM game_detection_rolls AS observed
             WHERE observed.interaction_id = r.interaction_id
           )
       ) AS pending`,
    ).first<{ pending: number }>();
    return row?.pending === 1;
  }

  private async ingestRow(row: LifecycleRow, now: number): Promise<boolean> {
    if (
      (row.command_name !== "roll" && row.command_name !== "library") ||
      (row.scope !== "guild" && row.scope !== "dm")
    ) {
      throw new Error("Stored game-detection lifecycle metadata is invalid");
    }
    const context = parseStoredRollContext(row.context_json);
    if (
      (row.scope === "guild" && context.guildId === null) ||
      (row.scope === "dm" && context.guildId !== null)
    ) {
      throw new Error("Stored game-detection lifecycle scope is inconsistent");
    }

    let session = await this.sessionAt(
      context.channelId,
      row.received_at,
    );
    if (session === null) {
      let open = await this.openSession(context.channelId);
      if (
        open !== null &&
        row.received_at - open.last_roll_at >= SESSION_INACTIVITY_MS
      ) {
        await this.closeSession(
          open,
          open.last_roll_at + SESSION_INACTIVITY_MS,
          now,
        );
        open = null;
      }
      const historical =
        open !== null &&
        row.received_at + SESSION_INACTIVITY_MS <= open.started_at;
      await this.db.prepare(
        `INSERT OR IGNORE INTO game_detection_sessions (
           session_id, scope, guild_id, channel_id, started_at, last_roll_at,
           roll_count, state, closed_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      )
        .bind(
          row.interaction_id,
          row.scope,
          context.guildId,
          context.channelId,
          row.received_at,
          row.received_at,
          historical ? "closed" : "open",
          historical ? row.received_at + SESSION_INACTIVITY_MS : null,
          now,
          now,
        )
        .run();
      session =
        await this.sessionById(row.interaction_id) ??
        await this.sessionAt(context.channelId, row.received_at);
      if (session === null) {
        throw new Error("Game-detection session was not created");
      }
    }

    const inserted = await this.db.prepare(
      `INSERT OR IGNORE INTO game_detection_rolls (
         interaction_id, session_id, observed_at, has_title,
         classification, game_id, expires_at, created_at
       ) VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)`,
    )
      .bind(
        row.interaction_id,
        session.session_id,
        row.received_at,
        context.title === null ? 0 : 1,
        row.received_at + RAW_RETENTION_MS,
        now,
      )
      .run();
    if (changes(inserted) === 0) return false;

    if (session.session_id !== row.interaction_id) {
      await this.db.prepare(
        `UPDATE game_detection_sessions
         SET started_at = MIN(started_at, ?),
             last_roll_at = MAX(last_roll_at, ?),
             roll_count = roll_count + 1,
             closed_at = CASE
               WHEN state = 'closed'
                 THEN MAX(last_roll_at, ?) + ?
               ELSE NULL
             END,
             updated_at = ?
         WHERE session_id = ?`,
      )
        .bind(
          row.received_at,
          row.received_at,
          row.received_at,
          SESSION_INACTIVITY_MS,
          now,
          session.session_id,
        )
        .run();
      session = await this.sessionById(session.session_id);
      if (session === null) {
        throw new Error("Game-detection session disappeared during ingestion");
      }
    }

    const rankPending = await this.prepareRankJob(
      session,
      row.interaction_id,
      now,
    );
    if (session.state === "closed" && !rankPending) {
      await this.finalizeClosedClassifications(session);
    }
    return true;
  }

  private async sessionAt(
    channelId: string,
    observedAt: number,
  ): Promise<SessionRow | null> {
    return this.db.prepare(
      `SELECT session_id, scope, guild_id, channel_id, started_at,
              last_roll_at, roll_count, state, current_game_id,
              current_confidence, current_game_detected_at,
              last_candidate_signature, last_candidate_disposition
       FROM game_detection_sessions
       WHERE channel_id = ?
         AND ? > started_at - ?
         AND ? < last_roll_at + ?
       ORDER BY CASE state WHEN 'open' THEN 0 ELSE 1 END, started_at DESC
       LIMIT 1`,
    ).bind(
      channelId,
      observedAt,
      SESSION_INACTIVITY_MS,
      observedAt,
      SESSION_INACTIVITY_MS,
    ).first<SessionRow>();
  }

  private async openSession(channelId: string): Promise<SessionRow | null> {
    return this.db.prepare(
      `SELECT session_id, scope, guild_id, channel_id, started_at,
              last_roll_at, roll_count, state, current_game_id,
              current_confidence, current_game_detected_at,
              last_candidate_signature, last_candidate_disposition
       FROM game_detection_sessions
       WHERE channel_id = ? AND state = 'open'`,
    ).bind(channelId).first<SessionRow>();
  }

  private async sessionById(sessionId: string): Promise<SessionRow | null> {
    return this.db.prepare(
      `SELECT session_id, scope, guild_id, channel_id, started_at,
              last_roll_at, roll_count, state, current_game_id,
              current_confidence, current_game_detected_at,
              last_candidate_signature, last_candidate_disposition
       FROM game_detection_sessions WHERE session_id = ?`,
    ).bind(sessionId).first<SessionRow>();
  }

  private async featureRequest(
    sessionId: string,
  ): Promise<NarrationGameFeatureRequestV1> {
    const rows = await this.db.prepare(
      `SELECT receipt.context_json
       FROM game_detection_rolls AS observed
       JOIN roll_lifecycle_receipts AS receipt
         ON receipt.interaction_id = observed.interaction_id
       WHERE observed.session_id = ?
       ORDER BY observed.observed_at DESC, observed.interaction_id DESC
       LIMIT ?`,
    ).bind(sessionId, MAX_FEATURE_ROLLS).all<{ context_json: string }>();
    return {
      version: 1,
      rolls: rows.results.reverse().map(({ context_json }) => {
        const context = parseStoredRollContext(context_json);
        return {
          notation: context.notation,
          repetitions: context.repetitions,
        };
      }),
    };
  }

  private async prepareRankJob(
    session: SessionRow,
    interactionId: string,
    now: number,
  ): Promise<boolean> {
    const request = await this.featureRequest(session.session_id);
    const ranking = extractNarrationGameFeaturesV1(request);
    const context = await this.sessionContext(session.session_id);
    const signature = await sha256(
      buildGameDetectionCandidateSignatureInputV2(ranking, context),
    );

    if (signature === session.last_candidate_signature) {
      if (
        session.last_candidate_disposition === "selected" &&
        session.current_game_id !== null
      ) {
        await this.classifyRoll(interactionId, "in-game", session.current_game_id);
      } else if (session.current_game_id !== null) {
        await this.classifyRoll(interactionId, "unknown", null);
      }
      return false;
    }

    const preparation = prepareGameDetectionV2({ ranking, context });
    await this.db.prepare(
      `UPDATE game_detection_sessions
       SET last_candidate_signature = ?, last_candidate_disposition = 'unknown',
           updated_at = ?
       WHERE session_id = ?`,
    ).bind(signature, now, session.session_id).run();

    if (preparation.state !== "prompt-ready") {
      if (session.current_game_id !== null) {
        await this.classifyRoll(interactionId, "unknown", null);
      }
      return false;
    }

    await this.db.prepare(
      `INSERT INTO game_detection_rank_jobs (
         session_id, candidate_signature, feature_request_json, state,
         attempt_count, created_at
       ) VALUES (?, ?, ?, 'pending', 0, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         candidate_signature = excluded.candidate_signature,
         feature_request_json = excluded.feature_request_json,
         state = 'pending',
         attempt_count = 0,
         created_at = excluded.created_at,
         started_at = NULL,
         completed_at = NULL,
         result = NULL,
         detail = NULL,
         latency_ms = NULL`,
    ).bind(
      session.session_id,
      signature,
      JSON.stringify(ranking),
      now,
    ).run();
    return true;
  }

  private async classifyRoll(
    interactionId: string,
    classification: "in-game" | "unknown",
    gameId: string | null,
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE game_detection_rolls
       SET classification = ?, game_id = ?
       WHERE interaction_id = ?`,
    ).bind(classification, gameId, interactionId).run();
  }

  private async sessionContext(
    sessionId: string,
  ): Promise<GameDetectionSessionContextV1> {
    const rows = await this.db.prepare(
      `SELECT receipt.command_name, receipt.scope, receipt.context_json
       FROM game_detection_rolls AS observed
       JOIN roll_lifecycle_receipts AS receipt
         ON receipt.interaction_id = observed.interaction_id
       WHERE observed.session_id = ?
       ORDER BY observed.observed_at DESC, observed.interaction_id DESC
       LIMIT ?`,
    ).bind(sessionId, MAX_CONTEXT_ROLLS).all<ContextRow>();
    const chronological = rows.results.reverse();
    const first = chronological[0];
    if (first === undefined) {
      throw new Error("Game-detection session has no roll context");
    }
    const parsed = chronological.map((row) => ({
      row,
      context: parseStoredRollContext(row.context_json),
    }));
    const latest = parsed.at(-1);
    if (latest === undefined) {
      throw new Error("Game-detection session context is unavailable");
    }

    return {
      version: 1,
      scope: first.scope,
      guildName: latest.context.guildName,
      channelName: latest.context.channelName,
      channelType: latest.context.channelType,
      rolls: parsed.map(({ row, context }) => ({
        commandName: row.command_name,
        username: context.username,
        title: context.title,
        savedRollName: context.savedRollName,
        notation: context.notation.join(" "),
        repetitions: context.repetitions,
        total: context.total,
      })),
    };
  }

  async claimRankJob(now: number): Promise<ClaimedGameDetectionRankJob | null> {
    const row = await this.db.prepare(
      `SELECT session_id, candidate_signature, feature_request_json
       FROM game_detection_rank_jobs
       WHERE state = 'pending'
       ORDER BY created_at, session_id
       LIMIT 1`,
    ).first<RankJobRow>();
    if (row === null) return null;

    const claimed = await this.db.prepare(
      `UPDATE game_detection_rank_jobs
       SET state = 'processing', attempt_count = 1, started_at = ?
       WHERE session_id = ? AND candidate_signature = ? AND state = 'pending'`,
    ).bind(now, row.session_id, row.candidate_signature).run();
    if (changes(claimed) !== 1) return null;

    return {
      sessionId: row.session_id,
      candidateSignature: row.candidate_signature,
      ranking: parseRankingRequest(row.feature_request_json),
      context: await this.sessionContext(row.session_id),
    };
  }

  async completeRankJob(
    job: ClaimedGameDetectionRankJob,
    outcome:
      | Readonly<{
          status: "accepted";
          value: NarrationGameRankingResponseV1;
        }>
      | Readonly<{
          status: "rejected" | "failed";
          detail: string;
        }>,
    completedAt: number,
    latencyMs: number,
  ): Promise<void> {
    const current = await this.sessionById(job.sessionId);
    if (
      current === null ||
      current.last_candidate_signature !== job.candidateSignature
    ) {
      await this.finishJob(
        job,
        "failed",
        "stale-candidate-signature",
        completedAt,
        latencyMs,
      );
      return;
    }

    if (outcome.status !== "accepted") {
      await this.classifyPendingUnresolved(job.sessionId);
      await this.finishJob(
        job,
        outcome.status,
        outcome.detail,
        completedAt,
        latencyMs,
      );
      return;
    }

    if (outcome.value.disposition === "abstain") {
      await this.classifyPendingUnresolved(job.sessionId);
      await this.finishJob(
        job,
        "abstained",
        outcome.value.abstentionReason ?? "model-abstained",
        completedAt,
        latencyMs,
      );
      return;
    }

    const selectedGameId = outcome.value.selectedSystemId;
    if (selectedGameId === null) {
      throw new Error("Accepted game selection omitted a system ID");
    }
    const assessment = outcome.value.assessments[selectedGameId];
    if (
      assessment === undefined ||
      assessment.confidenceTier === "weak"
    ) {
      throw new Error("Accepted game selection omitted usable confidence");
    }

    const firstDetection = current.current_game_id === null;
    await this.db.batch([
      this.db.prepare(
        `UPDATE game_detection_rolls
         SET classification = 'in-game', game_id = ?
         WHERE session_id = ?
           AND (
             classification = 'pending'
             OR (? = 1 AND classification IN ('unknown', 'out-of-game'))
             OR (? = 0 AND classification = 'unknown' AND observed_at >= ?)
           )`,
      ).bind(
        selectedGameId,
        job.sessionId,
        firstDetection ? 1 : 0,
        firstDetection ? 1 : 0,
        current.current_game_detected_at ?? current.started_at,
      ),
      this.db.prepare(
        `UPDATE game_detection_sessions
         SET current_game_id = ?, current_confidence = ?,
             current_game_detected_at = ?,
             last_candidate_disposition = 'selected', updated_at = ?
         WHERE session_id = ? AND last_candidate_signature = ?`,
      ).bind(
        selectedGameId,
        assessment.confidenceTier,
        completedAt,
        completedAt,
        job.sessionId,
        job.candidateSignature,
      ),
    ]);

    if (current.current_game_id !== selectedGameId) {
      const detectionId = `${job.sessionId}:${job.candidateSignature.slice(0, 16)}`;
      await this.db.prepare(
        `INSERT OR IGNORE INTO game_detections (
           detection_id, session_id, previous_game_id, game_id, confidence,
           candidate_signature, evidence_json, detected_at, model_id,
           prompt_revision, announcement_state, next_announcement_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).bind(
        detectionId,
        job.sessionId,
        current.current_game_id,
        selectedGameId,
        assessment.confidenceTier,
        job.candidateSignature,
        JSON.stringify(assessment.evidenceCitations),
        completedAt,
        "@cf/zai-org/glm-5.2",
        "dice-witch-game-detection-v2",
        completedAt,
      ).run();
    }

    await this.finishJob(
      job,
      "selected",
      selectedGameId,
      completedAt,
      latencyMs,
    );
  }

  private async classifyPendingUnresolved(sessionId: string): Promise<void> {
    const session = await this.sessionById(sessionId);
    if (session === null) return;
    const classification =
      session.state === "closed" &&
      session.roll_count === 1 &&
      session.current_game_id === null
        ? "out-of-game"
        : "unknown";
    await this.db.prepare(
      `UPDATE game_detection_rolls
       SET classification = ?, game_id = NULL
       WHERE session_id = ? AND classification = 'pending'`,
    ).bind(classification, sessionId).run();
  }

  private async finalizeClosedClassifications(
    session: SessionRow,
  ): Promise<void> {
    const loneUnidentified =
      session.roll_count === 1 && session.current_game_id === null;
    await this.db.prepare(
      `UPDATE game_detection_rolls
       SET classification = ?, game_id = NULL
       WHERE session_id = ?
         AND (
           classification = 'pending'
           OR (? = 1 AND classification = 'unknown')
           OR (? = 0 AND classification = 'out-of-game')
         )`,
    ).bind(
      loneUnidentified ? "out-of-game" : "unknown",
      session.session_id,
      loneUnidentified ? 1 : 0,
      loneUnidentified ? 1 : 0,
    ).run();
  }

  private async finishJob(
    job: ClaimedGameDetectionRankJob,
    result: "selected" | "abstained" | "rejected" | "failed",
    detail: string,
    completedAt: number,
    latencyMs: number,
  ): Promise<void> {
    const updated = await this.db.prepare(
      `UPDATE game_detection_rank_jobs
       SET state = 'completed', completed_at = ?, result = ?, detail = ?,
           latency_ms = ?
       WHERE session_id = ? AND candidate_signature = ?
         AND state = 'processing' AND attempt_count = 1`,
    ).bind(
      completedAt,
      result,
      detail.slice(0, 100),
      latencyMs,
      job.sessionId,
      job.candidateSignature,
    ).run();
    if (changes(updated) !== 1) {
      throw new Error("Game-detection rank job completion was stale");
    }
  }

  async failInterruptedRankJobs(now: number): Promise<number> {
    const jobs = await this.db.prepare(
      `SELECT session_id, candidate_signature, feature_request_json
       FROM game_detection_rank_jobs
       WHERE state = 'processing' AND started_at <= ?
       ORDER BY started_at
       LIMIT 100`,
    ).bind(now - 10 * 60 * 1_000).all<RankJobRow>();
    for (const job of jobs.results) {
      await this.classifyPendingUnresolved(job.session_id);
      await this.db.prepare(
        `UPDATE game_detection_rank_jobs
         SET state = 'completed', completed_at = ?, result = 'failed',
             detail = 'worker-interrupted', latency_ms = ? - started_at
         WHERE session_id = ? AND candidate_signature = ?
           AND state = 'processing'`,
      ).bind(now, now, job.session_id, job.candidate_signature).run();
    }
    return jobs.results.length;
  }

  private async closeExpiredSessions(now: number): Promise<number> {
    const rows = await this.db.prepare(
      `SELECT session_id, scope, guild_id, channel_id, started_at,
              last_roll_at, roll_count, state, current_game_id,
              current_confidence, current_game_detected_at,
              last_candidate_signature, last_candidate_disposition
       FROM game_detection_sessions
       WHERE state = 'open' AND last_roll_at <= ?
       ORDER BY last_roll_at
       LIMIT 500`,
    ).bind(now - SESSION_INACTIVITY_MS).all<SessionRow>();
    for (const row of rows.results) {
      await this.closeSession(
        row,
        row.last_roll_at + SESSION_INACTIVITY_MS,
        now,
      );
    }
    return rows.results.length;
  }

  private async closeSession(
    session: SessionRow,
    closedAt: number,
    updatedAt: number,
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE game_detection_sessions
       SET state = 'closed', closed_at = ?, updated_at = ?
       WHERE session_id = ? AND state = 'open'`,
    ).bind(closedAt, updatedAt, session.session_id).run();
    await this.finalizeClosedClassifications({
      ...session,
      state: "closed",
    });
  }

  async claimAnnouncement(
    now: number,
  ): Promise<ClaimedGameDetectionAnnouncement | null> {
    const row = await this.db.prepare(
      `SELECT detection.detection_id, detection.session_id,
              detection.previous_game_id, detection.game_id,
              detection.confidence, detection.detected_at,
              session.scope, session.guild_id, session.channel_id,
              session.roll_count, session.started_at,
              session.last_roll_at, receipt.context_json
       FROM game_detections AS detection
       JOIN game_detection_sessions AS session
         ON session.session_id = detection.session_id
       JOIN game_detection_rolls AS observed
         ON observed.session_id = session.session_id
       JOIN roll_lifecycle_receipts AS receipt
         ON receipt.interaction_id = observed.interaction_id
       WHERE detection.announcement_state = 'pending'
         AND detection.next_announcement_at <= ?
       ORDER BY detection.detected_at, observed.observed_at DESC
       LIMIT 1`,
    ).bind(now).first<AnnouncementRow>();
    if (row === null) return null;

    const claimed = await this.db.prepare(
      `UPDATE game_detections
       SET announcement_state = 'processing', announcement_started_at = ?,
           announcement_attempts = announcement_attempts + 1
       WHERE detection_id = ? AND announcement_state = 'pending'
         AND next_announcement_at <= ?`,
    ).bind(now, row.detection_id, now).run();
    if (changes(claimed) !== 1) return null;

    const context = parseStoredRollContext(row.context_json);
    return {
      detectionId: row.detection_id,
      sessionId: row.session_id,
      previousGameId: row.previous_game_id,
      gameId: row.game_id,
      gameName: gameName(row.game_id),
      confidence: row.confidence,
      detectedAt: row.detected_at,
      scope: row.scope,
      guildId: row.guild_id,
      channelId: row.channel_id,
      guildName: context.guildName,
      channelName: context.channelName,
      rollCount: row.roll_count,
      sessionStartedAt: row.started_at,
      sessionLastRollAt: row.last_roll_at,
    };
  }

  async markAnnouncementSent(
    detectionId: string,
    messageId: string,
    completedAt: number,
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE game_detections
       SET announcement_state = 'sent', announcement_completed_at = ?,
           discord_message_id = ?
       WHERE detection_id = ? AND announcement_state = 'processing'`,
    ).bind(completedAt, messageId, detectionId).run();
  }

  async markAnnouncementFailed(
    detectionId: string,
    detail: string,
    completedAt: number,
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE game_detections
       SET announcement_state = 'failed', announcement_completed_at = ?,
           announcement_failure = ?
       WHERE detection_id = ? AND announcement_state = 'processing'`,
    ).bind(completedAt, detail.slice(0, 100), detectionId).run();
  }

  async releaseAnnouncement(
    detectionId: string,
    detail: string,
    retryAt: number,
  ): Promise<"retrying" | "failed"> {
    const row = await this.db.prepare(
      `SELECT announcement_attempts AS attempts
       FROM game_detections
       WHERE detection_id = ? AND announcement_state = 'processing'`,
    ).bind(detectionId).first<{ attempts: number }>();
    if (row === null) return "failed";
    if (row.attempts >= 3) {
      await this.markAnnouncementFailed(
        detectionId,
        `${detail}-retry-exhausted`,
        retryAt,
      );
      return "failed";
    }
    await this.db.prepare(
      `UPDATE game_detections
       SET announcement_state = 'pending', announcement_started_at = NULL,
           next_announcement_at = ?
       WHERE detection_id = ? AND announcement_state = 'processing'`,
    ).bind(retryAt, detectionId).run();
    return "retrying";
  }

  async recoverInterruptedAnnouncements(now: number): Promise<number> {
    const retryable = await this.db.prepare(
      `UPDATE game_detections
       SET announcement_state = 'pending', announcement_started_at = NULL,
           next_announcement_at = ?
       WHERE announcement_state = 'processing'
         AND announcement_started_at <= ?
         AND announcement_attempts < 3`,
    ).bind(now, now - ANNOUNCEMENT_LEASE_MS).run();
    const exhausted = await this.db.prepare(
      `UPDATE game_detections
       SET announcement_state = 'failed', announcement_completed_at = ?,
           announcement_failure = 'worker-interrupted-retry-exhausted'
       WHERE announcement_state = 'processing'
         AND announcement_started_at <= ?
         AND announcement_attempts = 3`,
    ).bind(now, now - ANNOUNCEMENT_LEASE_MS).run();
    return changes(retryable) + changes(exhausted);
  }

  async aggregateAndDeleteExpired(now: number): Promise<number> {
    const pending = await this.db.prepare(
      `SELECT COUNT(*) AS count FROM game_detection_rolls
       WHERE expires_at <= ? AND classification = 'pending'`,
    ).bind(now).first<{ count: number }>();
    if ((pending?.count ?? 0) !== 0) {
      throw new Error("Expired game-detection rolls are not classified");
    }

    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO game_detection_daily_aggregates (
           day, classification, game_id_key, roll_count, titled_roll_count
         )
         SELECT date(observed_at / 1000, 'unixepoch'),
                classification, COALESCE(game_id, ''),
                COUNT(*), SUM(has_title)
         FROM game_detection_rolls
         WHERE expires_at <= ?
         GROUP BY date(observed_at / 1000, 'unixepoch'),
                  classification, COALESCE(game_id, '')
         HAVING true
         ON CONFLICT(day, classification, game_id_key) DO UPDATE SET
           roll_count = roll_count + excluded.roll_count,
           titled_roll_count = titled_roll_count + excluded.titled_roll_count`,
      ).bind(now),
      this.db.prepare(
        "DELETE FROM game_detection_rolls WHERE expires_at <= ?",
      ).bind(now),
    ]);
    await this.db.prepare(
      `DELETE FROM game_detection_sessions
       WHERE state = 'closed'
         AND NOT EXISTS (
           SELECT 1 FROM game_detection_rolls AS observed
           WHERE observed.session_id = game_detection_sessions.session_id
         )`,
    ).run();
    return changes(results[1] as D1Result);
  }
}
