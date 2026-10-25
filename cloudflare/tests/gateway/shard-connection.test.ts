import { describe, expect, it, vi } from "vitest";
import {
  createGatewayMachine,
  transitionGateway,
  validateGatewaySessionCheckpoint,
  type GatewayMachine,
  type GatewayEvent,
} from "../../packages/gateway-protocol/src";
import {
  parseDiscordChannelDirectoryMutationV1,
  type DiscordChannelDirectoryMutationV1,
} from "../../packages/discord-contracts/src";
import type { ParsedGatewayMessage } from "../../workers/gateway/src/discord-gateway";
import {
  GatewayEventQueue,
  GuildInventory,
  GatewayShardConnection,
  gatewayGuildInventoryStateKey,
  gatewayInitialGuildStateKey,
  initialGatewayCheckpoint,
  parseGatewayGuildInventoryState,
  parseGatewayInitialGuildState,
  type GatewayGuildInventoryState,
  type GatewayShardConnectionOptions,
  type GatewayShardIdentity,
  type GatewayShardStorageValue,
  type InitialGuildTracker,
} from "../../workers/gateway/src/gateway-shard-connection";

const guildId = "100000000000000001";
const identity: GatewayShardIdentity = {
  generation: 3,
  shardId: 0,
  shardCount: 23,
  ownerId: "gateway-partition-0",
};
const checkpointKey = "gateway-fleet-checkpoint-v1:3:0:23";

function identifyMachine(): GatewayMachine {
  const machine = helloMachine(initialGatewayCheckpoint(identity, 1));
  return transitionGateway(machine, {
    type: "identify-permit-granted",
  }).machine;
}

function readyMessage(): Extract<ParsedGatewayMessage, { type: "ready" }> {
  return {
    type: "ready",
    sequence: 1,
    sessionId: "session-123",
    resumeGatewayUrl: "wss://gateway.discord.gg",
    initialGuildIds: [guildId],
  };
}

function guildCreateData() {
  return {
    id: guildId,
    name: "Test Guild",
    icon: null,
    owner_id: "100000000000000002",
    member_count: 42,
    approximate_member_count: 42,
    preferred_locale: "en-US",
    joined_at: "2026-07-14T09:00:00.000Z",
    unavailable: false,
  };
}

function guildCreateMessage(): Extract<
  ParsedGatewayMessage,
  { type: "dispatch" }
> {
  return {
    type: "dispatch",
    sequence: 2,
    eventType: "GUILD_CREATE",
    data: guildCreateData(),
  };
}

class StorageFixture {
  readonly values = new Map<string, GatewayShardStorageValue>();

  put(
    key: string,
    value: GatewayShardStorageValue,
    options?: DurableObjectPutOptions,
  ): Promise<void>;
  put(
    entries: Record<string, GatewayShardStorageValue>,
    options?: DurableObjectPutOptions,
  ): Promise<void>;
  put(
    keyOrEntries: string | Record<string, GatewayShardStorageValue>,
    valueOrOptions?: GatewayShardStorageValue | DurableObjectPutOptions,
  ): Promise<void> {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The storage SDK overload distinguishes a string key from a typed batch.
    if (typeof keyOrEntries === "string") {
      if (valueOrOptions === undefined || !("version" in valueOrOptions)) throw new Error("Storage value is required");
      this.values.set(keyOrEntries, structuredClone(valueOrOptions));
    } else {
      for (const [key, value] of Object.entries(keyOrEntries)) this.values.set(key, structuredClone(value));
    }
    return Promise.resolve();
  }
}

function storedSnapshots(storage: StorageFixture) {
  return {
    checkpoint: validateGatewaySessionCheckpoint(storage.values.get(checkpointKey)),
    initialGuildState: parseGatewayInitialGuildState(storage.values.get(gatewayInitialGuildStateKey(checkpointKey))),
    guildInventoryState: parseGatewayGuildInventoryState(storage.values.get(gatewayGuildInventoryStateKey(checkpointKey))),
  };
}

function helloMachine(checkpoint: GatewayMachine["checkpoint"]): GatewayMachine {
  let machine = createGatewayMachine(checkpoint);
  machine = transitionGateway(machine, { type: "start" }).machine;
  machine = transitionGateway(machine, { type: "socket-open" }).machine;
  return transitionGateway(machine, { type: "hello", heartbeatIntervalMs: 41_250 }).machine;
}

type TestableConnection = {
  machine: GatewayMachine;
  socket: WebSocket | null;
  initialGuilds: InitialGuildTracker;
  socketEventQueue: GatewayEventQueue;
  handleGatewayMessage(message: ParsedGatewayMessage): Promise<void>;
  runSocketEvent(
    socket: WebSocket,
    code: string,
    operation: () => Promise<void>,
  ): void;
  acquireOwnership(): Promise<void>;
  apply(event: GatewayEvent): Promise<void>;
};

