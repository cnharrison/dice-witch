import { describe, expect, it } from "vitest";
import {
  buildGatewayHeartbeat,
  buildGatewayIdentify,
  buildGatewayPresenceUpdate,
  buildGatewayResume,
  normalizeDiscordGatewayUrl,
  parseGatewayBotResponse,
  parseGatewayMessage,
  serializeGatewayPayload,
} from "../../workers/gateway/src/discord-gateway";

const token = "test-token-never-used-outside-workerd";

describe("Discord Gateway outbound payloads", () => {
  it("identifies an assigned shard with only the GUILDS intent and online presence", () => {
    expect(
      buildGatewayIdentify(token, { shardId: 1, shardCount: 3 }),
    ).toEqual({
      op: 2,
      d: {
        token,
        properties: {
          os: "linux",
          browser: "dice-witch-cloudflare",
          device: "dice-witch-cloudflare",
        },
        shard: [1, 3],
        presence: {
          since: null,
          activities: [{ name: "/roll", type: 0 }],
          status: "online",
          afk: false,
        },
        intents: 1,
      },
    });
  });

  it("builds the production activity update", () => {
    expect(buildGatewayPresenceUpdate()).toEqual({
      op: 3,
      d: {
        since: null,
        activities: [{ name: "/roll", type: 0 }],
        status: "online",
        afk: false,
      },
    });
  });

  it("rejects invalid Identify shard coordinates", () => {
    expect(() =>
      buildGatewayIdentify(token, { shardId: 2, shardCount: 2 }),
    ).toThrow("Discord Identify shard coordinates are invalid");
  });

  it("builds Resume and Heartbeat without mutating their inputs", () => {
    expect(buildGatewayResume(token, "session-123", 42)).toEqual({
      op: 6,
      d: { token, session_id: "session-123", seq: 42 },
    });
    expect(buildGatewayHeartbeat(null)).toEqual({ op: 1, d: null });
    expect(buildGatewayHeartbeat(0)).toEqual({ op: 1, d: 0 });
  });

  it("enforces Discord's 4096-byte outbound payload limit", () => {
    expect(serializeGatewayPayload(buildGatewayHeartbeat(7))).toBe(
      '{"op":1,"d":7}',
    );
    expect(() =>
      serializeGatewayPayload({ op: 3, d: { value: "x".repeat(4096) } }),
    ).toThrow("4096-byte limit");
    expect(() => serializeGatewayPayload(undefined)).toThrow(
      "must serialize to JSON",
    );
  });
});

describe("normalizeDiscordGatewayUrl", () => {
  it("accepts initial and regional Resume hosts with fixed v10 JSON encoding", () => {
    expect(normalizeDiscordGatewayUrl("wss://gateway.discord.gg")).toBe(
      "wss://gateway.discord.gg/?v=10&encoding=json",
    );
    expect(
      normalizeDiscordGatewayUrl(
        "wss://gateway-us-east1-b.discord.gg?encoding=etf&v=9",
      ),
    ).toBe(
      "wss://gateway-us-east1-b.discord.gg/?encoding=json&v=10",
    );
  });

  it("accepts only the explicitly configured non-Discord hostname", () => {
    expect(
      normalizeDiscordGatewayUrl(
        "wss://gateway-simulator.example.com/gateway",
        "gateway-simulator.example.com",
      ),
    ).toBe(
      "wss://gateway-simulator.example.com/gateway?v=10&encoding=json",
    );
    expect(() =>
      normalizeDiscordGatewayUrl(
        "wss://attacker.example/gateway",
        "gateway-simulator.example.com",
      ),
    ).toThrow("Discord Gateway URL is invalid");
  });

  it.each([
    "not a url",
    "https://gateway.discord.gg",
    "wss://attacker.example",
    "wss://gateway.discord.gg:8443",
    "wss://user@gateway.discord.gg",
  ])("rejects an unsafe Gateway URL", (url) => {
    expect(() => normalizeDiscordGatewayUrl(url)).toThrow(
      "Discord Gateway URL is invalid",
    );
  });
});

