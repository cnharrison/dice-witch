import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGenerationMachine,
  transitionGeneration,
} from "../../packages/gateway-protocol/src";
import { GatewayCoordinator } from "../../workers/gateway/src/gateway-coordinator";
import type { GatewayEnv } from "../../workers/gateway/src/index";
import { gatewayTestEnv as gatewayEnv } from "./test-environment";

function gatewayBotResponse(
  remaining = 997,
  maxConcurrency = 1,
  shards = 23,
): Response {
  return Response.json({
    url: "wss://gateway.discord.gg",
    shards,
    session_start_limit: {
      total: 1_000,
      remaining,
      reset_after: 60_000,
      max_concurrency: maxConcurrency,
    },
  });
}

function ownership(ownerId: string, shardId = 0, shardCount = 1) {
  return {
    generation: 1,
    shardId,
    shardCount,
    ownerId,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GatewayCoordinator ownership", () => {
  it("allows exactly one owner for a generation and shard", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-exclusive-owner-test",
    );

    const results = await Promise.all([
      coordinator.acquireOwnership(ownership("partition-a")),
      coordinator.acquireOwnership(ownership("partition-b")),
    ]);

    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toHaveLength(1);
    await expect(coordinator.status()).resolves.toMatchObject({
      ownerships: [{ generation: 1, shardId: 0, shardCount: 1 }],
    });
  });

  it("removes stale ownership after stable-generation recovery", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-ownership-reconciliation-test",
    );
    await coordinator.initializeGeneration(1, 1);
    await coordinator.acquireOwnership(ownership("partition-a"));
    await coordinator.acquireOwnership({
      generation: 2,
      shardId: 0,
      shardCount: 2,
      ownerId: "partition-a",
    });

    await expect(coordinator.reconcileStableOwnerships(1, 1)).resolves.toBe(1);
    await expect(coordinator.status()).resolves.toMatchObject({
      ownerships: [{ generation: 1, shardId: 0, shardCount: 1 }],
    });
  });

  it("makes reacquisition and owner-checked release idempotent", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-idempotent-owner-test",
    );
    const request = ownership("partition-a");

    await expect(coordinator.acquireOwnership(request)).resolves.toMatchObject({
      acquired: true,
      alreadyOwned: false,
    });
    await expect(coordinator.acquireOwnership(request)).resolves.toMatchObject({
      acquired: true,
      alreadyOwned: true,
    });
    await expect(
      coordinator.releaseOwnership(ownership("partition-b")),
    ).resolves.toBe(false);
    await expect(coordinator.releaseOwnership(request)).resolves.toBe(true);
    await expect(coordinator.status()).resolves.toMatchObject({ ownerships: [] });
  });
});

