import { z } from "zod";
import {
  parseDiscordAudienceSnapshotV1,
  type DiscordAudienceCaptureV1,
} from "../../../packages/discord-contracts/src";
import { gatewayPartitionAssignments } from "../../../packages/gateway-protocol/src";
import { isWorkerSecretSource } from "../../../packages/worker-secrets/src";
import {
  GatewayCoordinator,
  type RecommendationCheckResult,
} from "./gateway-coordinator";
import { GatewayStatusService } from "./gateway-status-service";
import {
  GatewayPartition,
  type GatewayFaultResult,
  type GatewayStatus,
} from "./gateway-partition";
import { reconcileGuildInventory } from "./guild-reconciliation";
import {
  allowedGatewayHostname,
  discordBotToken,
  discordGatewayBotUrl,
  gatewayControlToken,
  GATEWAY_COORDINATOR_NAME,
  GATEWAY_PARTITION_NAME,
  type GatewayEnv,
} from "./environment";

export const GATEWAY_RECOMMENDATION_CRON = "0 * * * *";
export const BOT_LIST_STATS_CRON = "30 */4 * * *";
export const AUDIENCE_SNAPSHOT_CRON = "*/5 * * * *";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const GatewayModeSchema = z.enum(["single", "fleet"]);
const GatewayModeOperationSchema = z.enum(["start", "stop"]);
const DiscordRestBindingSchema = z.looseObject({
  listCurrentGuildIdsPage: z.function(),
  logGuildLifecycle: z.function(),
  reportBotListStats: z.function(),
  reportBotListStatsV1: z.function(),
  captureAudienceSnapshotV1: z.function(),
});
const AudiencePersistenceResponseSchema = z.looseObject({
  status: z.enum(["applied", "existing", "stale"]),
  snapshot: z.looseObject({}),
});
const NonNegativeSafeIntegerSchema = z
  .number()
  .refine(Number.isSafeInteger)
  .nonnegative();
const GuildReconciliationConfirmationSchema = z.strictObject({
  generation: NonNegativeSafeIntegerSchema,
  shardCount: NonNegativeSafeIntegerSchema,
  minimumCapturedAt: NonNegativeSafeIntegerSchema,
  expectedGuildCount: NonNegativeSafeIntegerSchema,
});

type GatewayBoundaryInput = Parameters<
  typeof AudiencePersistenceResponseSchema.safeParse
>[0];
type GuildReconciliationConfirmation = z.output<
  typeof GuildReconciliationConfirmationSchema
>;

class GatewayControlInputError extends Error {}

export function classifyGatewayControlError(value: GatewayBoundaryInput): string {
  if (!(value instanceof Error)) return "non-error";
  if (value.message.includes("listCurrentGuildIdsPage")) {
    return "discord-guild-page-rpc";
  }
  if (value.message.includes("Discord guild list request failed")) {
    return "discord-guild-page-request";
  }
  if (value.message.includes("Discord guild list response is invalid")) {
    return "discord-guild-page-invalid-response";
  }
  if (value.message.includes("Gateway active guild inventory")) {
    return "gateway-guild-inventory-unavailable";
  }
  if (value.message.includes("Gateway guild reconciliation inventory")) {
    return "gateway-guild-inventory-invalid";
  }
  if (value.message.toLowerCase().includes("subrequest")) {
    return "subrequest-limit";
  }
  if (value.message.includes("RPC")) return "rpc-error";
  return "unexpected";
}

export { GatewayCoordinator, GatewayPartition, GatewayStatusService };
export type { GatewayEnv, GatewayFaultResult, GatewayStatus };

