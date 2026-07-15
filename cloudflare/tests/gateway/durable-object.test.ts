import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GatewaySessionCheckpoint } from "../../packages/gateway-protocol/src";
import {
  GATEWAY_COORDINATOR_NAME,
  GATEWAY_PARTITION_NAME,
} from "../../workers/gateway/src/environment";
import {
  gatewayRecoveryAlarmAt,
  type GatewayPartition,
} from "../../workers/gateway/src/gateway-partition";
import { gatewayInitialGuildStateKey } from "../../workers/gateway/src/gateway-shard-connection";
import gatewayWorker, {
  type GatewayEnv,
  type GatewayStatus,
} from "../../workers/gateway/src/index";

const gatewayEnv = env as unknown as GatewayEnv;

describe("Gateway recovery alarm", () => {
  it("schedules recovery after two heartbeat intervals", () => {
    expect(gatewayRecoveryAlarmAt(41_250, 1_720_000_000_000)).toBe(
      1_720_000_082_500,
    );
  });

  it.each([
    [0, 1_720_000_000_000],
    [-1, 1_720_000_000_000],
    [41_250, -1],
    [Number.MAX_SAFE_INTEGER, 1_720_000_000_000],
  ])("rejects unsafe interval %s at timestamp %s", (interval, now) => {
    expect(() => gatewayRecoveryAlarmAt(interval, now)).toThrow(
      "Gateway recovery alarm timestamp is invalid",
    );
  });
});

