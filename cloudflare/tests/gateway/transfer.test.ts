import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GATEWAY_COORDINATOR_NAME } from "../../workers/gateway/src/environment";
import { GatewayCoordinator } from "../../workers/gateway/src/gateway-coordinator";
import { GatewayPartition } from "../../workers/gateway/src/gateway-partition";
import { GatewayPlacement } from "../../workers/gateway/src/gateway-placement";
import { GatewayShardConnection, initialGatewayCheckpoint } from "../../workers/gateway/src/gateway-shard-connection";
import { gatewayTestEnv as env } from "./test-environment";

const request = { generation: 5, shardId: 24, shardCount: 25, source: "gateway-partition-4", target: "gateway-partition-3" };
const coordinator = env.GATEWAY_COORDINATOR.getByName(GATEWAY_COORDINATOR_NAME);
const source = env.GATEWAY_PARTITION.getByName(request.source);
const target = env.GATEWAY_PARTITION.getByName(request.target);
const key = "5:24:25";
const checkpointKey = `gateway-fleet-checkpoint-v1:${key}`;
const checkpoint = {
  ...initialGatewayCheckpoint({ ...request, ownerId: request.source }, 100),
  sessionId: "persisted-discord-session",
  sequence: 123,
  resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
};

beforeEach(async () => {
  for (const stub of [source, target]) {
    await runInDurableObject(stub, (_instance, ctx) => ctx.storage.deleteAll());
    await evictDurableObject(stub);
  }
  await runInDurableObject(coordinator, (_instance, ctx) => ctx.storage.deleteAll());
  await evictDurableObject(coordinator);
  await coordinator.initializeFleet(5, 25, 6);
  await coordinator.acquireOwnership({ ...request, ownerId: request.source });
  await runInDurableObject(source, async (_instance, ctx) => {
    await ctx.storage.put({
      "gateway-fleet-partition-state-v1": {
        version: 1, activeGeneration: 5, activeShardCount: 25, ownerId: request.source,
        connections: [{ generation: 5, shardId: 24, shardCount: 25, ownerId: request.source }], suspendedGenerations: [],
      },
      [checkpointKey]: checkpoint,
      [`${checkpointKey}:initial-guilds-v1`]: { version: 1, guildIds: [], syncGuildIds: [] },
    });
  });
  await evictDurableObject(source);
});

afterEach(() => vi.restoreAllMocks());

