import { WorkerEntrypoint } from "cloudflare:workers";
import type { GatewayFleetInspection } from "./gateway-coordinator";
import type { GatewayFleetPartitionStatus } from "./gateway-partition";
import {
  GATEWAY_COORDINATOR_NAME,
  type GatewayEnv,
} from "./environment";

export type PublicGatewayShardStatus = {
  id: number;
  state: string;
  ping: number;
};

export type LogicalGuildShard = {
  status: "available";
  shardId: number;
  shardCount: number;
  generation: number;
};

export type LogicalGuildShardResult =
  | LogicalGuildShard
  | { status: "unavailable" };

export type PublicGatewayStatusSnapshot = {
  phase: GatewayFleetInspection["fleet"]["phase"];
  shardCount: number;
  shards: PublicGatewayShardStatus[];
};

export function logicalGuildShard(
  fleet: GatewayFleetInspection["fleet"],
  guildId: string,
): LogicalGuildShard {
  if (
    !/^[1-9][0-9]{16,19}$/.test(guildId) ||
    fleet.activeGeneration === null ||
    fleet.activeShardCount < 1
  ) {
    throw new Error("Logical guild shard is unavailable");
  }
  return {
    status: "available",
    shardId: Number(
      (BigInt(guildId) >> 22n) % BigInt(fleet.activeShardCount),
    ),
    shardCount: fleet.activeShardCount,
    generation: fleet.activeGeneration,
  };
}

export function sanitizeGatewayStatus(
  inspection: GatewayFleetInspection,
  partitions: GatewayFleetPartitionStatus[],
): PublicGatewayStatusSnapshot {
  const shards = partitions
    .flatMap((partition) => partition.connections)
    .map((shard): PublicGatewayShardStatus => ({
      id: shard.shardId,
      state: shard.state,
      ping:
        shard.lastHeartbeatSentAt !== null &&
        shard.lastHeartbeatAckAt !== null &&
        shard.lastHeartbeatAckAt >= shard.lastHeartbeatSentAt
          ? shard.lastHeartbeatAckAt - shard.lastHeartbeatSentAt
          : -1,
    }))
    .sort((left, right) => left.id - right.id);
  if (
    shards.length !== inspection.fleet.activeShardCount ||
    shards.some((shard, index) => shard.id !== index)
  ) {
    throw new Error(
      `Gateway status shard set is incomplete: expected ${inspection.fleet.activeShardCount}, observed ${shards.length}, ids ${shards.map(({ id }) => id).join(",")}`,
    );
  }
  return {
    phase: inspection.fleet.phase,
    shardCount: inspection.fleet.activeShardCount,
    shards,
  };
}

export class GatewayStatusService extends WorkerEntrypoint<GatewayEnv> {
  async getLogicalGuildShard(
    guildId: string,
  ): Promise<LogicalGuildShardResult> {
    try {
      const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
        GATEWAY_COORDINATOR_NAME,
      );
      return logicalGuildShard(
        (await coordinator.inspectFleet()).fleet,
        guildId,
      );
    } catch {
      return { status: "unavailable" };
    }
  }

  async getStatusSnapshot(): Promise<PublicGatewayStatusSnapshot> {
    const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    const inspection = await coordinator.inspectFleet();
    const partitions = await Promise.all(
      inspection.partitions.map(({ partitionName }) =>
        this.env.GATEWAY_PARTITION.getByName(partitionName).fleetStatus(),
      ),
    );
    return sanitizeGatewayStatus(inspection, partitions);
  }
}