describe("GatewayCoordinator generations", () => {
  it("initializes the active generation exactly once", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-generation-initialize-test",
    );

    await expect(coordinator.initializeGeneration(1, 1)).resolves.toMatchObject({
      activeGeneration: 1,
      activeShardCount: 1,
      phase: "idle",
    });
    await expect(coordinator.initializeGeneration(1, 1)).resolves.toMatchObject({
      activeGeneration: 1,
      activeShardCount: 1,
    });
    await expect(
      runInDurableObject(coordinator, (instance) => {
        if (!(instance instanceof GatewayCoordinator)) {
          throw new Error("Gateway coordinator fixture is invalid");
        }
        return instance.initializeGeneration(2, 2);
      }),
    ).rejects.toThrow("already initialized");
  });

  it("records a complete generation increase from live recommendations", async () => {
    const fetchGatewayBot = vi.fn(() =>
      Promise.resolve(gatewayBotResponse(10, 2, 2)),
    );
    vi.stubGlobal("fetch", fetchGatewayBot);
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-generation-plan-test",
    );
    await coordinator.initializeGeneration(1, 1);

    await expect(coordinator.checkRecommendation(2)).resolves.toMatchObject({
      outcome: "planned",
      plan: {
        currentGeneration: 1,
        currentShardCount: 1,
        targetGeneration: 2,
        targetShardCount: 2,
      },
    });
    await expect(coordinator.status()).resolves.toMatchObject({
      generation: {
        activeGeneration: 1,
        activeShardCount: 1,
        phase: "planned",
        targetGeneration: 2,
        targetShardCount: 2,
      },
    });
    const targetShard = {
      generation: 2,
      shardId: 0,
      shardCount: 2,
      ownerId: "partition-a",
    };
    await coordinator.acquireOwnership(targetShard);
    await expect(coordinator.gatewayUrl()).resolves.toBe(
      "wss://gateway.discord.gg/?v=10&encoding=json",
    );
    await expect(
      coordinator.requestIdentifyPermit(targetShard),
    ).resolves.toMatchObject({ granted: true, remainingAfterGrant: 9 });
    expect(fetchGatewayBot).toHaveBeenCalledOnce();

    const plan = await coordinator.plannedGeneration();
    if (plan === null) throw new Error("Expected a planned generation");
    let machine = createGenerationMachine(1, 1);
    machine = transitionGeneration(machine, {
      type: "plan",
      plan,
    }).machine;
    await coordinator.recordGeneration(machine);
    machine = transitionGeneration(machine, { type: "active-suspended" }).machine;
    await coordinator.recordGeneration(machine);
    machine = transitionGeneration(machine, {
      type: "target-shard-ready",
      shardId: 0,
    }).machine;
    await coordinator.recordGeneration(machine);
    machine = transitionGeneration(machine, {
      type: "target-shard-ready",
      shardId: 1,
    }).machine;
    await expect(coordinator.recordGeneration(machine)).resolves.toMatchObject({
      activeGeneration: 2,
      activeShardCount: 2,
      phase: "idle",
      targetGeneration: null,
    });
    await expect(coordinator.forceRecommendation(2, 1)).resolves.toMatchObject({
      outcome: "planned",
      plan: {
        currentGeneration: 2,
        currentShardCount: 2,
        targetGeneration: 3,
        targetShardCount: 1,
      },
    });
  });

  it("records failed generation rollback to the prior active generation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(gatewayBotResponse(10, 1, 2))),
    );
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-generation-rollback-test",
    );
    await coordinator.initializeGeneration(1, 1);
    await coordinator.checkRecommendation(2);
    const plan = await coordinator.plannedGeneration();
    if (plan === null) throw new Error("Expected a planned generation");

    let machine = createGenerationMachine(1, 1);
    machine = transitionGeneration(machine, {
      type: "plan",
      plan,
    }).machine;
    await coordinator.recordGeneration(machine);
    machine = transitionGeneration(machine, { type: "active-suspended" }).machine;
    machine = transitionGeneration(machine, {
      type: "target-shard-failed",
      shardId: 0,
      reason: "fault-injection",
    }).machine;
    await coordinator.recordGeneration(machine);
    machine = transitionGeneration(machine, { type: "rollback-ready" }).machine;

    await expect(coordinator.recordGeneration(machine)).resolves.toMatchObject({
      activeGeneration: 1,
      activeShardCount: 1,
      phase: "idle",
      targetGeneration: null,
    });
    await expect(coordinator.forceRecommendation(2, 2)).resolves.toMatchObject({
      outcome: "planned",
      plan: { targetGeneration: 3, targetShardCount: 2 },
    });
  });

  it("keeps the live recommendation while planning a forced replacement", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(gatewayBotResponse(10, 1, 1))),
    );
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-forced-recommendation-test",
    );
    await coordinator.initializeGeneration(1, 1);

    await expect(coordinator.forceRecommendation(2, 2)).resolves.toMatchObject({
      outcome: "planned",
      plan: { targetShardCount: 2 },
    });
    await expect(coordinator.status()).resolves.toMatchObject({
      identify: { remaining: 10, recommendedShards: 1 },
    });
  });

  it("postpones the entire generation when live budget is insufficient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(gatewayBotResponse(1, 1))),
    );
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-generation-budget-test",
    );
    await coordinator.initializeGeneration(1, 1);

    await expect(coordinator.checkRecommendation(23)).resolves.toMatchObject({
      outcome: "postponed",
      requiredIdentifies: 23,
      remainingIdentifies: 1,
    });
    const status = await coordinator.status();
    expect(status).toMatchObject({
      generation: {
        activeGeneration: 1,
        activeShardCount: 1,
        phase: "idle",
        targetGeneration: null,
        targetShardCount: null,
      },
    });
    expect(status.generation?.postponedUntil).toBeTypeOf("number");
  });
});

