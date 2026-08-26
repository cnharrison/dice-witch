import { env as runtimeEnv } from "cloudflare:workers";
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { parseDiscordAudienceCaptureV1 } from "../../packages/discord-contracts/src";
import gatewayWorker, {
  AUDIENCE_SNAPSHOT_CRON,
  BOT_LIST_STATS_CRON,
  GATEWAY_RECOMMENDATION_CRON,
  type GatewayEnv,
  type GatewayFaultResult,
  type GatewayStatus,
} from "../../workers/gateway/src/index";
import type {
  GatewayFleetStatus,
  RecommendationCheckResult,
} from "../../workers/gateway/src/gateway-coordinator";
import type { GatewayShardStatus } from "../../workers/gateway/src/gateway-shard-connection";

const controlToken = "gateway-control-token-at-least-32-characters";
const shardStatus: GatewayShardStatus = {
  state: "ready",
  connectionMode: "resume",
  activationId: "00000000-0000-4000-8000-000000000001",
  shardGeneration: 1,
  shardId: 0,
  shardCount: 1,
  sequence: 12,
  sessionEstablished: true,
  lastDispatchAt: 1_720_000_000_000,
  lastHeartbeatSentAt: 1_720_000_001_000,
  lastHeartbeatAckAt: 1_720_000_001_100,
  readyAt: 1_720_000_000_000,
  lastEventType: "READY",
  lastError: null,
  interactionResponses: 0,
  identifyAttempts: 1,
  resumeAttempts: 2,
  readyEvents: 1,
  resumedEvents: 2,
  forcedReconnects: 1,
  forcedReidentifies: 0,
  ownershipAcquired: true,
  identifyPermitRequests: 2,
  identifyPermitsGranted: 1,
  identifyPermitDenials: 1,
  lastIdentifyPermit: {
    granted: true,
    rateLimitKey: 0,
    maxConcurrency: 1,
    remaining: 996,
    resetAt: 1_720_086_400_000,
    retryAt: null,
    reason: null,
  },
  initialGuildsPending: 0,
  initialGuildsRequiringSync: 0,
  guildInventoryComplete: true,
  guildInventoryCount: 1,
  guildInventoryCapturedAt: 1_720_000_000_000,
};
const status: GatewayStatus = {
  ...shardStatus,
  generation: {
    phase: "idle",
    activeGeneration: 1,
    activeShardCount: 1,
    targetGeneration: null,
    targetShardCount: null,
  },
  shards: [shardStatus],
  targetShards: [],
  rejectedDispatches: 0,
};

