import { describe, expect, it } from "vitest";
import type { GatewayFleetInspection } from "../../workers/gateway/src/gateway-coordinator";
import type { GatewayFleetPartitionStatus } from "../../workers/gateway/src/gateway-partition";
import type { GatewayShardStatus } from "../../workers/gateway/src/gateway-shard-connection";
import {
  logicalGuildShard,
  sanitizeGatewayStatus,
} from "../../workers/gateway/src/gateway-status-service";

function inspection(activeShardCount: number): GatewayFleetInspection {
  return {
    fleet: {
      phase: "idle",
      activeGeneration: 16,
      activeShardCount,
      nextGeneration: 17,
      targetGeneration: null,
      targetShardCount: null,
      readyShardCount: activeShardCount,
      partitionCount: 1,
    },
    partitions: [],
    totals: {
      connectionCount: activeShardCount,
      readyConnectionCount: activeShardCount,
      sessionEstablishedCount: activeShardCount,
      heartbeatAcknowledgedCount: activeShardCount,
      ownershipCount: activeShardCount,
      identifyAttempts: activeShardCount,
      resumeAttempts: 0,
    },
  };
}

function shardStatus(
  overrides: Partial<GatewayShardStatus> &
    Pick<GatewayShardStatus, "shardId" | "state">,
): GatewayShardStatus {
  return {
    connectionMode: null,
    activationId: "00000000-0000-4000-8000-000000000001",
    shardGeneration: 16,
    shardCount: 2,
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
    ...overrides,
  };
}

function partition(
  connections: GatewayFleetPartitionStatus["connections"],
): GatewayFleetPartitionStatus {
  return {
    activeGeneration: null,
    activeShardCount: null,
    connections,
  };
}

describe("private Gateway status service", () => {
  it("resolves the guild's logical owner from the active generation", () => {
    expect(
      logicalGuildShard(inspection(4).fleet, "100000000000000003"),
    ).toEqual({
      status: "available",
      shardId: 2,
      shardCount: 4,
      generation: 16,
    });
  });

  it("fails closed without an active generation", () => {
    const fleet = inspection(1).fleet;
    fleet.activeGeneration = null;
    fleet.activeShardCount = 0;

    expect(() => logicalGuildShard(fleet, "100000000000000003")).toThrow(
      "Logical guild shard is unavailable",
    );
  });

  it("returns ordered sanitized shard state and heartbeat latency", () => {
    expect(
      sanitizeGatewayStatus(
        inspection(2),
        [
          partition([
            shardStatus({
              shardId: 1,
              state: "ready",
              lastHeartbeatSentAt: 1_000,
              lastHeartbeatAckAt: 1_025,
            }),
            shardStatus({
              shardId: 0,
              state: "connecting",
              lastHeartbeatSentAt: null,
              lastHeartbeatAckAt: null,
            }),
          ]),
        ],
      ),
    ).toEqual({
      phase: "idle",
      shardCount: 2,
      shards: [
        { id: 0, state: "connecting", ping: -1 },
        { id: 1, state: "ready", ping: 25 },
      ],
    });
  });

  it("fails closed when the active shard set is incomplete", () => {
    expect(() =>
      sanitizeGatewayStatus(
        inspection(2),
        [
          partition([
            shardStatus({
              shardId: 0,
              state: "ready",
              lastHeartbeatSentAt: 1_000,
              lastHeartbeatAckAt: 1_010,
            }),
          ]),
        ],
      ),
    ).toThrow("Gateway status shard set is incomplete");
  });
});