describe("GatewayCoordinator Identify permits", () => {
  it("grants only one concurrent permit in the same rate-limit key", async () => {
    const fetchGatewayBot = vi.fn(() => Promise.resolve(gatewayBotResponse()));
    vi.stubGlobal("fetch", fetchGatewayBot);
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-one-key-permit-test",
    );
    const request = ownership("partition-a");
    await coordinator.acquireOwnership(request);

    const results = await Promise.all([
      coordinator.requestIdentifyPermit(request),
      coordinator.requestIdentifyPermit(request),
    ]);

    expect(fetchGatewayBot).toHaveBeenCalledOnce();
    expect(results.filter((result) => result.granted)).toHaveLength(1);
    expect(results.filter((result) => !result.granted)).toEqual([
      expect.objectContaining({
        reason: "identify-rate-limited",
        rateLimitKey: 0,
      }),
    ]);
    const granted = results.find((result) => result.granted);
    expect(granted).toMatchObject({
      maxConcurrency: 1,
      rateLimitKey: 0,
      remainingAfterGrant: 996,
    });
  });

  it("allows different max-concurrency keys while reserving budget atomically", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(gatewayBotResponse(10, 2))),
    );
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-multi-key-permit-test",
    );
    const shardZero = ownership("partition-a", 0, 2);
    const shardOne = ownership("partition-b", 1, 2);
    await coordinator.acquireOwnership(shardZero);
    await coordinator.acquireOwnership(shardOne);

    const results = await Promise.all([
      coordinator.requestIdentifyPermit(shardZero),
      coordinator.requestIdentifyPermit(shardOne),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ granted: true, rateLimitKey: 0 }),
      expect.objectContaining({ granted: true, rateLimitKey: 1 }),
    ]);
    await expect(coordinator.status()).resolves.toMatchObject({
      identify: {
        remaining: 8,
        maxConcurrency: 2,
        recommendedShards: 23,
      },
    });
  });

  it("denies exhausted budget and callers without ownership", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(gatewayBotResponse(0))),
    );
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-denied-permit-test",
    );
    const owner = ownership("partition-a");
    await coordinator.acquireOwnership(owner);

    await expect(coordinator.requestIdentifyPermit(owner)).resolves.toMatchObject({
      granted: false,
      reason: "identify-budget-exhausted",
      remaining: 0,
    });
    await expect(
      coordinator.requestIdentifyPermit(ownership("partition-b")),
    ).resolves.toMatchObject({
      granted: false,
      reason: "shard-not-owned",
    });
  });
});

