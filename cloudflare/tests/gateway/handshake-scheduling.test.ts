import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayShardConnection,
  initialGatewayCheckpoint,
  type GatewayShardStorageValue,
} from "../../workers/gateway/src/gateway-shard-connection";

class HandshakeSocket extends EventTarget {
  static instances: HandshakeSocket[] = [];
  static deferClose = false;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readyState = HandshakeSocket.CONNECTING;
  completeHeaders: ((kind: "open" | "close") => void) | null = null;

  constructor(readonly url: string) {
    super();
    HandshakeSocket.instances.push(this);
  }

  accept(): void {
    if (this.readyState === HandshakeSocket.CONNECTING) this.readyState = HandshakeSocket.OPEN;
  }

  send(): void {}

  close(code = 1000): void {
    if (this.readyState === HandshakeSocket.CLOSED) return;
    const pending = this.readyState === HandshakeSocket.CONNECTING;
    this.readyState = HandshakeSocket.CLOSED;
    if (pending) this.completeHeaders?.("close");
    const deliver = () => this.dispatchEvent(new CloseEvent("close", { code }));
    if (HandshakeSocket.deferClose) setTimeout(deliver, 10);
    else deliver();
  }

  open(): void { this.completeHeaders?.("open"); }
}

type HandshakeUpgrade = {
  status: number;
  webSocket: HandshakeSocket | null;
  body: { cancel(): Promise<void> } | null;
};

function stubGatewayUpgradeFetch(): void {
  vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: { signal?: AbortSignal }) =>
    new Promise<HandshakeUpgrade>((resolve, reject) => {
      const socket = new HandshakeSocket("https://gateway.discord.gg/?v=10&encoding=json");
      let settled = false;
      const settle = (complete: () => void) => {
        if (settled) return;
        settled = true;
        complete();
      };
      const abort = () => {
        settle(() => { reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })); });
        socket.close(4000);
      };
      if (init?.signal?.aborted) { abort(); return; }
      init?.signal?.addEventListener("abort", abort, { once: true });
      socket.addEventListener("error", () => {
        settle(() => { reject(new Error("websocket-error")); });
        socket.close(4000);
      });
      socket.completeHeaders = () => {
        settle(() => { resolve({ status: 101, webSocket: socket, body: null }); });
      };
    }),
  );
}

class StorageFixture {
  put(key: string, value: GatewayShardStorageValue, options?: DurableObjectPutOptions): Promise<void>;
  put(entries: Record<string, GatewayShardStorageValue>, options?: DurableObjectPutOptions): Promise<void>;
  put(): Promise<void> { return Promise.resolve(); }
}

