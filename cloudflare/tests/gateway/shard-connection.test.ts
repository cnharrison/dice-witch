import { describe, expect, it, vi } from "vitest";
import {
  createGatewayMachine,
  transitionGateway,
  validateGatewaySessionCheckpoint,
  type GatewayMachine,
} from "../../packages/gateway-protocol/src";
import {
  parseDiscordChannelDirectoryMutationV1,
  type DiscordChannelDirectoryMutationV1,
} from "../../packages/discord-contracts/src";
import type { ParsedGatewayMessage } from "../../workers/gateway/src/discord-gateway";
import {
  GatewayEventQueue,
  GatewayShardConnection,
  gatewayGuildInventoryStateKey,
  gatewayInitialGuildStateKey,
  initialGatewayCheckpoint,
  parseGatewayGuildInventoryState,
  parseGatewayInitialGuildState,
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
  let machine = createGatewayMachine(initialGatewayCheckpoint(identity, 1));
  machine = transitionGateway(machine, { type: "start" }).machine;
  machine = transitionGateway(machine, { type: "socket-open" }).machine;
  machine = transitionGateway(machine, {
    type: "hello",
    heartbeatIntervalMs: 41_250,
  }).machine;
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

function resumingMachine(checkpoint: GatewayMachine["checkpoint"]): GatewayMachine {
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
  apply(event: { type: "start" }): Promise<void>;
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
      return (event: { type: "start" }) => shard["apply"](event);
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
    openingQueue: new GatewayEventQueue(),
    scheduleAlarm,
    onReady: () => Promise.resolve(),
    onFatal: () => Promise.resolve(),
    isDispatchActive: () => dispatchActive,
  });
  const testable = testableConnection(shard);
  const socket = new WebSocketPair()[0];
  socket.accept();
  const socketSend = vi.spyOn(socket, "send");
  testable.machine = restored.checkpoint === undefined ? identifyMachine() : resumingMachine(restored.checkpoint);
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
    waitUntil,
  };
}

describe("GatewayShardConnection recovery", () => {
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
      [gatewayGuildInventoryStateKey(checkpointKey)]: storedSnapshots(storage).guildInventoryState,
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
      [gatewayGuildInventoryStateKey(checkpointKey)]: storedSnapshots(storage).guildInventoryState,
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
