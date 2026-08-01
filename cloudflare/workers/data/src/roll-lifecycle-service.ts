import {
  buildDiscordChannelDirectoryUpsertV1,
  parseRollLifecycleSnapshot,
  type DiscordChannelContextResultV1,
  type RollLifecycleAlertV1,
  type RollLifecycleContextV1,
  type RollLifecycleSnapshotV1,
} from "../../../packages/discord-contracts/src";
import {
  applyDiscordChannelDirectoryMutation,
  resolveDiscordChannelContextCachedV1,
} from "./discord-channel-directory-service";
import {
  D1RollLifecycleRepository,
  type RollLifecycleAlertWorkItem,
} from "./roll-lifecycle-repository";

const ALERT_DELAY_MS = 2 * 60 * 1_000;
const ALERT_LEASE_MS = 60 * 1_000;
const ALERT_BATCH_SIZE = 25;
const DEFAULT_ALERT_RETRY_MS = 60 * 1_000;
const REJECTED_ALERT_RETRY_MS = 15 * 60 * 1_000;
export const ROLL_LIFECYCLE_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const MAX_LIFECYCLE_BODY_BYTES = 80 * 1_024;

export type RollLifecycleAlertService = {
  createRollLifecycleAlertV1(value: unknown): Promise<unknown>;
  updateRollLifecycleAlertV1(value: unknown): Promise<unknown>;
  resolveDiscordChannelContextV1(
    value: unknown,
  ): Promise<DiscordChannelContextResultV1>;
};

export type RollLifecycleServiceEnv = {
  DATA: D1Database;
  DISCORD_REST: RollLifecycleAlertService;
};

type AlertDeliveryResult =
  | { status: "delivered"; messageId: string; httpStatus: number }
  | { status: "failed"; httpStatus: number }
  | {
      status: "retryable";
      httpStatus: number | null;
      retryAfterMs: number | null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAlertResult(value: unknown): AlertDeliveryResult {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error("Roll lifecycle alert response is invalid");
  }
  if (
    value.status === "delivered" &&
    typeof value.messageId === "string" &&
    typeof value.httpStatus === "number" &&
    Number.isSafeInteger(value.httpStatus)
  ) {
    return {
      status: "delivered",
      messageId: value.messageId,
      httpStatus: value.httpStatus,
    };
  }
  if (
    value.status === "failed" &&
    typeof value.httpStatus === "number" &&
    Number.isSafeInteger(value.httpStatus)
  ) {
    return { status: "failed", httpStatus: value.httpStatus };
  }
  if (
    value.status === "retryable" &&
    (value.httpStatus === null ||
      (typeof value.httpStatus === "number" &&
        Number.isSafeInteger(value.httpStatus))) &&
    (value.retryAfterMs === null ||
      (typeof value.retryAfterMs === "number" &&
        Number.isSafeInteger(value.retryAfterMs) &&
        value.retryAfterMs >= 0))
  ) {
    return {
      status: "retryable",
      httpStatus: value.httpStatus,
      retryAfterMs: value.retryAfterMs,
    };
  }
  throw new Error("Roll lifecycle alert response is invalid");
}

function alertValue(
  item: RollLifecycleAlertWorkItem,
  context: RollLifecycleContextV1,
): RollLifecycleAlertV1 {
  return {
    version: 1,
    interactionId: item.interactionId,
    alertMessageId: item.alertMessageId,
    state: item.state,
    deferredAt: item.deferredAt,
    acceptedAt: item.acceptedAt,
    deliveryStartedAt: item.deliveryStartedAt,
    terminalAt: item.terminalAt,
    attempts: item.attempts,
    httpStatus: item.httpStatus,
    failurePhase: item.failurePhase,
    failureCode: item.failureCode,
    context,
  };
}

async function enrichAlertContext(
  db: D1Database,
  service: RollLifecycleAlertService,
  item: RollLifecycleAlertWorkItem,
  now: number,
): Promise<RollLifecycleContextV1> {
  const context = item.context;
  if (context.guildId === null) return context;

  let guildName = context.guildName;
  if (guildName === null) {
    try {
      const guild = await db.prepare(
        `SELECT name FROM guilds
         WHERE id = ? AND length(name) BETWEEN 1 AND 100`,
      ).bind(context.guildId).first<{ name: string }>();
      guildName = guild?.name ?? null;
    } catch {
      console.warn(JSON.stringify({
        level: "warn",
        message: "Roll lifecycle guild display context is unavailable",
        interactionId: item.interactionId,
      }));
    }
  }

  let channelName = context.channelName;
  let channelType = context.channelType;
  if (channelName === null || channelType === null) {
    try {
      const result = await resolveDiscordChannelContextCachedV1(
        { DATA: db, DISCORD_REST: service },
        {
          version: 1,
          guildId: context.guildId,
          channelId: context.channelId,
        },
        now,
      );
      if (result.status === "resolved") {
        channelName ??= result.channelName;
        channelType ??= result.channelType;
      } else {
        console.warn(JSON.stringify({
          level: "warn",
          message: "Roll lifecycle channel display context is unavailable",
          interactionId: item.interactionId,
          status: result.status,
          httpStatus: result.httpStatus,
        }));
      }
    } catch {
      console.warn(JSON.stringify({
        level: "warn",
        message: "Roll lifecycle channel display context is unavailable",
        interactionId: item.interactionId,
        status: "request-failed",
        httpStatus: null,
      }));
    }
  }

  return {
    ...context,
    guildName,
    channelName,
    channelType,
  };
}