describe("Gateway session transfer recovery", () => {
  it("recovers parking interrupted before the snapshot was stored", async () => {
    const transfer = await coordinator.beginTransfer(request);
    await runInDurableObject(source, (_instance, ctx) => ctx.storage.put(`gateway-transfer-v1:${key}`, {
      transfer, mode: "parked", hasSnapshot: false,
    }));
    await evictDurableObject(source);
    expect((await source.parkTransfer(transfer)).checkpoint).toMatchObject(checkpoint);
  });

  it("does not start an imported-only target when its alarm runs after eviction", async () => {
    const transfer = await coordinator.beginTransfer(request);
    const snapshot = await source.parkTransfer(transfer);
    await runInDurableObject(coordinator, (_instance, ctx) => {
      new GatewayPlacement(ctx.storage).advance(transfer.epoch, "parking", "importing");
    });
    await target.importTransfer(await coordinator.transferStatus(transfer.epoch), snapshot);
    await evictDurableObject(target);
    const recover = vi.spyOn(GatewayShardConnection.prototype, "recover");
    await runInDurableObject(target, (instance) => {
      if (!(instance instanceof GatewayPartition)) throw new Error("Wrong partition");
      return instance.alarm();
    });
    expect(recover).not.toHaveBeenCalled();
    expect((await target.fleetStatus()).connections).toEqual([]);
  });

  it("deduplicates begin after ownership changes and resumes through the coordinator alarm", async () => {
    vi.spyOn(GatewayShardConnection.prototype, "start").mockImplementation(function (this: GatewayShardConnection) {
      return Promise.resolve(this.status());
    });
    const transfer = await coordinator.beginTransfer(request);
    await evictDurableObject(coordinator);
    await runInDurableObject(coordinator, (instance) => {
      if (!(instance instanceof GatewayCoordinator)) throw new Error("Wrong coordinator");
      return instance.alarm();
    });
    expect((await coordinator.beginTransfer(request)).epoch).toBe(transfer.epoch);
    expect((await coordinator.transferStatus(transfer.epoch)).phase).toBe("verifying");
    expect(await runInDurableObject(coordinator, (_instance, ctx) => ctx.storage.getAlarm())).not.toBeNull();
  });

  it("keeps a parked source fenced across eviction and stale start commands", async () => {
    const transfer = await coordinator.beginTransfer(request);
    const snapshot = await source.parkTransfer(transfer);
    expect(snapshot.checkpoint).toMatchObject(checkpoint);
    await evictDurableObject(source);
    const recover = vi.spyOn(GatewayShardConnection.prototype, "recover");
    await runInDurableObject(source, (instance) => {
      if (!(instance instanceof GatewayPartition)) throw new Error("Wrong partition");
      return instance.alarm();
    });
    expect(recover).not.toHaveBeenCalled();
    expect((await source.fleetStatus()).connections).toEqual([]);
    await expect(runInDurableObject(source, (instance) => {
      if (!(instance instanceof GatewayPartition)) throw new Error("Wrong partition");
      return instance.executeFleetCommand({
      type: "start-target-shards", generation: 5, shardCount: 25, shardIds: [24],
      assignment: { partitionIndex: 4, partitionName: request.source, firstShardId: 24, lastShardId: 24, shardCount: 1 },
      });
    })).rejects.toThrow("fenced");
    expect(await runInDurableObject(source, (_instance, ctx) => ctx.storage.getAlarm())).toBeNull();
    expect(await source.parkTransfer(transfer)).toEqual(snapshot);
    await expect(runInDurableObject(coordinator, (instance) => {
      if (!(instance instanceof GatewayCoordinator)) throw new Error("Wrong coordinator");
      return instance.stopFleet();
    })).rejects.toThrow("transfer is in progress");
  });

  it("restores the source when rollback precedes the ownership switch", async () => {
    vi.spyOn(GatewayShardConnection.prototype, "start").mockImplementation(function (this: GatewayShardConnection) {
      return Promise.resolve(this.status());
    });
    const transfer = await coordinator.beginTransfer(request);
    await source.parkTransfer(transfer);
    const restored = await coordinator.rollbackTransfer(transfer.epoch);
    expect(restored.phase).toBe("restoring");
    await source.fleetStatus();
    await evictDurableObject(source);
    await coordinator.continueTransfer(transfer.epoch);
    expect((await source.fleetStatus()).connections).toMatchObject([{ sequence: 123 }]);
    expect((await coordinator.status()).ownerships).toMatchObject([{ ownerId: request.source }]);
    expect(await runInDurableObject(source, (_instance, ctx) => ctx.storage.get(checkpointKey))).toMatchObject(checkpoint);
  });

  it("rolls back using the target's latest checkpoint and rejects the old transfer", async () => {
    vi.spyOn(GatewayShardConnection.prototype, "start").mockImplementation(function (this: GatewayShardConnection) {
      return Promise.resolve(this.status());
    });
    const transfer = await coordinator.beginTransfer(request);
    await coordinator.continueTransfer(transfer.epoch);
    await runInDurableObject(target, async (_instance, ctx) => {
      await ctx.storage.put(checkpointKey, { ...checkpoint, sequence: 456 });
    });
    await evictDurableObject(target);
    const reverse = await coordinator.rollbackTransfer(transfer.epoch);
    expect(reverse).toMatchObject({ source: request.target, target: request.source, phase: "parking" });
    expect(reverse.epoch).toBeGreaterThan(transfer.epoch);
    await coordinator.continueTransfer(reverse.epoch);
    expect(await runInDurableObject(source, (_instance, ctx) => ctx.storage.get(checkpointKey))).toMatchObject({ ...checkpoint, sequence: 456 });
    expect((await target.fleetStatus()).connections).toEqual([]);
    expect((await coordinator.status()).ownerships).toMatchObject([{ ownerId: request.source }]);
    expect((await coordinator.continueTransfer(transfer.epoch)).phase).toBe("superseded");
  });

  it.each(["parking", "importing", "activating", "verifying"] as const)(
    "recovers from a lost reply/restart in %s without replacing the Discord checkpoint",
    async (phase) => {
      vi.spyOn(GatewayShardConnection.prototype, "start").mockImplementation(function (this: GatewayShardConnection) {
        return Promise.resolve(this.status());
      });
      const transfer = await coordinator.beginTransfer(request);
      if (phase !== "parking") {
        await source.parkTransfer(transfer);
        await runInDurableObject(coordinator, (_instance, ctx) => {
          new GatewayPlacement(ctx.storage).advance(transfer.epoch, "parking", "importing");
        });
      }
      if (phase === "activating" || phase === "verifying") {
        const importing = await coordinator.transferStatus(transfer.epoch);
        await target.importTransfer(importing, await source.parkTransfer(importing));
        await runInDurableObject(coordinator, (_instance, ctx) => {
          new GatewayPlacement(ctx.storage).commit(importing);
        });
      }
      if (phase === "verifying") {
        await target.activateTransfer(await coordinator.transferStatus(transfer.epoch));
        await runInDurableObject(coordinator, (_instance, ctx) => {
          new GatewayPlacement(ctx.storage).advance(transfer.epoch, "activating", "verifying");
        });
      }
      await source.fleetStatus();
      await target.fleetStatus();
      await evictDurableObject(source);
      await evictDurableObject(target);
      await evictDurableObject(coordinator);
      const result = await coordinator.continueTransfer(transfer.epoch);
      expect(result.phase).toBe("verifying");
      expect(await runInDurableObject(target, (_instance, ctx) => ctx.storage.get(checkpointKey))).toMatchObject(checkpoint);
      expect((await source.fleetStatus()).connections).toEqual([]);
      expect((await target.fleetStatus()).connections).toMatchObject([{ shardId: 24, sequence: 123, sessionEstablished: true }]);
      expect((await coordinator.status()).ownerships).toMatchObject([{ ownerId: request.target }]);
      expect((await coordinator.fleetStatus()).partitionCount).toBe(4);
      await coordinator.continueTransfer(transfer.epoch);
      expect(await runInDurableObject(target, (_instance, ctx) => ctx.storage.get(checkpointKey))).toMatchObject(checkpoint);
    },
  );
});
