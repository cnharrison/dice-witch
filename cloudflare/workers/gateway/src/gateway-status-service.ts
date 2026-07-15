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

export type PublicGatewayStatusSnapshot = {
  phase: GatewayFleetInspection["fleet"]["phase"];
  shardCount: number;
  shards: PublicGatewayShardStatus[];
};

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
