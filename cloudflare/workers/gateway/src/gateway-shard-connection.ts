import {
  createGatewayMachine,
  hasResumableGatewaySession,
  transitionGateway,
  type GatewayAction,
  type GatewayConnectionMode,
  type GatewayEvent,
  type GatewayMachine,
  type GatewaySessionCheckpoint,
} from "../../../packages/gateway-protocol/src";
import {
  parseDiscordChannelDirectoryDispatchV1,
  parseGuildLifecycleDispatch,
} from "../../../packages/discord-contracts/src";
import {
  buildGatewayHeartbeat,
  buildGatewayIdentify,
  buildGatewayPresenceUpdate,
  buildGatewayResume,
  normalizeDiscordGatewayUrl,
  parseGatewayMessage,
  serializeGatewayPayload,
  type ParsedGatewayMessage,
} from "./discord-gateway";
import type {
  IdentifyPermitResult,
  ShardOwnershipRequest,
} from "./gateway-coordinator";
import {
  allowedGatewayHostname,
  discordBotToken,
  GATEWAY_COORDINATOR_NAME,
  type GatewayEnv,
} from "./environment";

const ACTIVATION_RECOVERY_ALARM_DELAY_MS = 1_000;
const RECOVERY_HEARTBEAT_INTERVALS = 2;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const GUILD_FILTER_BATCH_SIZE = 100;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function gatewaySessionMutationScope(
  sessionId: string,
): Promise<string> {
  if (sessionId.length === 0) {
    throw new Error("Gateway session id is unavailable");
  }
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId)),
  );
  return [...digest.slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class GatewayEventQueue {
  private tail: Promise<void> | null = null;

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    let result: Promise<T>;
    if (this.tail === null) {
      try {
        result = operation();
      } catch (error) {
        result = Promise.reject(
          error instanceof Error
            ? error
            : new Error("Gateway queued operation failed"),
        );
      }
    } else {
      result = this.tail.then(operation);
    }
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tail = tail;
    void tail.then(() => {
      if (this.tail === tail) this.tail = null;
    });
    return result;
  }
}

export type GatewayInitialGuildState = {
  version: 1;
  guildIds: string[];
  syncGuildIds: string[];
};

export type GatewayGuildInventoryState = {
  version: 1;
  generation: number;
  shardId: number;
  shardCount: number;
  sessionId: string;
  capturedAt: number;
  guildIds: string[];
};

function validGuildIds(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every(
      (guildId): guildId is string =>
        typeof guildId === "string" && SNOWFLAKE.test(guildId),
    ) &&
    new Set(value).size === value.length;
}

export function parseGatewayGuildInventoryState(
  value: unknown,
): GatewayGuildInventoryState {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 1 ||
    !Number.isSafeInteger(value.shardId) ||
    Number(value.shardId) < 0 ||
    !Number.isSafeInteger(value.shardCount) ||
    Number(value.shardCount) < 1 ||
    Number(value.shardId) >= Number(value.shardCount) ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length < 1 ||
    !Number.isSafeInteger(value.capturedAt) ||
    Number(value.capturedAt) < 0 ||
    !validGuildIds(value.guildIds)
  ) {
    throw new Error("Gateway guild inventory state is invalid");
  }
  return {
    version: 1,
    generation: Number(value.generation),
    shardId: Number(value.shardId),
    shardCount: Number(value.shardCount),
    sessionId: value.sessionId,
    capturedAt: Number(value.capturedAt),
    guildIds: [...value.guildIds],
  };
}

export function parseGatewayInitialGuildState(
  value: unknown,
): GatewayInitialGuildState {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !validGuildIds(value.guildIds) ||
    !validGuildIds(value.syncGuildIds)
  ) {
    throw new Error("Gateway initial guild state is invalid");
  }
  const guildIds = new Set(value.guildIds);
  if (!value.syncGuildIds.every((guildId) => guildIds.has(guildId))) {
    throw new Error("Gateway initial guild state is invalid");
  }
  return {
    version: 1,
    guildIds: [...value.guildIds],
    syncGuildIds: [...value.syncGuildIds],
  };
}

export class GuildInventory {
  private state: GatewayGuildInventoryState | null;

  constructor(state?: GatewayGuildInventoryState) {
    this.state = state === undefined ? null : parseGatewayGuildInventoryState(state);
  }

  replace(
    identity: GatewayShardIdentity,
    sessionId: string,
    guildIds: string[],
    capturedAt: number,
  ): void {
    this.state = parseGatewayGuildInventoryState({
      version: 1,
      generation: identity.generation,
      shardId: identity.shardId,
      shardCount: identity.shardCount,
      sessionId,
      capturedAt,
      guildIds,
    });
  }

  apply(event: ReturnType<typeof parseGuildLifecycleDispatch>): void {
    if (this.state === null || event === null || event.type === "unavailable") {
      return;
    }
    const guildIds = new Set(this.state.guildIds);
    if (event.type === "upsert") guildIds.add(event.guild.id);
    else guildIds.delete(event.guildId);
    this.state = { ...this.state, guildIds: [...guildIds] };
  }