function jsonResponse(value: GatewayBoundaryInput, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function gatewayMode(env: GatewayEnv): "single" | "fleet" {
  const mode = GatewayModeSchema.safeParse(env.GATEWAY_MODE);
  if (!mode.success) {
    throw new Error("Gateway mode is invalid");
  }
  return mode.data;
}

function fleetConnectionCapacity(env: GatewayEnv): number {
  const capacity = Number(env.GATEWAY_FLEET_CONNECTION_CAPACITY);
  if (
    !/^[1-9][0-9]*$/.test(env.GATEWAY_FLEET_CONNECTION_CAPACITY) ||
    !Number.isSafeInteger(capacity)
  ) {
    throw new Error("Gateway fleet connection capacity is invalid");
  }
  return capacity;
}

async function inspectFleetConnections(env: GatewayEnv) {
  const coordinator = env.GATEWAY_COORDINATOR.getByName(
    GATEWAY_COORDINATOR_NAME,
  );
  const fleet = await coordinator.fleetStatus();
  const generation = fleet.targetGeneration ?? fleet.activeGeneration;
  const shardCount = fleet.targetShardCount ?? fleet.activeShardCount;
  if (generation === null || shardCount === 0) {
    return { fleet, partitions: [] };
  }
  const assignments = gatewayPartitionAssignments(
    shardCount,
    fleetConnectionCapacity(env),
  );
  const statuses = await Promise.all(
    assignments.map((assignment) =>
      env.GATEWAY_PARTITION.getByName(assignment.partitionName).fleetStatus(),
    ),
  );
  return {
    fleet,
    partitions: assignments.map((assignment, index) => ({
      partitionName: assignment.partitionName,
      expectedShardCount: assignment.shardCount,
      connections: (statuses[index]?.connections ?? []).filter(
        (connection) =>
          connection.shardGeneration === generation &&
          connection.shardCount === shardCount &&
          connection.shardId >= assignment.firstShardId &&
          connection.shardId <= assignment.lastShardId,
      ),
    })),
  };
}

function partitionCapacity(env: GatewayEnv): number {
  const capacity = Number(env.GATEWAY_PARTITION_CAPACITY);
  if (
    !/^[1-9][0-9]*$/.test(env.GATEWAY_PARTITION_CAPACITY) ||
    !Number.isSafeInteger(capacity)
  ) {
    throw new Error("Gateway partition capacity is invalid");
  }
  return capacity;
}

function isValidEnvironment(env: GatewayEnv): boolean {
  try {
    allowedGatewayHostname(env);
    discordGatewayBotUrl(env);
    gatewayMode(env);
    fleetConnectionCapacity(env);
    partitionCapacity(env);
  } catch {
    return false;
  }
  return (
    SNOWFLAKE.test(env.DISCORD_APPLICATION_ID) &&
    isWorkerSecretSource(env.DISCORD_BOT_TOKEN) &&
    isWorkerSecretSource(env.GATEWAY_CONTROL_TOKEN) &&
    DiscordRestBindingSchema.safeParse(env.DISCORD_REST).success
  );
}

async function persistAudienceSnapshot(
  env: GatewayEnv,
  capture: DiscordAudienceCaptureV1,
): Promise<void> {
  const response = await env.DATA_SERVICE.fetch(
    new Request("https://data.internal/internal/audience-snapshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(capture),
    }),
  );
  const value = AudiencePersistenceResponseSchema.safeParse(
    await response.json(),
  );
  if (!value.success) {
    throw new Error("Audience snapshot persistence failed");
  }
  parseDiscordAudienceSnapshotV1(value.data.snapshot);
}

async function captureAudienceSnapshot(env: GatewayEnv): Promise<void> {
  const fleet = await env.GATEWAY_COORDINATOR.getByName(
    GATEWAY_COORDINATOR_NAME,
  ).fleetStatus();
  if (
    fleet.activeGeneration === null ||
    fleet.activeShardCount === 0 ||
    fleet.readyShardCount !== fleet.activeShardCount
  ) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Audience snapshot capture skipped",
        reason: "inactive-fleet",
        phase: fleet.phase,
        activeShardCount: fleet.activeShardCount,
        readyShardCount: fleet.readyShardCount,
      }),
    );
    return;
  }
  const capture = await env.DISCORD_REST.captureAudienceSnapshotV1({
    shardCount: fleet.activeShardCount,
  });
  await persistAudienceSnapshot(env, capture);
  console.log(
    JSON.stringify({
      level: "info",
      message: "Audience snapshot capture completed",
      liveGuilds: capture.liveGuilds,
      estimatedGuildMemberships: capture.estimatedGuildMemberships,
      shardCount: capture.shardCount,
    }),
  );
}