function testableConnection(
  shard: GatewayShardConnection,
): TestableConnection {
  return {
    get machine() {
      return shard["machine"];
    },
    set machine(machine) {
      shard["machine"] = machine;
    },
    get socket() {
      return shard["socket"];
    },
    set socket(socket) {
      shard["socket"] = socket;
    },
    get initialGuilds() {
      return shard["initialGuilds"];
    },
    get socketEventQueue() {
      return shard["socketEventQueue"];
    },
    handleGatewayMessage: (message) => shard["handleGatewayMessage"](message),
    runSocketEvent: (socket, code, operation) => {
      shard["runSocketEvent"](socket, code, operation);
    },
    get acquireOwnership() {
      return () => shard["acquireOwnership"]();
    },
    set acquireOwnership(acquireOwnership) {
      shard["acquireOwnership"] = acquireOwnership;
    },
    get apply() {
      return (event: GatewayEvent) => shard["apply"](event);
    },
    set apply(apply) {
      shard["apply"] = apply;
    },
  };
}

function connection(
  activeGuild: boolean,
  dispatchActive = false,
  restored: Pick<GatewayShardConnectionOptions, "checkpoint" | "initialGuildState" | "guildInventoryState"> = {},
) {
  const background: Promise<unknown>[] = [];
  const channelMutations: DiscordChannelDirectoryMutationV1[] = [];
  const storage = new StorageFixture();
  if (restored.checkpoint !== undefined) storage.values.set(checkpointKey, structuredClone(restored.checkpoint));
  if (restored.initialGuildState !== undefined) storage.values.set(gatewayInitialGuildStateKey(checkpointKey), structuredClone(restored.initialGuildState));
  if (restored.guildInventoryState !== undefined) storage.values.set(gatewayGuildInventoryStateKey(checkpointKey), structuredClone(restored.guildInventoryState));
  const storagePut = vi.spyOn(storage, "put");
  const scheduleAlarm = vi.fn(() => Promise.resolve());
  const waitUntil = vi.fn((promise: Promise<unknown>) => {
    background.push(promise);
  });
  const dataFetch = vi.fn((request: Request) => {
    const path = new URL(request.url).pathname;
    if (path === "/internal/guilds/filter") {
      return Promise.resolve(
        Response.json({ guildIds: activeGuild ? [guildId] : [] }),
      );
    }
    if (path === "/internal/guilds/lifecycle") {
      return Promise.resolve(
        Response.json({ status: "applied", guildName: "Test Guild" }),
      );
    }
    if (path === "/internal/discord-channel-context") {
      return request.json().then((value) => {
        channelMutations.push(parseDiscordChannelDirectoryMutationV1(value));
        return Response.json({ status: "applied" });
      });
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  const logGuildLifecycle = vi.fn(() =>
    Promise.resolve({ status: "delivered" as const }),
  );
  const coordinator = {
    acquireOwnership: () =>
      Promise.resolve({ acquired: true as const, alreadyOwned: false }),
    releaseOwnership: () => Promise.resolve(true),
    requestIdentifyPermit: () => Promise.resolve({
      granted: true as const,
      rateLimitKey: 0,
      maxConcurrency: 1,
      remainingAfterGrant: 999,
      resetAt: 1_720_086_400_000,
      grantedAt: 1_720_000_000_000,
    }),
    gatewayUrl: () => Promise.resolve("wss://gateway.discord.gg"),
  };
  const shard = new GatewayShardConnection({
    ctx: {
      storage,
      waitUntil,
    },
    env: {
      DISCORD_BOT_TOKEN:
        "development-token-first-part.second.development-token-third-part",
      GATEWAY_ALLOWED_HOSTNAME: "gateway.discord.gg",
      DATA_SERVICE: { fetch: dataFetch },
      DISCORD_REST: { logGuildLifecycle },
      GATEWAY_COORDINATOR: { getByName: () => coordinator },
    },
    identity,
    checkpoint: initialGatewayCheckpoint(identity, 1),
    ...restored,
    checkpointKey,
    scheduleAlarm,
    onReady: () => Promise.resolve(),
    onFatal: () => Promise.resolve(),
    isDispatchActive: () => dispatchActive,
  });
  const testable = testableConnection(shard);
  const pair = new WebSocketPair();
  const socket = pair[0];
  socket.accept();
  pair[1].accept();
  const socketSend = vi.spyOn(socket, "send");
  testable.machine = restored.checkpoint === undefined ? identifyMachine() : helloMachine(restored.checkpoint);
  testable.socket = socket;
  return {
    background,
    channelMutations,
    dataFetch,
    logGuildLifecycle,
    shard,
    storage,
    storagePut,
    scheduleAlarm,
    testable,
    socketSend,
    socketPeer: pair[1],
    waitUntil,
  };
}

describe("GatewayShardConnection recovery", () => {
  it("starts once when activation and alarm recovery overlap an ownership RPC", async () => {
    const { shard, testable } = connection(true);
    testable.machine = createGatewayMachine(initialGatewayCheckpoint(identity, 1));
    let releaseOwnership: () => void = () => { throw new Error("Ownership RPC did not start"); };
    const ownership = new Promise<void>((resolve) => { releaseOwnership = resolve; });
    testable.acquireOwnership = () => ownership;
    const apply = vi.fn((event: GatewayEvent) => {
      testable.machine = transitionGateway(testable.machine, event).machine;
      return Promise.resolve();
    });
    testable.apply = apply;
    const activation = shard.start();
    const recovery = shard.recover();
    releaseOwnership();
    await Promise.all([activation, recovery]);
    expect(apply).toHaveBeenCalledExactlyOnceWith({ type: "start" });
    expect(shard.status().state).toBe("connecting");
  });

  it("restarts an interrupted pre-session target connection", async () => {
    const { shard, testable } = connection(true);
    const acquireOwnership = vi.fn(() => Promise.resolve());
    const apply = vi.fn(() => Promise.resolve());
    testable.machine = createGatewayMachine(initialGatewayCheckpoint(identity, 1));
    testable.acquireOwnership = acquireOwnership;
    testable.apply = apply;

    await shard.recover();

    expect(acquireOwnership).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith({ type: "start" });
  });
});

describe("GatewayShardConnection snapshot persistence", () => {
  it("retains the exact heartbeat reconnect cause after Resume without persisting diagnostics", async () => {
    const { shard, storagePut, testable } = connection(true);
    expect(shard.status().lastReconnect).toBeNull();
    try {
      await testable.handleGatewayMessage(readyMessage());
      await testable.handleGatewayMessage({ type: "heartbeat-requested" });
      const before = shard.status();
      const writes = storagePut.mock.calls.length;
      const scheduledAfter = Date.now();
      await testable.apply({ type: "heartbeat-due", sentAt: Date.now() });
      const reconnect = shard.status().lastReconnect;
      expect(reconnect).toEqual({
        reason: "heartbeat-ack-timeout",
        closeCode: null,
        scheduledAt: reconnect?.scheduledAt,
        lastHeartbeatSentAt: before.lastHeartbeatSentAt,
        lastHeartbeatAckAt: before.lastHeartbeatAckAt,
      });
      expect(reconnect?.scheduledAt).toBeGreaterThanOrEqual(scheduledAfter);
      expect(reconnect?.scheduledAt).toBeLessThanOrEqual(Date.now());
      expect(storagePut).toHaveBeenCalledTimes(writes);
      testable.machine = helloMachine(testable.machine.checkpoint);
      testable.socket = new WebSocketPair()[0];
      testable.socket.accept();
      await testable.handleGatewayMessage({ type: "resumed", sequence: 2 });
      expect(shard.status().lastError).toBeNull();
      expect(shard.status().lastReconnect).toEqual(reconnect);
      expect(storagePut.mock.calls.at(-1)?.[0]).toEqual({
        [checkpointKey]: testable.machine.checkpoint,
      });
    } finally { await shard.stop(); }
  });

  it("distinguishes a requested reconnect from a heartbeat timeout", async () => {
    const { shard, testable } = connection(true);
    try {
      await testable.handleGatewayMessage(readyMessage());
      await shard.forceReconnect();
      expect(shard.status().lastReconnect?.reason).toBe("gateway-reconnect");
      expect(shard.status().lastReconnect?.closeCode).toBeNull();
    } finally { await shard.stop(); }
  });

  it("retains the reconnect close code", async () => {
    const { shard, testable } = connection(true);
    try {
      await testable.handleGatewayMessage(readyMessage());
      await testable.apply({ type: "socket-closed", code: 4008, closedAt: Date.now() });
      expect(shard.status().lastReconnect?.reason).toBe("socket-closed");
      expect(shard.status().lastReconnect?.closeCode).toBe(4008);
    } finally { await shard.stop(); }
  });

  it.each(["stop", "suspend"] as const)("ignores a queued heartbeat ACK after %s", async (command) => {
    const { shard, testable, background } = connection(true);
    await testable.handleGatewayMessage(readyMessage());
    await testable.handleGatewayMessage({ type: "heartbeat-requested" });
    const socket = testable.socket;
    if (socket === null) throw new Error("Fixture socket is required");
    let release: () => void = () => { throw new Error("Gate is not initialized"); };
    const gate = new Promise<void>((resolve) => { release = resolve; });
    void testable.socketEventQueue.enqueue(() => gate);
    testable.runSocketEvent(socket, "message", () => testable.handleGatewayMessage({ type: "heartbeat-ack" }));
    try {
      await shard[command]();
    } finally { release(); }
    await Promise.all(background);
    expect(shard.status().lastError).toBeNull();
    expect(shard.status().state).toBe(command === "stop" ? "stopped" : "suspended");
  });

  it("writes only checkpoints on steady heartbeats and keeps recovery alarms", async () => {
    const { shard, storage, storagePut, scheduleAlarm, testable } = connection(true);
    await testable.handleGatewayMessage(readyMessage());
    await testable.handleGatewayMessage(guildCreateMessage());
    await testable.handleGatewayMessage({ type: "heartbeat-requested" });
    expect(storagePut.mock.calls.at(-1)?.[0]).toEqual({
      [checkpointKey]: storage.values.get(checkpointKey),
      [gatewayInitialGuildStateKey(checkpointKey)]: { version: 1, guildIds: [], syncGuildIds: [] },
    });
    await testable.handleGatewayMessage({ type: "heartbeat-ack" });
    storagePut.mockClear();
    scheduleAlarm.mockClear();

    for (let cycle = 0; cycle < 2; cycle++) {
      await testable.handleGatewayMessage({ type: "heartbeat-requested" });
      await testable.handleGatewayMessage({ type: "heartbeat-ack" });
    }

    expect(storagePut).toHaveBeenCalledTimes(4);
    expect(storagePut.mock.calls.map(([entries]) => Object.keys(entries))).toEqual(Array.from({ length: 4 }, () => [checkpointKey]));
    expect(scheduleAlarm).toHaveBeenCalledTimes(2);
    expect(scheduleAlarm).toHaveBeenLastCalledWith(Number(shard.status().lastHeartbeatAckAt) + 82_500);
    expect(validateGatewaySessionCheckpoint(storage.values.get(checkpointKey))).toMatchObject({
      sequence: 2,
      lastHeartbeatSentAt: shard.status().lastHeartbeatSentAt,
      lastHeartbeatAckAt: shard.status().lastHeartbeatAckAt,
    });
  });

  it("recovers partial initial synchronization without rewriting loaded snapshots", async () => {
    const joinedGuildId = "100000000000000003";
    const original = connection(true);
    await original.testable.handleGatewayMessage({ ...readyMessage(), initialGuildIds: [guildId, joinedGuildId] });
    await original.testable.handleGatewayMessage(guildCreateMessage());
    await original.testable.handleGatewayMessage({ type: "heartbeat-requested" });
    expect(original.storagePut.mock.calls.at(-1)?.[0]).toEqual({
      [checkpointKey]: original.storage.values.get(checkpointKey),
      [gatewayInitialGuildStateKey(checkpointKey)]: { version: 1, guildIds: [joinedGuildId], syncGuildIds: [joinedGuildId] },
    });

    const restored = connection(false, false, storedSnapshots(original.storage));
    await restored.testable.handleGatewayMessage({ type: "resumed", sequence: 3 });
    expect(restored.storagePut.mock.calls[0]?.[0]).toEqual({ [checkpointKey]: restored.storage.values.get(checkpointKey) });
    expect(restored.shard.status()).toMatchObject({ initialGuildsPending: 1, initialGuildsRequiringSync: 1, guildInventoryCount: 2 });
    await restored.testable.handleGatewayMessage({ ...guildCreateMessage(), sequence: 4, data: { ...guildCreateData(), id: joinedGuildId } });
    await restored.testable.handleGatewayMessage({ type: "heartbeat-requested" });
    expect(restored.storagePut.mock.calls.at(-1)?.[0]).toEqual({
      [checkpointKey]: restored.storage.values.get(checkpointKey),
      [gatewayInitialGuildStateKey(checkpointKey)]: { version: 1, guildIds: [], syncGuildIds: [] },
    });
    expect(storedSnapshots(restored.storage).checkpoint.sequence).toBe(4);
    expect(restored.shard.status()).toMatchObject({ initialGuildsPending: 0, initialGuildsRequiringSync: 0 });
  });

  it("applies replayed guild events before RESUMED after restoring a checkpoint", async () => {
    const original = connection(true, true);
    await original.testable.handleGatewayMessage(readyMessage());
    await original.testable.handleGatewayMessage(guildCreateMessage());
    await original.testable.handleGatewayMessage({ type: "heartbeat-requested" });
    const restored = connection(true, true, storedSnapshots(original.storage));
    // A retry of the same sequence on a new owner must keep its mutation ID.
    await original.testable.handleGatewayMessage({ ...guildCreateMessage(), sequence: 3 });
    await restored.shard["execute"]({ type: "send-resume", sessionId: "session-123", sequence: 2 });
    await restored.testable.handleGatewayMessage({ ...guildCreateMessage(), sequence: 3 });
    expect(restored.logGuildLifecycle).toHaveBeenCalledTimes(1);
    expect(restored.logGuildLifecycle.mock.calls[0]).toEqual(original.logGuildLifecycle.mock.calls[0]);
    expect(restored.shard.status()).toMatchObject({ state: "resuming", sequence: 3 });
    expect(storedSnapshots(restored.storage).checkpoint.sequence).toBe(3);
    await restored.testable.handleGatewayMessage({ type: "resumed", sequence: 4 });
    expect(restored.shard.status()).toMatchObject({ state: "ready", sequence: 4 });
    expect(restored.logGuildLifecycle).toHaveBeenCalledTimes(1);
  });

  it("initializes missing legacy snapshots instead of treating defaults as persisted", async () => {
    const { storage, storagePut, testable } = connection(false, false, {
      checkpoint: { ...initialGatewayCheckpoint(identity, 1), sessionId: "session-123", resumeGatewayUrl: "wss://gateway.discord.gg", sequence: 1 },
    });
    await testable.handleGatewayMessage({ type: "resumed", sequence: 2 });
    expect(storagePut.mock.calls[0]?.[0]).toEqual({
      [checkpointKey]: storage.values.get(checkpointKey),
      [gatewayInitialGuildStateKey(checkpointKey)]: { version: 1, guildIds: [], syncGuildIds: [] },
    });
    expect(storage.values.has(gatewayGuildInventoryStateKey(checkpointKey))).toBe(false);
    await testable.handleGatewayMessage({ type: "heartbeat-requested" });
    expect(storagePut.mock.calls.at(-1)?.[0]).toEqual({ [checkpointKey]: storage.values.get(checkpointKey) });
  });

  it("retries both snapshots after a failed batch before recording them as persisted", async () => {
    const { storage, storagePut, testable } = connection(true);
    storagePut.mockRejectedValueOnce(new Error("fixture storage failure"));
    await expect(testable.handleGatewayMessage(readyMessage())).rejects.toThrow("fixture storage failure");
    expect(storage.values.size).toBe(0);

    await testable.handleGatewayMessage({ type: "heartbeat-requested" });
    expect(Object.keys(storagePut.mock.calls.at(-1)?.[0] ?? {})).toEqual([
      checkpointKey, gatewayInitialGuildStateKey(checkpointKey), gatewayGuildInventoryStateKey(checkpointKey),
    ]);
    expect(storedSnapshots(storage)).toMatchObject({
      checkpoint: { sessionId: "session-123" },
      initialGuildState: { guildIds: [guildId] },
      guildInventoryState: { guildIds: [guildId] },
    });
  });

  it("keeps changes made during an unfinished write eligible for the next batch", async () => {
    const { storage, storagePut, testable } = connection(true);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const writing = new Promise<void>((resolve) => { entered = resolve; });
    storagePut.mockImplementationOnce(async (entries) => {
      await StorageFixture.prototype.put.call(storage, entries);
      entered();
      await gate;
    });
    const ready = testable.handleGatewayMessage(readyMessage());
    await writing;
    testable.initialGuilds.complete(guildId);
    release();
    await ready;
    expect(storedSnapshots(storage).initialGuildState.guildIds).toEqual([guildId]);
    await testable.handleGatewayMessage({ type: "heartbeat-requested" });
    expect(storagePut.mock.calls.at(-1)?.[0]).toEqual({
      [checkpointKey]: storage.values.get(checkpointKey),
      [gatewayInitialGuildStateKey(checkpointKey)]: { version: 1, guildIds: [], syncGuildIds: [] },
    });
  });

  it("writes inventory when session metadata changes but guild membership does not", async () => {
    const { storage, storagePut, testable } = connection(true);
    await testable.handleGatewayMessage(readyMessage());
    testable.machine = identifyMachine();
    await testable.handleGatewayMessage({ ...readyMessage(), sessionId: "session-new" });
    expect(storagePut.mock.calls.at(-1)?.[0]).toEqual({
      [checkpointKey]: storage.values.get(checkpointKey),
      [gatewayGuildInventoryStateKey(checkpointKey)]: storedSnapshots(storage).guildInventoryState,
    });
    expect(storedSnapshots(storage).guildInventoryState.sessionId).toBe("session-new");
  });
});

describe("GuildInventory membership", () => {
  it("preserves metadata, order and snapshot isolation across duplicate and actual changes", () => {
    const secondGuildId = "100000000000000002";
    const missingGuildId = "100000000000000003";
    const state: GatewayGuildInventoryState = {
      version: 1, generation: identity.generation, shardId: identity.shardId,
      shardCount: identity.shardCount, sessionId: "inventory-session", capturedAt: 1_000,
      guildIds: [guildId, secondGuildId],
    };
    const inventory = new GuildInventory(state);
    const upsert = (id: string) => {
      inventory.apply({
        type: "upsert",
        guild: { id, name: "Guild", icon: null, ownerId: guildId, memberCount: 1,
          approximateMemberCount: null, preferredLocale: "en-US", joinedTimestamp: 1_000, isActive: true },
      });
    };
    const original = inventory.snapshot();
    upsert(guildId);
    inventory.apply({ type: "deactivate", guildId: missingGuildId });
    inventory.apply({ type: "unavailable", guildId });
    expect(inventory.snapshot()).toEqual(original);
    original?.guildIds.push(missingGuildId);
    expect(inventory.snapshot()?.guildIds).toEqual([guildId, secondGuildId]);
    inventory.apply({ type: "deactivate", guildId });
    upsert(guildId);
    expect(inventory.snapshot()).toEqual({ ...state, guildIds: [secondGuildId, guildId] });
  });
});

describe("GatewayShardConnection initial guild inventory", () => {
  it("reclassifies pending startup guilds after Resume", async () => {
    const { dataFetch, shard, testable } = connection(true);
    const resumableCheckpoint = {
      ...initialGatewayCheckpoint(identity, 1),
      sessionId: "session-123",
      resumeGatewayUrl: "wss://gateway.discord.gg",
      sequence: 1,
    };
    let machine = createGatewayMachine(resumableCheckpoint);
    machine = transitionGateway(machine, { type: "start" }).machine;
    machine = transitionGateway(machine, { type: "socket-open" }).machine;
    machine = transitionGateway(machine, {
      type: "hello",
      heartbeatIntervalMs: 41_250,
    }).machine;
    testable.machine = machine;
    testable.initialGuilds.replace([guildId], [guildId]);

    await testable.handleGatewayMessage({ type: "resumed", sequence: 2 });

    expect(dataFetch).toHaveBeenCalledOnce();
    expect(shard.status()).toMatchObject({
      state: "ready",
      initialGuildsPending: 1,
      initialGuildsRequiringSync: 0,
    });
  });

  it("suppresses persistence, synchronization, and logging for active startup guilds", async () => {
    const {
      dataFetch,
      logGuildLifecycle,
      shard,
      socketSend,
      storagePut,
      testable,
    } = connection(true);

    await testable.handleGatewayMessage(readyMessage());
    expect(shard.status()).toMatchObject({
      state: "ready",
      initialGuildsPending: 1,
      initialGuildsRequiringSync: 0,
      guildInventoryComplete: true,
      guildInventoryCount: 1,
    });
    expect(storagePut).toHaveBeenCalledOnce();
    expect(socketSend).toHaveBeenCalledWith(
      '{"op":3,"d":{"since":null,"activities":[{"name":"/roll","type":0}],"status":"online","afk":false}}',
    );
    expect(storagePut.mock.calls[0]?.[0]).toMatchObject({
      [gatewayInitialGuildStateKey(checkpointKey)]: {
        version: 1,
        guildIds: [guildId],
        syncGuildIds: [],
      },
      [gatewayGuildInventoryStateKey(checkpointKey)]: {
        version: 1,
        generation: 3,
        shardId: 0,
        shardCount: 23,
        sessionId: "session-123",
        guildIds: [guildId],
      },
    });

    await testable.handleGatewayMessage(guildCreateMessage());

    expect(dataFetch).toHaveBeenCalledOnce();
    expect(logGuildLifecycle).not.toHaveBeenCalled();
    expect(storagePut).toHaveBeenCalledOnce();
    expect(shard.status()).toMatchObject({
      sequence: 2,
      initialGuildsPending: 0,
      initialGuildsRequiringSync: 0,
    });
  });

  it("repairs missing startup guilds without emitting guild-add logs", async () => {
    const { dataFetch, logGuildLifecycle, shard, testable } = connection(false);

    await testable.handleGatewayMessage(readyMessage());
    expect(shard.status()).toMatchObject({
      initialGuildsPending: 1,
      initialGuildsRequiringSync: 1,
    });

    await testable.handleGatewayMessage(guildCreateMessage());

    expect(dataFetch).toHaveBeenCalledTimes(2);
    expect(
      new URL(dataFetch.mock.calls[1]?.[0].url ?? "https://invalid.test").pathname,
    ).toBe("/internal/guilds/lifecycle");
    expect(logGuildLifecycle).not.toHaveBeenCalled();
    expect(shard.status()).toMatchObject({
      sequence: 2,
      initialGuildsPending: 0,
      initialGuildsRequiringSync: 0,
    });
  });

  it("waits for queued lifecycle work before returning an inventory snapshot", async () => {
    const { shard, testable } = connection(true);
    await testable.handleGatewayMessage(readyMessage());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    void testable.socketEventQueue.enqueue(() => gate);
    let resolved = false;
    const snapshot = shard.guildInventorySnapshot().then((value) => {
      resolved = true;
      return value;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    release();
    await expect(snapshot).resolves.toMatchObject({ guildIds: [guildId] });
  });

  it("feeds channel lifecycle context without making Gateway depend on the cache", async () => {
    const { background, channelMutations, dataFetch, testable } = connection(
      true,
      true,
    );
    await testable.handleGatewayMessage(readyMessage());
    const channelId = "100000000000000004";

    await testable.handleGatewayMessage({
      type: "dispatch",
      sequence: 2,
      eventType: "CHANNEL_CREATE",
      data: {
        id: channelId,
        guild_id: guildId,
        name: "dice-rolls",
        type: 0,
      },
    });
    await Promise.all(background);
    expect(channelMutations).toHaveLength(1);
    const created = channelMutations[0];
    expect(created).toMatchObject({
      version: 1,
      operation: "upsert",
      source: "gateway",
      guildId,
      channelId,
      channelName: "dice-rolls",
      channelType: 0,
    });
    expect(created?.observedAt).toBeTypeOf("number");

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(
      () => undefined,
    );
    dataFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    try {
      await expect(testable.handleGatewayMessage({
        type: "dispatch",
        sequence: 3,
        eventType: "CHANNEL_UPDATE",
        data: {
          id: channelId,
          guild_id: guildId,
          name: "renamed-rolls",
          type: 0,
        },
      })).resolves.toBeUndefined();
      await Promise.all(background);
      expect(consoleWarn).toHaveBeenCalledWith(JSON.stringify({
        level: "warn",
        message: "Gateway channel context cache write failed",
        eventType: "CHANNEL_UPDATE",
      }));
    } finally {
      consoleWarn.mockRestore();
    }

    await testable.handleGatewayMessage({
      type: "dispatch",
      sequence: 4,
      eventType: "CHANNEL_DELETE",
      data: { id: channelId, guild_id: guildId },
    });
    await Promise.all(background);
    const deleted = channelMutations[1];
    expect(deleted).toMatchObject({
      version: 1,
      operation: "delete",
      source: "gateway",
      guildId,
      channelId,
    });
    expect(deleted?.observedAt).toBeTypeOf("number");
  });

  it("tracks active guild creates and available deletes after READY", async () => {
    const { shard, storage, storagePut, testable } = connection(true, true);
    await testable.handleGatewayMessage(readyMessage());
    await testable.handleGatewayMessage(guildCreateMessage());
    const joinedGuildId = "100000000000000003";
    storagePut.mockClear();

    await testable.handleGatewayMessage({
      type: "dispatch",
      sequence: 3,
      eventType: "GUILD_CREATE",
      data: {
        ...guildCreateData(),
        id: joinedGuildId,
      },
    });
    expect(shard.currentGuildInventory()?.guildIds).toEqual([
      guildId,
      joinedGuildId,
    ]);
    expect(storagePut).toHaveBeenCalledTimes(2);
    expect(storagePut).toHaveBeenNthCalledWith(1, gatewayGuildInventoryStateKey(checkpointKey), expect.objectContaining({ guildIds: [guildId, joinedGuildId] }));
    expect(storagePut.mock.calls[1]?.[0]).toEqual({
      [checkpointKey]: storage.values.get(checkpointKey),
      [gatewayInitialGuildStateKey(checkpointKey)]: { version: 1, guildIds: [], syncGuildIds: [] },
    });

    await testable.handleGatewayMessage({
      type: "dispatch",
      sequence: 4,
      eventType: "GUILD_DELETE",
      data: { id: joinedGuildId, unavailable: true },
    });
    expect(shard.currentGuildInventory()?.guildIds).toEqual([
      guildId,
      joinedGuildId,
    ]);

    await testable.handleGatewayMessage({
      type: "dispatch",
      sequence: 5,
      eventType: "GUILD_DELETE",
      data: { id: joinedGuildId, unavailable: false },
    });
    expect(shard.currentGuildInventory()?.guildIds).toEqual([guildId]);
    expect(storagePut.mock.calls.at(-1)?.[0]).toEqual({
      [checkpointKey]: storage.values.get(checkpointKey),
    });
  });

  it("persists inventory after D1 commits even when lifecycle logging fails", async () => {
    const {
      logGuildLifecycle,
      shard,
      storagePut,
      testable,
    } = connection(true, true);
    await testable.handleGatewayMessage(readyMessage());
    await testable.handleGatewayMessage(guildCreateMessage());
    const joinedGuildId = "100000000000000003";
    logGuildLifecycle.mockRejectedValueOnce(new Error("fixture log failure"));

    await expect(
      testable.handleGatewayMessage({
        type: "dispatch",
        sequence: 3,
        eventType: "GUILD_CREATE",
        data: {
          ...guildCreateData(),
          id: joinedGuildId,
        },
      }),
    ).rejects.toThrow("fixture log failure");

    expect(shard.currentGuildInventory()?.guildIds).toEqual([
      guildId,
      joinedGuildId,
    ]);
    expect(storagePut).toHaveBeenCalledWith(
      gatewayGuildInventoryStateKey(checkpointKey),
      expect.objectContaining({ guildIds: [guildId, joinedGuildId] }),
    );
  });

  it("retains failed startup repairs for exact retry", async () => {
    const { dataFetch, shard, storagePut, testable } = connection(false);
    await testable.handleGatewayMessage(readyMessage());
    dataFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      testable.handleGatewayMessage(guildCreateMessage()),
    ).rejects.toThrow("Guild lifecycle synchronization failed");
    expect(shard.status()).toMatchObject({
      sequence: 1,
      initialGuildsPending: 1,
      initialGuildsRequiringSync: 1,
    });
    expect(storagePut).toHaveBeenCalledOnce();

    await testable.handleGatewayMessage(guildCreateMessage());
    expect(shard.status()).toMatchObject({
      sequence: 2,
      initialGuildsPending: 0,
      initialGuildsRequiringSync: 0,
    });
  });

  it("orders heartbeat work behind earlier socket events and skips work after failure", async () => {
    const { testable, waitUntil } = connection(true);
    const socket = new WebSocketPair()[0];
    socket.accept();
    const close = vi.spyOn(socket, "close");
    testable.socket = socket;
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    testable.runSocketEvent(socket, "message", async () => {
      order.push("message-start");
      await gate;
      order.push("message-end");
    });
    testable.runSocketEvent(socket, "heartbeat-timer", () => {
      order.push("heartbeat");
      return Promise.resolve();
    });
    await Promise.resolve();
    expect(order).toEqual(["message-start"]);
    release();
    await Promise.all(
      waitUntil.mock.calls.map(([promise]) => promise),
    );
    expect(order).toEqual(["message-start", "message-end", "heartbeat"]);

    testable.runSocketEvent(socket, "message", () =>
      Promise.reject(new Error("failed")),
    );
    testable.runSocketEvent(socket, "message", () => {
      order.push("should-not-run");
      return Promise.resolve();
    });
    await Promise.all(
      waitUntil.mock.calls.slice(2).map(([promise]) => promise),
    );
    expect(close).toHaveBeenCalledWith(4000, "event-failed");
    expect(order).not.toContain("should-not-run");
  });
});

describe("Gateway transfer barriers", () => {
  it("drains accepted events and channel work before exporting a checkpoint", async () => {
    const { shard, testable } = connection(true);
    await testable.handleGatewayMessage(readyMessage());
    // This fixture does not retain the peer socket; closure is covered by the live runner.
    testable.socket = null;
    let releaseEvents!: () => void;
    let releaseChannels!: () => void;
    const events = new Promise<void>((resolve) => { releaseEvents = resolve; });
    const channels = new Promise<void>((resolve) => { releaseChannels = resolve; });
    void testable.socketEventQueue.enqueue(async () => {
      await events;
      await testable.handleGatewayMessage({ type: "dispatch", sequence: 42, eventType: "IGNORED_EVENT", data: {} });
    });
    void shard["channelDirectoryQueue"].enqueue(() => channels);
    let exported = false;
    const pending = shard.parkForTransfer().then((snapshot) => { exported = true; return snapshot; });
    await Promise.resolve();
    expect(exported).toBe(false);
    releaseEvents();
    await Promise.resolve();
    expect(exported).toBe(false);
    releaseChannels();
    expect((await pending).checkpoint.sequence).toBe(42);
    await expect(shard.start()).rejects.toThrow("parked");
  });

  it("retries failed inventory persistence and skips an unchanged successful revision", async () => {
    const { shard, testable, storagePut } = connection(true);
    await testable.handleGatewayMessage(readyMessage());
    shard["guildInventory"].apply({ type: "deactivate", guildId });
    storagePut.mockRejectedValueOnce(new Error("storage failed"));
    await expect(shard["persistGuildInventory"]()).rejects.toThrow("storage failed");
    storagePut.mockClear();
    await shard["persistGuildInventory"]();
    await shard["persistGuildInventory"]();
    expect(storagePut).toHaveBeenCalledTimes(1);
  });
});