  snapshot(): GatewayGuildInventoryState | null {
    return this.state === null
      ? null
      : { ...this.state, guildIds: [...this.state.guildIds] };
  }
}

export class InitialGuildTracker {
  private guildIds: Set<string>;
  private syncGuildIds: Set<string>;

  constructor(
    state: GatewayInitialGuildState = {
      version: 1,
      guildIds: [],
      syncGuildIds: [],
    },
  ) {
    this.guildIds = new Set(state.guildIds);
    this.syncGuildIds = new Set(state.syncGuildIds);
  }

  replace(guildIds: string[], syncGuildIds: string[]): void {
    this.guildIds = new Set(guildIds);
    this.syncGuildIds = new Set(syncGuildIds);
  }

  match(eventType: string, data: unknown): string | null {
    if (
      eventType !== "GUILD_CREATE" ||
      !isRecord(data) ||
      typeof data.id !== "string" ||
      !this.guildIds.has(data.id)
    ) {
      return null;
    }
    return data.id;
  }

  needsSync(guildId: string): boolean {
    return this.syncGuildIds.has(guildId);
  }

  complete(guildId: string): void {
    this.guildIds.delete(guildId);
    this.syncGuildIds.delete(guildId);
  }

  counts(): { pending: number; requiringSync: number } {
    return {
      pending: this.guildIds.size,
      requiringSync: this.syncGuildIds.size,
    };
  }

  snapshot(): GatewayInitialGuildState {
    return {
      version: 1,
      guildIds: [...this.guildIds],
      syncGuildIds: [...this.syncGuildIds],
    };
  }
}

type GuildFilterService = {
  fetch(request: Request): Promise<Response>;
};

type GuildLifecycleMode = "none" | "synchronize" | "synchronize-and-log";

export function guildLifecycleMode(
  active: boolean,
  initialGuildId: string | null,
  initialGuildNeedsSync: boolean,
): GuildLifecycleMode {
  if (initialGuildId !== null) {
    return initialGuildNeedsSync ? "synchronize" : "none";
  }
  return active ? "synchronize-and-log" : "none";
}

export async function findGuildsNeedingInitialSync(
  dataService: GuildFilterService,
  guildIds: string[],
): Promise<string[]> {
  const activeGuildIds = new Set<string>();
  for (let index = 0; index < guildIds.length; index += GUILD_FILTER_BATCH_SIZE) {
    const batch = guildIds.slice(index, index + GUILD_FILTER_BATCH_SIZE);
    const response = await dataService.fetch(
      new Request("https://data.internal/internal/guilds/filter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guildIds: batch }),
      }),
    );
    if (!response.ok) {
      throw new Error("Initial guild classification failed");
    }
    const value: unknown = await response.json();
    const batchIds = new Set(batch);
    if (
      !isRecord(value) ||
      !validGuildIds(value.guildIds) ||
      !value.guildIds.every((guildId) => batchIds.has(guildId))
    ) {
      throw new Error("Initial guild classification response is invalid");
    }
    for (const guildId of value.guildIds) activeGuildIds.add(guildId);
  }
  return guildIds.filter((guildId) => !activeGuildIds.has(guildId));
}

export function gatewayInitialGuildStateKey(checkpointKey: string): string {
  return `${checkpointKey}:initial-guilds-v1`;
}

export function gatewayGuildInventoryStateKey(checkpointKey: string): string {
  return `${checkpointKey}:guild-inventory-v1`;
}

export function gatewayRecoveryAlarmAt(
  heartbeatIntervalMs: number,
  now: number,
): number {
  const alarmAt = now + heartbeatIntervalMs * RECOVERY_HEARTBEAT_INTERVALS;
  if (
    !Number.isSafeInteger(heartbeatIntervalMs) ||
    heartbeatIntervalMs <= 0 ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(alarmAt)
  ) {
    throw new Error("Gateway recovery alarm timestamp is invalid");
  }
  return alarmAt;
}

type PublicIdentifyPermit = {
  granted: boolean;
  rateLimitKey: number | null;
  maxConcurrency: number | null;
  remaining: number | null;
  resetAt: number | null;
  retryAt: number | null;
  reason: Exclude<IdentifyPermitResult, { granted: true }>["reason"] | null;
};