describe("GatewayCoordinator fleet lifecycle", () => {
  it("validates and aggregates the active per-shard guild inventory", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-fleet-guild-inventory-test",
    );
    await coordinator.initializeFleet(7, 2, 2);

    const result = await runInDurableObject(coordinator, async (instance) => {
      // SAFETY: Miniflare returns the configured GatewayCoordinator class instance; this test replaces only its environment binding.
      const runtime = instance as GatewayCoordinator & { env: GatewayEnv };
      const forceFleetShardReidentify = vi.fn(() =>
        Promise.resolve({ accepted: true, status: {} }),
      );
      Object.defineProperty(runtime.env, "GATEWAY_PARTITION", {
        configurable: true,
        value: {
          getByName: () => ({
            fleetGuildInventory: () => ({
              activeGeneration: 7,
              activeShardCount: 2,
              entries: [
                {
                  status: {
                    shardGeneration: 7,
                    shardId: 0,
                    shardCount: 2,
                    state: "ready",
                  },
                  inventory: {
                    version: 1,
                    generation: 7,
                    shardId: 0,
                    shardCount: 2,
                    sessionId: "session-0",
                    capturedAt: 100,
                    guildIds: ["100000000000000001"],
                  },
                },
                {
                  status: {
                    shardGeneration: 7,
                    shardId: 1,
                    shardCount: 2,
                    state: "ready",
                  },
                  inventory: {
                    version: 1,
                    generation: 7,
                    shardId: 1,
                    shardCount: 2,
                    sessionId: "session-1",
                    capturedAt: 101,
                    guildIds: ["808534128941072425"],
                  },
                },
              ],
            }),
            forceFleetShardReidentify,
          }),
        },
      });

      const inventory = await runtime.activeGuildInventory();
      await runtime.forceActiveShardReidentify(1);
      return {
        inventory,
        forceCall: forceFleetShardReidentify.mock.calls[0],
      };
    });

    expect(result).toEqual({
      inventory: {
        generation: 7,
        shardCount: 2,
        guildIds: ["100000000000000001", "808534128941072425"],
        shards: [
          { shardId: 0, guildCount: 1, capturedAt: 100 },
          { shardId: 1, guildCount: 1, capturedAt: 101 },
        ],
      },
      forceCall: [7, 1, 2],
    });
  });

  it("retains generation state and retries a failed partition stop", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-fleet-stop-retry-test",
    );
    await coordinator.initializeFleet(7, 1, 24);

    const result = await runInDurableObject(coordinator, async (instance) => {
      // SAFETY: Miniflare returns the configured GatewayCoordinator class instance; this test replaces only its environment binding.
      const runtime = instance as GatewayCoordinator & { env: GatewayEnv };
      let attempts = 0;
      Object.defineProperty(runtime.env, "GATEWAY_PARTITION", {
        configurable: true,
        value: {
          getByName: () => ({
            executeFleetCommand: () => {
              attempts += 1;
              return attempts === 1
                ? Promise.reject(new Error("injected partition failure"))
                : Promise.resolve();
            },
          }),
        },
      });

      await expect(runtime.stopFleet()).rejects.toThrow(
        "injected partition failure",
      );
      const stopping = await runtime.fleetStatus();
      const stopped = await runtime.stopFleet();
      return { attempts, stopped, stopping };
    });

    expect(result).toMatchObject({
      attempts: 2,
      stopping: {
        phase: "stopping",
        activeGeneration: 7,
        activeShardCount: 1,
      },
      stopped: {
        phase: "stopped",
        activeGeneration: null,
        activeShardCount: 0,
      },
    });
  });

  it("preserves an operator stop across scheduled recommendation checks", async () => {
    const fetchGatewayBot = vi.fn(() =>
      Promise.resolve(gatewayBotResponse(1_000, 24, 24)),
    );
    vi.stubGlobal("fetch", fetchGatewayBot);
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      "coordinator-fleet-stop-test",
    );
    await coordinator.initializeFleet(7, 1, 24);

    await expect(coordinator.stopFleet()).resolves.toMatchObject({
      phase: "stopped",
      activeGeneration: null,
      activeShardCount: 0,
      nextGeneration: 8,
      partitionCount: 0,
    });
    await expect(
      coordinator.reconcileFleetRecommendation(24),
    ).resolves.toMatchObject({
      outcome: "operator-stopped",
      fleet: { phase: "stopped" },
    });
    expect(fetchGatewayBot).not.toHaveBeenCalled();
  });
});
