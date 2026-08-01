import { describe, expect, it, vi } from "vitest";
import {
  createGatewayMachine,
  transitionGateway,
  type GatewayMachine,
} from "../../packages/gateway-protocol/src";
import type { ParsedGatewayMessage } from "../../workers/gateway/src/discord-gateway";
import type { GatewayEnv } from "../../workers/gateway/src/environment";
import {
  GatewayEventQueue,
  GatewayShardConnection,
  gatewayGuildInventoryStateKey,
  gatewayInitialGuildStateKey,
  initialGatewayCheckpoint,
  type GatewayShardIdentity,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function readyMessage(): ParsedGatewayMessage {
  return {
    type: "ready",
    sequence: 1,
    sessionId: "session-123",
    resumeGatewayUrl: "wss://gateway.discord.gg",
    initialGuildIds: [guildId],
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
    data: {
      id: guildId,
      name: "Test Guild",
      icon: null,
      owner_id: "100000000000000002",
      member_count: 42,
      approximate_member_count: 42,
      preferred_locale: "en-US",
      joined_at: "2026-07-14T09:00:00.000Z",
      unavailable: false,
    },
  };
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

function connection(activeGuild: boolean, dispatchActive = false) {
  const background: Promise<unknown>[] = [];
  const channelMutations: unknown[] = [];
  const storagePut = vi.fn((entries: Record<string, unknown>) => {
    void entries;
    return Promise.resolve();
  });
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
      return request.json().then((mutation) => {
        channelMutations.push(mutation);
        return Response.json({ status: "applied" });
      });
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  const logGuildLifecycle = vi.fn(() =>
    Promise.resolve({ status: "delivered" }),
  );
  const shard = new GatewayShardConnection({
    ctx: {
      storage: { put: storagePut },
      waitUntil,
    } as unknown as DurableObjectState,
    env: {
      DATA_SERVICE: { fetch: dataFetch },
      DISCORD_REST: { logGuildLifecycle },
    } as unknown as GatewayEnv,
    identity,
    checkpoint: initialGatewayCheckpoint(identity, 1),
    checkpointKey,
    scheduleAlarm: () => Promise.resolve(),
    onReady: () => Promise.resolve(),
    onFatal: () => Promise.resolve(),
    isDispatchActive: () => dispatchActive,
  });
  const testable = shard as unknown as TestableConnection;
  const socketSend = vi.fn();
  testable.machine = identifyMachine();
  testable.socket = {
    readyState: WebSocket.OPEN,
    send: socketSend,
  } as unknown as WebSocket;
  return {
    background,
    channelMutations,
    dataFetch,
    logGuildLifecycle,
    shard,
    storagePut,
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
    if (!isRecord(created)) throw new Error("Channel mutation is invalid");
    expect(created).toMatchObject({
      version: 1,
      operation: "upsert",
      source: "gateway",
      guildId,
      channelId,
      channelName: "dice-rolls",
      channelType: 0,
    });
    expect(typeof created.observedAt).toBe("number");

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
    if (!isRecord(deleted)) throw new Error("Channel deletion is invalid");
    expect(deleted).toMatchObject({
      version: 1,
      operation: "delete",
      source: "gateway",
      guildId,
      channelId,
    });
    expect(typeof deleted.observedAt).toBe("number");
  });

  it("tracks active guild creates and available deletes after READY", async () => {
    const { shard, testable } = connection(true, true);
    await testable.handleGatewayMessage(readyMessage());
    await testable.handleGatewayMessage(guildCreateMessage());
    const joinedGuildId = "100000000000000003";

    await testable.handleGatewayMessage({
      type: "dispatch",
      sequence: 3,
      eventType: "GUILD_CREATE",
      data: {
        ...(guildCreateMessage().data as Record<string, unknown>),
        id: joinedGuildId,
      },
    });
    expect(shard.currentGuildInventory()?.guildIds).toEqual([
      guildId,
      joinedGuildId,
    ]);

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
          ...(guildCreateMessage().data as Record<string, unknown>),
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
    const close = vi.fn();
    const socket = {
      close,
      readyState: WebSocket.OPEN,
    } as unknown as WebSocket;
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
      waitUntil.mock.calls.map(([promise]) => promise as Promise<void>),
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
      waitUntil.mock.calls.slice(2).map(([promise]) => promise as Promise<void>),
    );
    expect(close).toHaveBeenCalledWith(4000, "event-failed");
    expect(order).not.toContain("should-not-run");
  });
});
