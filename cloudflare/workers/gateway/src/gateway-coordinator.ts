import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import {
  createGenerationMachine,
  gatewayPartitionAssignments,
  gatewayPartitionCount,
  partitionGenerationAction,
  planForcedGenerationReplacement,
  planGenerationIncrease,
  planIdentifyWaves,
  transitionGeneration,
  type GatewayPartitionCommand,
  type GenerationAction,
  type GenerationEvent,
  type GenerationMachine,
  type GenerationPlan,
  type GenerationPlanResult,
} from "../../../packages/gateway-protocol/src";
import {
  normalizeDiscordGatewayUrl,
  parseGatewayBotResponse,
  type GatewayBotInfo,
} from "./discord-gateway";
import type {
  GatewayShardFaultResult,
  GatewayShardStatus,
} from "./gateway-shard-connection";
import {
  allowedGatewayHostname,
  discordBotToken,
  discordGatewayBotUrl,
  type GatewayEnv,
} from "./environment";

const IDENTIFY_WINDOW_MS = 5_000;
const FLEET_STATE_KEY = "gateway-fleet-state-v1";
const OWNER_ID = /^[a-z][a-z0-9-]{0,63}$/;
const SafeIntegerSchema = z.number().refine(Number.isSafeInteger);
const NonNegativeSafeIntegerSchema = SafeIntegerSchema.nonnegative();
const PositiveSafeIntegerSchema = SafeIntegerSchema.positive();
const GatewayGenerationPhaseSchema = z.enum([
  "idle",
  "planned",
  "suspending-active",
  "starting-target",
  "rolling-back",
]);
const GenerationMachinePhaseSchema = z.enum([
  "idle",
  "suspending-active",
  "starting-target",
  "rolling-back",
]);
const GenerationPlanSchema = z.looseObject({
  currentGeneration: z.number(),
  currentShardCount: z.number(),
  targetGeneration: z.number(),
  targetShardCount: z.number(),
  identifyWaves: z.array(z.array(z.number())),
});
const GenerationTargetSchema = z.looseObject({
  plan: GenerationPlanSchema,
  currentWaveIndex: z.number(),
  readyShardIds: z.array(z.number()),
  failure: z.nullable(
    z.looseObject({
      shardId: z.number(),
      reason: z.string(),
    }),
  ),
});
const GenerationMachineSchema = z.looseObject({
  phase: GenerationMachinePhaseSchema,
  activeGeneration: z.number(),
  activeShardCount: z.number(),
  target: z.nullable(GenerationTargetSchema),
});
const StoredFleetStateSchema = z.looseObject({
  version: z.literal(1),
  machine: GenerationMachineSchema,
  connectionCapacity: z.number(),
  hasActiveFleet: z.boolean(),
  nextGeneration: PositiveSafeIntegerSchema,
  operatorStopped: z.boolean(),
  pendingActions: z.boolean(),
  rollbackReadyShardIds: z.array(NonNegativeSafeIntegerSchema),
});
type CoordinatorStorageInput = Parameters<
  typeof StoredFleetStateSchema.safeParse
>[0];

const GENERATION_PHASES = new Set<GatewayGenerationPhase>([
  "idle",
  "planned",
  "suspending-active",
  "starting-target",
  "rolling-back",
]);

export type ShardOwnershipRequest = {
  generation: number;
  shardId: number;
  shardCount: number;
  ownerId: string;
};

export type OwnershipResult =
  | { acquired: true; alreadyOwned: boolean }
  | { acquired: false; reason: "shard-owned-by-another-partition" };

export type IdentifyPermitResult =
  | {
      granted: true;
      rateLimitKey: number;
      maxConcurrency: number;
      remainingAfterGrant: number;
      resetAt: number;
      grantedAt: number;
    }
  | {
      granted: false;
      reason:
        | "shard-not-owned"
        | "identify-rate-limited"
        | "identify-budget-exhausted";
      rateLimitKey?: number;
      maxConcurrency?: number;
      remaining?: number;
      resetAt?: number;
      retryAt?: number;
    };

export type GatewayGenerationPhase =
  | "idle"
  | "planned"
  | "suspending-active"
  | "starting-target"
  | "rolling-back";

export type GatewayGenerationStatus = {
  activeGeneration: number;
  activeShardCount: number;
  phase: GatewayGenerationPhase;
  targetGeneration: number | null;
  targetShardCount: number | null;
  lastRecommendationCheckAt: number | null;
  postponedUntil: number | null;
};

export type RecommendationCheckResult =
  | GenerationPlanResult
  | {
      outcome: "in-progress";
      targetGeneration: number;
      targetShardCount: number;
    };

export type GatewayCoordinatorStatus = {
  ownerships: Array<ShardOwnershipRequest & { acquiredAt: number }>;
  identify: null | {
    total: number;
    remaining: number;
    resetAt: number;
    maxConcurrency: number;
    recommendedShards: number;
    observedAt: number;
  };
  generation: GatewayGenerationStatus | null;
};

type OwnershipRow = {
  generation: number;
  shard_id: number;
  shard_count: number;
  owner_id: string;
  acquired_at: number;
};

type IdentifyBudgetRow = {
  total: number;
  remaining: number;
  reset_at: number;
  max_concurrency: number;
  recommended_shards: number;
  observed_at: number;
};

type IdentifyBucketRow = { next_available_at: number };

type GatewayConfigurationRow = {
  gateway_url: string;
  observed_at: number;
};

type GatewayIdentifyInfo = Pick<
  GatewayBotInfo,
  "shards" | "sessionStartLimit"
>;

type StoredFleetState = {
  version: 1;
  machine: GenerationMachine;
  connectionCapacity: number;
  hasActiveFleet: boolean;
  nextGeneration: number;
  operatorStopped: boolean;
  pendingActions: boolean;
  rollbackReadyShardIds: number[];
};

export type GatewayFleetRecommendationResult = {
  outcome:
    | "bootstrapping"
    | "in-progress"
    | "operator-stopped"
    | GenerationPlanResult["outcome"];
  fleet: GatewayFleetStatus;
};

export type GatewayFleetInspection = {
  fleet: GatewayFleetStatus;
  partitions: Array<{
    partitionName: string;
    expectedShardCount: number;
    connectionCount: number;
    readyConnectionCount: number;
    sessionEstablishedCount: number;
    heartbeatAcknowledgedCount: number;
    ownershipCount: number;
    identifyAttempts: number;
    resumeAttempts: number;
    latestHeartbeatAckAt: number | null;
    shards: Array<
      Pick<
        GatewayShardStatus,
        | "shardGeneration"
        | "shardId"
        | "state"
        | "sequence"
        | "sessionEstablished"
        | "lastHeartbeatAckAt"
        | "lastEventType"
        | "lastError"
        | "identifyAttempts"
        | "resumeAttempts"
        | "ownershipAcquired"
        | "lastIdentifyPermit"
        | "initialGuildsPending"
        | "initialGuildsRequiringSync"
      >
    >;
  }>;
  totals: {
    connectionCount: number;
    readyConnectionCount: number;
    sessionEstablishedCount: number;
    heartbeatAcknowledgedCount: number;
    ownershipCount: number;
    identifyAttempts: number;
    resumeAttempts: number;
  };
};

