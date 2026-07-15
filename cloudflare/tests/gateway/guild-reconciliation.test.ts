import { describe, expect, it, vi } from "vitest";
import { reconcileGuildInventory } from "../../workers/gateway/src/guild-reconciliation";

const guildIds = ["100000000000000001", "100000000000000002"];
const inventory = {
  generation: 3,
  shardCount: 1,
  guildIds,
  shards: [{ shardId: 0, guildCount: 2, capturedAt: 100 }],
};

describe("Gateway guild reconciliation", () => {
  it("sends one complete validated Gateway guild set to Data", async () => {
    const dataFetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe("/internal/guilds/reconcile");
      expect(await request.json()).toEqual({
        guildIds,
        runId: "gateway-3-100-1767225600123",
        occurredAt: 1_767_225_600_123,
      });
      return Response.json({
        status: "applied",
        activatedCount: 3,
        deactivatedCount: 1,
      });
    });

    await expect(
      reconcileGuildInventory(
        { DATA_SERVICE: { fetch: dataFetch } },
        inventory,
        1_767_225_600_123,
      ),
    ).resolves.toEqual({
      status: "applied",
      observedGuildCount: 2,
      activatedCount: 3,
      deactivatedCount: 1,
    });
    expect(dataFetch).toHaveBeenCalledOnce();
  });

  it("fails closed before Data when the Gateway inventory is incomplete", async () => {
    const dataFetch = vi.fn();

    await expect(
      reconcileGuildInventory(
        { DATA_SERVICE: { fetch: dataFetch } },
        {
          ...inventory,
          shards: [{ shardId: 0, guildCount: 1, capturedAt: 100 }],
        },
        1_767_225_600_123,
      ),
    ).rejects.toThrow("Gateway guild reconciliation inventory is invalid");
    expect(dataFetch).not.toHaveBeenCalled();
  });
});
