import { DurableObject } from "cloudflare:workers";
import {
  createGenerationMachine,
  routeGenerationDispatch,
  transitionGeneration,
  validateGatewaySessionCheckpoint,
  type GatewayPartitionCommand,
  type GatewaySessionCheckpoint,
  type GenerationAction,
  type GenerationEvent,
  type GenerationMachine,
  type GenerationPlan,
} from "../../../packages/gateway-protocol/src";
import {
  GatewayShardConnection,
  classifyGatewayRuntimeError,
  gatewayGuildInventoryStateKey,
  gatewayInitialGuildStateKey,
  gatewayRecoveryAlarmAt,
  initialGatewayCheckpoint,
  parseGatewayGuildInventoryState,
  parseGatewayInitialGuildState,
  type GatewayGuildInventoryState,
  type GatewayInitialGuildState,
  type GatewayShardFaultResult,
  type GatewayShardIdentity,
  type GatewayShardStatus,
} from "./gateway-shard-connection";
import {
  allowedGatewayHostname,
  GATEWAY_COORDINATOR_NAME,
  GATEWAY_PARTITION_NAME,
  type GatewayEnv,
} from "./environment";

const LEGACY_CHECKPOINT_KEY = "gateway-checkpoint-v1";
const PARTITION_STATE_KEY = "gateway-partition-state-v1";
const FLEET_PARTITION_STATE_KEY = "gateway-fleet-partition-state-v1";

export { gatewayRecoveryAlarmAt };

export type GatewayStatus = GatewayShardStatus & {
  generation: {
    phase: GenerationMachine["phase"];
    activeGeneration: number;
    activeShardCount: number;
    targetGeneration: number | null;
    targetShardCount: number | null;
  };
  shards: GatewayShardStatus[];
  targetShards: GatewayShardStatus[];
  rejectedDispatches: number;
};

export type GatewayFleetPartitionStatus = {
  activeGeneration: number | null;
  activeShardCount: number | null;
  connections: GatewayShardStatus[];
};

export type GatewayFleetGuildInventory = {
  activeGeneration: number | null;
  activeShardCount: number | null;
  entries: Array<{
    status: GatewayShardStatus;
    inventory: GatewayGuildInventoryState | null;
  }>;
};

export type GatewayFaultResult =
  | { accepted: true; status: GatewayStatus }
  | {
      accepted: false;
      reason: "gateway-not-ready" | "session-not-resumable";
      status: GatewayStatus;
    };

type StoredPartitionState = {
  version: 1;
  generation: GenerationMachine;
};

type StoredFleetPartitionState = {
  version: 1;
  activeGeneration: number | null;
  activeShardCount: number | null;
  ownerId: string;
  connections: GatewayShardIdentity[];
  suspendedGenerations: number[];
};

function parseStoredPartitionState(value: unknown): {
  state: StoredPartitionState;
  interruptedReshard: boolean;
} {
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    value.version !== 1 ||
    !("generation" in value) ||
    typeof value.generation !== "object" ||
    value.generation === null ||
    !("phase" in value.generation) ||
    typeof value.generation.phase !== "string" ||
    !("target" in value.generation) ||
    !("activeGeneration" in value.generation) ||
    typeof value.generation.activeGeneration !== "number" ||
    !("activeShardCount" in value.generation) ||
    typeof value.generation.activeShardCount !== "number"
  ) {
    throw new Error("Gateway partition state is unsupported");
  }
  const stable = createGenerationMachine(
    value.generation.activeGeneration,
    value.generation.activeShardCount,
  );
  if (value.generation.phase === "idle" && value.generation.target === null) {
    return {
      state: { version: 1, generation: stable },
      interruptedReshard: false,
    };
  }
  if (
    !["suspending-active", "starting-target", "rolling-back"].includes(
      value.generation.phase,
    ) ||
    typeof value.generation.target !== "object" ||
    value.generation.target === null ||
    !("plan" in value.generation.target)
  ) {
    throw new Error("Gateway partition state is unsupported");
  }
  try {
    transitionGeneration(stable, {
      type: "plan",
      plan: value.generation.target.plan as GenerationPlan,
    });
  } catch {
    throw new Error("Gateway partition target plan is invalid");
  }
  return {
    state: { version: 1, generation: stable },
    interruptedReshard: true,
  };
}