function environment() {
  const stub = {
    initializeControlPlane: vi.fn(() => Promise.resolve(status)),
    start: vi.fn(() => Promise.resolve(status)),
    status: vi.fn(() => Promise.resolve(status)),
    stop: vi.fn(() =>
      Promise.resolve({ ...status, state: "stopped" as const }),
    ),
    forceReconnect: vi.fn(
      (): Promise<GatewayFaultResult> =>
        Promise.resolve({ accepted: true, status }),
    ),
    forceReidentify: vi.fn(
      (): Promise<GatewayFaultResult> =>
        Promise.resolve({ accepted: true, status }),
    ),
    applyGenerationPlan: vi.fn(() => Promise.resolve(status)),
    forceTargetFailure: vi.fn(() => Promise.resolve(status)),
    fleetStatus: vi.fn(() =>
      Promise.resolve({
        activeGeneration: 1,
        activeShardCount: 24,
        connections: [shardStatus],
      }),
    ),
  };
  const recommendationPlan = {
    currentGeneration: 1,
    currentShardCount: 1,
    targetGeneration: 2,
    targetShardCount: 2,
    identifyWaves: [[0], [1]],
  };
  const fleetStatus = {
    phase: "idle" as const,
    activeGeneration: 1,
    activeShardCount: 24,
    nextGeneration: 2,
    targetGeneration: null,
    targetShardCount: null,
    readyShardCount: 24,
    partitionCount: 1,
  };
  const coordinator = {
    status: vi.fn(() =>
      Promise.resolve({
        ownerships: [
          {
            generation: 1,
            shardId: 0,
            shardCount: 1,
            ownerId: "development-shard-0",
            acquiredAt: 1_720_000_000_000,
          },
        ],
        identify: {
          total: 1_000,
          remaining: 990,
          resetAt: 1_720_086_400_000,
          maxConcurrency: 1,
          recommendedShards: 24,
          observedAt: 1_720_000_000_000,
        },
      }),
    ),
    checkRecommendation: vi.fn<() => Promise<RecommendationCheckResult>>(() =>
      Promise.resolve({ outcome: "no-change" }),
    ),
    forceRecommendation: vi.fn(() =>
      Promise.resolve({
        outcome: "planned" as const,
        plan: recommendationPlan,
      }),
    ),
    reconcileFleetRecommendation: vi.fn(() =>
      Promise.resolve({
        outcome: "no-change" as const,
        fleet: fleetStatus,
      }),
    ),
    fleetStatus: vi.fn<() => Promise<GatewayFleetStatus>>(() =>
      Promise.resolve(fleetStatus),
    ),
    activeGuildInventory: vi.fn(() =>
      Promise.resolve({
        generation: 1,
        shardCount: 1,
        guildIds: ["100000000000000001"],
        shards: [{ shardId: 0, guildCount: 1, capturedAt: 100 }],
      }),
    ),
    forceActiveShardReidentify: vi.fn(() =>
      Promise.resolve({ accepted: true, status: shardStatus }),
    ),
    inspectFleet: vi.fn(() =>
      Promise.resolve({
        fleet: fleetStatus,
        partitions: [],
        totals: {
          connectionCount: 24,
          readyConnectionCount: 24,
          sessionEstablishedCount: 24,
          heartbeatAcknowledgedCount: 24,
          ownershipCount: 24,
          identifyAttempts: 24,
          resumeAttempts: 0,
        },
      }),
    ),
    startFleetRecommendations: vi.fn(() =>
      Promise.resolve({ outcome: "no-change" as const, fleet: fleetStatus }),
    ),
    stopFleet: vi.fn(() =>
      Promise.resolve({
        ...fleetStatus,
        phase: "stopped" as const,
        activeGeneration: null,
        activeShardCount: 0,
        readyShardCount: 0,
        partitionCount: 0,
      }),
    ),
  };
  const listCurrentGuildIdsPage = vi.fn(() =>
    Promise.resolve({ guildIds: [], nextAfter: null }),
  );
  const guildCountsByShard = Array.from({ length: 24 }, (_, index) =>
    index === 0 ? 1 : 0,
  );
  const captureAudienceSnapshot = vi.fn<
    GatewayEnv["DISCORD_REST"]["captureAudienceSnapshotV1"]
  >(() =>
    Promise.resolve({
      version: 1 as const,
      capturedAt: 1_720_000_000_000,
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      shardCount: 24,
      guildCountsByShard,
    }),
  );
  const reportBotListStats = vi.fn<
    GatewayEnv["DISCORD_REST"]["reportBotListStatsV1"]
  >(() =>
    Promise.resolve({
      status: "reported" as const,
      version: 1 as const,
      capturedAt: 1_720_000_000_000,
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      shardCount: 24,
      guildCountsByShard,
      topggHttpStatus: 200,
      discordBotListHttpStatus: 200,
    }),
  );
  const dataServiceFetch = vi.fn(async (request: Request) => {
    if (new URL(request.url).pathname === "/internal/audience-snapshot") {
      const capture = parseDiscordAudienceCaptureV1(
        await request.clone().json(),
      );
      return Response.json({
        status: "applied",
        snapshot: { ...capture, knownDiceWitchUsers: 7 },
      });
    }
    return Response.json({
      status: "applied",
      activatedCount: 0,
      deactivatedCount: 0,
    });
  });
  const bindings = {
    DISCORD_APPLICATION_ID: "100000000000000001",
    DISCORD_TEST_GUILD_ID: "100000000000000002",
    DISCORD_GATEWAY_BOT_URL: "https://discord.com/api/v10/gateway/bot",
    DISCORD_BOT_TOKEN:
      "development-token-first-part.second.development-token-third-part",
    GATEWAY_CONTROL_TOKEN: controlToken,
    GATEWAY_MODE: "single",
    GATEWAY_ALLOWED_HOSTNAME: "gateway.discord.gg",
    GATEWAY_PARTITION_CAPACITY: "2",
    GATEWAY_FLEET_CONNECTION_CAPACITY: "24",
    GATEWAY_PARTITION: {
      getByName: vi.fn(() => stub),
    },
    GATEWAY_COORDINATOR: {
      getByName: vi.fn(() => coordinator),
    },
    ROLL_WORK: {
      getByName: vi.fn(),
    },
    DISCORD_REST: {
      captureAudienceSnapshotV1: captureAudienceSnapshot,
      listCurrentGuildIdsPage,
      logGuildLifecycle: vi.fn(() =>
        Promise.resolve({ status: "delivered" as const }),
      ),
      reportBotListStats: vi.fn(() =>
        Promise.resolve({
          status: "reported" as const,
          servers: 1,
          users: 42,
          topggHttpStatus: 200,
          discordBotListHttpStatus: 200,
        }),
      ),
      reportBotListStatsV1: reportBotListStats,
    },
    DATA_SERVICE: { fetch: dataServiceFetch },
  };
  const gatewayEnv: GatewayEnv = Object.assign({}, runtimeEnv, bindings);
  return {
    captureAudienceSnapshot,
    coordinator,
    dataServiceFetch,
    env: gatewayEnv,
    listCurrentGuildIdsPage,
    reportBotListStats,
    stub,
  };
}

