import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { GatewayPlacement } from "../../workers/gateway/src/gateway-placement";
import { gatewayTestEnv as env } from "./test-environment";

const request = { generation: 5, shardId: 24, shardCount: 25, source: "gateway-partition-4", target: "gateway-partition-3" };

describe("durable Gateway placement", () => {
  it("commits ownership, placement and journal together and survives eviction", async () => {
    const coordinator = env.GATEWAY_COORDINATOR.getByName("placement-atomic");
    await coordinator.acquireOwnership({ ...request, ownerId: request.source });
    const epoch = await runInDurableObject(coordinator, (_instance, ctx) => {
      const placement = new GatewayPlacement(ctx.storage);
      expect(placement.assignments(5, 25, 6).map((p) => p.shardCount)).toEqual([6, 6, 6, 6, 1]);
      const transfer = placement.begin(request);
      expect(() => placement.begin(request)).toThrow("in progress");
      placement.advance(transfer.epoch, "parking", "importing");
      placement.commit(placement.get(transfer.epoch));
      expect(placement.assignments(5, 25, 6).map((p) => p.shardCount)).toEqual([6, 6, 6, 7]);
      expect(placement.shardIds(5, 25, 6, request.target)).toEqual([18, 19, 20, 21, 22, 23, 24]);
      return transfer.epoch;
    });
    await evictDurableObject(coordinator);
    expect(await coordinator.transferStatus(epoch)).toMatchObject({ ...request, phase: "activating" });
    expect(await coordinator.acquireOwnership({ ...request, ownerId: request.source })).toEqual({ acquired: false, reason: "shard-owned-by-another-partition" });
    expect((await coordinator.status()).ownerships).toMatchObject([{ ownerId: request.target }]);
  });

  it("does not move placement when ownership compare-and-swap fails", async () => {
    const coordinator = env.GATEWAY_COORDINATOR.getByName("placement-conflict");
    await coordinator.acquireOwnership({ ...request, ownerId: "gateway-partition-2" });
    await runInDurableObject(coordinator, (_instance, ctx) => {
      const placement = new GatewayPlacement(ctx.storage);
      const transfer = placement.begin(request);
      placement.advance(transfer.epoch, "parking", "importing");
      expect(() => { placement.commit(placement.get(transfer.epoch)); }).toThrow("no longer owns");
      expect(placement.get(transfer.epoch).phase).toBe("importing");
      expect(placement.owner(5, 24)).toBeNull();
    });
  });

  it("routes non-contiguous placements and later generations independently", async () => {
    const coordinator = env.GATEWAY_COORDINATOR.getByName("placement-noncontiguous");
    await coordinator.acquireOwnership({ ...request, shardId: 7, ownerId: "gateway-partition-1" });
    await runInDurableObject(coordinator, (_instance, ctx) => {
      const placement = new GatewayPlacement(ctx.storage);
      const transfer = placement.begin({ ...request, shardId: 7, source: "gateway-partition-1", target: "gateway-partition-0" });
      placement.advance(transfer.epoch, "parking", "importing");
      placement.commit(placement.get(transfer.epoch));
      expect(placement.shardIds(5, 25, 6, "gateway-partition-0")).toEqual([0, 1, 2, 3, 4, 5, 7]);
      expect(placement.shardIds(5, 25, 6, "gateway-partition-1")).toEqual([6, 8, 9, 10, 11]);
      expect(placement.shardIds(6, 25, 6, "gateway-partition-0")).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });
});