async function reportBotListStats(env: GatewayEnv): Promise<void> {
  if (gatewayMode(env) !== "fleet") {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Bot list statistics report skipped",
        reason: "gateway-mode",
      }),
    );
    return;
  }
  let fleet;
  try {
    fleet = await env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    ).fleetStatus();
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Bot list fleet status failed",
      }),
    );
    throw new Error("Bot list fleet status failed");
  }
  if (
    fleet.activeGeneration === null ||
    fleet.activeShardCount === 0 ||
    fleet.readyShardCount !== fleet.activeShardCount
  ) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Bot list statistics report skipped",
        reason: "inactive-fleet",
        phase: fleet.phase,
        activeShardCount: fleet.activeShardCount,
        readyShardCount: fleet.readyShardCount,
      }),
    );
    return;
  }

  let result: Awaited<
    ReturnType<GatewayEnv["DISCORD_REST"]["reportBotListStatsV1"]>
  >;
  try {
    result = await env.DISCORD_REST.reportBotListStatsV1({
      shardCount: fleet.activeShardCount,
    });
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Bot list statistics report failed",
      }),
    );
    throw new Error("Bot list statistics report failed");
  }
  const {
    status,
    topggHttpStatus,
    discordBotListHttpStatus,
    ...capture
  } = result;
  try {
    await persistAudienceSnapshot(env, capture);
  } catch {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Audience snapshot persistence failed",
      }),
    );
    throw new Error("Audience snapshot persistence failed");
  }
  const log = {
    level: status === "failed" ? "error" : "info",
    message: "Bot list statistics report completed",
    status,
    liveGuilds: capture.liveGuilds,
    estimatedGuildMemberships: capture.estimatedGuildMemberships,
    shardCount: capture.shardCount,
    topggHttpStatus,
    discordBotListHttpStatus,
  };
  if (status === "failed") {
    console.error(JSON.stringify(log));
    throw new Error("Bot list statistics report failed");
  }
  console.log(JSON.stringify(log));
}

async function isAuthorized(request: Request, expectedToken: string): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  if (authorization === null || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const providedToken = authorization.slice("Bearer ".length);
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(providedToken)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expectedToken)),
  ]);
  return crypto.subtle.timingSafeEqual(providedDigest, expectedDigest);
}

async function callPartition(
  env: GatewayEnv,
  operation: "start" | "status" | "stop",
): Promise<GatewayStatus> {
  const partition = env.GATEWAY_PARTITION.getByName(GATEWAY_PARTITION_NAME);
  return partition[operation]();
}

async function injectFault(
  env: GatewayEnv,
  operation: "reconnect" | "reidentify",
): Promise<GatewayFaultResult> {
  const partition = env.GATEWAY_PARTITION.getByName(GATEWAY_PARTITION_NAME);
  return operation === "reconnect"
    ? partition.forceReconnect()
    : partition.forceReidentify();
}

async function integerControlInput(
  request: Request,
  field: string,
  minimum: number,
  maximum: number,
  errorMessage: string,
): Promise<number> {
  let value: GatewayBoundaryInput;
  try {
    value = await request.json();
  } catch {
    throw new GatewayControlInputError(errorMessage);
  }
  const schema = z.strictObject({
    [field]: NonNegativeSafeIntegerSchema.min(minimum).max(maximum),
  });
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new GatewayControlInputError(errorMessage);
  }
  const input = Object.values(result.data)[0];
  if (input === undefined) {
    throw new GatewayControlInputError(errorMessage);
  }
  return input;
}

async function guildReconciliationConfirmation(
  request: Request,
): Promise<GuildReconciliationConfirmation> {
  let value: GatewayBoundaryInput;
  try {
    value = await request.json();
  } catch {
    throw new GatewayControlInputError("Guild reconciliation confirmation is invalid");
  }
  const result = GuildReconciliationConfirmationSchema.safeParse(value);
  if (
    !result.success ||
    result.data.generation < 1 ||
    result.data.shardCount < 1 ||
    result.data.expectedGuildCount < 1
  ) {
    throw new GatewayControlInputError("Guild reconciliation confirmation is invalid");
  }
  return result.data;
}

