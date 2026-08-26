import { describe, expect, it } from "vitest";
import {
  GatewayTransitionError,
  createGatewayMachine,
  transitionGateway,
  type GatewayEvent,
  type GatewayMachine,
  type GatewaySessionCheckpoint,
} from "../../packages/gateway-protocol/src";

function checkpoint(
  overrides: Partial<GatewaySessionCheckpoint> = {},
): GatewaySessionCheckpoint {
  return {
    version: 1,
    generation: 1,
    shardId: 0,
    shardCount: 1,
    sessionId: null,
    resumeGatewayUrl: null,
    sequence: null,
    lastDispatchAt: null,
    lastHeartbeatSentAt: null,
    lastHeartbeatAckAt: null,
    updatedAt: 1_720_000_000_000,
    ...overrides,
  };
}

function apply(machine: GatewayMachine, event: GatewayEvent): GatewayMachine {
  return transitionGateway(machine, event).machine;
}

function identifyHandshake(): GatewayMachine {
  let machine = createGatewayMachine(checkpoint());
  machine = apply(machine, { type: "start" });
  machine = apply(machine, { type: "socket-open" });
  machine = apply(machine, { type: "hello", heartbeatIntervalMs: 41_250 });
  machine = apply(machine, { type: "identify-permit-granted" });
  return machine;
}

function readyMachine(): GatewayMachine {
  return apply(identifyHandshake(), {
    type: "ready",
    sequence: 1,
    sessionId: "session-123",
    resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
    receivedAt: 1_720_000_001_000,
  });
}

describe("Gateway identify handshake", () => {
  it("waits for Hello and an Identify permit before identifying", () => {
    let machine = createGatewayMachine(checkpoint());

    let result = transitionGateway(machine, { type: "start" });
    expect(result.machine.status).toBe("connecting");
    expect(result.actions).toEqual([{ type: "open-socket", mode: "identify" }]);

    machine = result.machine;
    result = transitionGateway(machine, { type: "socket-open" });
    expect(result.machine.status).toBe("awaiting-hello");
    expect(result.actions).toEqual([]);

    machine = result.machine;
    result = transitionGateway(machine, {
      type: "hello",
      heartbeatIntervalMs: 41_250,
    });
    expect(result.machine.status).toBe("awaiting-identify-permit");
    expect(result.actions).toEqual([
      {
        type: "schedule-heartbeat",
        intervalMs: 41_250,
        initialJitterRequired: true,
      },
      { type: "request-identify-permit" },
    ]);

    result = transitionGateway(result.machine, {
      type: "identify-permit-granted",
    });
    expect(result.machine.status).toBe("identifying");
    expect(result.actions).toEqual([{ type: "send-identify" }]);
  });

  it("persists Ready session fields before reporting readiness", () => {
    const result = transitionGateway(identifyHandshake(), {
      type: "ready",
      sequence: 12,
      sessionId: "session-123",
      resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
      receivedAt: 1_720_000_001_000,
    });

    expect(result.machine.status).toBe("ready");
    expect(result.machine.checkpoint).toMatchObject({
      sessionId: "session-123",
      resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
      sequence: 12,
      lastDispatchAt: 1_720_000_001_000,
      updatedAt: 1_720_000_001_000,
    });
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      { type: "report-ready", resumed: false },
    ]);
  });
});

describe("Gateway resume handshake", () => {
  it("resumes directly after Hello without consuming an Identify permit", () => {
    let machine = createGatewayMachine(
      checkpoint({
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
        sequence: 41,
      }),
    );

    let result = transitionGateway(machine, { type: "start" });
    expect(result.actions).toEqual([{ type: "open-socket", mode: "resume" }]);
    machine = apply(result.machine, { type: "socket-open" });
    result = transitionGateway(machine, {
      type: "hello",
      heartbeatIntervalMs: 41_250,
    });

    expect(result.machine.status).toBe("resuming");
    expect(result.actions).toEqual([
      {
        type: "schedule-heartbeat",
        intervalMs: 41_250,
        initialJitterRequired: true,
      },
      { type: "send-resume", sessionId: "session-123", sequence: 41 },
    ]);
  });

  it("persists replayed Dispatch events while waiting for Resumed", () => {
    let machine = createGatewayMachine(
      checkpoint({
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
        sequence: 41,
      }),
    );
    machine = apply(machine, { type: "start" });
    machine = apply(machine, { type: "socket-open" });
    machine = apply(machine, { type: "hello", heartbeatIntervalMs: 41_250 });

    const result = transitionGateway(machine, {
      type: "dispatch",
      eventType: "GUILD_CREATE",
      sequence: 42,
      receivedAt: 1_720_000_001_500,
    });

    expect(result.machine.status).toBe("resuming");
    expect(result.machine.checkpoint.sequence).toBe(42);
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      { type: "emit-dispatch", eventType: "GUILD_CREATE", sequence: 42 },
    ]);
  });

  it("reports readiness only after the Resumed dispatch", () => {
    let machine = createGatewayMachine(
      checkpoint({
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
        sequence: 41,
      }),
    );
    machine = apply(machine, { type: "start" });
    machine = apply(machine, { type: "socket-open" });
    machine = apply(machine, { type: "hello", heartbeatIntervalMs: 41_250 });

    const result = transitionGateway(machine, {
      type: "resumed",
      sequence: 44,
      receivedAt: 1_720_000_002_000,
    });

    expect(result.machine.status).toBe("ready");
    expect(result.machine.checkpoint.sequence).toBe(44);
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      { type: "report-ready", resumed: true },
    ]);
  });
});