export type GatewayShardStatus = {
  state: GatewayMachine["status"];
  connectionMode: GatewayConnectionMode | null;
  activationId: string;
  shardGeneration: number;
  shardId: number;
  shardCount: number;
  sequence: number | null;
  sessionEstablished: boolean;
  lastDispatchAt: number | null;
  lastHeartbeatSentAt: number | null;
  lastHeartbeatAckAt: number | null;
  readyAt: number | null;
  lastEventType: string | null;
  lastError: string | null;
  interactionResponses: number;
  identifyAttempts: number;
  resumeAttempts: number;
  readyEvents: number;
  resumedEvents: number;
  forcedReconnects: number;
  forcedReidentifies: number;
  ownershipAcquired: boolean;
  identifyPermitRequests: number;
  identifyPermitsGranted: number;
  identifyPermitDenials: number;
  lastIdentifyPermit: PublicIdentifyPermit | null;
  initialGuildsPending: number;
  initialGuildsRequiringSync: number;
  guildInventoryComplete: boolean;
  guildInventoryCount: number;
  guildInventoryCapturedAt: number | null;
};

export type GatewayShardFaultResult =
  | { accepted: true; status: GatewayShardStatus }
  | {
      accepted: false;
      reason: "gateway-not-ready" | "session-not-resumable";
      status: GatewayShardStatus;
    };

export type GatewayShardIdentity = ShardOwnershipRequest;

const DISCORD_ERROR_CLASSES: Readonly<Record<string, string>> = {
  "Discord Get Gateway Bot response is invalid":
    "discord-gateway-bot-invalid-response",
  "Discord Gateway socket is not open": "discord-socket-not-open",
  "Discord Gateway URL is invalid": "discord-gateway-url-invalid",
  "Discord Identify shard coordinates are invalid":
    "discord-identify-coordinates-invalid",
  "Guild lifecycle synchronization failed":
    "guild-lifecycle-sync-failed",
  "Guild lifecycle synchronization response is invalid":
    "guild-lifecycle-sync-invalid-response",
  "Guild lifecycle logging response is invalid":
    "guild-lifecycle-log-invalid-response",
  "Initial guild classification failed":
    "guild-initial-classification-failed",
  "Initial guild classification response is invalid":
    "guild-initial-classification-invalid-response",
};

export function classifyGatewayRuntimeError(value: unknown): string {
  if (!(value instanceof Error)) return "non-error";
  if (
    value.message.includes("Cannot perform I/O on behalf of a different Durable Object")
  ) {
    return "cross-durable-object-io";
  }
  if (value.message.startsWith("Gateway ")) return "gateway-protocol";
  const gatewayBotStatus = value.message.match(
    /^Discord Get Gateway Bot returned HTTP ([1-5][0-9]{2})$/,
  );
  if (gatewayBotStatus !== null) {
    return `discord-gateway-bot-http-${gatewayBotStatus[1]}`;
  }
  const discordError = DISCORD_ERROR_CLASSES[value.message];
  if (discordError !== undefined) return discordError;
  if (value.message.startsWith("Discord ")) return "discord-response";
  return "unexpected";
}

export type GatewayShardConnectionOptions = {
  ctx: DurableObjectState;
  env: GatewayEnv;
  identity: GatewayShardIdentity;
  checkpoint?: GatewaySessionCheckpoint;
  checkpointKey: string;
  initialGuildState?: GatewayInitialGuildState;
  guildInventoryState?: GatewayGuildInventoryState;
  scheduleAlarm: (scheduledAt: number) => Promise<void>;
  onReady: (identity: GatewayShardIdentity) => Promise<void>;
  onFatal: (
    identity: GatewayShardIdentity,
    reason: string,
  ) => Promise<void>;
  isDispatchActive: (identity: GatewayShardIdentity) => boolean;
};

export function initialGatewayCheckpoint(
  identity: GatewayShardIdentity,
  now: number,
  allowedHostname?: string,
): GatewaySessionCheckpoint {
  return {
    version: 1,
    generation: identity.generation,
    shardId: identity.shardId,
    shardCount: identity.shardCount,
    ...(allowedHostname === undefined
      ? {}
      : { allowedGatewayHostname: allowedHostname }),
    sessionId: null,
    resumeGatewayUrl: null,
    sequence: null,
    lastDispatchAt: null,
    lastHeartbeatSentAt: null,
    lastHeartbeatAckAt: null,
    updatedAt: now,
  };
}

export class GatewayShardConnection {
  private machine: GatewayMachine;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private identifyPermitTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private readonly activationId = crypto.randomUUID();
  private readonly socketEventQueue = new GatewayEventQueue();
  private readonly channelDirectoryQueue = new GatewayEventQueue();
  private readonly initialGuilds: InitialGuildTracker;
  private readonly guildInventory: GuildInventory;
  private lifecycleMutationScope: string | null = null;
  private failedSocket: WebSocket | null = null;
  private readyAt: number | null = null;
  private lastEventType: string | null = null;
  private lastError: string | null = null;
  private interactionResponses = 0;
  private identifyAttempts = 0;
  private resumeAttempts = 0;
  private readyEvents = 0;
  private resumedEvents = 0;
  private forcedReconnects = 0;
  private forcedReidentifies = 0;
  private ownershipAcquired = false;
  private identifyPermitRequests = 0;
  private identifyPermitsGranted = 0;
  private identifyPermitDenials = 0;
  private lastIdentifyPermit: PublicIdentifyPermit | null = null;
  private readonly ctx: DurableObjectState;
  private readonly env: GatewayEnv;
  private readonly identity: GatewayShardIdentity;
  private readonly checkpointKey: string;
  private readonly scheduleAlarm: (scheduledAt: number) => Promise<void>;
  private readonly onReady: (identity: GatewayShardIdentity) => Promise<void>;
  private readonly onFatal: (
    identity: GatewayShardIdentity,
    reason: string,
  ) => Promise<void>;
  private readonly isDispatchActive: (identity: GatewayShardIdentity) => boolean;

