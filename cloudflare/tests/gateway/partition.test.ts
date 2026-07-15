import { describe, expect, it } from "vitest";
import {
  gatewayPartitionAssignments,
  gatewayPartitionCount,
  gatewayPartitionForShard,
} from "../../packages/gateway-protocol/src";

describe("Gateway fleet partition assignment", () => {
  it("creates a second partition automatically at the capacity boundary", () => {
    expect(gatewayPartitionCount(24, 24)).toBe(1);
    expect(gatewayPartitionCount(25, 24)).toBe(2);
    expect(gatewayPartitionAssignments(25, 24)).toEqual([
      {
        partitionIndex: 0,
        partitionName: "gateway-partition-0",
        firstShardId: 0,
        lastShardId: 23,
        shardCount: 24,
      },
      {
        partitionIndex: 1,
        partitionName: "gateway-partition-1",
        firstShardId: 24,
        lastShardId: 24,
        shardCount: 1,
      },
    ]);
  });

  it("assigns every shard to exactly one stable partition", () => {
    const assignments = Array.from({ length: 73 }, (_, shardId) =>
      gatewayPartitionForShard(shardId, 73, 24),
    );

    expect(assignments.filter(({ partitionIndex }) => partitionIndex === 0)).toHaveLength(24);
    expect(assignments.filter(({ partitionIndex }) => partitionIndex === 1)).toHaveLength(24);
    expect(assignments.filter(({ partitionIndex }) => partitionIndex === 2)).toHaveLength(24);
    expect(assignments.filter(({ partitionIndex }) => partitionIndex === 3)).toHaveLength(1);
    expect(gatewayPartitionForShard(24, 25, 24).partitionName).toBe(
      "gateway-partition-1",
    );
  });

  it.each([
    [0, 24],
    [24, 0],
    [-1, 24],
  ])("rejects shard count %s and capacity %s", (shardCount, capacity) => {
    expect(() => gatewayPartitionAssignments(shardCount, capacity)).toThrow();
  });
});