function validateFleetIdentity(
  value: unknown,
): asserts value is GatewayShardIdentity {
  if (
    typeof value !== "object" ||
    value === null ||
    !("generation" in value) ||
    typeof value.generation !== "number" ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 0 ||
    !("shardId" in value) ||
    typeof value.shardId !== "number" ||
    !Number.isSafeInteger(value.shardId) ||
    value.shardId < 0 ||
    !("shardCount" in value) ||
    typeof value.shardCount !== "number" ||
    !Number.isSafeInteger(value.shardCount) ||
    value.shardCount <= 0 ||
    value.shardId >= value.shardCount ||
    !("ownerId" in value) ||
    typeof value.ownerId !== "string" ||
    !/^gateway-partition-[0-9]+$/.test(value.ownerId)
  ) {
    throw new Error("Gateway fleet shard identity is invalid");
  }
}

function connectionKey(identity: GatewayShardIdentity): string {
  return `${String(identity.generation)}:${String(identity.shardId)}:${String(identity.shardCount)}`;
}

function checkpointKey(identity: GatewayShardIdentity): string {
  return `gateway-checkpoint-v1:${connectionKey(identity)}`;
}

function targetCoordinates(machine: GenerationMachine): {
  generation: number | null;
  shardCount: number | null;
} {
  return {
    generation: machine.target?.plan.targetGeneration ?? null,
    shardCount: machine.target?.plan.targetShardCount ?? null,
  };
}

export class GatewayPartition extends DurableObject<GatewayEnv> {
  private generation = createGenerationMachine(1, 1);
  private readonly connections = new Map<string, GatewayShardConnection>();
  private readonly fleetConnections = new Map<string, GatewayShardConnection>();
  private fleetActiveGeneration: number | null = null;
  private fleetActiveShardCount: number | null = null;
  private fleetMode = false;
  private fleetOwnerId: string | null = null;
  private readonly suspendedFleetGenerations = new Set<number>();
  private readonly recoveryDeadlines = new Map<string, number>();
  private readonly activationId = crypto.randomUUID();
  private rejectedDispatches = 0;
  private lastManagerError: string | null = null;
  private generationTransitionQueue: Promise<void> = Promise.resolve();
  private readonly rollbackReadyShardIds = new Set<number>();
  private pendingCoordinatorRollback = false;