  constructor(options: GatewayShardConnectionOptions) {
    this.ctx = options.ctx;
    this.env = options.env;
    this.identity = options.identity;
    this.checkpointKey = options.checkpointKey;
    this.initialGuilds = new InitialGuildTracker(options.initialGuildState);
    this.guildInventory = new GuildInventory(options.guildInventoryState);
    this.scheduleAlarm = options.scheduleAlarm;
    this.onReady = options.onReady;
    this.onFatal = options.onFatal;
    this.isDispatchActive = options.isDispatchActive;
    const checkpoint =
      options.checkpoint ??
      initialGatewayCheckpoint(
        options.identity,
        Date.now(),
        allowedGatewayHostname(options.env),
      );
    if (
      checkpoint.generation !== options.identity.generation ||
      checkpoint.shardId !== options.identity.shardId ||
      checkpoint.shardCount !== options.identity.shardCount
    ) {
      throw new Error("Gateway checkpoint does not match shard identity");
    }
    this.machine = createGatewayMachine(checkpoint);
  }

  needsRecovery(): boolean {
    return hasResumableGatewaySession(this.machine.checkpoint);
  }

  activationRecoveryAt(now = Date.now()): number {
    return now + ACTIVATION_RECOVERY_ALARM_DELAY_MS;
  }

  async recover(): Promise<void> {
    if (this.machine.status === "idle") {
      await this.acquireOwnership();
      await this.apply({ type: "start" });
      return;
    }
    if (this.machine.status === "ready") {
      await this.scheduleRecoveryAlarm();
    }
  }

  async start(): Promise<GatewayShardStatus> {
    if (this.machine.status === "fatal") {
      throw new Error("Gateway is in a fatal state");
    }
    if (
      this.machine.status === "stopped" ||
      this.machine.status === "suspended"
    ) {
      this.machine = createGatewayMachine(this.machine.checkpoint);
    }
    if (this.machine.status === "idle") {
      await this.acquireOwnership();
      await this.apply({ type: "start" });
    }
    return this.status();
  }

  status(): GatewayShardStatus {
    const checkpoint = this.machine.checkpoint;
    const initialGuilds = this.initialGuilds.counts();
    const guildInventory = this.currentGuildInventory();
    return {
      state: this.machine.status,
      connectionMode: this.machine.connectionMode,
      activationId: this.activationId,
      shardGeneration: checkpoint.generation,
      shardId: checkpoint.shardId,
      shardCount: checkpoint.shardCount,
      sequence: checkpoint.sequence,
      sessionEstablished: checkpoint.sessionId !== null,
      lastDispatchAt: checkpoint.lastDispatchAt,
      lastHeartbeatSentAt: checkpoint.lastHeartbeatSentAt,
      lastHeartbeatAckAt: checkpoint.lastHeartbeatAckAt,
      readyAt: this.readyAt,
      lastEventType: this.lastEventType,
      lastError: this.lastError,
      interactionResponses: this.interactionResponses,
      identifyAttempts: this.identifyAttempts,
      resumeAttempts: this.resumeAttempts,
      readyEvents: this.readyEvents,
      resumedEvents: this.resumedEvents,
      forcedReconnects: this.forcedReconnects,
      forcedReidentifies: this.forcedReidentifies,
      ownershipAcquired: this.ownershipAcquired,
      identifyPermitRequests: this.identifyPermitRequests,
      identifyPermitsGranted: this.identifyPermitsGranted,
      identifyPermitDenials: this.identifyPermitDenials,
      lastIdentifyPermit: this.lastIdentifyPermit,
      initialGuildsPending: initialGuilds.pending,
      initialGuildsRequiringSync: initialGuilds.requiringSync,
      guildInventoryComplete: guildInventory !== null,
      guildInventoryCount: guildInventory?.guildIds.length ?? 0,
      guildInventoryCapturedAt: guildInventory?.capturedAt ?? null,
    };
  }

  guildInventorySnapshot(): Promise<GatewayGuildInventoryState | null> {
    return this.socketEventQueue.enqueue(() =>
      Promise.resolve(this.currentGuildInventory()),
    );
  }