function forcedRecommendation(
  request: Request,
  maximumShardCount: number,
): Promise<number> {
  return integerControlInput(
    request,
    "shardCount",
    1,
    maximumShardCount,
    "Forced Gateway recommendation is invalid",
  );
}

function forcedTargetFailure(request: Request): Promise<number> {
  return integerControlInput(
    request,
    "shardId",
    0,
    Number.MAX_SAFE_INTEGER,
    "Forced target shard failure is invalid",
  );
}

async function applyRecommendation(
  env: GatewayEnv,
  forcedShardCount: number | null,
): Promise<{
  recommendation: RecommendationCheckResult | { outcome: "stopped" };
  gateway: GatewayStatus;
}> {
  const partition = env.GATEWAY_PARTITION.getByName(GATEWAY_PARTITION_NAME);
  const initialGateway = await partition.initializeControlPlane();
  if (initialGateway.state === "stopped") {
    return {
      recommendation: { outcome: "stopped" },
      gateway: initialGateway,
    };
  }
  const coordinator = env.GATEWAY_COORDINATOR.getByName(
    GATEWAY_COORDINATOR_NAME,
  );
  const capacity = partitionCapacity(env);
  const recommendation =
    forcedShardCount === null
      ? await coordinator.checkRecommendation(capacity)
      : await coordinator.forceRecommendation(capacity, forcedShardCount);
  let gateway = initialGateway;
  if (recommendation.outcome === "planned") {
    gateway = await partition.applyGenerationPlan(recommendation.plan);
  } else if (recommendation.outcome === "no-change" && gateway.state === "idle") {
    gateway = await partition.start();
  }
  return { recommendation, gateway };
}

async function runScheduledRecommendation(env: GatewayEnv): Promise<void> {
  if (gatewayMode(env) !== "fleet") {
    await applyRecommendation(env, null);
    return;
  }
  const coordinator = env.GATEWAY_COORDINATOR.getByName(
    GATEWAY_COORDINATOR_NAME,
  );
  const result = await coordinator.reconcileFleetRecommendation(
    fleetConnectionCapacity(env),
  );
  const status = await coordinator.status();
  console.log(
    JSON.stringify({
      level: "info",
      message: "Scheduled Gateway recommendation check completed",
      outcome: result.outcome,
      phase: result.fleet.phase,
      activeGeneration: result.fleet.activeGeneration,
      activeShardCount: result.fleet.activeShardCount,
      readyShardCount: result.fleet.readyShardCount,
      targetGeneration: result.fleet.targetGeneration,
      targetShardCount: result.fleet.targetShardCount,
      recommendedShardCount: status.identify?.recommendedShards ?? null,
      recommendationObservedAt: status.identify?.observedAt ?? null,
      identifyRemaining: status.identify?.remaining ?? null,
      identifyResetAt: status.identify?.resetAt ?? null,
      identifyMaxConcurrency: status.identify?.maxConcurrency ?? null,
    }),
  );
}