async function processAlert(
  db: D1Database,
  repository: D1RollLifecycleRepository,
  service: RollLifecycleAlertService,
  item: RollLifecycleAlertWorkItem,
  operation: "send" | "update",
  now: number,
): Promise<void> {
  let result: AlertDeliveryResult;
  try {
    const context = await enrichAlertContext(db, service, item, now);
    const value = alertValue(item, context);
    result = parseAlertResult(
      operation === "send"
        ? await service.createRollLifecycleAlertV1(value)
        : await service.updateRollLifecycleAlertV1(value),
    );
  } catch {
    await repository.releaseAlert(
      item.interactionId,
      operation,
      now + DEFAULT_ALERT_RETRY_MS,
    );
    console.error(
      JSON.stringify({
        level: "error",
        message: "Roll lifecycle alert delivery failed",
        interactionId: item.interactionId,
        operation,
        retryable: true,
      }),
    );
    return;
  }
  if (result.status === "delivered") {
    if (operation === "send") {
      await repository.markAlertSent(
        item.interactionId,
        result.messageId,
        item.revision,
        now,
      );
    } else {
      await repository.markAlertUpdated(item.interactionId, item.revision, now);
    }
    return;
  }
  if (result.status === "retryable") {
    await repository.releaseAlert(
      item.interactionId,
      operation,
      now + (result.retryAfterMs ?? DEFAULT_ALERT_RETRY_MS),
    );
    return;
  }
  await repository.markAlertFailed(
    item.interactionId,
    operation,
    now + REJECTED_ALERT_RETRY_MS,
  );
  console.error(
    JSON.stringify({
      level: "error",
      message: "Roll lifecycle alert delivery was rejected",
      interactionId: item.interactionId,
      operation,
      httpStatus: result.httpStatus,
      retryable: false,
    }),
  );
}

function cacheLifecycleDisplayContext(
  snapshot: RollLifecycleSnapshotV1,
  db: D1Database,
  ctx?: ExecutionContext,
): void {
  if (ctx === undefined) return;
  const warn = () => {
    console.warn(JSON.stringify({
      level: "warn",
      message: "Roll lifecycle channel context cache write failed",
    }));
  };
  try {
    const mutation = buildDiscordChannelDirectoryUpsertV1(
      snapshot.context,
      "lifecycle",
      snapshot.receivedAt,
    );
    if (mutation === null) return;
    ctx.waitUntil(
      applyDiscordChannelDirectoryMutation(db, mutation, Date.now()).catch(warn),
    );
  } catch {
    warn();
  }
}

export async function recordRollLifecycle(
  request: Request,
  env: RollLifecycleServiceEnv,
  ctx?: ExecutionContext,
): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_LIFECYCLE_BODY_BYTES) {
    return Response.json(
      { error: "Roll lifecycle request is too large" },
      { status: 413 },
    );
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_LIFECYCLE_BODY_BYTES) {
    return Response.json(
      { error: "Roll lifecycle request is too large" },
      { status: 413 },
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return Response.json(
      { error: "Roll lifecycle request is invalid" },
      { status: 400 },
    );
  }
  try {
    const snapshot = parseRollLifecycleSnapshot(value);
    const result = await new D1RollLifecycleRepository(env.DATA).record(snapshot);
    cacheLifecycleDisplayContext(snapshot, env.DATA, ctx);
    if (snapshot.state === "failed" && ctx !== undefined) {
      ctx.waitUntil(processRollLifecycleAlerts(env, Date.now()));
    }
    return Response.json(result, {
      status: result.status === "conflict" ? 409 : 200,
    });
  } catch {
    return Response.json(
      { error: "Roll lifecycle request is invalid" },
      { status: 400 },
    );
  }
}

export async function processRollLifecycleAlerts(
  env: RollLifecycleServiceEnv,
  now: number,
): Promise<void> {
  const repository = new D1RollLifecycleRepository(env.DATA);
  const creates = await repository.claimAlerts(
    now,
    ALERT_DELAY_MS,
    ALERT_LEASE_MS,
    ALERT_BATCH_SIZE,
  );
  for (const item of creates) {
    await processAlert(
      env.DATA,
      repository,
      env.DISCORD_REST,
      item,
      "send",
      now,
    );
  }
  const updates = await repository.claimAlertUpdates(
    now,
    ALERT_LEASE_MS,
    ALERT_BATCH_SIZE,
  );
  for (const item of updates) {
    await processAlert(
      env.DATA,
      repository,
      env.DISCORD_REST,
      item,
      "update",
      now,
    );
  }
}

export function cleanRollLifecycleRecords(
  env: Pick<RollLifecycleServiceEnv, "DATA">,
  now: number,
): Promise<number> {
  return new D1RollLifecycleRepository(env.DATA).deleteExpired(
    now - ROLL_LIFECYCLE_RETENTION_MS,
  );
}