describe("parseGatewayBotResponse", () => {
  it("validates live shard and session-start limits", () => {
    expect(
      parseGatewayBotResponse(
        {
          url: "wss://gateway.discord.gg",
          shards: 23,
          session_start_limit: {
            total: 1_000,
            remaining: 997,
            reset_after: 60_000,
            max_concurrency: 1,
          },
        },
        1_720_000_000_000,
      ),
    ).toEqual({
      url: "wss://gateway.discord.gg",
      shards: 23,
      sessionStartLimit: {
        total: 1_000,
        remaining: 997,
        resetAt: 1_720_000_060_000,
        maxConcurrency: 1,
        observedAt: 1_720_000_000_000,
      },
    });
  });

  it.each([
    { shards: 0 },
    { session_start_limit: { remaining: 1_001 } },
    { session_start_limit: { reset_after: -1 } },
    { session_start_limit: { max_concurrency: 0 } },
  ])("rejects invalid Gateway Bot fields: $0", (override) => {
    const response = {
      url: "wss://gateway.discord.gg",
      shards: 1,
      session_start_limit: {
        total: 1_000,
        remaining: 997,
        reset_after: 60_000,
        max_concurrency: 1,
      },
      ...override,
    };
    if ("session_start_limit" in override) {
      response.session_start_limit = {
        total: 1_000,
        remaining: 997,
        reset_after: 60_000,
        max_concurrency: 1,
        ...override.session_start_limit,
      };
    }

    expect(() =>
      parseGatewayBotResponse(response, 1_720_000_000_000),
    ).toThrow("Get Gateway Bot response is invalid");
  });
});

describe("parseGatewayMessage", () => {
  it.each([
    [{ op: 10, d: { heartbeat_interval: 41_250 } }, { type: "hello", heartbeatIntervalMs: 41_250 }],
    [{ op: 1, d: null }, { type: "heartbeat-requested" }],
    [{ op: 7, d: null }, { type: "reconnect-requested" }],
    [{ op: 9, d: true }, { type: "invalid-session", resumable: true }],
    [{ op: 11, d: null }, { type: "heartbeat-ack" }],
  ] as const)("parses receive opcode $0.op", (payload, expected) => {
    expect(parseGatewayMessage(JSON.stringify(payload))).toEqual(expected);
  });

  it("parses Ready session fields from a Dispatch", () => {
    expect(
      parseGatewayMessage(
        JSON.stringify({
          op: 0,
          s: 1,
          t: "READY",
          d: {
            session_id: "session-123",
            resume_gateway_url: "wss://gateway-us-east1-b.discord.gg",
            guilds: [
              { id: "100000000000000001", unavailable: true },
              { id: "100000000000000002", unavailable: false },
            ],
          },
        }),
      ),
    ).toEqual({
      type: "ready",
      sequence: 1,
      sessionId: "session-123",
      resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
      initialGuildIds: ["100000000000000001", "100000000000000002"],
    });
  });

  it("parses Resumed and ordinary Dispatch events", () => {
    expect(
      parseGatewayMessage(
        JSON.stringify({ op: 0, s: 4, t: "RESUMED", d: null }),
      ),
    ).toEqual({ type: "resumed", sequence: 4 });

    const interaction = { id: "interaction-1", data: { name: "status" } };
    expect(
      parseGatewayMessage(
        JSON.stringify({
          op: 0,
          s: 5,
          t: "INTERACTION_CREATE",
          d: interaction,
        }),
      ),
    ).toEqual({
      type: "dispatch",
      sequence: 5,
      eventType: "INTERACTION_CREATE",
      data: interaction,
    });
  });

  it.each([
    "not json",
    JSON.stringify(null),
    JSON.stringify({ op: 10, d: { heartbeat_interval: 0 } }),
    JSON.stringify({ op: 9, d: "true" }),
    JSON.stringify({ op: 0, s: -1, t: "READY", d: {} }),
    JSON.stringify({
      op: 0,
      s: 1,
      t: "READY",
      d: {
        session_id: "session-123",
        resume_gateway_url: "wss://gateway.discord.gg",
        guilds: [{ id: "invalid" }],
      },
    }),
    JSON.stringify({ op: 99, d: null }),
  ])("rejects malformed or unsupported payloads", (payload) => {
    expect(() => parseGatewayMessage(payload)).toThrow();
  });
});