const gatewayWorker = {
  scheduled(
    controller: ScheduledController,
    env: GatewayEnv,
    ctx: ExecutionContext,
  ): void {
    if (!isValidEnvironment(env)) {
      throw new Error("Gateway is not configured");
    }
    if (controller.cron === BOT_LIST_STATS_CRON) {
      ctx.waitUntil(reportBotListStats(env));
      return;
    }
    if (controller.cron === AUDIENCE_SNAPSHOT_CRON) {
      ctx.waitUntil(captureAudienceSnapshot(env));
      return;
    }
    if (controller.cron !== GATEWAY_RECOMMENDATION_CRON) {
      throw new Error("Gateway scheduled trigger is not configured");
    }
    ctx.waitUntil(
      runScheduledRecommendation(env).catch(() => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Scheduled Gateway recommendation check failed",
          }),
        );
      }),
    );
  },

  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "dice-witch-gateway" });
    }
    if (!isValidEnvironment(env)) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Gateway environment validation failed",
        }),
      );
      return jsonResponse({ error: "Gateway is not configured" }, 503);
    }
    let controlToken: string;
    try {
      [, controlToken] = await Promise.all([
        discordBotToken(env),
        gatewayControlToken(env),
      ]);
    } catch {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Gateway secret validation failed",
        }),
      );
      return jsonResponse({ error: "Gateway is not configured" }, 503);
    }
    if (!(await isAuthorized(request, controlToken))) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let requestedMode: "single" | "fleet" | null = null;
    let operation:
      | "start"
      | "status"
      | "fleet-inspection"
      | "fleet-connections"
      | "stop"
      | "reconnect"
      | "reidentify"
      | "coordinator-status"
      | "recommendation-check"
      | "recommendation-force"
      | "target-failure"
      | "guild-observation"
      | "guild-reconciliation"
      | "fleet-shard-reidentify"
      | null = null;
    let fleetShardId: number | null = null;
    const modeControl = /^\/gateway\/(single|fleet)\/(start|stop)$/.exec(
      url.pathname,
    );
    if (request.method === "POST" && modeControl !== null) {
      const mode = GatewayModeSchema.safeParse(modeControl[1]);
      const modeOperation = GatewayModeOperationSchema.safeParse(modeControl[2]);
      if (!mode.success || !modeOperation.success) {
        throw new Error("Gateway mode control route is invalid");
      }
      requestedMode = mode.data;
      operation = modeOperation.data;
    } else if (request.method === "POST" && url.pathname === "/gateway/start") {
      operation = "start";
    } else if (
      request.method === "GET" &&
      url.pathname === "/gateway/status"
    ) {
      operation = "status";
    } else if (
      request.method === "GET" &&
      url.pathname === "/gateway/fleet/status"
    ) {
      operation = "fleet-inspection";
    } else if (
      request.method === "GET" &&
      url.pathname === "/gateway/fleet/connections"
    ) {
      operation = "fleet-connections";
    } else if (
      request.method === "POST" &&
      url.pathname === "/gateway/stop"
    ) {
      operation = "stop";
    } else if (
      request.method === "POST" &&
      url.pathname === "/gateway/fault/reconnect"
    ) {
      operation = "reconnect";
    } else if (
      request.method === "POST" &&
      url.pathname === "/gateway/fault/reidentify"
    ) {
      operation = "reidentify";
    } else if (
      request.method === "GET" &&
      url.pathname === "/gateway/coordinator/status"
    ) {
      operation = "coordinator-status";
    } else if (
      request.method === "POST" &&
      url.pathname === "/gateway/recommendation/check"
    ) {
      operation = "recommendation-check";
    } else if (
      request.method === "POST" &&
      url.pathname === "/gateway/fault/recommendation"
    ) {
      operation = "recommendation-force";
    } else if (
      request.method === "POST" &&
      url.pathname === "/gateway/fault/target-failure"
    ) {
      operation = "target-failure";
    } else if (
      request.method === "GET" &&
      url.pathname === "/gateway/reconciliation/observe"
    ) {
      operation = "guild-observation";
    } else if (
      request.method === "POST" &&
      url.pathname === "/gateway/reconciliation/run"
    ) {
      operation = "guild-reconciliation";
    } else if (
      request.method === "POST" &&
      /^\/gateway\/fleet\/shards\/[0-9]+\/reidentify$/.test(url.pathname)
    ) {
      operation = "fleet-shard-reidentify";
      fleetShardId = Number(url.pathname.split("/")[4]);
    }
    if (operation === null) return jsonResponse({ error: "Not found" }, 404);

    try {
      if (requestedMode !== null && requestedMode !== gatewayMode(env)) {
        return jsonResponse({ error: "Gateway mode does not match" }, 409);
      }
      if (gatewayMode(env) === "fleet") {
        const coordinator = env.GATEWAY_COORDINATOR.getByName(
          GATEWAY_COORDINATOR_NAME,
        );
        if (operation === "status") {
          return jsonResponse(await coordinator.fleetStatus());
        }
        if (operation === "fleet-inspection") {
          return jsonResponse(await coordinator.inspectFleet());
        }
        if (operation === "fleet-connections") {
          return jsonResponse(await inspectFleetConnections(env));
        }
        if (operation === "guild-observation") {
          const inventory = await coordinator.activeGuildInventory();
          return jsonResponse({
            generation: inventory.generation,
            shardCount: inventory.shardCount,
            observedGuildCount: inventory.guildIds.length,
            shards: inventory.shards,
          });
        }
        if (operation === "guild-reconciliation") {
          const confirmation = await guildReconciliationConfirmation(request);
          const occurredAt = Date.now();
          const inventory = await coordinator.activeGuildInventory();
          if (
            inventory.generation !== confirmation.generation ||
            inventory.shardCount !== confirmation.shardCount ||
            inventory.guildIds.length !== confirmation.expectedGuildCount ||
            inventory.shards.some(
              ({ capturedAt }) =>
                capturedAt < confirmation.minimumCapturedAt,
            )
          ) {
            throw new GatewayControlInputError(
              "Guild reconciliation confirmation does not match inventory",
            );
          }
          return jsonResponse(
            await reconcileGuildInventory(env, inventory, occurredAt),
          );
        }
        if (operation === "fleet-shard-reidentify") {
          if (fleetShardId === null) {
            throw new GatewayControlInputError("Shard id is invalid");
          }
          const result = await coordinator.forceActiveShardReidentify(
            fleetShardId,
          );
          return jsonResponse(result, result.accepted ? 200 : 409);
        }
        if (operation === "coordinator-status") {
          return jsonResponse(await coordinator.status());
        }
        if (operation === "start") {
          return jsonResponse(
            await coordinator.startFleetRecommendations(
              fleetConnectionCapacity(env),
            ),
          );
        }
        if (operation === "stop") {
          return jsonResponse(await coordinator.stopFleet());
        }
        if (operation === "recommendation-check") {
          return jsonResponse(
            await coordinator.reconcileFleetRecommendation(
              fleetConnectionCapacity(env),
            ),
          );
        }
        return jsonResponse(
          { error: "Gateway operation is unavailable in fleet mode" },
          409,
        );
      }
      if (
        operation === "fleet-inspection" ||
        operation === "fleet-connections" ||
        operation === "guild-observation" ||
        operation === "guild-reconciliation" ||
        operation === "fleet-shard-reidentify"
      ) {
        return jsonResponse(
          { error: "Gateway operation is unavailable in single mode" },
          409,
        );
      }
      if (operation === "coordinator-status") {
        const coordinator = env.GATEWAY_COORDINATOR.getByName(
          GATEWAY_COORDINATOR_NAME,
        );
        return jsonResponse(await coordinator.status());
      }
      if (operation === "reconnect" || operation === "reidentify") {
        const result = await injectFault(env, operation);
        return jsonResponse(result, result.accepted ? 200 : 409);
      }
      if (operation === "recommendation-check") {
        return jsonResponse(await applyRecommendation(env, null));
      }
      if (operation === "recommendation-force") {
        return jsonResponse(
          await applyRecommendation(
            env,
            await forcedRecommendation(request, partitionCapacity(env)),
          ),
        );
      }
      if (operation === "target-failure") {
        const partition = env.GATEWAY_PARTITION.getByName(GATEWAY_PARTITION_NAME);
        return jsonResponse(
          await partition.forceTargetFailure(
            await forcedTargetFailure(request),
          ),
        );
      }
      return jsonResponse(await callPartition(env, operation));
    } catch (error) {
      if (error instanceof GatewayControlInputError) {
        return jsonResponse({ error: error.message }, 400);
      }
      console.error(
        JSON.stringify({
          level: "error",
          message: "Gateway control operation failed",
          operation,
          errorClass: classifyGatewayControlError(error),
        }),
      );
      return jsonResponse({ error: "Gateway operation failed" }, 502);
    }
  },
} satisfies ExportedHandler<GatewayEnv>;

export default gatewayWorker;