describe("Gateway dispatch and heartbeat state", () => {
  it("persists the newest Dispatch sequence before emitting the event", () => {
    const result = transitionGateway(readyMachine(), {
      type: "dispatch",
      eventType: "INTERACTION_CREATE",
      sequence: 2,
      receivedAt: 1_720_000_003_000,
    });

    expect(result.machine.checkpoint.sequence).toBe(2);
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      {
        type: "emit-dispatch",
        eventType: "INTERACTION_CREATE",
        sequence: 2,
      },
    ]);
  });

  it("sends the last sequence and records Heartbeat ACKs", () => {
    let result = transitionGateway(readyMachine(), {
      type: "heartbeat-due",
      sentAt: 1_720_000_004_000,
    });

    expect(result.machine.heartbeat?.awaitingAck).toBe(true);
    expect(result.machine.checkpoint.lastHeartbeatSentAt).toBe(
      1_720_000_004_000,
    );
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      { type: "send-heartbeat", sequence: 1 },
    ]);

    result = transitionGateway(result.machine, {
      type: "heartbeat-ack",
      receivedAt: 1_720_000_004_120,
    });
    expect(result.machine.heartbeat?.awaitingAck).toBe(false);
    expect(result.machine.checkpoint.lastHeartbeatAckAt).toBe(
      1_720_000_004_120,
    );
    expect(result.actions).toEqual([{ type: "persist-checkpoint" }]);
  });

  it("terminates a zombied connection before the next heartbeat", () => {
    const waiting = apply(readyMachine(), {
      type: "heartbeat-due",
      sentAt: 1_720_000_004_000,
    });
    const result = transitionGateway(waiting, {
      type: "heartbeat-due",
      sentAt: 1_720_000_045_250,
    });

    expect(result.machine.status).toBe("backing-off");
    expect(result.machine.connectionMode).toBe("resume");
    expect(result.actions).toEqual([
      { type: "terminate-socket", preserveSession: true },
      {
        type: "schedule-reconnect",
        mode: "resume",
        reason: "heartbeat-ack-timeout",
        closeCode: null,
      },
    ]);
  });
});

describe("Gateway transition validation", () => {
  it.each([
    [
      createGatewayMachine(checkpoint()),
      {
        type: "ready",
        sequence: 1,
        sessionId: "session-123",
        resumeGatewayUrl: "wss://gateway.discord.gg",
        receivedAt: 1_720_000_001_000,
      },
    ],
    [createGatewayMachine(checkpoint()), { type: "socket-open" }],
    [readyMachine(), { type: "identify-permit-granted" }],
    [
      identifyHandshake(),
      { type: "resumed", sequence: 1, receivedAt: 1_720_000_001_000 },
    ],
  ] satisfies readonly (readonly [GatewayMachine, GatewayEvent])[])(
    "rejects invalid transitions",
    (machine, event) => {
    expect(() => transitionGateway(machine, event)).toThrow(
      GatewayTransitionError,
    );
  });

  it("rejects a Ready event with a non-Discord resume URL", () => {
    expect(() =>
      transitionGateway(identifyHandshake(), {
        type: "ready",
        sequence: 1,
        sessionId: "session-123",
        resumeGatewayUrl: "wss://attacker.example",
        receivedAt: 1_720_000_001_000,
      }),
    ).toThrow("Ready event contains invalid resume state");
  });

  it("rejects a Dispatch sequence that moves the resume checkpoint backward", () => {
    expect(() =>
      transitionGateway(readyMachine(), {
        type: "dispatch",
        eventType: "INTERACTION_CREATE",
        sequence: 0,
        receivedAt: 1_720_000_003_000,
      }),
    ).toThrow("Dispatch sequence moved backward");
  });
});