export type GatewayActiveGuildInventory = {
  generation: number;
  shardCount: number;
  guildIds: string[];
  shards: Array<{
    shardId: number;
    guildCount: number;
    capturedAt: number;
  }>;
};

export type GatewayFleetStatus = {
  phase:
    | GenerationMachine["phase"]
    | "activating"
    | "bootstrapping"
    | "bootstrap-failed"
    | "stopping"
    | "stopped";
  activeGeneration: number | null;
  activeShardCount: number;
  nextGeneration: number;
  targetGeneration: number | null;
  targetShardCount: number | null;
  readyShardCount: number;
  partitionCount: number;
};

type GenerationStateRow = {
  active_generation: number;
  active_shard_count: number;
  phase: string;
  target_generation: number | null;
  target_shard_count: number | null;
  target_plan: string | null;
  last_recommendation_check_at: number | null;
  postponed_until: number | null;
};

function discordGuildShardId(guildId: string, shardCount: number): number {
  return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}

function validateGeneration(generation: number, shardCount: number): void {
  if (
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    !Number.isSafeInteger(shardCount) ||
    shardCount <= 0
  ) {
    throw new Error("Gateway generation coordinates are invalid");
  }
}

function validateOwnership(request: ShardOwnershipRequest): void {
  if (
    !Number.isSafeInteger(request.generation) ||
    request.generation < 0 ||
    !Number.isSafeInteger(request.shardId) ||
    request.shardId < 0 ||
    !Number.isSafeInteger(request.shardCount) ||
    request.shardCount <= 0 ||
    request.shardId >= request.shardCount ||
    !OWNER_ID.test(request.ownerId)
  ) {
    throw new Error("Gateway shard ownership request is invalid");
  }
}

