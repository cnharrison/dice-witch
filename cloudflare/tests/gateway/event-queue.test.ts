import { describe, expect, it } from "vitest";
import {
  findGuildsNeedingInitialSync,
  GatewayEventQueue,
  guildLifecycleMode,
  InitialGuildTracker,
  parseGatewayInitialGuildState,
  gatewaySessionMutationScope,
} from "../../workers/gateway/src/gateway-shard-connection";

describe("Gateway socket event queue", () => {
  it("processes burst events in arrival order", async () => {
    const queue = new GatewayEventQueue();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue(async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
    });
    const second = queue.enqueue(() => {
      order.push("second");
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("keeps production-like bursts strictly single-file", async () => {
    const queue = new GatewayEventQueue();
    let concurrent = 0;
    let maximumConcurrent = 0;
    const completed: number[] = [];

    await Promise.all(
      Array.from({ length: 1_500 }, (_, index) =>
        queue.enqueue(async () => {
          concurrent += 1;
          maximumConcurrent = Math.max(maximumConcurrent, concurrent);
          await Promise.resolve();
          completed.push(index);
          concurrent -= 1;
        }),
      ),
    );

    expect(maximumConcurrent).toBe(1);
    expect(completed).toEqual(Array.from({ length: 1_500 }, (_, index) => index));
  });

  it("continues after a failed event", async () => {
    const queue = new GatewayEventQueue();
    const failed = queue.enqueue(() => Promise.reject(new Error("failed")));
    const recovered = queue.enqueue(() => Promise.resolve("recovered"));

    await expect(failed).rejects.toThrow("failed");
    await expect(recovered).resolves.toBe("recovered");
  });
});

describe("Gateway lifecycle mutation scope", () => {
  it("is stable within one Discord session and distinct across sessions", async () => {
    const first = await gatewaySessionMutationScope("session-one");

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    await expect(gatewaySessionMutationScope("session-one")).resolves.toBe(
      first,
    );
    await expect(gatewaySessionMutationScope("session-two")).resolves.not.toBe(
      first,
    );
  });
});

describe("initial guild synchronization", () => {
  it("keeps startup inventory pending until processing succeeds", () => {
    const tracker = new InitialGuildTracker({
      version: 1,
      guildIds: ["100000000000000001"],
      syncGuildIds: ["100000000000000001"],
    });

    expect(
      tracker.match("GUILD_CREATE", { id: "100000000000000001" }),
    ).toBe("100000000000000001");
    expect(tracker.needsSync("100000000000000001")).toBe(true);
    expect(tracker.snapshot()).toEqual({
      version: 1,
      guildIds: ["100000000000000001"],
      syncGuildIds: ["100000000000000001"],
    });

    tracker.complete("100000000000000001");
    expect(tracker.snapshot()).toEqual({
      version: 1,
      guildIds: [],
      syncGuildIds: [],
    });
  });

  it("restores durable inventory while preserving real joins", () => {
    const restored = new InitialGuildTracker(
      parseGatewayInitialGuildState({
        version: 1,
        guildIds: ["100000000000000001"],
        syncGuildIds: [],
      }),
    );

    expect(
      restored.match("GUILD_CREATE", { id: "100000000000000001" }),
    ).toBe("100000000000000001");
    expect(
      restored.match("GUILD_CREATE", { id: "100000000000000002" }),
    ).toBeNull();
    expect(
      restored.match("MESSAGE_CREATE", { id: "100000000000000001" }),
    ).toBeNull();
  });

  it("rejects invalid durable inventory", () => {
    expect(() =>
      parseGatewayInitialGuildState({
        version: 1,
        guildIds: ["100000000000000001"],
        syncGuildIds: ["100000000000000002"],
      }),
    ).toThrow("Gateway initial guild state is invalid");
  });

  it("synchronizes startup repairs without logging them as joins", () => {
    expect(guildLifecycleMode(false, "100000000000000001", true)).toBe(
      "synchronize",
    );
    expect(guildLifecycleMode(false, "100000000000000001", false)).toBe(
      "none",
    );
    expect(guildLifecycleMode(true, null, false)).toBe(
      "synchronize-and-log",
    );
  });

  it("classifies inactive or missing startup guilds in bounded batches", async () => {
    const guildIds = Array.from(
      { length: 450 },
      (_, index) => String(100000000000000001n + BigInt(index)),
    );
    const missing = new Set([guildIds[0], guildIds[225], guildIds[449]]);
    const batchSizes: number[] = [];
    const dataService = {
      fetch: async (request: Request) => {
        expect(new URL(request.url).pathname).toBe("/internal/guilds/filter");
        const body = await request.json<{ guildIds: string[] }>();
        batchSizes.push(body.guildIds.length);
        return Response.json({
          guildIds: body.guildIds.filter((id) => !missing.has(id)),
        });
      },
    };

    await expect(
      findGuildsNeedingInitialSync(dataService, guildIds),
    ).resolves.toEqual([...missing]);
    expect(batchSizes).toEqual([100, 100, 100, 100, 50]);
  });
});