  currentGuildInventory(): GatewayGuildInventoryState | null {
    const inventory = this.guildInventory.snapshot();
    const checkpoint = this.machine.checkpoint;
    return inventory !== null &&
      inventory.generation === checkpoint.generation &&
      inventory.shardId === checkpoint.shardId &&
      inventory.shardCount === checkpoint.shardCount &&
      inventory.sessionId === checkpoint.sessionId
      ? inventory
      : null;
  }

  async forceReconnect(): Promise<GatewayShardFaultResult> {
    if (this.machine.status !== "ready") {
      return {
        accepted: false,
        reason: "gateway-not-ready",
        status: this.status(),
      };
    }
    if (!hasResumableGatewaySession(this.machine.checkpoint)) {
      return {
        accepted: false,
        reason: "session-not-resumable",
        status: this.status(),
      };
    }

    this.forcedReconnects += 1;
    await this.apply({ type: "reconnect-requested", receivedAt: Date.now() });
    return { accepted: true, status: this.status() };
  }

  async forceReidentify(): Promise<GatewayShardFaultResult> {
    if (this.machine.status !== "ready") {
      return {
        accepted: false,
        reason: "gateway-not-ready",
        status: this.status(),
      };
    }

    this.forcedReidentifies += 1;
    await this.apply({
      type: "invalid-session",
      resumable: false,
      receivedAt: Date.now(),
    });
    return { accepted: true, status: this.status() };
  }

  async suspend(): Promise<GatewayShardStatus> {
    if (this.machine.status !== "suspended") {
      await this.apply({
        type: "suspend",
        reason: "generation-replacement",
        suspendedAt: Date.now(),
      });
    }
    return this.status();
  }

  async stop(options?: {
    releaseOwnership?: boolean;
  }): Promise<GatewayShardStatus> {
    if (this.machine.status !== "stopped") {
      await this.apply({
        type: "stop",
        reason: "operator-request",
        stoppedAt: Date.now(),
      });
    }
    // Fleet-stop skips nested coordinator RPC (Cloudflare 1104) and lets the
    // coordinator clear ownership after the partition command returns.
    if (options?.releaseOwnership === false) {
      this.ownershipAcquired = false;
    } else {
      await this.releaseOwnership();
    }
    return this.status();
  }

  private async apply(
    event: GatewayEvent,
    persistCheckpoint = true,
  ): Promise<void> {
    const transition = transitionGateway(this.machine, event);
    this.machine = transition.machine;
    for (const action of transition.actions) {
      if (persistCheckpoint || action.type !== "persist-checkpoint") {
        await this.execute(action);
      }
    }
  }

  private async execute(action: GatewayAction): Promise<void> {
    switch (action.type) {
      case "open-socket":
        await this.openSocket(action.mode);
        return;
      case "schedule-heartbeat":
        this.scheduleHeartbeat(action.intervalMs, action.initialJitterRequired);
        return;
      case "request-identify-permit":
        await this.requestIdentifyPermit();
        return;
      case "send-identify":
        this.send(
          buildGatewayIdentify(await discordBotToken(this.env), {
            shardId: this.machine.checkpoint.shardId,
            shardCount: this.machine.checkpoint.shardCount,
          }),
        );
        this.identifyAttempts += 1;
        return;
      case "send-resume":
        this.send(
          buildGatewayResume(
            await discordBotToken(this.env),
            action.sessionId,
            action.sequence,
          ),
        );
        this.resumeAttempts += 1;
        return;
      case "send-heartbeat":
        this.send(buildGatewayHeartbeat(action.sequence));
        return;
      case "persist-checkpoint": {
        const entries: Record<string, unknown> = {
          [this.checkpointKey]: this.machine.checkpoint,
          [gatewayInitialGuildStateKey(this.checkpointKey)]:
            this.initialGuilds.snapshot(),
        };
        const guildInventory = this.guildInventory.snapshot();
        if (guildInventory !== null) {
          entries[gatewayGuildInventoryStateKey(this.checkpointKey)] =
            guildInventory;
        }
        await this.ctx.storage.put(entries);
        return;
      }
      case "report-ready":
        this.clearIdentifyPermitTimer();
        this.reconnectAttempt = 0;
        this.readyAt = Date.now();
        this.lastEventType = action.resumed ? "RESUMED" : "READY";
        if (action.resumed) this.resumedEvents += 1;
        else this.readyEvents += 1;
        this.lastError = null;
        await this.scheduleRecoveryAlarm();
        await this.onReady(this.identity);
        return;
      case "emit-dispatch":
        this.lastEventType = action.eventType;
        return;
      case "terminate-socket":
        this.clearHeartbeatTimer();
        this.clearIdentifyPermitTimer();
        this.closeSocket(4000, "reconnect");
        return;
      case "schedule-reconnect":
        this.scheduleReconnect(action.reason, action.closeCode);
        return;
      case "close-socket":
        this.clearTimers();
        this.closeSocket(action.code, action.reason);
        return;
      case "report-suspended":
      case "report-stopped":
        this.clearTimers();
        return;
      case "report-fatal":
        this.clearTimers();
        this.lastError = `${action.reason}:${String(action.closeCode)}`;
        await this.releaseOwnership();
        await this.onFatal(this.identity, this.lastError);
        return;
    }
  }

