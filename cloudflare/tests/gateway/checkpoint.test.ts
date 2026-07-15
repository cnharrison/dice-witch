import { describe, expect, it } from "vitest";
import {
  clearGatewaySession,
  hasResumableGatewaySession,
  validateGatewaySessionCheckpoint,
  type GatewaySessionCheckpoint,
} from "../../packages/gateway-protocol/src";

function checkpoint(
  overrides: Partial<GatewaySessionCheckpoint> = {},
): GatewaySessionCheckpoint {
  return {
    version: 1,
    generation: 3,
    shardId: 4,
    shardCount: 23,
    sessionId: "session-123",
    resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
    sequence: 0,
    lastDispatchAt: 1_720_000_000_000,
    lastHeartbeatSentAt: 1_720_000_001_000,
    lastHeartbeatAckAt: 1_720_000_001_100,
    updatedAt: 1_720_000_001_100,
    ...overrides,
  };
}

describe("GatewaySessionCheckpoint", () => {
  it("is resumable only when every Discord resume field is present", () => {
    expect(hasResumableGatewaySession(checkpoint())).toBe(true);
    expect(hasResumableGatewaySession(checkpoint({ sessionId: null }))).toBe(false);
    expect(
      hasResumableGatewaySession(checkpoint({ resumeGatewayUrl: null })),
    ).toBe(false);
    expect(hasResumableGatewaySession(checkpoint({ sequence: null }))).toBe(false);
  });

  it("accepts sequence zero as a valid resume checkpoint", () => {
    expect(hasResumableGatewaySession(checkpoint({ sequence: 0 }))).toBe(true);
  });

  it("accepts only an explicitly persisted non-Discord Gateway hostname", () => {
    const customGateway = checkpoint({
      allowedGatewayHostname: "gateway-simulator.example.com",
      resumeGatewayUrl: "wss://gateway-simulator.example.com/gateway",
    });
    expect(hasResumableGatewaySession(customGateway)).toBe(true);
    expect(validateGatewaySessionCheckpoint(customGateway)).toEqual(
      customGateway,
    );
    expect(
      hasResumableGatewaySession({
        ...customGateway,
        resumeGatewayUrl: "wss://attacker.example/gateway",
      }),
    ).toBe(false);
  });

  it("rejects resume URLs outside Discord's secure Gateway hosts", () => {
    expect(
      hasResumableGatewaySession(
        checkpoint({ resumeGatewayUrl: "wss://attacker.example" }),
      ),
    ).toBe(false);
    expect(
      hasResumableGatewaySession(
        checkpoint({ resumeGatewayUrl: "https://gateway.discord.gg" }),
      ),
    ).toBe(false);
  });

  it.each([
    [{ generation: -1 }, "generation"],
    [{ shardId: 23 }, "shardId"],
    [{ shardCount: 0 }, "shardCount"],
    [{ sessionId: null }, "all present or all null"],
    [{ sequence: -1 }, "sequence"],
    [{ updatedAt: -1 }, "updatedAt"],
  ] as const)("rejects an invalid persisted %s field", (overrides, message) => {
    expect(() =>
      validateGatewaySessionCheckpoint(checkpoint(overrides)),
    ).toThrow(message);
  });

  it("rejects unexpected persisted fields, including credentials", () => {
    expect(() =>
      validateGatewaySessionCheckpoint({
        ...checkpoint(),
        token: "must-not-be-persisted",
      }),
    ).toThrow("unexpected field");
  });

  it("returns a validated checkpoint without changing it", () => {
    const value = checkpoint();

    expect(validateGatewaySessionCheckpoint(value)).toBe(value);
  });

  it("clears only session-specific state before a new Identify", () => {
    expect(clearGatewaySession(checkpoint(), 1_720_000_002_000)).toEqual({
      ...checkpoint(),
      sessionId: null,
      resumeGatewayUrl: null,
      sequence: null,
      lastDispatchAt: null,
      lastHeartbeatSentAt: null,
      lastHeartbeatAckAt: null,
      updatedAt: 1_720_000_002_000,
    });
  });
});