function request(path: string, method: string, authenticated = false) {
  const init: RequestInit = { method };
  if (authenticated) {
    init.headers = { authorization: `Bearer ${controlToken}` };
  }
  return new Request(`https://gateway.test${path}`, init);
}

function recommendationController() {
  return createScheduledController({
    cron: GATEWAY_RECOMMENDATION_CRON,
    scheduledTime: new Date(1_720_000_000_000),
  });
}

describe("Gateway control Worker", () => {
  it("exposes only a minimal public health response", async () => {
    const { env } = environment();
    const response = await gatewayWorker.fetch(request("/health", "GET"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "dice-witch-gateway",
    });
  });

  it("requires authorization for status and mutations", async () => {
    const { env, stub } = environment();

    for (const [path, method] of [
      ["/gateway/status", "GET"],
      ["/gateway/fleet/status", "GET"],
      ["/gateway/fleet/connections", "GET"],
      ["/gateway/start", "POST"],
      ["/gateway/stop", "POST"],
      ["/gateway/fault/reconnect", "POST"],
      ["/gateway/fault/reidentify", "POST"],
      ["/gateway/coordinator/status", "GET"],
      ["/gateway/recommendation/check", "POST"],
      ["/gateway/fault/recommendation", "POST"],
      ["/gateway/fault/target-failure", "POST"],
      ["/gateway/reconciliation/observe", "GET"],
      ["/gateway/reconciliation/run", "POST"],
      ["/gateway/fleet/shards/0/reidentify", "POST"],
    ] as const) {
      const response = await gatewayWorker.fetch(request(path, method), env);
      expect(response.status).toBe(401);
    }
    expect(stub.start).not.toHaveBeenCalled();
    expect(stub.status).not.toHaveBeenCalled();
    expect(stub.stop).not.toHaveBeenCalled();
    expect(stub.forceReconnect).not.toHaveBeenCalled();
    expect(stub.forceReidentify).not.toHaveBeenCalled();
  });

  it.each([
    ["/gateway/status", "GET", "status"],
    ["/gateway/start", "POST", "start"],
    ["/gateway/stop", "POST", "stop"],
    ["/gateway/fault/reconnect", "POST", "forceReconnect"],
    ["/gateway/fault/reidentify", "POST", "forceReidentify"],
  ] as const)("routes authenticated %s", async (path, method, operation) => {
    const { env, stub } = environment();
    const response = await gatewayWorker.fetch(
      request(path, method, true),
      env,
    );

    expect(response.status).toBe(200);
    const expectedBody = operation.startsWith("force")
      ? { status: { shardId: 0 } }
      : { shardId: 0 };
    await expect(response.json()).resolves.toMatchObject(expectedBody);
    expect(stub[operation]).toHaveBeenCalledOnce();
  });

  it("routes authenticated Coordinator status", async () => {
    const { coordinator, env } = environment();
    const response = await gatewayWorker.fetch(
      request("/gateway/coordinator/status", "GET", true),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ownerships: [{ shardId: 0, ownerId: "development-shard-0" }],
      identify: { recommendedShards: 24, remaining: 990 },
    });
    expect(coordinator.status).toHaveBeenCalledOnce();
  });

  it("reports only the authenticated Gateway guild inventory summary", async () => {
    const { env } = environment();
    env.GATEWAY_MODE = "fleet";

    const response = await gatewayWorker.fetch(
      request("/gateway/reconciliation/observe", "GET", true),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      generation: 1,
      shardCount: 1,
      observedGuildCount: 1,
      shards: [{ shardId: 0, guildCount: 1, capturedAt: 100 }],
    });
  });

  it("runs authenticated guild reconciliation without exposing guild ids", async () => {
    const { env } = environment();
    env.GATEWAY_MODE = "fleet";
    env.DATA_SERVICE.fetch = vi.fn(() =>
      Promise.resolve(
        Response.json({
          status: "applied",
          activatedCount: 3,
          deactivatedCount: 2,
        }),
      ),
    );

    const response = await gatewayWorker.fetch(
      new Request("https://gateway.test/gateway/reconciliation/run", {
        method: "POST",
        headers: {
          authorization: `Bearer ${controlToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          generation: 1,
          shardCount: 1,
          minimumCapturedAt: 100,
          expectedGuildCount: 1,
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "applied",
      observedGuildCount: 1,
      activatedCount: 3,
      deactivatedCount: 2,
    });
  });

  it("reidentifies exactly one authenticated active fleet shard", async () => {
    const { coordinator, env } = environment();
    env.GATEWAY_MODE = "fleet";

    const response = await gatewayWorker.fetch(
      request("/gateway/fleet/shards/7/reidentify", "POST", true),
      env,
    );

    expect(response.status).toBe(200);
    expect(coordinator.forceActiveShardReidentify).toHaveBeenCalledWith(7);
  });

  it("runs the live recommendation check from the scheduled handler", async () => {
    const { coordinator, env, stub } = environment();
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(recommendationController(), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(stub.initializeControlPlane).toHaveBeenCalledOnce();
    expect(coordinator.checkRecommendation).toHaveBeenCalledWith(2);
    expect(stub.applyGenerationPlan).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized cron without mutating the fleet", () => {
    const { coordinator, env } = environment();
    const ctx = createExecutionContext();

    expect(() => {
      gatewayWorker.scheduled(
        createScheduledController({
          cron: "15 * * * *",
          scheduledTime: new Date(1_720_000_000_000),
        }),
        env,
        ctx,
      );
    }).toThrow("Gateway scheduled trigger is not configured");
    expect(coordinator.reconcileFleetRecommendation).not.toHaveBeenCalled();
  });

  it("captures and persists staging audience snapshots without bot-list posts", async () => {
    const {
      captureAudienceSnapshot,
      coordinator,
      dataServiceFetch,
      env,
      reportBotListStats,
    } = environment();
    env.GATEWAY_MODE = "fleet";
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(
      createScheduledController({
        cron: AUDIENCE_SNAPSHOT_CRON,
        scheduledTime: new Date(1_720_000_000_000),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(captureAudienceSnapshot).toHaveBeenCalledWith({ shardCount: 24 });
    expect(reportBotListStats).not.toHaveBeenCalled();
    expect(dataServiceFetch).toHaveBeenCalledOnce();
    expect(coordinator.checkRecommendation).not.toHaveBeenCalled();
  });

  it("reports bot-list statistics and persists the same audience capture", async () => {
    const {
      coordinator,
      dataServiceFetch,
      env,
      reportBotListStats,
      stub,
    } = environment();
    env.GATEWAY_MODE = "fleet";
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(
      createScheduledController({
        cron: BOT_LIST_STATS_CRON,
        scheduledTime: new Date(1_720_000_000_000),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(reportBotListStats).toHaveBeenCalledWith({ shardCount: 24 });
    expect(dataServiceFetch).toHaveBeenCalledOnce();
    const audienceRequest = dataServiceFetch.mock.calls[0]?.[0];
    expect(audienceRequest).toBeInstanceOf(Request);
    expect(new URL(audienceRequest?.url ?? "").pathname).toBe(
      "/internal/audience-snapshot",
    );
    await expect(audienceRequest?.json()).resolves.toMatchObject({
      version: 1,
      capturedAt: 1_720_000_000_000,
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      shardCount: 24,
    });
    expect(coordinator.checkRecommendation).not.toHaveBeenCalled();
    expect(coordinator.reconcileFleetRecommendation).not.toHaveBeenCalled();
    expect(stub.initializeControlPlane).not.toHaveBeenCalled();
  });

  it("persists a successfully captured zero-guild snapshot", async () => {
    const { dataServiceFetch, env, reportBotListStats } = environment();
    env.GATEWAY_MODE = "fleet";
    reportBotListStats.mockResolvedValue({
      status: "skipped",
      version: 1,
      capturedAt: 1_720_000_000_000,
      liveGuilds: 0,
      estimatedGuildMemberships: 0,
      shardCount: 24,
      guildCountsByShard: Array.from({ length: 24 }, () => 0),
      topggHttpStatus: null,
      discordBotListHttpStatus: null,
    });
    const infoLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(
      createScheduledController({
        cron: BOT_LIST_STATS_CRON,
        scheduledTime: new Date(1_720_000_000_000),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(dataServiceFetch).toHaveBeenCalledOnce();
    const request = dataServiceFetch.mock.calls[0]?.[0];
    await expect(request?.json()).resolves.toMatchObject({ liveGuilds: 0 });
    infoLog.mockRestore();
  });

  it("does not report bot-list statistics while fleet ownership is stopped", async () => {
    const { coordinator, env, reportBotListStats } = environment();
    env.GATEWAY_MODE = "fleet";
    coordinator.fleetStatus.mockResolvedValue({
      phase: "stopped",
      activeGeneration: null,
      activeShardCount: 0,
      nextGeneration: 2,
      targetGeneration: null,
      targetShardCount: null,
      readyShardCount: 0,
      partitionCount: 0,
    });
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(
      createScheduledController({
        cron: BOT_LIST_STATS_CRON,
        scheduledTime: new Date(1_720_000_000_000),
      }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(reportBotListStats).not.toHaveBeenCalled();
  });

  it("fails the bot-list Cron visibly when either listing rejects the report", async () => {
    const { env, reportBotListStats } = environment();
    env.GATEWAY_MODE = "fleet";
    reportBotListStats.mockResolvedValue({
      status: "failed",
      version: 1,
      capturedAt: 1_720_000_000_000,
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      shardCount: 24,
      guildCountsByShard: Array.from({ length: 24 }, (_, index) =>
        index === 0 ? 1 : 0,
      ),
      topggHttpStatus: 429,
      discordBotListHttpStatus: null,
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(
      createScheduledController({
        cron: BOT_LIST_STATS_CRON,
        scheduledTime: new Date(1_720_000_000_000),
      }),
      env,
      ctx,
    );
    await expect(waitOnExecutionContext(ctx)).rejects.toThrow(
      "Bot list statistics report failed",
    );
    expect(errorLog).toHaveBeenCalledOnce();
    expect(errorLog.mock.calls[0]?.[0]).toContain('"topggHttpStatus":429');
    errorLog.mockRestore();
  });

  it("sanitizes a rejected bot-list service call", async () => {
    const { env, reportBotListStats } = environment();
    env.GATEWAY_MODE = "fleet";
    reportBotListStats.mockRejectedValue(
      new Error("fixture failure containing a listing token"),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(
      createScheduledController({
        cron: BOT_LIST_STATS_CRON,
        scheduledTime: new Date(1_720_000_000_000),
      }),
      env,
      ctx,
    );
    await expect(waitOnExecutionContext(ctx)).rejects.toThrow(
      "Bot list statistics report failed",
    );
    expect(errorLog).toHaveBeenCalledWith(
      JSON.stringify({
        level: "error",
        message: "Bot list statistics report failed",
      }),
    );
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("listing token");
    errorLog.mockRestore();
  });

  it("runs fleet recommendation without destructive guild reconciliation", async () => {
    const {
      coordinator,
      dataServiceFetch,
      env,
      listCurrentGuildIdsPage,
      stub,
    } = environment();
    env.GATEWAY_MODE = "fleet";
    const infoLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(recommendationController(), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(coordinator.reconcileFleetRecommendation).toHaveBeenCalledWith(24);
    expect(listCurrentGuildIdsPage).not.toHaveBeenCalled();
    expect(dataServiceFetch).not.toHaveBeenCalled();
    expect(stub.initializeControlPlane).not.toHaveBeenCalled();
    expect(infoLog).toHaveBeenCalledWith(
      expect.stringContaining('"recommendedShardCount":24'),
    );
    expect(infoLog).toHaveBeenCalledWith(
      expect.stringContaining('"activeShardCount":24'),
    );
    infoLog.mockRestore();
  });

  it("routes authenticated fleet lifecycle controls without using the single partition", async () => {
    const { coordinator, env, stub } = environment();
    env.GATEWAY_MODE = "fleet";

    for (const [path, method] of [
      ["/gateway/status", "GET"],
      ["/gateway/fleet/status", "GET"],
      ["/gateway/fleet/connections", "GET"],
      ["/gateway/coordinator/status", "GET"],
      ["/gateway/start", "POST"],
      ["/gateway/stop", "POST"],
      ["/gateway/recommendation/check", "POST"],
    ] as const) {
      const response = await gatewayWorker.fetch(
        request(path, method, true),
        env,
      );
      expect(response.status).toBe(200);
    }

    expect(coordinator.fleetStatus).toHaveBeenCalledTimes(2);
    expect(coordinator.inspectFleet).toHaveBeenCalledOnce();
    expect(coordinator.status).toHaveBeenCalledOnce();
    expect(coordinator.startFleetRecommendations).toHaveBeenCalledWith(24);
    expect(coordinator.stopFleet).toHaveBeenCalledOnce();
    expect(coordinator.reconcileFleetRecommendation).toHaveBeenCalledWith(24);
    expect(stub.status).not.toHaveBeenCalled();
    expect(stub.fleetStatus).toHaveBeenCalledOnce();
    expect(stub.start).not.toHaveBeenCalled();
    expect(stub.stop).not.toHaveBeenCalled();
  });

  it("fails closed when a mode-qualified control reaches the wrong version", async () => {
    const { coordinator, env, stub } = environment();
    env.GATEWAY_MODE = "fleet";

    const mismatch = await gatewayWorker.fetch(
      request("/gateway/single/start", "POST", true),
      env,
    );
    const matched = await gatewayWorker.fetch(
      request("/gateway/fleet/start", "POST", true),
      env,
    );

    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toEqual({
      error: "Gateway mode does not match",
    });
    expect(matched.status).toBe(200);
    expect(coordinator.startFleetRecommendations).toHaveBeenCalledOnce();
    expect(stub.start).not.toHaveBeenCalled();
  });

  it("rejects single-partition fault controls in fleet mode", async () => {
    const { env, stub } = environment();
    env.GATEWAY_MODE = "fleet";
    const response = await gatewayWorker.fetch(
      request("/gateway/fault/reconnect", "POST", true),
      env,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Gateway operation is unavailable in fleet mode",
    });
    expect(stub.forceReconnect).not.toHaveBeenCalled();
  });

  it("automatically starts an idle recommended generation", async () => {
    const { coordinator, env, stub } = environment();
    stub.initializeControlPlane.mockResolvedValue({ ...status, state: "idle" });
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(recommendationController(), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(coordinator.checkRecommendation).toHaveBeenCalledWith(2);
    expect(stub.start).toHaveBeenCalledOnce();
  });

  it("does not restart an operator-stopped Gateway from the scheduler", async () => {
    const { coordinator, env, stub } = environment();
    stub.initializeControlPlane.mockResolvedValue({
      ...status,
      state: "stopped",
    });
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(recommendationController(), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(coordinator.checkRecommendation).not.toHaveBeenCalled();
    expect(stub.start).not.toHaveBeenCalled();
    expect(stub.applyGenerationPlan).not.toHaveBeenCalled();
  });

  it("automatically applies a scheduled shard increase", async () => {
    const { coordinator, env, stub } = environment();
    coordinator.checkRecommendation.mockResolvedValue({
      outcome: "planned",
      plan: {
        currentGeneration: 1,
        currentShardCount: 1,
        targetGeneration: 2,
        targetShardCount: 2,
        identifyWaves: [[0], [1]],
      },
    });
    const ctx = createExecutionContext();

    gatewayWorker.scheduled(recommendationController(), env, ctx);
    await waitOnExecutionContext(ctx);

    expect(stub.applyGenerationPlan).toHaveBeenCalledOnce();
  });

  it("checks live recommendations without starting an unchanged generation", async () => {
    const { coordinator, env, stub } = environment();
    const response = await gatewayWorker.fetch(
      request("/gateway/recommendation/check", "POST", true),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      recommendation: { outcome: "no-change" },
      gateway: { state: "ready" },
    });
    expect(coordinator.checkRecommendation).toHaveBeenCalledWith(2);
    expect(stub.applyGenerationPlan).not.toHaveBeenCalled();
  });

  it("applies a validated forced recommendation", async () => {
    const { coordinator, env, stub } = environment();
    const forceRequest = new Request(
      "https://gateway.test/gateway/fault/recommendation",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${controlToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ shardCount: 2 }),
      },
    );

    const response = await gatewayWorker.fetch(forceRequest, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      recommendation: {
        outcome: "planned",
        plan: { targetGeneration: 2, targetShardCount: 2 },
      },
    });
    expect(coordinator.forceRecommendation).toHaveBeenCalledWith(2, 2);
    expect(stub.applyGenerationPlan).toHaveBeenCalledOnce();
  });

  it("rejects a forced recommendation above measured capacity", async () => {
    const { coordinator, env, stub } = environment();
    const invalidRequest = new Request(
      "https://gateway.test/gateway/fault/recommendation",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${controlToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ shardCount: 3 }),
      },
    );

    const response = await gatewayWorker.fetch(invalidRequest, env);

    expect(response.status).toBe(400);
    expect(coordinator.forceRecommendation).not.toHaveBeenCalled();
    expect(stub.applyGenerationPlan).not.toHaveBeenCalled();
  });

  it("routes a validated target-generation failure", async () => {
    const { env, stub } = environment();
    const failureRequest = new Request(
      "https://gateway.test/gateway/fault/target-failure",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${controlToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ shardId: 1 }),
      },
    );

    const response = await gatewayWorker.fetch(failureRequest, env);

    expect(response.status).toBe(200);
    expect(stub.forceTargetFailure).toHaveBeenCalledWith(1);
  });

  it("returns conflict when a fault cannot be injected safely", async () => {
    const { env, stub } = environment();
    stub.forceReconnect.mockResolvedValue({
      accepted: false,
      reason: "gateway-not-ready",
      status: { ...status, state: "backing-off" },
    });

    const response = await gatewayWorker.fetch(
      request("/gateway/fault/reconnect", "POST", true),
      env,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      accepted: false,
      reason: "gateway-not-ready",
      status: { state: "backing-off" },
    });
  });

  it("fails closed when required secrets or identifiers are invalid", async () => {
    const { env } = environment();
    const invalidEnv = {
      ...env,
      GATEWAY_CONTROL_TOKEN: "short",
    } satisfies GatewayEnv;
    const response = await gatewayWorker.fetch(
      request("/gateway/status", "GET", true),
      invalidEnv,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Gateway is not configured",
    });
  });

  it("rejects unknown routes and methods", async () => {
    const { env } = environment();
    const missing = await gatewayWorker.fetch(
      request("/missing", "GET", true),
      env,
    );
    const wrongMethod = await gatewayWorker.fetch(
      request("/gateway/start", "GET", true),
      env,
    );

    expect(missing.status).toBe(404);
    expect(wrongMethod.status).toBe(404);
  });
});