  private async openSocket(mode: GatewayConnectionMode): Promise<void> {
    const gatewayUrl =
      mode === "resume"
        ? this.machine.checkpoint.resumeGatewayUrl
        : await this.fetchGatewayUrl();
    if (gatewayUrl === null) {
      throw new Error("Resume Gateway URL is unavailable");
    }

    const socket = new WebSocket(
      normalizeDiscordGatewayUrl(
        gatewayUrl,
        allowedGatewayHostname(this.env),
      ),
    );
    this.socket = socket;
    this.failedSocket = null;
    if (mode === "identify") {
      this.initialGuilds.replace([], []);
      this.lifecycleMutationScope = null;
    }
    socket.addEventListener("open", () => {
      this.runSocketEvent(socket, "socket-open", async () => {
        await this.apply({ type: "socket-open" });
      });
    });
    socket.addEventListener("message", (event) => {
      this.runSocketEvent(socket, "message", async () => {
        if (typeof event.data !== "string") {
          throw new Error("Gateway message must use JSON text encoding");
        }
        await this.handleGatewayMessage(parseGatewayMessage(event.data));
      });
    });
    socket.addEventListener("close", (event) => {
      this.runSocketEvent(socket, "socket-close", async () => {
        this.socket = null;
        this.failedSocket = null;
        this.clearIdentifyPermitTimer();
        if (
          this.machine.status === "suspended" ||
          this.machine.status === "stopped"
        ) {
          return;
        }
        await this.apply({
          type: "socket-closed",
          code: event.code === 1005 ? null : event.code,
          closedAt: Date.now(),
        });
      });
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket) this.lastError = "websocket-error";
    });
  }

  private runSocketEvent(
    socket: WebSocket,
    code: string,
    operation: () => Promise<void>,
  ): void {
    const event = this.socketEventQueue.enqueue(async () => {
      if (
        this.socket !== socket ||
        (this.failedSocket === socket && code !== "socket-close")
      ) {
        return;
      }
      try {
        await operation();
      } catch (error: unknown) {
        const errorClass = classifyGatewayRuntimeError(error);
        this.lastError = `${code}:${errorClass}`;
        this.failedSocket = socket;
        this.clearHeartbeatTimer();
        this.clearIdentifyPermitTimer();
        console.error(
          JSON.stringify({
            level: "error",
            message: "Gateway socket event failed",
            code,
            errorClass,
          }),
        );
        this.closeSocket(4000, "event-failed");
      }
    });
    this.ctx.waitUntil(event);
  }

  private async handleGatewayMessage(
    message: ParsedGatewayMessage,
  ): Promise<void> {
    const now = Date.now();
    switch (message.type) {
      case "hello":
        await this.apply({
          type: "hello",
          heartbeatIntervalMs: message.heartbeatIntervalMs,
        });
        return;
      case "heartbeat-requested":
        await this.apply({ type: "heartbeat-requested", sentAt: now });
        return;
      case "reconnect-requested":
        await this.apply({ type: "reconnect-requested", receivedAt: now });
        return;
      case "invalid-session":
        await this.apply({
          type: "invalid-session",
          resumable: message.resumable,
          receivedAt: now,
        });
        return;
      case "heartbeat-ack":
        await this.apply({ type: "heartbeat-ack", receivedAt: now });
        await this.scheduleRecoveryAlarm(now);
        return;
      case "ready": {
        const syncGuildIds = await findGuildsNeedingInitialSync(
          this.env.DATA_SERVICE,
          message.initialGuildIds,
        );
        this.initialGuilds.replace(message.initialGuildIds, syncGuildIds);
        this.guildInventory.replace(
          this.identity,
          message.sessionId,
          message.initialGuildIds,
          now,
        );
        this.lifecycleMutationScope = await gatewaySessionMutationScope(
          message.sessionId,
        );
        await this.apply({
          type: "ready",
          sequence: message.sequence,
          sessionId: message.sessionId,
          resumeGatewayUrl: message.resumeGatewayUrl,
          receivedAt: now,
        });
        this.send(buildGatewayPresenceUpdate());
        return;
      }
      case "resumed": {
        const sessionId = this.machine.checkpoint.sessionId;
        if (sessionId === null) {
          throw new Error("Gateway Resume session id is unavailable");
        }
        this.lifecycleMutationScope = await gatewaySessionMutationScope(
          sessionId,
        );
        const pendingGuildIds = this.initialGuilds.snapshot().guildIds;
        if (pendingGuildIds.length > 0) {
          const syncGuildIds = await findGuildsNeedingInitialSync(
            this.env.DATA_SERVICE,
            pendingGuildIds,
          );
          this.initialGuilds.replace(pendingGuildIds, syncGuildIds);
        }
        await this.apply({
          type: "resumed",
          sequence: message.sequence,
          receivedAt: now,
        });
        this.send(buildGatewayPresenceUpdate());
        return;
      }
      case "dispatch": {
        const active = this.isDispatchActive(this.identity);
        const initialGuildId = this.initialGuilds.match(
          message.eventType,
          message.data,
        );
        const lifecycleEvent = await this.syncGuildLifecycle(
          message.eventType,
          message.data,
          message.sequence,
          now,
          guildLifecycleMode(
            active,
            initialGuildId,
            initialGuildId !== null &&
              this.initialGuilds.needsSync(initialGuildId),
          ),
        );
        if (active) {
          this.syncDiscordChannelDirectory(
            message.eventType,
            message.data,
            now,
          );
        }
        this.guildInventory.apply(lifecycleEvent);
        await this.apply(
          {
            type: "dispatch",
            sequence: message.sequence,
            eventType: message.eventType,
            receivedAt: now,
          },
          initialGuildId === null,
        );
        if (initialGuildId !== null) this.initialGuilds.complete(initialGuildId);
        return;
      }
    }
  }

  private syncDiscordChannelDirectory(
    eventType: string,
    data: unknown,
    receivedAt: number,
  ): void {
    const warn = () => {
      console.warn(JSON.stringify({
        level: "warn",
        message: "Gateway channel context cache write failed",
        eventType,
      }));
    };
    let mutation: ReturnType<typeof parseDiscordChannelDirectoryDispatchV1>;
    try {
      mutation = parseDiscordChannelDirectoryDispatchV1(
        eventType,
        data,
        receivedAt,
      );
    } catch {
      warn();
      return;
    }
    if (mutation === null) return;

    const synchronization = this.channelDirectoryQueue.enqueue(async () => {
      const response = await this.env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/discord-channel-context", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(mutation),
        }),
      );
      const result: unknown = response.ok ? await response.json() : null;
      if (
        !response.ok ||
        !isRecord(result) ||
        !["applied", "existing", "stale"].includes(String(result.status))
      ) {
        throw new Error("Discord channel directory synchronization failed");
      }
    });
    try {
      this.ctx.waitUntil(synchronization.catch(warn));
    } catch {
      warn();
    }
  }

  private async syncGuildLifecycle(
    eventType: string,
    data: unknown,
    sequence: number,
    receivedAt: number,
    mode: GuildLifecycleMode,
  ): Promise<ReturnType<typeof parseGuildLifecycleDispatch>> {
    const event = parseGuildLifecycleDispatch(eventType, data);
    if (mode === "none" || event === null || event.type === "unavailable") {
      return event;
    }
    if (this.lifecycleMutationScope === null) {
      throw new Error("Gateway lifecycle mutation scope is unavailable");
    }
    const mutationId = `gateway:${String(this.identity.generation)}:${String(this.identity.shardId)}:${this.lifecycleMutationScope}:${String(sequence)}:${eventType}`;
    const response = await this.env.DATA_SERVICE.fetch(
      new Request("https://data.internal/internal/guilds/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...event, mutationId, occurredAt: receivedAt }),
      }),
    );
    if (!response.ok) {
      throw new Error("Guild lifecycle synchronization failed");
    }
    const result: unknown = await response.json();
    if (
      !isRecord(result) ||
      (result.status !== "applied" &&
        result.status !== "existing" &&
        result.status !== "missing") ||
      (result.guildName !== null && typeof result.guildName !== "string")
    ) {
      throw new Error("Guild lifecycle synchronization response is invalid");
    }
    this.guildInventory.apply(event);
    const guildInventory = this.guildInventory.snapshot();
    if (guildInventory !== null) {
      await this.ctx.storage.put(
        gatewayGuildInventoryStateKey(this.checkpointKey),
        guildInventory,
      );
    }
    if (
      mode === "synchronize" ||
      result.status === "missing" ||
      typeof result.guildName !== "string"
    ) {
      return event;
    }
    const logged = await this.env.DISCORD_REST.logGuildLifecycle({
      mutationId,
      eventType: event.type === "upsert" ? "guildAdd" : "guildRemove",
      guildName: result.guildName,
    });
    if (!isRecord(logged) || logged.status !== "delivered") {
      throw new Error("Guild lifecycle logging response is invalid");
    }
    return event;
  }

  private ownershipRequest(): ShardOwnershipRequest {
    const checkpoint = this.machine.checkpoint;
    return {
      generation: checkpoint.generation,
      shardId: checkpoint.shardId,
      shardCount: checkpoint.shardCount,
      ownerId: this.identity.ownerId,
    };
  }

  private async acquireOwnership(): Promise<void> {
    const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    const result = await coordinator.acquireOwnership(this.ownershipRequest());
    if (!result.acquired) {
      this.lastError = "shard-ownership-conflict";
      throw new Error("Gateway shard is owned by another partition");
    }
    this.ownershipAcquired = true;
  }

  private async releaseOwnership(): Promise<void> {
    const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    const released = await coordinator.releaseOwnership(this.ownershipRequest());
    if (this.ownershipAcquired && !released) {
      throw new Error("Gateway shard ownership release failed");
    }
    this.ownershipAcquired = false;
  }

  private async requestIdentifyPermit(): Promise<void> {
    this.identifyPermitRequests += 1;
    const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    const result = await coordinator.requestIdentifyPermit(
      this.ownershipRequest(),
    );
    if (result.granted) {
      this.identifyPermitsGranted += 1;
      this.lastIdentifyPermit = {
        granted: true,
        rateLimitKey: result.rateLimitKey,
        maxConcurrency: result.maxConcurrency,
        remaining: result.remainingAfterGrant,
        resetAt: result.resetAt,
        retryAt: null,
        reason: null,
      };
      this.lastError = null;
      await this.apply({ type: "identify-permit-granted" });
      return;
    }

    this.identifyPermitDenials += 1;
    this.lastIdentifyPermit = {
      granted: false,
      rateLimitKey: result.rateLimitKey ?? null,
      maxConcurrency: result.maxConcurrency ?? null,
      remaining: result.remaining ?? null,
      resetAt: result.resetAt ?? null,
      retryAt: result.retryAt ?? null,
      reason: result.reason,
    };
    this.lastError = `identify-permit-${result.reason}`;
    if (result.reason === "shard-not-owned") {
      this.ownershipAcquired = false;
      throw new Error("Gateway Identify requested without shard ownership");
    }
    if (result.retryAt === undefined) {
      throw new Error("Gateway Identify permit retry time is unavailable");
    }
    this.scheduleIdentifyPermitRetry(result.retryAt);
  }

  private scheduleIdentifyPermitRetry(retryAt: number): void {
    const delay = Math.max(0, retryAt - Date.now());
    if (!Number.isSafeInteger(retryAt) || retryAt < 0 || delay > MAX_TIMER_DELAY_MS) {
      throw new Error("Gateway Identify permit retry time is invalid");
    }
    this.clearIdentifyPermitTimer();
    this.identifyPermitTimer = setTimeout(() => {
      this.identifyPermitTimer = null;
      if (this.machine.status !== "awaiting-identify-permit") return;
      this.ctx.waitUntil(
        this.requestIdentifyPermit().catch(() => {
          this.lastError = "identify-permit-retry-failed";
          this.clearHeartbeatTimer();
          this.closeSocket(4000, "identify-permit-failed");
        }),
      );
    }, delay);
  }

  private fetchGatewayUrl(): Promise<string> {
    const coordinator = this.env.GATEWAY_COORDINATOR.getByName(
      GATEWAY_COORDINATOR_NAME,
    );
    return coordinator.gatewayUrl();
  }

  private send(payload: unknown): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Discord Gateway socket is not open");
    }
    this.socket.send(serializeGatewayPayload(payload));
  }

  private scheduleHeartbeat(
    intervalMs: number,
    initialJitterRequired: boolean,
  ): void {
    this.clearHeartbeatTimer();
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    if (random === undefined) {
      throw new Error("Heartbeat jitter generation failed");
    }
    const delay = initialJitterRequired
      ? Math.floor((random / 2 ** 32) * intervalMs)
      : intervalMs;
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      const socket = this.socket;
      if (socket === null) return;
      this.runSocketEvent(socket, "heartbeat-timer", async () => {
        await this.apply({ type: "heartbeat-due", sentAt: Date.now() });
        if (this.machine.heartbeat !== null) {
          this.scheduleHeartbeat(intervalMs, false);
        }
      });
    }, delay);
  }

  private async scheduleRecoveryAlarm(now = Date.now()): Promise<void> {
    const heartbeat = this.machine.heartbeat;
    if (heartbeat === null) {
      throw new Error("Gateway recovery alarm requires heartbeat state");
    }
    await this.scheduleAlarm(
      gatewayRecoveryAlarmAt(heartbeat.intervalMs, now),
    );
  }

  private scheduleReconnect(reason: string, closeCode: number | null): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    const exponent = Math.min(this.reconnectAttempt, 5);
    let delay = 1_000 * 2 ** exponent;
    if (reason === "gateway-reconnect") delay = 0;
    else if (closeCode === 4008) delay = 5_000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ctx.waitUntil(
        this.apply({ type: "reconnect-delay-elapsed" }).catch(() => {
          this.lastError = "reconnect-failed";
        }),
      );
    }, delay);
  }

  private closeSocket(code: number, reason: string): void {
    const socket = this.socket;
    if (socket !== null && socket.readyState <= WebSocket.OPEN) {
      socket.close(code, reason);
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer !== null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearIdentifyPermitTimer(): void {
    if (this.identifyPermitTimer !== null) {
      clearTimeout(this.identifyPermitTimer);
      this.identifyPermitTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeatTimer();
    this.clearIdentifyPermitTimer();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
