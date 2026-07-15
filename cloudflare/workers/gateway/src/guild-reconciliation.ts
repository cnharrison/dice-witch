import type { GatewayActiveGuildInventory } from "./gateway-coordinator";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

type GuildReconciliationEnv = {
  DATA_SERVICE: {
    fetch(request: Request): Promise<Response>;
  };
};

export type GuildReconciliationResult = {
  status: "applied";
  observedGuildCount: number;
  activatedCount: number;
  deactivatedCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateGuildInventory(inventory: GatewayActiveGuildInventory): void {
  if (
    !Number.isSafeInteger(inventory.generation) ||
    inventory.generation < 1 ||
    !Number.isSafeInteger(inventory.shardCount) ||
    inventory.shardCount < 1 ||
    inventory.shards.length !== inventory.shardCount ||
    inventory.shards.some(
      (shard, shardId) =>
        shard.shardId !== shardId ||
        !Number.isSafeInteger(shard.guildCount) ||
        shard.guildCount < 0 ||
        !Number.isSafeInteger(shard.capturedAt) ||
        shard.capturedAt < 0,
    ) ||
    !inventory.guildIds.every((guildId) => SNOWFLAKE.test(guildId)) ||
    new Set(inventory.guildIds).size !== inventory.guildIds.length ||
    inventory.shards.reduce((total, shard) => total + shard.guildCount, 0) !==
      inventory.guildIds.length
  ) {
    throw new Error("Gateway guild reconciliation inventory is invalid");
  }
}

export async function reconcileGuildInventory(
  env: GuildReconciliationEnv,
  inventory: GatewayActiveGuildInventory,
  occurredAt: number,
): Promise<GuildReconciliationResult> {
  if (!Number.isSafeInteger(occurredAt) || occurredAt < 0) {
    throw new Error("Guild reconciliation timestamp is invalid");
  }
  validateGuildInventory(inventory);
  const oldestCapture = Math.min(
    ...inventory.shards.map(({ capturedAt }) => capturedAt),
  );
  const response = await env.DATA_SERVICE.fetch(
    new Request("https://data.internal/internal/guilds/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        guildIds: inventory.guildIds,
        runId: `gateway-${inventory.generation}-${oldestCapture}-${occurredAt}`,
        occurredAt,
      }),
    }),
  );
  if (!response.ok) throw new Error("Guild reconciliation update failed");
  const result: unknown = await response.json();
  if (
    !isRecord(result) ||
    result.status !== "applied" ||
    !Number.isSafeInteger(result.activatedCount) ||
    Number(result.activatedCount) < 0 ||
    !Number.isSafeInteger(result.deactivatedCount) ||
    Number(result.deactivatedCount) < 0
  ) {
    throw new Error("Guild reconciliation update response is invalid");
  }
  return {
    status: "applied",
    observedGuildCount: inventory.guildIds.length,
    activatedCount: Number(result.activatedCount),
    deactivatedCount: Number(result.deactivatedCount),
  };
}