function connection(
  shardId: number,
  resumable = false,
  gatewayUrl = () => Promise.resolve("wss://gateway.discord.gg"),
) {
  const identity = { generation: 7, shardId, shardCount: 24, ownerId: "gateway-partition-0" };
  const background: Promise<unknown>[] = [];
  const coordinator = {
    acquireOwnership: () => Promise.resolve({ acquired: true as const, alreadyOwned: false }),
    releaseOwnership: () => Promise.resolve(true),
    requestIdentifyPermit: () => Promise.resolve({
      granted: true as const, rateLimitKey: 0, maxConcurrency: 24,
      remainingAfterGrant: 999, resetAt: 1_720_086_400_000, grantedAt: 1_720_000_000_000,
    }),
    gatewayUrl,
  };
  const shard = new GatewayShardConnection({
    ctx: { storage: new StorageFixture(), waitUntil: (promise) => { background.push(promise); } },
    env: {
      DISCORD_BOT_TOKEN: "development-token-first-part.second.development-token-third-part",
      GATEWAY_ALLOWED_HOSTNAME: "gateway.discord.gg",
      DATA_SERVICE: { fetch: () => Promise.resolve(Response.json({})) },
      DISCORD_REST: { logGuildLifecycle: () => Promise.resolve({ status: "delivered" as const }) },
      GATEWAY_COORDINATOR: { getByName: () => coordinator },
    },
    identity,
    checkpoint: resumable ? {
      ...initialGatewayCheckpoint(identity, 1), sessionId: `session-${shardId}`,
      sequence: 1, resumeGatewayUrl: "wss://gateway.discord.gg",
    } : initialGatewayCheckpoint(identity, 1),
    checkpointKey: `gateway-checkpoint-v1:7:${shardId}:24`,
    scheduleAlarm: () => Promise.resolve(), onReady: () => Promise.resolve(),
    onFatal: () => Promise.resolve(), isDispatchActive: () => false,
  });
  return { shard, background };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  HandshakeSocket.instances = [];
  HandshakeSocket.deferClose = false;
  vi.useFakeTimers();
  stubGatewayUpgradeFetch();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Gateway handshake scheduling", () => {
  it("rejects non-upgrade responses and cancels their bodies", async () => {
    const cancel = vi.fn(() => Promise.resolve());
    const fetchUpgrade = vi.fn(() => Promise.resolve({ status: 403, webSocket: null, body: { cancel } }));
    vi.stubGlobal("fetch", fetchUpgrade);
    const current = connection(0);
    await current.shard.start();
    await flush();
    expect(cancel).toHaveBeenCalledOnce();
    expect(current.shard.status().state).toBe("backing-off");
    expect(current.shard.status().lastError).toBe("handshake-failed");
    expect(fetchUpgrade).toHaveBeenCalledWith("https://gateway.discord.gg/?v=10&encoding=json", expect.objectContaining({ headers: { Upgrade: "websocket" }, redirect: "manual" }));
    await current.shard.stop();
    await Promise.all(current.background);
  });

  it("closes an upgrade delivered after stop even when fetch ignores cancellation", async () => {
    const socket = new HandshakeSocket("https://gateway.discord.gg");
    let complete: () => void = () => { throw new Error("Fetch did not begin"); };
    vi.stubGlobal("fetch", () => new Promise<HandshakeUpgrade>((resolve) => {
      complete = () => { resolve({ status: 101, webSocket: socket, body: null }); };
    }));
    const current = connection(0);
    await current.shard.start();
    await flush();
    await current.shard.stop();
    complete();
    await Promise.all(current.background);
    expect(socket.readyState).toBe(HandshakeSocket.CLOSED);
    expect(current.shard.status().state).toBe("stopped");
  });

  it("accepts a successful handshake after twenty seconds", async () => {
    const current = connection(0);
    await current.shard.start();
    await flush();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(current.shard.status().state).toBe("connecting");
    expect(HandshakeSocket.instances[0]?.readyState).toBe(HandshakeSocket.CONNECTING);
    HandshakeSocket.instances[0]?.open();
    await flush();
    expect(current.shard.status().state).toBe("awaiting-hello");
    expect(current.shard.status().lastError).toBe(null);
    await current.shard.stop();
    await Promise.all(current.background);
  });

  it("does not let a cancelled URL lookup block peer handshakes", async () => {
    let resolveUrl: (url: string) => void = () => { throw new Error("URL lookup did not start"); };
    const url = new Promise<string>((resolve) => { resolveUrl = resolve; });
    const first = connection(0, false, () => url);
    const second = connection(1);
    const firstStart = first.shard.start();
    await flush();
    await first.shard.stop();
    await second.shard.start();
    await flush();
    expect(HandshakeSocket.instances).toHaveLength(1);
    HandshakeSocket.instances[0]?.open();
    resolveUrl("wss://gateway.discord.gg");
    await firstStart;
    await flush();
    expect(HandshakeSocket.instances).toHaveLength(1);
    await second.shard.stop();
    await Promise.all([...first.background, ...second.background]);
  });

  it.each([false, true])("recovers concurrent Resume requests with deferred close=%s", async (deferClose) => {
    HandshakeSocket.deferClose = deferClose;
    const connections = Array.from({ length: 24 }, (_, index) => connection(index, true));
    await Promise.all(connections.map(({ shard }) => shard.start()));
    await flush();
    expect(HandshakeSocket.instances).toHaveLength(24);
    for (const socket of HandshakeSocket.instances) {
      socket.open();
      await flush();
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }) }));
      await flush();
      socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ op: 0, t: "RESUMED", s: 2, d: {} }) }));
      await flush();
    }
    expect(connections.every(({ shard }) => shard.status().state === "ready")).toBe(true);
    const reconnects = await Promise.all(connections.map(({ shard }) => shard.forceReconnect()));
    expect(reconnects.every((result) => result.accepted)).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(HandshakeSocket.instances).toHaveLength(48);
    expect(connections.every(({ shard }) => shard.status().state === "connecting" && shard.status().lastError === null)).toBe(true);
    for (let index = 0; index < 24; index++) {
      HandshakeSocket.instances[24 + index]?.open();
      await flush();
      expect(connections[index]?.shard.status().state).toBe("awaiting-hello");
    }
    await Promise.all(connections.map(({ shard }) => shard.stop()));
    await Promise.all(connections.flatMap(({ background }) => background));
  });

  it("starts peer handshakes without awaiting earlier upgrades", async () => {
    const connections = Array.from({ length: 24 }, (_, index) => connection(index));
    await Promise.all(connections.map(({ shard }) => shard.start()));
    await flush();
    expect(HandshakeSocket.instances).toHaveLength(24);
    HandshakeSocket.instances[23]?.open();
    await flush();
    expect(connections[23]?.shard.status().state).toBe("awaiting-hello");
    expect(connections[0]?.shard.status().state).toBe("connecting");
    await Promise.all(connections.map(({ shard }) => shard.stop()));
    await Promise.all(connections.flatMap(({ background }) => background));
  });

  it("recovers a handshake that closes before transport open", async () => {
    const current = connection(0);
    await current.shard.start();
    await flush();
    HandshakeSocket.instances[0]?.close();
    await flush();
    expect(current.shard.status().state).toBe("backing-off");
    await current.shard.stop();
    await Promise.all(current.background);
  });

  it("does not let failed or stalled handshakes block another shard", async () => {
    const connections = [0, 1, 2].map((index) => connection(index));
    await Promise.all(connections.map(({ shard }) => shard.start()));
    await flush();
    HandshakeSocket.instances[0]?.dispatchEvent(new Event("error"));
    HandshakeSocket.instances[2]?.open();
    await flush();
    expect(HandshakeSocket.instances).toHaveLength(3);
    expect(HandshakeSocket.instances[0]?.readyState).toBe(HandshakeSocket.CLOSED);
    expect(connections[0]?.shard.status().state).toBe("backing-off");
    expect(connections[1]?.shard.status().state).toBe("connecting");
    expect(connections[2]?.shard.status().state).toBe("awaiting-hello");
    await Promise.all(connections.map(({ shard }) => shard.stop()));
    await Promise.all(connections.flatMap(({ background }) => background));
  });

  it("cancels active openings on stop without blocking peers", async () => {
    const connections = [0, 1, 2].map((index) => connection(index));
    await Promise.all(connections.map(({ shard }) => shard.start()));
    await flush();
    await connections[1]?.shard.stop();
    await connections[0]?.shard.stop();
    await flush();
    expect(HandshakeSocket.instances).toHaveLength(3);
    expect(HandshakeSocket.instances[0]?.readyState).toBe(HandshakeSocket.CLOSED);
    expect(HandshakeSocket.instances[1]?.readyState).toBe(HandshakeSocket.CLOSED);
    HandshakeSocket.instances[2]?.open();
    await flush();
    expect(connections[1]?.shard.status().state).toBe("stopped");
    expect(connections[2]?.shard.status().state).toBe("awaiting-hello");
    await connections[2]?.shard.stop();
    await Promise.all(connections.flatMap(({ background }) => background));
  });
});