describe("GatewayPartition Durable Object", () => {
  it("starts with a sanitized idle checkpoint", async () => {
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-idle-test",
    );

    const status = await partition.status();

    expect(status.activationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(status).toEqual({
      state: "idle",
      connectionMode: null,
      activationId: status.activationId,
      shardGeneration: 1,
      shardId: 0,
      shardCount: 1,
      sequence: null,
      sessionEstablished: false,
      lastDispatchAt: null,
      lastHeartbeatSentAt: null,
      lastHeartbeatAckAt: null,
      readyAt: null,
      lastEventType: null,
      lastError: null,
      interactionResponses: 0,
      identifyAttempts: 0,
      resumeAttempts: 0,
      readyEvents: 0,
      resumedEvents: 0,
      forcedReconnects: 0,
      forcedReidentifies: 0,
      ownershipAcquired: false,
      identifyPermitRequests: 0,
      identifyPermitsGranted: 0,
      identifyPermitDenials: 0,
      lastIdentifyPermit: null,
      initialGuildsPending: 0,
      initialGuildsRequiringSync: 0,
      guildInventoryComplete: false,
      guildInventoryCount: 0,
      guildInventoryCapturedAt: null,
      generation: {
        phase: "idle",
        activeGeneration: 1,
        activeShardCount: 1,
        targetGeneration: null,
        targetShardCount: null,
      },
      shards: status.shards,
      targetShards: [],
      rejectedDispatches: 0,
    } satisfies GatewayStatus);
    expect(status.shards).toHaveLength(1);
    expect(status.shards[0]).toMatchObject({
      state: "idle",
      shardId: 0,
      shardCount: 1,
    });
  });

  it("restores multiple shard connections in one partition", async () => {
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-multi-shard-restore-test",
    );
    await partition.status();
    const checkpoint = (
      shardId: number,
    ): GatewaySessionCheckpoint => ({
      version: 1,
      generation: 3,
      shardId,
      shardCount: 2,
      sessionId: `persisted-session-${String(shardId)}`,
      resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
      sequence: 40 + shardId,
      lastDispatchAt: 1_720_000_000_000 + shardId,
      lastHeartbeatSentAt: 1_720_000_001_000 + shardId,
      lastHeartbeatAckAt: 1_720_000_001_100 + shardId,
      updatedAt: 1_720_000_001_100 + shardId,
    });

    await runInDurableObject(partition, async (_instance, state) => {
      await state.storage.put("gateway-partition-state-v1", {
        version: 1,
        generation: {
          phase: "idle",
          activeGeneration: 3,
          activeShardCount: 2,
          target: null,
        },
      });
      await state.storage.put("gateway-checkpoint-v1:3:0:2", checkpoint(0));
      await state.storage.put("gateway-checkpoint-v1:3:1:2", checkpoint(1));
    });
    await evictDurableObject(partition);

    const status = await partition.status();
    expect(status.generation).toEqual({
      phase: "idle",
      activeGeneration: 3,
      activeShardCount: 2,
      targetGeneration: null,
      targetShardCount: null,
    });
    expect(status.shards.map((shard) => [shard.shardId, shard.sequence])).toEqual([
      [0, 40],
      [1, 41],
    ]);
    await runInDurableObject(partition, async (_instance, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
      await state.storage.deleteAlarm();
    });
  });

  it("restores interrupted fleet targets with valid recovery alarm keys", async () => {
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-fleet-target-recovery-test",
    );
    await partition.status();
    await runInDurableObject(partition, async (_instance, state) => {
      await state.storage.put("gateway-fleet-partition-state-v1", {
        version: 1,
        activeGeneration: null,
        activeShardCount: null,
        ownerId: "gateway-partition-0",
        connections: [
          {
            generation: 3,
            shardId: 0,
            shardCount: 23,
            ownerId: "gateway-partition-0",
          },
        ],
        suspendedGenerations: [],
      });
    });
    await evictDurableObject(partition);

    await partition.fleetStatus();
    await runInDurableObject(partition, async (instance, state) => {
      const internal = instance as unknown as {
        recoveryDeadlines: Map<string, number>;
      };
      expect([...internal.recoveryDeadlines.keys()]).toEqual(["3:0:23"]);
      expect(await state.storage.getAlarm()).not.toBeNull();
      await state.storage.deleteAlarm();
    });
  });

  it("rolls an interrupted reshard back to the persisted active generation", async () => {
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-interrupted-reshard-test",
    );
    await partition.status();
    const activeCheckpoint: GatewaySessionCheckpoint = {
      version: 1,
      generation: 4,
      shardId: 0,
      shardCount: 1,
      sessionId: "persisted-active-session",
      resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
      sequence: 50,
      lastDispatchAt: 1_720_000_000_000,
      lastHeartbeatSentAt: 1_720_000_001_000,
      lastHeartbeatAckAt: 1_720_000_001_100,
      updatedAt: 1_720_000_001_100,
    };

    await runInDurableObject(partition, async (_instance, state) => {
      await state.storage.put("gateway-partition-state-v1", {
        version: 1,
        generation: {
          phase: "starting-target",
          activeGeneration: 4,
          activeShardCount: 1,
          target: {
            plan: {
              currentGeneration: 4,
              currentShardCount: 1,
              targetGeneration: 5,
              targetShardCount: 2,
              identifyWaves: [[0], [1]],
            },
            currentWaveIndex: 0,
            readyShardIds: [],
            failure: null,
          },
        },
      });
      await state.storage.put(
        "gateway-checkpoint-v1:4:0:1",
        activeCheckpoint,
      );
    });
    await evictDurableObject(partition);

    await expect(partition.status()).resolves.toMatchObject({
      state: "idle",
      sessionEstablished: true,
      lastError: "interrupted-reshard-rollback",
      generation: {
        phase: "idle",
        activeGeneration: 4,
        activeShardCount: 1,
        targetGeneration: null,
      },
      targetShards: [],
    });
  });

  it("rejects fault injection unless the Gateway is ready", async () => {
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-fault-state-test",
    );

    await expect(partition.forceReconnect()).resolves.toMatchObject({
      accepted: false,
      reason: "gateway-not-ready",
      status: { state: "idle", forcedReconnects: 0 },
    });
    await expect(partition.forceReidentify()).resolves.toMatchObject({
      accepted: false,
      reason: "gateway-not-ready",
      status: { state: "idle", forcedReidentifies: 0 },
    });
  });

  it("restores a resumable checkpoint after object recreation", async () => {
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-recreation-test",
    );
    const before = await partition.status();
    const checkpoint: GatewaySessionCheckpoint = {
      version: 1,
      generation: 1,
      shardId: 0,
      shardCount: 1,
      sessionId: "persisted-development-session",
      resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
      sequence: 42,
      lastDispatchAt: 1_720_000_000_000,
      lastHeartbeatSentAt: 1_720_000_001_000,
      lastHeartbeatAckAt: 1_720_000_001_100,
      updatedAt: 1_720_000_001_100,
    };

    await runInDurableObject(partition, async (_instance, state) => {
      await state.storage.put("gateway-checkpoint-v1", checkpoint);
      await state.storage.put(
        gatewayInitialGuildStateKey("gateway-checkpoint-v1:1:0:1"),
        {
          version: 1,
          guildIds: ["100000000000000001"],
          syncGuildIds: ["100000000000000001"],
        },
      );
    });
    await evictDurableObject(partition);

    const after = await partition.status();
    expect(after.activationId).not.toBe(before.activationId);
    expect(after).toMatchObject({
      state: "idle",
      connectionMode: null,
      sequence: 42,
      sessionEstablished: true,
      identifyAttempts: 0,
      resumeAttempts: 0,
      initialGuildsPending: 1,
      initialGuildsRequiringSync: 1,
    });
    await runInDurableObject(partition, async (_instance, state) => {
      expect(await state.storage.getAlarm()).not.toBeNull();
      await state.storage.deleteAlarm();
    });
  });

  it("fails closed when another partition owns the shard", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    const ownership = {
      generation: 1,
      shardId: 0,
      shardCount: 1,
      ownerId: "other-partition",
    };
    await coordinator.acquireOwnership(ownership);
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-ownership-conflict-test",
    );

    await expect(
      runInDurableObject(partition, (instance) =>
        (instance as GatewayPartition).start(),
      ),
    ).rejects.toThrow("Gateway shard is owned by another partition");
    await expect(partition.status()).resolves.toMatchObject({
      state: "idle",
      ownershipAcquired: false,
      lastError: "shard-ownership-conflict",
    });
    await coordinator.releaseOwnership(ownership);
  });

  it("releases stable ownership after partition recreation", async () => {
    const coordinator = gatewayEnv.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    const ownership = {
      generation: 1,
      shardId: 0,
      shardCount: 1,
      ownerId: GATEWAY_PARTITION_NAME,
    };
    await coordinator.acquireOwnership(ownership);
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-stale-ownership-release-test",
    );

    await partition.stop();

    await expect(coordinator.status()).resolves.toMatchObject({ ownerships: [] });
  });

  it("persists an intentional stopped checkpoint", async () => {
    const partition = gatewayEnv.GATEWAY_PARTITION.getByName(
      "durable-object-stop-test",
    );

    await expect(partition.stop()).resolves.toMatchObject({
      state: "stopped",
      sessionEstablished: false,
    });
    await expect(partition.status()).resolves.toMatchObject({
      state: "stopped",
      sessionEstablished: false,
    });
  });
});

describe("Gateway Worker and binding integration", () => {
  it("routes authenticated status through the configured namespace", async () => {
    const response = await gatewayWorker.fetch(
      new Request("https://gateway.test/gateway/status", {
        headers: {
          authorization:
            "Bearer gateway-control-token-at-least-32-characters",
        },
      }),
      { ...gatewayEnv, GATEWAY_MODE: "single" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: "idle",
      shardId: 0,
      shardCount: 1,
      sessionEstablished: false,
    });
  });
});