export class GatewayCoordinator extends DurableObject<GatewayEnv> {
  private identifyRefresh: Promise<GatewayBotInfo> | null = null;
  private fleetTransitionQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: GatewayEnv) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS shard_ownership (
          generation INTEGER NOT NULL,
          shard_id INTEGER NOT NULL,
          shard_count INTEGER NOT NULL,
          owner_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL,
          PRIMARY KEY (generation, shard_id)
        );
        CREATE TABLE IF NOT EXISTS identify_budget (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          total INTEGER NOT NULL,
          remaining INTEGER NOT NULL,
          reset_at INTEGER NOT NULL,
          max_concurrency INTEGER NOT NULL,
          recommended_shards INTEGER NOT NULL,
          observed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS identify_buckets (
          rate_limit_key INTEGER PRIMARY KEY,
          next_available_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS gateway_configuration (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          gateway_url TEXT NOT NULL,
          observed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS generation_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          active_generation INTEGER NOT NULL,
          active_shard_count INTEGER NOT NULL,
          phase TEXT NOT NULL,
          target_generation INTEGER,
          target_shard_count INTEGER,
          target_plan TEXT,
          last_recommendation_check_at INTEGER,
          postponed_until INTEGER
        );
        CREATE TABLE IF NOT EXISTS generation_history (
          generation INTEGER PRIMARY KEY,
          shard_count INTEGER NOT NULL,
          state TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      return Promise.resolve();
    });
  }

  async reconcileFleetRecommendation(
    connectionCapacity: number,
  ): Promise<GatewayFleetRecommendationResult> {
    validateGeneration(0, connectionCapacity);
    const beforeFetch = await this.readFleetState();
    if (beforeFetch?.operatorStopped === true) {
      return {
        outcome: "operator-stopped",
        fleet: this.toFleetStatus(beforeFetch),
      };
    }
    if (
      beforeFetch !== null &&
      (beforeFetch.machine.phase !== "idle" || beforeFetch.pendingActions)
    ) {
      return {
        outcome: "in-progress",
        fleet: this.toFleetStatus(beforeFetch),
      };
    }

    const info = await this.fetchGatewayBotInfo();
    const availableIdentifies = this.availableIdentifyBudget(info);
    this.ctx.storage.transactionSync(() => {
      this.storeBudget(
        info,
        availableIdentifies,
        info.sessionStartLimit.resetAt,
      );
      this.storeGatewayConfiguration(info);
    });

    const state = await this.readFleetState();
    if (state === null) {
      return this.bootstrapFleet(
        info,
        availableIdentifies,
        connectionCapacity,
      );
    }
    if (state.connectionCapacity !== connectionCapacity) {
      throw new Error("Gateway fleet partition capacity changed");
    }
    if (state.machine.phase !== "idle" || state.pendingActions) {
      return { outcome: "in-progress", fleet: this.toFleetStatus(state) };
    }
    if (!state.hasActiveFleet) {
      return this.bootstrapFleet(
        info,
        availableIdentifies,
        connectionCapacity,
        state.nextGeneration,
      );
    }

    const planned = planGenerationIncrease({
      currentGeneration: state.machine.activeGeneration,
      currentShardCount: state.machine.activeShardCount,
      recommendedShardCount: info.shards,
      remainingIdentifies: availableIdentifies,
      identifyResetAt: info.sessionStartLimit.resetAt,
      maxConcurrency: info.sessionStartLimit.maxConcurrency,
      partitionCapacity: Math.max(
        state.machine.activeShardCount,
        info.shards,
      ),
    });
    if (planned.outcome !== "planned") {
      return { outcome: planned.outcome, fleet: this.toFleetStatus(state) };
    }
    const plan = {
      ...planned.plan,
      targetGeneration: state.nextGeneration,
    };
    const fleet = await this.startFleetPlan(plan);
    return { outcome: "planned", fleet };
  }

  async startFleetRecommendations(
    connectionCapacity: number,
  ): Promise<GatewayFleetRecommendationResult> {
    validateGeneration(0, connectionCapacity);
    const state = await this.readFleetState();
    if (state?.operatorStopped === true && state.pendingActions) {
      return { outcome: "in-progress", fleet: this.toFleetStatus(state) };
    }
    if (state?.operatorStopped === true) {
      await this.ctx.storage.put(FLEET_STATE_KEY, {
        ...state,
        operatorStopped: false,
      });
    }
    return this.reconcileFleetRecommendation(connectionCapacity);
  }

  async stopFleet(): Promise<GatewayFleetStatus> {
    const operation = this.fleetTransitionQueue.then(async () => {
      const state = await this.requireFleetState();
      const target = state.machine.target?.plan;
      const actions: GenerationAction[] = [];
      if (target !== undefined) {
        actions.push({
          type: "stop-generation",
          generation: target.targetGeneration,
          shardCount: target.targetShardCount,
        });
      }
      if (
        state.hasActiveFleet &&
        state.machine.activeGeneration !== target?.targetGeneration
      ) {
        actions.push({
          type: "stop-generation",
          generation: state.machine.activeGeneration,
          shardCount: state.machine.activeShardCount,
        });
      }
      const stopping: StoredFleetState = {
        ...state,
        operatorStopped: true,
        pendingActions: actions.length > 0,
      };
      await this.ctx.storage.put(FLEET_STATE_KEY, stopping);
      return { actions, state: stopping };
    });
    this.fleetTransitionQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    const result = await operation;
    await this.runFleetActions(result.actions, result.state);
    const finalize = this.fleetTransitionQueue.then(async () => {
      const state = await this.requireFleetState();
      const stopped: StoredFleetState = {
        ...state,
        machine: createGenerationMachine(state.nextGeneration - 1, 1),
        hasActiveFleet: false,
        pendingActions: false,
        rollbackReadyShardIds: [],
      };
      await this.ctx.storage.put(FLEET_STATE_KEY, stopped);
      return stopped;
    });
    this.fleetTransitionQueue = finalize.then(
      () => undefined,
      () => undefined,
    );
    return this.toFleetStatus(await finalize);
  }

  async initializeFleet(
    generation: number,
    shardCount: number,
    connectionCapacity: number,
  ): Promise<GatewayFleetStatus> {
    validateGeneration(generation, shardCount);
    validateGeneration(0, connectionCapacity);
    const existing = await this.readFleetState();
    if (existing !== null) {
      if (
        existing.machine.activeGeneration !== generation ||
        existing.machine.activeShardCount !== shardCount ||
        existing.connectionCapacity !== connectionCapacity
      ) {
        throw new Error("Gateway fleet is already initialized");
      }
      return this.toFleetStatus(existing);
    }
    const state: StoredFleetState = {
      version: 1,
      machine: createGenerationMachine(generation, shardCount),
      connectionCapacity,
      hasActiveFleet: true,
      nextGeneration: generation + 1,
      operatorStopped: false,
      pendingActions: false,
      rollbackReadyShardIds: [],
    };
    await this.ctx.storage.put(FLEET_STATE_KEY, state);
    return this.toFleetStatus(state);
  }

  async startFleetPlan(plan: GenerationPlan): Promise<GatewayFleetStatus> {
    const state = await this.requireFleetState();
    if (!state.hasActiveFleet) {
      throw new Error("Gateway fleet has no active generation");
    }
    if (
      plan.targetGeneration < state.nextGeneration ||
      plan.targetGeneration === Number.MAX_SAFE_INTEGER
    ) {
      throw new Error("Gateway fleet target generation is invalid");
    }
    const transition = transitionGeneration(state.machine, {
      type: "plan",
      plan,
    });
    const updated = {
      ...state,
      machine: transition.machine,
      nextGeneration: plan.targetGeneration + 1,
      rollbackReadyShardIds: [],
    };
    await this.ctx.storage.put(FLEET_STATE_KEY, updated);
    await this.executeFleetActions(transition.actions, updated);
    return this.fleetStatus();
  }

  async reportFleetShardReady(
    generation: number,
    shardId: number,
    shardCount: number,
  ): Promise<void> {
    validateOwnership({
      generation,
      shardId,
      shardCount,
      ownerId: "gateway-partition-0",
    });
    const result = await this.enqueueFleetReady(
      generation,
      shardId,
      shardCount,
    );
    if (result.actions.length > 0) {
      this.ctx.waitUntil(
        this.executeFleetActions(result.actions, result.state).catch(() => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "Gateway fleet action failed",
            }),
          );
        }),
      );
    }
  }

  async reportFleetShardFailed(
    generation: number,
    shardId: number,
    shardCount: number,
    reason: string,
  ): Promise<void> {
    if (reason.length === 0 || reason.length > 128) {
      throw new Error("Gateway fleet failure reason is invalid");
    }
    const result = await this.enqueueFleetEvent({
      type: "target-shard-failed",
      shardId,
      reason,
    }, generation, shardCount, "Failed");
    this.ctx.waitUntil(
      this.executeFleetActions(result.actions, result.state).catch(() => {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Gateway fleet rollback action failed",
          }),
        );
      }),
    );
  }

  async fleetStatus(): Promise<GatewayFleetStatus> {
    return this.toFleetStatus(await this.requireFleetState());
  }

  async inspectFleet(): Promise<GatewayFleetInspection> {
    const state = await this.requireFleetState();
    const fleet = this.toFleetStatus(state);
    const target = state.machine.target?.plan;
    const inspectedShardCount = state.hasActiveFleet
      ? state.machine.activeShardCount
      : target?.targetShardCount;
    if (inspectedShardCount === undefined) {
      return {
        fleet,
        partitions: [],
        totals: this.emptyFleetInspectionTotals(),
      };
    }
    const assignments = gatewayPartitionAssignments(
      inspectedShardCount,
      state.connectionCapacity,
    );
    const statuses = await Promise.all(
      assignments.map((assignment) =>
        this.env.GATEWAY_PARTITION.getByName(
          assignment.partitionName,
        ).fleetStatus(),
      ),
    );
    const partitions = assignments.map((assignment, index) => {
      const status = statuses[index];
      const inspectingTarget = !state.hasActiveFleet && target !== undefined;
      const generationMatches = inspectingTarget ||
        (status?.activeGeneration === state.machine.activeGeneration &&
          status.activeShardCount === state.machine.activeShardCount);
      const connections = generationMatches
        ? (status?.connections ?? []).filter(
            (connection) =>
              connection.shardCount === inspectedShardCount &&
              connection.shardId >= assignment.firstShardId &&
              connection.shardId <= assignment.lastShardId,
          )
        : [];
      const heartbeatAcks = connections
        .map((connection) => connection.lastHeartbeatAckAt)
        .filter((value): value is number => value !== null);
      return {
        partitionName: assignment.partitionName,
        expectedShardCount: assignment.shardCount,
        connectionCount: connections.length,
        readyConnectionCount: connections.filter(
          (connection) => connection.state === "ready",
        ).length,
        sessionEstablishedCount: connections.filter(
          (connection) => connection.sessionEstablished,
        ).length,
        heartbeatAcknowledgedCount: heartbeatAcks.length,
        ownershipCount: connections.filter(
          (connection) => connection.ownershipAcquired,
        ).length,
        identifyAttempts: connections.reduce(
          (total, connection) => total + connection.identifyAttempts,
          0,
        ),
        resumeAttempts: connections.reduce(
          (total, connection) => total + connection.resumeAttempts,
          0,
        ),
        latestHeartbeatAckAt:
          heartbeatAcks.length === 0 ? null : Math.max(...heartbeatAcks),
        shards: connections.map((connection) => ({
          shardGeneration: connection.shardGeneration,
          shardId: connection.shardId,
          state: connection.state,
          sequence: connection.sequence,
          sessionEstablished: connection.sessionEstablished,
          lastHeartbeatAckAt: connection.lastHeartbeatAckAt,
          lastEventType: connection.lastEventType,
          lastError: connection.lastError,
          identifyAttempts: connection.identifyAttempts,
          resumeAttempts: connection.resumeAttempts,
          ownershipAcquired: connection.ownershipAcquired,
          lastIdentifyPermit: connection.lastIdentifyPermit,
          initialGuildsPending: connection.initialGuildsPending,
          initialGuildsRequiringSync:
            connection.initialGuildsRequiringSync,
        })),
      };
    });
    const totals = this.emptyFleetInspectionTotals();
    for (const partition of partitions) {
      totals.connectionCount += partition.connectionCount;
      totals.readyConnectionCount += partition.readyConnectionCount;
      totals.sessionEstablishedCount += partition.sessionEstablishedCount;
      totals.heartbeatAcknowledgedCount +=
        partition.heartbeatAcknowledgedCount;
      totals.ownershipCount += partition.ownershipCount;
      totals.identifyAttempts += partition.identifyAttempts;
      totals.resumeAttempts += partition.resumeAttempts;
    }
    return { fleet, partitions, totals };
  }

  async forceActiveShardReidentify(
    shardId: number,
  ): Promise<GatewayShardFaultResult> {
    const state = await this.requireFleetState();
    if (
      !state.hasActiveFleet ||
      state.machine.phase !== "idle" ||
      state.pendingActions ||
      !Number.isSafeInteger(shardId) ||
      shardId < 0 ||
      shardId >= state.machine.activeShardCount
    ) {
      throw new Error("Gateway active shard reidentify request is invalid");
    }
    const assignment = gatewayPartitionAssignments(
      state.machine.activeShardCount,
      state.connectionCapacity,
    ).find(
      (candidate) =>
        shardId >= candidate.firstShardId &&
        shardId <= candidate.lastShardId,
    );
    if (assignment === undefined) {
      throw new Error("Gateway active shard assignment is missing");
    }
    return this.env.GATEWAY_PARTITION.getByName(
      assignment.partitionName,
    ).forceFleetShardReidentify(
      state.machine.activeGeneration,
      shardId,
      state.machine.activeShardCount,
    );
  }

  async activeGuildInventory(): Promise<GatewayActiveGuildInventory> {
    const state = await this.requireFleetState();
    if (
      !state.hasActiveFleet ||
      state.machine.phase !== "idle" ||
      state.pendingActions
    ) {
      throw new Error("Gateway active guild inventory is unavailable");
    }
    const generation = state.machine.activeGeneration;
    const shardCount = state.machine.activeShardCount;
    const assignments = gatewayPartitionAssignments(
      shardCount,
      state.connectionCapacity,
    );
    const partitionInventories = await Promise.all(
      assignments.map((assignment) =>
        this.env.GATEWAY_PARTITION.getByName(
          assignment.partitionName,
        ).fleetGuildInventory(),
      ),
    );
    const entries = partitionInventories.flatMap((partition, index) => {
      const assignment = assignments[index];
      if (
        assignment === undefined ||
        partition.activeGeneration !== generation ||
        partition.activeShardCount !== shardCount
      ) {
        throw new Error("Gateway guild inventory partition is inconsistent");
      }
      return partition.entries.filter(
        ({ status }) =>
          status.shardGeneration === generation &&
          status.shardCount === shardCount &&
          status.shardId >= assignment.firstShardId &&
          status.shardId <= assignment.lastShardId,
      );
    }).sort((left, right) => left.status.shardId - right.status.shardId);
    if (entries.length !== shardCount) {
      throw new Error("Gateway active guild inventory is incomplete");
    }
    const guildIds = new Set<string>();
    const shards: GatewayActiveGuildInventory["shards"] = [];
    for (let shardId = 0; shardId < entries.length; shardId += 1) {
      const entry = entries[shardId];
      if (
        entry === undefined ||
        entry.status.shardId !== shardId ||
        entry.status.state !== "ready" ||
        entry.inventory === null ||
        entry.inventory.generation !== generation ||
        entry.inventory.shardId !== shardId ||
        entry.inventory.shardCount !== shardCount
      ) {
        throw new Error("Gateway active guild inventory is incomplete");
      }
      const { inventory, status } = entry;
      for (const guildId of inventory.guildIds) {
        if (
          discordGuildShardId(guildId, shardCount) !== status.shardId ||
          guildIds.has(guildId)
        ) {
          throw new Error("Gateway active guild inventory is inconsistent");
        }
        guildIds.add(guildId);
      }
      shards.push({
        shardId: status.shardId,
        guildCount: inventory.guildIds.length,
        capturedAt: inventory.capturedAt,
      });
    }
    return { generation, shardCount, guildIds: [...guildIds], shards };
  }

  initializeGeneration(
    generation: number,
    shardCount: number,
  ): GatewayGenerationStatus {
    validateGeneration(generation, shardCount);
    return this.ctx.storage.transactionSync(() => {
      const existing = this.findGenerationState();
      if (existing !== undefined) {
        if (
          existing.active_generation !== generation ||
          existing.active_shard_count !== shardCount
        ) {
          throw new Error("Gateway generation is already initialized");
        }
        return this.toGenerationStatus(existing);
      }

      const now = Date.now();
      this.ctx.storage.sql.exec(
        `INSERT INTO generation_state
          (singleton, active_generation, active_shard_count, phase,
           target_generation, target_shard_count, target_plan,
           last_recommendation_check_at, postponed_until)
         VALUES (1, ?, ?, 'idle', NULL, NULL, NULL, NULL, NULL)`,
        generation,
        shardCount,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO generation_history
          (generation, shard_count, state, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?)`,
        generation,
        shardCount,
        now,
        now,
      );
      const initialized = this.findGenerationState();
      if (initialized === undefined) {
        throw new Error("Gateway generation initialization failed");
      }
      return this.toGenerationStatus(initialized);
    });
  }

  checkRecommendation(
    partitionCapacity: number,
  ): Promise<RecommendationCheckResult> {
    return this.evaluateRecommendation(partitionCapacity, null);
  }

  forceRecommendation(
    partitionCapacity: number,
    recommendedShardCount: number,
  ): Promise<RecommendationCheckResult> {
    validateGeneration(0, recommendedShardCount);
    return this.evaluateRecommendation(
      partitionCapacity,
      recommendedShardCount,
    );
  }

  private async evaluateRecommendation(
    partitionCapacity: number,
    recommendationOverride: number | null,
  ): Promise<RecommendationCheckResult> {
    validateGeneration(0, partitionCapacity);
    const initialState = this.findGenerationState();
    if (initialState === undefined) {
      throw new Error("Gateway generation is not initialized");
    }
    const initialStatus = this.toGenerationStatus(initialState);
    if (initialStatus.phase !== "idle") {
      if (
        initialStatus.targetGeneration === null ||
        initialStatus.targetShardCount === null
      ) {
        throw new Error("Gateway target generation state is invalid");
      }
      return {
        outcome: "in-progress",
        targetGeneration: initialStatus.targetGeneration,
        targetShardCount: initialStatus.targetShardCount,
      };
    }

    const observedInfo = await this.fetchGatewayBotInfo();
    const info =
      recommendationOverride === null
        ? observedInfo
        : { ...observedInfo, shards: recommendationOverride };
    return this.ctx.storage.transactionSync(() => {
      const state = this.findGenerationState();
      if (state === undefined) {
        throw new Error("Gateway generation is not initialized");
      }
      const status = this.toGenerationStatus(state);
      if (status.phase !== "idle") {
        if (
          status.targetGeneration === null ||
          status.targetShardCount === null
        ) {
          throw new Error("Gateway target generation state is invalid");
        }
        return {
          outcome: "in-progress",
          targetGeneration: status.targetGeneration,
          targetShardCount: status.targetShardCount,
        };
      }

      const availableIdentifies = this.availableIdentifyBudget(observedInfo);
      this.storeBudget(
        observedInfo,
        availableIdentifies,
        observedInfo.sessionStartLimit.resetAt,
      );
      this.storeGatewayConfiguration(observedInfo);
      const planner =
        recommendationOverride === null
          ? planGenerationIncrease
          : planForcedGenerationReplacement;
      let result: GenerationPlanResult = planner({
        currentGeneration: state.active_generation,
        currentShardCount: state.active_shard_count,
        recommendedShardCount: info.shards,
        remainingIdentifies: availableIdentifies,
        identifyResetAt: info.sessionStartLimit.resetAt,
        maxConcurrency: info.sessionStartLimit.maxConcurrency,
        partitionCapacity,
      });
      const checkedAt = info.sessionStartLimit.observedAt;
      if (result.outcome === "planned") {
        const plan = {
          ...result.plan,
          targetGeneration: this.nextGenerationNumber(),
        };
        result = { outcome: "planned", plan };
        this.ctx.storage.sql.exec(
          `UPDATE generation_state SET
             phase = 'planned',
             target_generation = ?,
             target_shard_count = ?,
             target_plan = ?,
             last_recommendation_check_at = ?,
             postponed_until = NULL
           WHERE singleton = 1`,
          plan.targetGeneration,
          plan.targetShardCount,
          JSON.stringify(plan),
          checkedAt,
        );
        this.ctx.storage.sql.exec(
          `INSERT INTO generation_history
            (generation, shard_count, state, created_at, updated_at)
           VALUES (?, ?, 'planned', ?, ?)`,
          plan.targetGeneration,
          plan.targetShardCount,
          checkedAt,
          checkedAt,
        );
      } else if (result.outcome === "postponed") {
        this.ctx.storage.sql.exec(
          `UPDATE generation_state SET
             target_generation = NULL,
             target_shard_count = NULL,
             target_plan = NULL,
             last_recommendation_check_at = ?,
             postponed_until = ?
           WHERE singleton = 1`,
          checkedAt,
          result.retryAt,
        );
      } else {
        this.ctx.storage.sql.exec(
          `UPDATE generation_state SET
             target_generation = NULL,
             target_shard_count = NULL,
             target_plan = NULL,
             last_recommendation_check_at = ?,
             postponed_until = NULL
           WHERE singleton = 1`,
          checkedAt,
        );
      }
      return result;
    });
  }

  plannedGeneration(): GenerationPlan | null {
    const state = this.findGenerationState();
    if (state === undefined || state.phase === "idle") return null;
    return this.parseStoredPlan(state);
  }

  recordGeneration(machine: GenerationMachine): GatewayGenerationStatus {
    return this.ctx.storage.transactionSync(() => {
      const state = this.findGenerationState();
      if (state === undefined) {
        throw new Error("Gateway generation is not initialized");
      }
      const previousTargetGeneration = state.target_generation;
      const previousTargetShardCount = state.target_shard_count;
      const now = Date.now();

      if (machine.target !== null) {
        const plan = machine.target.plan;
        const storedPlan = this.parseStoredPlan(state);
        if (
          !GENERATION_PHASES.has(machine.phase) ||
          machine.phase === "idle" ||
          JSON.stringify(plan) !== JSON.stringify(storedPlan) ||
          machine.activeGeneration !== state.active_generation ||
          machine.activeShardCount !== state.active_shard_count ||
          plan.targetGeneration !== previousTargetGeneration ||
          plan.targetShardCount !== previousTargetShardCount
        ) {
          throw new Error("Gateway generation transition does not match the plan");
        }
        this.ctx.storage.sql.exec(
          `UPDATE generation_state SET
             phase = ?, target_plan = ?, postponed_until = NULL
           WHERE singleton = 1`,
          machine.phase,
          JSON.stringify(plan),
        );
        this.ctx.storage.sql.exec(
          `UPDATE generation_history SET state = ?, updated_at = ?
           WHERE generation = ?`,
          machine.phase,
          now,
          plan.targetGeneration,
        );
      } else if (
        previousTargetGeneration !== null &&
        previousTargetShardCount !== null &&
        machine.activeGeneration === previousTargetGeneration &&
        machine.activeShardCount === previousTargetShardCount
      ) {
        this.ctx.storage.sql.exec(
          `UPDATE generation_history SET state = 'retired', updated_at = ?
           WHERE generation = ?`,
          now,
          state.active_generation,
        );
        this.ctx.storage.sql.exec(
          `UPDATE generation_history SET state = 'active', updated_at = ?
           WHERE generation = ?`,
          now,
          previousTargetGeneration,
        );
        this.ctx.storage.sql.exec(
          `UPDATE generation_state SET
             active_generation = ?, active_shard_count = ?, phase = 'idle',
             target_generation = NULL, target_shard_count = NULL,
             target_plan = NULL, postponed_until = NULL
           WHERE singleton = 1`,
          machine.activeGeneration,
          machine.activeShardCount,
        );
      } else if (
        machine.activeGeneration === state.active_generation &&
        machine.activeShardCount === state.active_shard_count
      ) {
        if (previousTargetGeneration !== null) {
          this.ctx.storage.sql.exec(
            `UPDATE generation_history SET state = 'failed', updated_at = ?
             WHERE generation = ?`,
            now,
            previousTargetGeneration,
          );
        }
        this.ctx.storage.sql.exec(
          `UPDATE generation_state SET
             phase = 'idle', target_generation = NULL,
             target_shard_count = NULL, target_plan = NULL,
             postponed_until = NULL
           WHERE singleton = 1`,
        );
      } else {
        throw new Error("Gateway active generation transition is invalid");
      }

      const updated = this.findGenerationState();
      if (updated === undefined) {
        throw new Error("Gateway generation transition was not persisted");
      }
      return this.toGenerationStatus(updated);
    });
  }

  reconcileStableOwnerships(
    activeGeneration: number,
    activeShardCount: number,
  ): number {
    validateGeneration(activeGeneration, activeShardCount);
    const state = this.findGenerationState();
    if (
      state === undefined ||
      state.phase !== "idle" ||
      state.active_generation !== activeGeneration ||
      state.active_shard_count !== activeShardCount
    ) {
      throw new Error("Gateway ownership reconciliation state is invalid");
    }
    return this.ctx.storage.sql.exec(
      "DELETE FROM shard_ownership WHERE generation != ?",
      activeGeneration,
    ).rowsWritten;
  }

  acquireOwnership(request: ShardOwnershipRequest): OwnershipResult {
    validateOwnership(request);
    return this.ctx.storage.transactionSync(() => {
      const existing = this.findOwnership(request.generation, request.shardId);
      if (existing === undefined) {
        this.ctx.storage.sql.exec(
          `INSERT INTO shard_ownership
            (generation, shard_id, shard_count, owner_id, acquired_at)
           VALUES (?, ?, ?, ?, ?)`,
          request.generation,
          request.shardId,
          request.shardCount,
          request.ownerId,
          Date.now(),
        );
        return { acquired: true, alreadyOwned: false };
      }
      if (
        existing.owner_id === request.ownerId &&
        existing.shard_count === request.shardCount
      ) {
        return { acquired: true, alreadyOwned: true };
      }
      return {
        acquired: false,
        reason: "shard-owned-by-another-partition",
      };
    });
  }

  releaseOwnership(request: ShardOwnershipRequest): boolean {
    validateOwnership(request);
    const result = this.ctx.storage.sql.exec(
      `DELETE FROM shard_ownership
       WHERE generation = ? AND shard_id = ? AND shard_count = ? AND owner_id = ?`,
      request.generation,
      request.shardId,
      request.shardCount,
      request.ownerId,
    );
    return result.rowsWritten === 1;
  }

  async gatewayUrl(): Promise<string> {
    const stored = this.ctx.storage.sql
      .exec<GatewayConfigurationRow>(
        `SELECT gateway_url, observed_at
         FROM gateway_configuration WHERE singleton = 1`,
      )
      .toArray()[0];
    if (stored !== undefined) {
      if (!Number.isSafeInteger(stored.observed_at) || stored.observed_at < 0) {
        throw new Error("Stored Gateway configuration is invalid");
      }
      return normalizeDiscordGatewayUrl(
        stored.gateway_url,
        allowedGatewayHostname(this.env),
      );
    }

    const info = await this.refreshGatewayBotInfo();
    this.ctx.storage.transactionSync(() => {
      const availableIdentifies = this.availableIdentifyBudget(info);
      this.storeBudget(info, availableIdentifies, info.sessionStartLimit.resetAt);
      this.storeGatewayConfiguration(info);
    });
    return normalizeDiscordGatewayUrl(
      info.url,
      allowedGatewayHostname(this.env),
    );
  }

  async requestIdentifyPermit(
    request: ShardOwnershipRequest,
  ): Promise<IdentifyPermitResult> {
    validateOwnership(request);
    if (!this.ownsShard(request)) {
      return { granted: false, reason: "shard-not-owned" };
    }

    const info =
      this.storedIdentifyInfo() ?? (await this.refreshGatewayBotInfo());
    return this.ctx.storage.transactionSync(() =>
      this.reserveIdentifyPermit(request, info),
    );
  }

  status(): GatewayCoordinatorStatus {
    const ownerships = this.ctx.storage.sql
      .exec<OwnershipRow>(
        `SELECT generation, shard_id, shard_count, owner_id, acquired_at
         FROM shard_ownership
         ORDER BY generation, shard_id`,
      )
      .toArray()
      .map((row) => ({
        generation: row.generation,
        shardId: row.shard_id,
        shardCount: row.shard_count,
        ownerId: row.owner_id,
        acquiredAt: row.acquired_at,
      }));
    const budget = this.ctx.storage.sql
      .exec<IdentifyBudgetRow>(
        `SELECT total, remaining, reset_at, max_concurrency,
                recommended_shards, observed_at
         FROM identify_budget WHERE singleton = 1`,
      )
      .toArray()[0];
    const generation = this.findGenerationState();
    return {
      ownerships,
      identify:
        budget === undefined
          ? null
          : {
              total: budget.total,
              remaining: budget.remaining,
              resetAt: budget.reset_at,
              maxConcurrency: budget.max_concurrency,
              recommendedShards: budget.recommended_shards,
              observedAt: budget.observed_at,
            },
      generation:
        generation === undefined ? null : this.toGenerationStatus(generation),
    };
  }

  private async bootstrapFleet(
    info: GatewayBotInfo,
    availableIdentifies: number,
    connectionCapacity: number,
    retryGeneration?: number,
  ): Promise<GatewayFleetRecommendationResult> {
    if (availableIdentifies < info.shards) {
      throw new Error("Initial Gateway fleet Identify budget is insufficient");
    }
    const targetGeneration =
      retryGeneration ?? this.nextFleetGenerationNumber();
    const plan: GenerationPlan = {
      currentGeneration: targetGeneration - 1,
      currentShardCount: 1,
      targetGeneration,
      targetShardCount: info.shards,
      identifyWaves: planIdentifyWaves(
        info.shards,
        info.sessionStartLimit.maxConcurrency,
      ),
    };
    const firstWave = plan.identifyWaves[0];
    if (firstWave === undefined) {
      throw new Error("Initial Gateway fleet has no Identify wave");
    }
    const bootstrapping: StoredFleetState = {
      version: 1,
      machine: {
        phase: "starting-target",
        activeGeneration: targetGeneration - 1,
        activeShardCount: 1,
        target: {
          plan,
          currentWaveIndex: 0,
          readyShardIds: [],
          failure: null,
        },
      },
      connectionCapacity,
      hasActiveFleet: false,
      nextGeneration: targetGeneration + 1,
      operatorStopped: false,
      pendingActions: false,
      rollbackReadyShardIds: [],
    };
    await this.ctx.storage.put(FLEET_STATE_KEY, bootstrapping);
    await this.executeFleetActions(
      [
        {
          type: "start-target-wave",
          generation: targetGeneration,
          shardIds: firstWave,
          shardCount: info.shards,
        },
      ],
      bootstrapping,
    );
    return {
      outcome: "bootstrapping",
      fleet: this.toFleetStatus(bootstrapping),
    };
  }

  private enqueueFleetReady(
    generation: number,
    shardId: number,
    shardCount: number,
  ): Promise<{ actions: GenerationAction[]; state: StoredFleetState }> {
    const operation = this.fleetTransitionQueue.then(async () => {
      const state = await this.requireFleetState();
      if (
        state.machine.phase === "idle" &&
        generation === state.machine.activeGeneration &&
        shardCount === state.machine.activeShardCount
      ) {
        return { actions: [], state };
      }
      if (
        state.machine.phase === "rolling-back" &&
        generation === state.machine.activeGeneration &&
        shardCount === state.machine.activeShardCount
      ) {
        const readyShardIds = state.rollbackReadyShardIds.includes(shardId)
          ? state.rollbackReadyShardIds
          : [...state.rollbackReadyShardIds, shardId].sort(
              (left, right) => left - right,
            );
        const machine =
          readyShardIds.length === state.machine.activeShardCount
            ? transitionGeneration(state.machine, { type: "rollback-ready" })
                .machine
            : state.machine;
        const updated = {
          ...state,
          machine,
          rollbackReadyShardIds: readyShardIds,
        };
        await this.ctx.storage.put(FLEET_STATE_KEY, updated);
        return { actions: [], state: updated };
      }
      const target = state.machine.target?.plan;
      if (
        target === undefined ||
        generation !== target.targetGeneration ||
        shardCount !== target.targetShardCount
      ) {
        throw new Error("Ready shard does not belong to the target fleet");
      }
      const transition = transitionGeneration(state.machine, {
        type: "target-shard-ready",
        shardId,
      });
      const updated = {
        ...state,
        machine: transition.machine,
        hasActiveFleet:
          state.hasActiveFleet || transition.machine.phase === "idle",
        pendingActions: transition.actions.length > 0,
      };
      await this.ctx.storage.put(FLEET_STATE_KEY, updated);
      return { actions: transition.actions, state: updated };
    });
    this.fleetTransitionQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private enqueueFleetEvent(
    event: GenerationEvent,
    generation: number,
    shardCount: number,
    label: "Ready" | "Failed",
  ): Promise<{ actions: GenerationAction[]; state: StoredFleetState }> {
    const operation = this.fleetTransitionQueue.then(async () => {
      const state = await this.requireFleetState();
      const target = state.machine.target?.plan;
      if (
        target === undefined ||
        generation !== target.targetGeneration ||
        shardCount !== target.targetShardCount
      ) {
        throw new Error(`${label} shard does not belong to the target fleet`);
      }
      const transition = transitionGeneration(state.machine, event);
      const initialBootstrapFailed =
        event.type === "target-shard-failed" && !state.hasActiveFleet;
      const actions = initialBootstrapFailed
        ? transition.actions.filter(
            (action) => action.type === "stop-generation",
          )
        : transition.actions;
      const machine = initialBootstrapFailed
        ? createGenerationMachine(target.targetGeneration, 1)
        : transition.machine;
      const updated = {
        ...state,
        machine,
        pendingActions: actions.length > 0,
        rollbackReadyShardIds: [],
      };
      await this.ctx.storage.put(FLEET_STATE_KEY, updated);
      return { actions, state: updated };
    });
    this.fleetTransitionQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async runFleetActions(
    actions: GenerationAction[],
    state: StoredFleetState,
  ): Promise<void> {
    for (const action of actions) {
      const commands = partitionGenerationAction(
        action,
        state.connectionCapacity,
      );
      await Promise.all(
        commands.map((command) => this.executeFleetCommand(command)),
      );
      if (action.type === "suspend-generation") {
        const transition = transitionGeneration(state.machine, {
          type: "active-suspended",
        });
        const updated = { ...state, machine: transition.machine };
        await this.ctx.storage.put(FLEET_STATE_KEY, updated);
        await this.executeFleetActions(transition.actions, updated);
      }
    }
  }

  private async executeFleetActions(
    actions: GenerationAction[],
    state: StoredFleetState,
  ): Promise<void> {
    await this.runFleetActions(actions, state);
    const current = await this.requireFleetState();
    if (current.pendingActions) {
      await this.ctx.storage.put(FLEET_STATE_KEY, {
        ...current,
        pendingActions: false,
      });
    }
  }

  private executeFleetCommand(command: GatewayPartitionCommand): Promise<void> {
    const partition = this.env.GATEWAY_PARTITION.getByName(
      command.assignment.partitionName,
    );
    return partition.executeFleetCommand(command);
  }

  private async readFleetState(): Promise<StoredFleetState | null> {
    const value: CoordinatorStorageInput = await this.ctx.storage.get(
      FLEET_STATE_KEY,
    );
    if (value === undefined) return null;
    const stored = StoredFleetStateSchema.safeParse(value);
    if (!stored.success) {
      throw new Error("Stored Gateway fleet state is invalid");
    }
    validateGeneration(0, stored.data.connectionCapacity);
    validateGeneration(
      stored.data.machine.activeGeneration,
      stored.data.machine.activeShardCount,
    );
    return {
      version: 1,
      machine: stored.data.machine,
      connectionCapacity: stored.data.connectionCapacity,
      hasActiveFleet: stored.data.hasActiveFleet,
      nextGeneration: stored.data.nextGeneration,
      operatorStopped: stored.data.operatorStopped,
      pendingActions: stored.data.pendingActions,
      rollbackReadyShardIds: stored.data.rollbackReadyShardIds,
    };
  }

  private async requireFleetState(): Promise<StoredFleetState> {
    const state = await this.readFleetState();
    if (state === null) throw new Error("Gateway fleet is not initialized");
    return state;
  }

  private emptyFleetInspectionTotals(): GatewayFleetInspection["totals"] {
    return {
      connectionCount: 0,
      readyConnectionCount: 0,
      sessionEstablishedCount: 0,
      heartbeatAcknowledgedCount: 0,
      ownershipCount: 0,
      identifyAttempts: 0,
      resumeAttempts: 0,
    };
  }

  private toFleetStatus(state: StoredFleetState): GatewayFleetStatus {
    const target = state.machine.target;
    let phase: GatewayFleetStatus["phase"] = state.machine.phase;
    if (state.operatorStopped) {
      phase = state.pendingActions ? "stopping" : "stopped";
    } else if (!state.hasActiveFleet) {
      phase =
        state.machine.phase === "idle" && !state.pendingActions
          ? "bootstrap-failed"
          : "bootstrapping";
    } else if (state.machine.phase === "idle" && state.pendingActions) {
      phase = "activating";
    }
    const targetShardCount = target?.plan.targetShardCount ?? null;
    const partitionShardCount = state.hasActiveFleet
      ? Math.max(state.machine.activeShardCount, targetShardCount ?? 0)
      : targetShardCount;
    return {
      phase,
      activeGeneration: state.hasActiveFleet
        ? state.machine.activeGeneration
        : null,
      activeShardCount: state.hasActiveFleet
        ? state.machine.activeShardCount
        : 0,
      nextGeneration: state.nextGeneration,
      targetGeneration: target?.plan.targetGeneration ?? null,
      targetShardCount,
      readyShardCount:
        target?.readyShardIds.length ??
        (state.hasActiveFleet ? state.machine.activeShardCount : 0),
      partitionCount:
        partitionShardCount === null
          ? 0
          : gatewayPartitionCount(
              partitionShardCount,
              state.connectionCapacity,
            ),
    };
  }

  private parseStoredPlan(state: GenerationStateRow): GenerationPlan {
    if (state.target_plan === null) {
      throw new Error("Gateway target generation plan is unavailable");
    }
    let value: CoordinatorStorageInput;
    try {
      value = JSON.parse(state.target_plan);
    } catch {
      throw new Error("Gateway target generation plan is invalid");
    }
    const plan = GenerationPlanSchema.safeParse(value);
    if (!plan.success) {
      throw new Error("Gateway target generation plan is invalid");
    }
    try {
      const transition = transitionGeneration(
        createGenerationMachine(
          state.active_generation,
          state.active_shard_count,
        ),
        { type: "plan", plan: plan.data },
      );
      if (transition.machine.target === null) {
        throw new Error("Gateway target generation plan is invalid");
      }
      return transition.machine.target.plan;
    } catch {
      throw new Error("Gateway target generation plan is invalid");
    }
  }

  private findGenerationState(): GenerationStateRow | undefined {
    return this.ctx.storage.sql
      .exec<GenerationStateRow>(
        `SELECT active_generation, active_shard_count, phase,
                target_generation, target_shard_count, target_plan,
                last_recommendation_check_at, postponed_until
         FROM generation_state WHERE singleton = 1`,
      )
      .toArray()[0];
  }

  private toGenerationStatus(row: GenerationStateRow): GatewayGenerationStatus {
    validateGeneration(row.active_generation, row.active_shard_count);
    const phase = GatewayGenerationPhaseSchema.safeParse(row.phase);
    if (!phase.success) {
      throw new Error("Gateway generation phase is invalid");
    }
    const hasTarget =
      row.target_generation !== null && row.target_shard_count !== null;
    if (
      (row.target_generation === null) !== (row.target_shard_count === null) ||
      (row.phase !== "idle" && !hasTarget)
    ) {
      throw new Error("Gateway target generation state is invalid");
    }
    if (
      row.target_generation !== null &&
      row.target_shard_count !== null
    ) {
      validateGeneration(row.target_generation, row.target_shard_count);
    }
    return {
      activeGeneration: row.active_generation,
      activeShardCount: row.active_shard_count,
      phase: phase.data,
      targetGeneration: row.target_generation,
      targetShardCount: row.target_shard_count,
      lastRecommendationCheckAt: row.last_recommendation_check_at,
      postponedUntil: row.postponed_until,
    };
  }

  private nextFleetGenerationNumber(): number {
    const latest = this.ctx.storage.sql
      .exec<{ generation: number | null }>(
        `SELECT MAX(generation) AS generation FROM generation_history`,
      )
      .one().generation;
    if (latest === null) return 1;
    if (
      !Number.isSafeInteger(latest) ||
      latest < 0 ||
      latest === Number.MAX_SAFE_INTEGER
    ) {
      throw new Error("Gateway generation history is invalid");
    }
    return latest + 1;
  }

  private nextGenerationNumber(): number {
    const latest = this.ctx.storage.sql
      .exec<{ generation: number }>(
        `SELECT MAX(generation) AS generation FROM generation_history`,
      )
      .one().generation;
    if (!Number.isSafeInteger(latest) || latest < 0 || latest === Number.MAX_SAFE_INTEGER) {
      throw new Error("Gateway generation history is invalid");
    }
    return latest + 1;
  }

  private availableIdentifyBudget(info: GatewayBotInfo): number {
    const stored = this.ctx.storage.sql
      .exec<IdentifyBudgetRow>(
        `SELECT total, remaining, reset_at, max_concurrency,
                recommended_shards, observed_at
         FROM identify_budget WHERE singleton = 1`,
      )
      .toArray()[0];
    if (
      stored === undefined ||
      info.sessionStartLimit.observedAt >= stored.reset_at
    ) {
      return info.sessionStartLimit.remaining;
    }
    return Math.min(stored.remaining, info.sessionStartLimit.remaining);
  }

  private findOwnership(
    generation: number,
    shardId: number,
  ): OwnershipRow | undefined {
    return this.ctx.storage.sql
      .exec<OwnershipRow>(
        `SELECT generation, shard_id, shard_count, owner_id, acquired_at
         FROM shard_ownership WHERE generation = ? AND shard_id = ?`,
        generation,
        shardId,
      )
      .toArray()[0];
  }

  private ownsShard(request: ShardOwnershipRequest): boolean {
    const ownership = this.findOwnership(request.generation, request.shardId);
    return (
      ownership !== undefined &&
      ownership.owner_id === request.ownerId &&
      ownership.shard_count === request.shardCount
    );
  }

  private storedIdentifyInfo(now = Date.now()): GatewayIdentifyInfo | null {
    const row = this.ctx.storage.sql
      .exec<IdentifyBudgetRow>(
        `SELECT total, remaining, reset_at, max_concurrency,
                recommended_shards, observed_at
         FROM identify_budget WHERE singleton = 1`,
      )
      .toArray()[0];
    if (row === undefined || now >= row.reset_at) return null;
    if (
      !Number.isSafeInteger(row.total) ||
      row.total <= 0 ||
      !Number.isSafeInteger(row.remaining) ||
      row.remaining < 0 ||
      row.remaining > row.total ||
      !Number.isSafeInteger(row.reset_at) ||
      !Number.isSafeInteger(row.max_concurrency) ||
      row.max_concurrency <= 0 ||
      !Number.isSafeInteger(row.recommended_shards) ||
      row.recommended_shards <= 0 ||
      !Number.isSafeInteger(row.observed_at) ||
      row.observed_at < 0
    ) {
      throw new Error("Stored Gateway Identify budget is invalid");
    }
    return {
      shards: row.recommended_shards,
      sessionStartLimit: {
        total: row.total,
        remaining: row.remaining,
        resetAt: row.reset_at,
        maxConcurrency: row.max_concurrency,
        observedAt: row.observed_at,
      },
    };
  }

  private refreshGatewayBotInfo(): Promise<GatewayBotInfo> {
    this.identifyRefresh ??= this.fetchGatewayBotInfo().finally(() => {
      this.identifyRefresh = null;
    });
    return this.identifyRefresh;
  }

  private async fetchGatewayBotInfo(): Promise<GatewayBotInfo> {
    const response = await fetch(discordGatewayBotUrl(this.env), {
      headers: { authorization: `Bot ${await discordBotToken(this.env)}` },
    });
    if (!response.ok) {
      throw new Error(`Discord Get Gateway Bot returned HTTP ${response.status}`);
    }
    return parseGatewayBotResponse(
      await response.json(),
      Date.now(),
      allowedGatewayHostname(this.env),
    );
  }

  private storeGatewayConfiguration(info: GatewayBotInfo): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO gateway_configuration (singleton, gateway_url, observed_at)
       VALUES (1, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         gateway_url = excluded.gateway_url,
         observed_at = excluded.observed_at`,
      info.url,
      info.sessionStartLimit.observedAt,
    );
  }

  private reserveIdentifyPermit(
    request: ShardOwnershipRequest,
    info: GatewayIdentifyInfo,
  ): IdentifyPermitResult {
    if (!this.ownsShard(request)) {
      return { granted: false, reason: "shard-not-owned" };
    }
    const now = Date.now();
    const live = info.sessionStartLimit;
    const stored = this.ctx.storage.sql
      .exec<IdentifyBudgetRow>(
        `SELECT total, remaining, reset_at, max_concurrency,
                recommended_shards, observed_at
         FROM identify_budget WHERE singleton = 1`,
      )
      .toArray()[0];
    const sameBudgetWindow = stored !== undefined && now < stored.reset_at;
    const remaining = sameBudgetWindow
      ? Math.min(stored.remaining, live.remaining)
      : live.remaining;
    const resetAt = sameBudgetWindow ? stored.reset_at : live.resetAt;
    const rateLimitKey = request.shardId % live.maxConcurrency;
    const bucket = this.ctx.storage.sql
      .exec<IdentifyBucketRow>(
        `SELECT next_available_at FROM identify_buckets
         WHERE rate_limit_key = ?`,
        rateLimitKey,
      )
      .toArray()[0];

    if (remaining === 0) {
      this.storeBudget(info, remaining, resetAt);
      return {
        granted: false,
        reason: "identify-budget-exhausted",
        rateLimitKey,
        maxConcurrency: live.maxConcurrency,
        remaining,
        resetAt,
        retryAt: resetAt,
      };
    }
    if (bucket !== undefined && bucket.next_available_at > now) {
      this.storeBudget(info, remaining, resetAt);
      return {
        granted: false,
        reason: "identify-rate-limited",
        rateLimitKey,
        maxConcurrency: live.maxConcurrency,
        remaining,
        resetAt,
        retryAt: bucket.next_available_at,
      };
    }

    const remainingAfterGrant = remaining - 1;
    this.storeBudget(info, remainingAfterGrant, resetAt);
    this.ctx.storage.sql.exec(
      `INSERT INTO identify_buckets (rate_limit_key, next_available_at)
       VALUES (?, ?)
       ON CONFLICT(rate_limit_key) DO UPDATE
       SET next_available_at = excluded.next_available_at`,
      rateLimitKey,
      now + IDENTIFY_WINDOW_MS,
    );
    return {
      granted: true,
      rateLimitKey,
      maxConcurrency: live.maxConcurrency,
      remainingAfterGrant,
      resetAt,
      grantedAt: now,
    };
  }

  private storeBudget(
    info: GatewayIdentifyInfo,
    remaining: number,
    resetAt: number,
  ): void {
    const limit = info.sessionStartLimit;
    this.ctx.storage.sql.exec(
      `INSERT INTO identify_budget
        (singleton, total, remaining, reset_at, max_concurrency,
         recommended_shards, observed_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         total = excluded.total,
         remaining = excluded.remaining,
         reset_at = excluded.reset_at,
         max_concurrency = excluded.max_concurrency,
         recommended_shards = excluded.recommended_shards,
         observed_at = excluded.observed_at`,
      limit.total,
      remaining,
      resetAt,
      limit.maxConcurrency,
      info.shards,
      limit.observedAt,
    );
  }
}
