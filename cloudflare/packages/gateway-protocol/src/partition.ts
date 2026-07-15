export type GatewayPartitionAssignment = {
  partitionIndex: number;
  partitionName: string;
  firstShardId: number;
  lastShardId: number;
  shardCount: number;
};

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

function requireShardId(shardId: number, shardCount: number): void {
  if (!Number.isSafeInteger(shardId) || shardId < 0 || shardId >= shardCount) {
    throw new Error("Gateway shard ID is outside the generation");
  }
}

export function gatewayPartitionCount(
  shardCount: number,
  connectionCapacity: number,
): number {
  requirePositiveInteger(shardCount, "Gateway shard count");
  requirePositiveInteger(connectionCapacity, "Gateway partition capacity");
  return Math.ceil(shardCount / connectionCapacity);
}

export function gatewayPartitionName(partitionIndex: number): string {
  if (!Number.isSafeInteger(partitionIndex) || partitionIndex < 0) {
    throw new Error("Gateway partition index must be a non-negative safe integer");
  }
  return `gateway-partition-${String(partitionIndex)}`;
}

export function gatewayPartitionForShard(
  shardId: number,
  shardCount: number,
  connectionCapacity: number,
): GatewayPartitionAssignment {
  requirePositiveInteger(shardCount, "Gateway shard count");
  requirePositiveInteger(connectionCapacity, "Gateway partition capacity");
  requireShardId(shardId, shardCount);
  const partitionIndex = Math.floor(shardId / connectionCapacity);
  const firstShardId = partitionIndex * connectionCapacity;
  const lastShardId = Math.min(
    shardCount - 1,
    firstShardId + connectionCapacity - 1,
  );
  return {
    partitionIndex,
    partitionName: gatewayPartitionName(partitionIndex),
    firstShardId,
    lastShardId,
    shardCount: lastShardId - firstShardId + 1,
  };
}

export function gatewayPartitionAssignments(
  shardCount: number,
  connectionCapacity: number,
): GatewayPartitionAssignment[] {
  const count = gatewayPartitionCount(shardCount, connectionCapacity);
  return Array.from({ length: count }, (_, partitionIndex) => {
    const firstShardId = partitionIndex * connectionCapacity;
    return gatewayPartitionForShard(
      firstShardId,
      shardCount,
      connectionCapacity,
    );
  });
}