  constructor(ctx: DurableObjectState, env: GatewayEnv) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.initialize();
    });
  }

  async alarm(): Promise<void> {
    this.recoveryDeadlines.clear();
    if (this.fleetMode) {
      await Promise.all(
        [...this.fleetConnections.entries()]
          .filter(
            ([key]) =>
              !this.suspendedFleetGenerations.has(
                this.generationFromConnectionKey(key),
              ),
          )
          .map(([, connection]) => connection.recover()),
      );
      return;
    }
    await this.initializeCoordinator();
    await Promise.all(
      this.activeConnections().map((connection) => connection.recover()),
    );
  }

  async initializeControlPlane(): Promise<GatewayStatus> {
    await this.initializeCoordinator();
    return this.status();
  }

  async start(): Promise<GatewayStatus> {
    await this.initializeCoordinator();
    await this.ctx.storage.deleteAlarm();
    this.recoveryDeadlines.clear();
    await Promise.all(
      this.activeConnections().map((connection) => connection.start()),
    );
    return this.status();
  }

  status(): GatewayStatus {
    const shards = this.activeConnections()
      .map((connection) => connection.status())
      .sort((left, right) => left.shardId - right.shardId);
    const primary = shards[0];
    if (primary === undefined) {
      throw new Error("Gateway partition has no active shard connections");
    }
    const target = targetCoordinates(this.generation);
    return {
      ...primary,
      activationId: this.activationId,
      lastError: this.lastManagerError ?? primary.lastError,
      generation: {
        phase: this.generation.phase,
        activeGeneration: this.generation.activeGeneration,
        activeShardCount: this.generation.activeShardCount,
        targetGeneration: target.generation,
        targetShardCount: target.shardCount,
      },
      shards,
      targetShards: this.targetConnections().map((connection) =>
        connection.status(),
      ),
      rejectedDispatches: this.rejectedDispatches,
    };
  }

  async forceReconnect(): Promise<GatewayFaultResult> {
    return this.applyFault(await this.primaryConnection().forceReconnect());
  }

  async forceReidentify(): Promise<GatewayFaultResult> {
    return this.applyFault(await this.primaryConnection().forceReidentify());
  }

  async applyGenerationPlan(plan: GenerationPlan): Promise<GatewayStatus> {
    this.lastManagerError = null;
    await this.enqueueGenerationEvent({ type: "plan", plan });
    return this.status();
  }

  async executeFleetCommand(command: GatewayPartitionCommand): Promise<void> {
    this.fleetMode = true;
    this.validateFleetCommand(command);
    this.fleetOwnerId ??= command.assignment.partitionName;
    if (this.fleetOwnerId !== command.assignment.partitionName) {
      throw new Error("Gateway fleet partition owner does not match");
    }
    switch (command.type) {
      case "start-target-shards": {
        const connections = command.shardIds.map((shardId) => {
          const identity = this.identity(
            command.generation,
            shardId,
            command.shardCount,
            command.assignment.partitionName,
          );
          const key = connectionKey(identity);
          let connection = this.fleetConnections.get(key);
          if (connection === undefined) {
            connection = this.createFleetConnection(identity);
            this.fleetConnections.set(key, connection);
          }
          return { connection, identity };
        });
        await this.persistFleetPartitionState();
        this.ctx.waitUntil(
          (async () => {
            for (const { connection, identity } of connections) {
              try {
                await connection.start();
              } catch {
                const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
                  GATEWAY_COORDINATOR_NAME,
                );
                await coordinator.reportFleetShardFailed(
                  identity.generation,
                  identity.shardId,
                  identity.shardCount,
                  "connection-start-failed",
                );
                return;
              }
            }
          })(),
        );
        return;
      }
      case "activate-generation":
        this.fleetActiveGeneration = command.generation;
        this.fleetActiveShardCount = command.shardCount;
        await this.persistFleetPartitionState();
        return;
      case "suspend-generation":
        this.suspendedFleetGenerations.add(command.generation);
        await this.persistFleetPartitionState();
        await Promise.all(
          this.fleetConnectionsFor(command.generation).map((connection) =>
            connection.status().state === "idle"
              ? Promise.resolve()
              : connection.suspend().then(() => undefined),
          ),
        );
        return;
      case "resume-generation":
        this.suspendedFleetGenerations.delete(command.generation);
        await this.persistFleetPartitionState();
        for (const connection of this.fleetConnectionsFor(command.generation)) {
          await connection.start();
        }
        return;
      case "retire-generation":
      case "stop-generation":
        await this.stopFleetGeneration(command.generation);
        return;
    }
  }

  async shutdownFleet(): Promise<void> {
    const connections = [...this.fleetConnections.values()];
    await Promise.all(
      connections.map((connection) => {
        const state = connection.status().state;
        return state === "fatal" || state === "stopped"
          ? Promise.resolve()
          : connection
              .stop({ releaseOwnership: false })
              .then(() => undefined);
      }),
    );
    this.fleetConnections.clear();
    this.suspendedFleetGenerations.clear();
    this.recoveryDeadlines.clear();
    await this.ctx.storage.delete(FLEET_PARTITION_STATE_KEY);
    await this.ctx.storage.deleteAlarm();
  }

  fleetStatus(): GatewayFleetPartitionStatus {
    return {
      activeGeneration: this.fleetActiveGeneration,
      activeShardCount: this.fleetActiveShardCount,
      connections: [...this.fleetConnections.values()]
        .map((connection) => connection.status())
        .sort((left, right) => left.shardId - right.shardId),
    };
  }

  async fleetGuildInventory(): Promise<GatewayFleetGuildInventory> {
    const connections =
      this.fleetActiveGeneration === null
        ? []
        : this.fleetConnectionsFor(this.fleetActiveGeneration);
    const entries = await Promise.all(
      connections.map(async (connection) => {
        const inventory = await connection.guildInventorySnapshot();
        return { status: connection.status(), inventory };
      }),
    );
    return {
      activeGeneration: this.fleetActiveGeneration,
      activeShardCount: this.fleetActiveShardCount,
      entries: entries.sort(
        (left, right) => left.status.shardId - right.status.shardId,
      ),
    };
  }

  async forceFleetShardReidentify(
    generation: number,
    shardId: number,
    shardCount: number,
  ): Promise<GatewayShardFaultResult> {
    if (
      generation !== this.fleetActiveGeneration ||
      shardCount !== this.fleetActiveShardCount
    ) {
      throw new Error("Gateway fleet reidentify coordinates are inactive");
    }
    const connection = this.fleetConnections.get(
      connectionKey({
        generation,
        shardId,
        shardCount,
        ownerId: this.fleetOwnerId ?? "",
      }),
    );
    if (connection === undefined) {
      throw new Error("Gateway fleet reidentify shard is missing");
    }
    return connection.forceReidentify();
  }

  async forceTargetFailure(shardId: number): Promise<GatewayStatus> {
    if (!Number.isSafeInteger(shardId) || shardId < 0) {
      throw new Error("Forced target shard failure is invalid");
    }
    this.lastManagerError = "fault-injection";
    await this.enqueueGenerationEvent({
      type: "target-shard-failed",
      shardId,
      reason: "fault-injection",
    });
    return this.status();
  }

  async stop(): Promise<GatewayStatus> {
    await this.ctx.storage.deleteAlarm();
    this.recoveryDeadlines.clear();
    await Promise.all(
      [...this.connections.values()].map((connection) => connection.stop()),
    );
    return this.status();
  }

  private async initializeCoordinator(): Promise<void> {
    const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    await coordinator.initializeGeneration(
      this.generation.activeGeneration,
      this.generation.activeShardCount,
    );
    if (this.pendingCoordinatorRollback) {
      await coordinator.recordGeneration(this.generation);
      this.pendingCoordinatorRollback = false;
    }
    if (this.generation.phase === "idle") {
      await coordinator.reconcileStableOwnerships(
        this.generation.activeGeneration,
        this.generation.activeShardCount,
      );
    }
  }

  private async initialize(): Promise<void> {
    const [storedState, legacyCheckpoint, storedFleetState] = await Promise.all([
      this.ctx.storage.get(PARTITION_STATE_KEY),
      this.ctx.storage.get(LEGACY_CHECKPOINT_KEY),
      this.ctx.storage.get(FLEET_PARTITION_STATE_KEY),
    ]);
    const validatedLegacyCheckpoint =
      legacyCheckpoint === undefined
        ? undefined
        : validateGatewaySessionCheckpoint(legacyCheckpoint);
    if (storedState !== undefined) {
      const parsed = parseStoredPartitionState(storedState);
      this.generation = parsed.state.generation;
      if (parsed.interruptedReshard) {
        this.pendingCoordinatorRollback = true;
        this.lastManagerError = "interrupted-reshard-rollback";
        await this.ctx.storage.put(PARTITION_STATE_KEY, parsed.state);
      }
    } else if (validatedLegacyCheckpoint !== undefined) {
      this.generation = createGenerationMachine(
        validatedLegacyCheckpoint.generation,
        validatedLegacyCheckpoint.shardCount,
      );
      await this.ctx.storage.put(PARTITION_STATE_KEY, {
        version: 1,
        generation: this.generation,
      } satisfies StoredPartitionState);
    } else {
      await this.ctx.storage.put(PARTITION_STATE_KEY, {
        version: 1,
        generation: this.generation,
      } satisfies StoredPartitionState);
    }

    for (let shardId = 0; shardId < this.generation.activeShardCount; shardId += 1) {
      const identity = this.identity(
        this.generation.activeGeneration,
        shardId,
        this.generation.activeShardCount,
      );
      const key = checkpointKey(identity);
      const [
        storedCheckpoint,
        storedInitialGuildState,
        storedGuildInventoryState,
      ] = await Promise.all([
        this.ctx.storage.get(key),
        this.ctx.storage.get(gatewayInitialGuildStateKey(key)),
        this.ctx.storage.get(gatewayGuildInventoryStateKey(key)),
      ]);
      let checkpoint =
        storedCheckpoint === undefined
          ? undefined
          : validateGatewaySessionCheckpoint(storedCheckpoint);
      const initialGuildState =
        storedInitialGuildState === undefined
          ? undefined
          : parseGatewayInitialGuildState(storedInitialGuildState);
      const guildInventoryState =
        storedGuildInventoryState === undefined
          ? undefined
          : parseGatewayGuildInventoryState(storedGuildInventoryState);
      if (
        checkpoint === undefined &&
        identity.generation === 1 &&
        identity.shardId === 0 &&
        identity.shardCount === 1 &&
        validatedLegacyCheckpoint !== undefined
      ) {
        checkpoint = validatedLegacyCheckpoint;
        await this.ctx.storage.put(checkpointKey(identity), checkpoint);
      }
      const connection = this.createConnection(
        identity,
        checkpoint,
        initialGuildState,
        guildInventoryState,
      );
      this.connections.set(connectionKey(identity), connection);
      if (connection.needsRecovery()) {
        await this.scheduleConnectionAlarm(
          connectionKey(identity),
          connection.activationRecoveryAt(),
        );
      }
    }

    if (storedFleetState !== undefined) {
      const fleet = this.parseFleetPartitionState(storedFleetState);
      this.fleetMode = true;
      this.fleetOwnerId = fleet.ownerId;
      this.fleetActiveGeneration = fleet.activeGeneration;
      this.fleetActiveShardCount = fleet.activeShardCount;
      for (const generation of fleet.suspendedGenerations) {
        this.suspendedFleetGenerations.add(generation);
      }
      for (const identity of fleet.connections) {
        const key = `gateway-fleet-checkpoint-v1:${connectionKey(identity)}`;
        const [
          storedCheckpoint,
          storedInitialGuildState,
          storedGuildInventoryState,
        ] = await Promise.all([
          this.ctx.storage.get(key),
          this.ctx.storage.get(gatewayInitialGuildStateKey(key)),
          this.ctx.storage.get(gatewayGuildInventoryStateKey(key)),
        ]);
        const checkpoint =
          storedCheckpoint === undefined
            ? undefined
            : validateGatewaySessionCheckpoint(storedCheckpoint);
        const initialGuildState =
          storedInitialGuildState === undefined
            ? undefined
            : parseGatewayInitialGuildState(storedInitialGuildState);
        const guildInventoryState =
          storedGuildInventoryState === undefined
            ? undefined
            : parseGatewayGuildInventoryState(storedGuildInventoryState);
        const connection = this.createFleetConnection(
          identity,
          checkpoint,
          initialGuildState,
          guildInventoryState,
        );
        this.fleetConnections.set(connectionKey(identity), connection);
        if (!this.suspendedFleetGenerations.has(identity.generation)) {
          await this.scheduleConnectionAlarm(
            connectionKey(identity),
            connection.activationRecoveryAt(),
          );
        }
      }
    }
  }

  private createConnection(
    identity: GatewayShardIdentity,
    checkpoint: GatewaySessionCheckpoint | undefined,
    initialGuildState?: GatewayInitialGuildState,
    guildInventoryState?: GatewayGuildInventoryState,
  ): GatewayShardConnection {
    return new GatewayShardConnection({
      ctx: this.ctx,
      env: this.env,
      identity,
      checkpoint:
        checkpoint ??
        initialGatewayCheckpoint(
          identity,
          Date.now(),
          allowedGatewayHostname(this.env),
        ),
      checkpointKey: checkpointKey(identity),
      ...(initialGuildState === undefined ? {} : { initialGuildState }),
      ...(guildInventoryState === undefined ? {} : { guildInventoryState }),
      scheduleAlarm: (scheduledAt) =>
        this.scheduleConnectionAlarm(connectionKey(identity), scheduledAt),
      onReady: (readyIdentity) => this.handleConnectionReady(readyIdentity),
      onFatal: (failedIdentity, reason) =>
        this.handleConnectionFatal(failedIdentity, reason),
      isDispatchActive: (source) => this.isDispatchActive(source),
    });
  }

  private identity(
    generation: number,
    shardId: number,
    shardCount: number,
    ownerId = GATEWAY_PARTITION_NAME,
  ): GatewayShardIdentity {
    return {
      generation,
      shardId,
      shardCount,
      ownerId,
    };
  }

  private createFleetConnection(
    identity: GatewayShardIdentity,
    checkpoint?: GatewaySessionCheckpoint,
    initialGuildState?: GatewayInitialGuildState,
    guildInventoryState?: GatewayGuildInventoryState,
  ): GatewayShardConnection {
    const key = `gateway-fleet-checkpoint-v1:${connectionKey(identity)}`;
    return new GatewayShardConnection({
      ctx: this.ctx,
      env: this.env,
      identity,
      checkpoint:
        checkpoint ??
        initialGatewayCheckpoint(
          identity,
          Date.now(),
          allowedGatewayHostname(this.env),
        ),
      checkpointKey: key,
      ...(initialGuildState === undefined ? {} : { initialGuildState }),
      ...(guildInventoryState === undefined ? {} : { guildInventoryState }),
      scheduleAlarm: (scheduledAt) =>
        this.scheduleConnectionAlarm(connectionKey(identity), scheduledAt),
      onReady: async (readyIdentity) => {
        const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
          GATEWAY_COORDINATOR_NAME,
        );
        await coordinator.reportFleetShardReady(
          readyIdentity.generation,
          readyIdentity.shardId,
          readyIdentity.shardCount,
        );
      },
      onFatal: async (failedIdentity, reason) => {
        const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
          GATEWAY_COORDINATOR_NAME,
        );
        await coordinator.reportFleetShardFailed(
          failedIdentity.generation,
          failedIdentity.shardId,
          failedIdentity.shardCount,
          reason,
        );
      },
      isDispatchActive: (source) =>
        this.fleetActiveGeneration === source.generation &&
        this.fleetActiveShardCount === source.shardCount,
    });
  }

  private activeConnections(): GatewayShardConnection[] {
    const active: GatewayShardConnection[] = [];
    for (let shardId = 0; shardId < this.generation.activeShardCount; shardId += 1) {
      const identity = this.identity(
        this.generation.activeGeneration,
        shardId,
        this.generation.activeShardCount,
      );
      const connection = this.connections.get(connectionKey(identity));
      if (connection === undefined) {
        throw new Error("Gateway active shard connection is missing");
      }
      active.push(connection);
    }
    return active;
  }

  private targetConnections(): GatewayShardConnection[] {
    const plan = this.generation.target?.plan;
    if (plan === undefined) return [];
    const target: GatewayShardConnection[] = [];
    for (let shardId = 0; shardId < plan.targetShardCount; shardId += 1) {
      const identity = this.identity(
        plan.targetGeneration,
        shardId,
        plan.targetShardCount,
      );
      const connection = this.connections.get(connectionKey(identity));
      if (connection !== undefined) target.push(connection);
    }
    return target;
  }

  private async connectionFor(
    generation: number,
    shardId: number,
    shardCount: number,
  ): Promise<GatewayShardConnection> {
    const identity = this.identity(generation, shardId, shardCount);
    const key = connectionKey(identity);
    const existing = this.connections.get(key);
    if (existing !== undefined) return existing;
    const storedCheckpointKey = checkpointKey(identity);
    const [stored, storedInitialGuildState] = await Promise.all([
      this.ctx.storage.get(storedCheckpointKey),
      this.ctx.storage.get(gatewayInitialGuildStateKey(storedCheckpointKey)),
    ]);
    const checkpoint =
      stored === undefined
        ? initialGatewayCheckpoint(
            identity,
            Date.now(),
            allowedGatewayHostname(this.env),
          )
        : validateGatewaySessionCheckpoint(stored);
    const initialGuildState =
      storedInitialGuildState === undefined
        ? undefined
        : parseGatewayInitialGuildState(storedInitialGuildState);
    const connection = this.createConnection(
      identity,
      checkpoint,
      initialGuildState,
    );
    this.connections.set(key, connection);
    return connection;
  }

  private primaryConnection(): GatewayShardConnection {
    const primary = this.activeConnections()[0];
    if (primary === undefined) {
      throw new Error("Gateway primary shard connection is missing");
    }
    return primary;
  }

  private applyFault(result: GatewayShardFaultResult): GatewayFaultResult {
    if (!result.accepted) {
      return { ...result, status: this.status() };
    }
    return { accepted: true, status: this.status() };
  }

  private enqueueGenerationEvent(event: GenerationEvent): Promise<void> {
    const operation = this.generationTransitionQueue.then(() =>
      this.applyGenerationEvent(event),
    );
    this.generationTransitionQueue = operation.catch(() => {
      this.lastManagerError ??= "generation-transition-failed";
    });
    return operation;
  }

  private async applyGenerationEvent(event: GenerationEvent): Promise<void> {
    const transition = transitionGeneration(this.generation, event);
    this.generation = transition.machine;
    if (
      event.type === "target-shard-ready" &&
      this.generation.phase === "idle"
    ) {
      this.lastManagerError = null;
    }
    await this.ctx.storage.put(PARTITION_STATE_KEY, {
      version: 1,
      generation: this.generation,
    } satisfies StoredPartitionState);
    const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    await coordinator.recordGeneration(this.generation);
    for (const action of transition.actions) {
      await this.executeGenerationAction(action);
    }
  }

  private async executeGenerationAction(
    action: GenerationAction,
  ): Promise<void> {
    switch (action.type) {
      case "suspend-generation":
        await Promise.all(
          this.connectionsFor(action.generation, action.shardCount)
            .filter((connection) => connection.status().state !== "idle")
            .map((connection) => connection.suspend()),
        );
        await this.applyGenerationEvent({ type: "active-suspended" });
        return;
      case "start-target-wave":
        try {
          const connections = await Promise.all(
            action.shardIds.map((shardId) =>
              this.connectionFor(action.generation, shardId, action.shardCount),
            ),
          );
          await Promise.all(connections.map((connection) => connection.start()));
        } catch (error: unknown) {
          const failedShardId = action.shardIds[0];
          if (failedShardId === undefined) {
            throw new Error("Gateway target Identify wave is empty", {
              cause: error,
            });
          }
          this.lastManagerError = `target-start-${classifyGatewayRuntimeError(error)}`;
          await this.applyGenerationEvent({
            type: "target-shard-failed",
            shardId: failedShardId,
            reason: "target-start-failed",
          });
        }
        return;
      case "activate-generation":
        return;
      case "retire-generation":
        await this.stopAndRemoveGeneration(action.generation, action.shardCount);
        return;
      case "stop-generation":
        await this.stopAndRemoveGeneration(action.generation, action.shardCount);
        return;
      case "resume-generation":
        this.rollbackReadyShardIds.clear();
        await Promise.all(
          this.connectionsFor(action.generation, action.shardCount).map(
            (connection) => connection.start(),
          ),
        );
        return;
    }
  }

  private async handleConnectionReady(
    identity: GatewayShardIdentity,
  ): Promise<void> {
    const target = this.generation.target?.plan;
    if (
      this.generation.phase === "starting-target" &&
      target !== undefined &&
      identity.generation === target.targetGeneration &&
      identity.shardCount === target.targetShardCount
    ) {
      await this.enqueueGenerationEvent({
        type: "target-shard-ready",
        shardId: identity.shardId,
      });
      return;
    }
    if (
      this.generation.phase === "rolling-back" &&
      identity.generation === this.generation.activeGeneration &&
      identity.shardCount === this.generation.activeShardCount
    ) {
      this.rollbackReadyShardIds.add(identity.shardId);
      if (
        this.rollbackReadyShardIds.size === this.generation.activeShardCount
      ) {
        await this.enqueueGenerationEvent({ type: "rollback-ready" });
      }
    }
  }

  private async handleConnectionFatal(
    identity: GatewayShardIdentity,
    reason: string,
  ): Promise<void> {
    const target = this.generation.target?.plan;
    if (
      this.generation.phase === "starting-target" &&
      target !== undefined &&
      identity.generation === target.targetGeneration &&
      identity.shardCount === target.targetShardCount
    ) {
      this.lastManagerError = reason;
      await this.enqueueGenerationEvent({
        type: "target-shard-failed",
        shardId: identity.shardId,
        reason: "gateway-fatal",
      });
      return;
    }
    this.lastManagerError = reason;
  }

  private parseFleetPartitionState(value: unknown): StoredFleetPartitionState {
    if (
      typeof value !== "object" ||
      value === null ||
      !("version" in value) ||
      value.version !== 1 ||
      !("activeGeneration" in value) ||
      !("activeShardCount" in value) ||
      !("ownerId" in value) ||
      typeof value.ownerId !== "string" ||
      !/^gateway-partition-[0-9]+$/.test(value.ownerId) ||
      !("connections" in value) ||
      !Array.isArray(value.connections) ||
      !("suspendedGenerations" in value) ||
      !Array.isArray(value.suspendedGenerations)
    ) {
      throw new Error("Stored Gateway fleet partition state is invalid");
    }
    const activeGeneration = value.activeGeneration;
    const activeShardCount = value.activeShardCount;
    if (
      (activeGeneration !== null &&
        (typeof activeGeneration !== "number" ||
          !Number.isSafeInteger(activeGeneration) ||
          activeGeneration < 0)) ||
      (activeShardCount !== null &&
        (typeof activeShardCount !== "number" ||
          !Number.isSafeInteger(activeShardCount) ||
          activeShardCount <= 0)) ||
      (activeGeneration === null) !== (activeShardCount === null) ||
      !value.suspendedGenerations.every(
        (generation) => Number.isSafeInteger(generation) && generation >= 0,
      )
    ) {
      throw new Error("Stored Gateway fleet partition state is invalid");
    }
    const connections = value.connections as GatewayShardIdentity[];
    for (const identity of connections) {
      validateFleetIdentity(identity);
      if (identity.ownerId !== value.ownerId) {
        throw new Error("Stored Gateway fleet partition owner is invalid");
      }
    }
    return {
      version: 1,
      activeGeneration,
      activeShardCount,
      ownerId: value.ownerId,
      connections,
      suspendedGenerations: value.suspendedGenerations as number[],
    };
  }

  private async persistFleetPartitionState(): Promise<void> {
    if (this.fleetOwnerId === null) {
      throw new Error("Gateway fleet partition owner is unavailable");
    }
    const connections = [...this.fleetConnections.keys()].map((key) => {
      const [generation, shardId, shardCount] = key
        .split(":")
        .map((part) => Number(part));
      const identity = {
        generation,
        shardId,
        shardCount,
        ownerId: this.fleetOwnerId,
      };
      validateFleetIdentity(identity);
      return identity;
    });
    await this.ctx.storage.put(FLEET_PARTITION_STATE_KEY, {
      version: 1,
      activeGeneration: this.fleetActiveGeneration,
      activeShardCount: this.fleetActiveShardCount,
      ownerId: this.fleetOwnerId,
      connections,
      suspendedGenerations: [...this.suspendedFleetGenerations].sort(
        (left, right) => left - right,
      ),
    } satisfies StoredFleetPartitionState);
  }

  private generationFromConnectionKey(key: string): number {
    const generation = Number(key.split(":")[0]);
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new Error("Gateway fleet connection key is invalid");
    }
    return generation;
  }

  private validateFleetCommand(command: GatewayPartitionCommand): void {
    if (
      !Number.isSafeInteger(command.generation) ||
      command.generation < 0 ||
      !Number.isSafeInteger(command.shardCount) ||
      command.shardCount <= 0 ||
      command.shardIds.length === 0 ||
      command.shardIds.some(
        (shardId) =>
          !Number.isSafeInteger(shardId) ||
          shardId < command.assignment.firstShardId ||
          shardId > command.assignment.lastShardId ||
          shardId >= command.shardCount,
      )
    ) {
      throw new Error("Gateway fleet partition command is invalid");
    }
  }

  private fleetConnectionsFor(generation: number): GatewayShardConnection[] {
    const prefix = `${String(generation)}:`;
    return [...this.fleetConnections.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, connection]) => connection);
  }

  private async stopFleetGeneration(generation: number): Promise<void> {
    const entries = [...this.fleetConnections.entries()].filter(([key]) =>
      key.startsWith(`${String(generation)}:`),
    );
    await Promise.all(
      entries.map(([, connection]) => {
        const state = connection.status().state;
        return state === "fatal" || state === "stopped"
          ? Promise.resolve()
          : connection
              .stop({ releaseOwnership: false })
              .then(() => undefined);
      }),
    );
    for (const [key] of entries) this.fleetConnections.delete(key);
    this.suspendedFleetGenerations.delete(generation);
    await this.persistFleetPartitionState();
  }

  private connectionsFor(
    generation: number,
    shardCount: number,
  ): GatewayShardConnection[] {
    const connections: GatewayShardConnection[] = [];
    for (let shardId = 0; shardId < shardCount; shardId += 1) {
      const identity = this.identity(generation, shardId, shardCount);
      const connection = this.connections.get(connectionKey(identity));
      if (connection !== undefined) connections.push(connection);
    }
    return connections;
  }

  private async stopAndRemoveGeneration(
    generation: number,
    shardCount: number,
  ): Promise<void> {
    const connections = this.connectionsFor(generation, shardCount);
    await Promise.all(connections.map((connection) => connection.stop()));
    for (let shardId = 0; shardId < shardCount; shardId += 1) {
      const identity = this.identity(generation, shardId, shardCount);
      const key = connectionKey(identity);
      this.connections.delete(key);
      this.recoveryDeadlines.delete(key);
    }
  }

  private isDispatchActive(identity: GatewayShardIdentity): boolean {
    const target = this.generation.target?.plan;
    if (
      target !== undefined &&
      identity.generation === target.targetGeneration &&
      identity.shardCount === target.targetShardCount
    ) {
      return false;
    }
    try {
      routeGenerationDispatch(
        {
          activeGeneration: this.generation.activeGeneration,
          activeShardCount: this.generation.activeShardCount,
        },
        identity,
      );
      return this.generation.phase === "idle";
    } catch {
      this.rejectedDispatches += 1;
      return false;
    }
  }

  private async scheduleConnectionAlarm(
    key: string,
    scheduledAt: number,
  ): Promise<void> {
    this.recoveryDeadlines.set(key, scheduledAt);
    const nextAlarm = Math.min(...this.recoveryDeadlines.values());
    if (!Number.isSafeInteger(nextAlarm) || nextAlarm < 0) {
      throw new Error("Gateway partition recovery alarm is invalid");
    }
    await this.ctx.storage.setAlarm(nextAlarm);
  }
}
