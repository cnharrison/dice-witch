import { describe, expect, it } from "vitest";
import {
  createGatewayMachine,
  transitionGateway,
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
    sessionId: "session-123",
    resumeGatewayUrl: "wss://gateway-us-east1-b.discord.gg",
    sequence: 12,
    lastDispatchAt: 1_720_000_000_000,
    lastHeartbeatSentAt: null,
    lastHeartbeatAckAt: null,
    updatedAt: 1_720_000_000_000,
    ...overrides,
  };
}

function readyMachine(): GatewayMachine {
  let machine = createGatewayMachine(checkpoint());
  machine = transitionGateway(machine, { type: "start" }).machine;
  machine = transitionGateway(machine, { type: "socket-open" }).machine;
  machine = transitionGateway(machine, {
    type: "hello",
    heartbeatIntervalMs: 41_250,
  }).machine;
  return transitionGateway(machine, {
    type: "resumed",
    sequence: 12,
    receivedAt: 1_720_000_001_000,
  }).machine;
}

describe("server-directed Gateway reconnects", () => {
  it("preserves a resumable session for opcode 7", () => {
    const result = transitionGateway(readyMachine(), {
      type: "reconnect-requested",
      receivedAt: 1_720_000_002_000,
    });

    expect(result.machine.status).toBe("backing-off");
    expect(result.machine.connectionMode).toBe("resume");
    expect(result.actions).toEqual([
      { type: "terminate-socket", preserveSession: true },
      {
        type: "schedule-reconnect",
        mode: "resume",
        reason: "gateway-reconnect",
        closeCode: null,
      },
    ]);
  });

  it("resumes after a resumable Invalid Session response", () => {
    const result = transitionGateway(readyMachine(), {
      type: "invalid-session",
      resumable: true,
      receivedAt: 1_720_000_002_000,
    });

    expect(result.machine.connectionMode).toBe("resume");
    expect(result.machine.checkpoint.sessionId).toBe("session-123");
    expect(result.actions).toEqual([
      { type: "terminate-socket", preserveSession: true },
      {
        type: "schedule-reconnect",
        mode: "resume",
        reason: "invalid-session",
        closeCode: null,
      },
    ]);
  });

  it("clears the session before identifying after an invalid session", () => {
    const result = transitionGateway(readyMachine(), {
      type: "invalid-session",
      resumable: false,
      receivedAt: 1_720_000_002_000,
    });

    expect(result.machine.connectionMode).toBe("identify");
    expect(result.machine.checkpoint).toMatchObject({
      sessionId: null,
      resumeGatewayUrl: null,
      sequence: null,
      updatedAt: 1_720_000_002_000,
    });
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      { type: "terminate-socket", preserveSession: false },
      {
        type: "schedule-reconnect",
        mode: "identify",
        reason: "invalid-session",
        closeCode: null,
      },
    ]);
  });
});

describe("Gateway socket close policy", () => {
  it.each([
    [null, "resume", false],
    [4000, "resume", false],
    [4007, "identify", true],
    [4009, "identify", true],
  ] as const)(
    "turns close code %s into a %s reconnect",
    (code, mode, invalidatesSession) => {
      const result = transitionGateway(readyMachine(), {
        type: "socket-closed",
        code,
        closedAt: 1_720_000_002_000,
      });

      expect(result.machine.status).toBe("backing-off");
      expect(result.machine.connectionMode).toBe(mode);
      expect(result.machine.checkpoint.sessionId === null).toBe(
        invalidatesSession,
      );
      expect(result.actions.at(-1)).toEqual({
        type: "schedule-reconnect",
        mode,
        reason: "socket-closed",
        closeCode: code,
      });
    },
  );

  it("stops permanently on a fatal authentication close", () => {
    const result = transitionGateway(readyMachine(), {
      type: "socket-closed",
      code: 4004,
      closedAt: 1_720_000_002_000,
    });

    expect(result.machine.status).toBe("fatal");
    expect(result.machine.checkpoint.sessionId).toBeNull();
    expect(result.machine.terminal).toEqual({
      reason: "fatal-close-code",
      closeCode: 4004,
    });
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      {
        type: "report-fatal",
        reason: "fatal-close-code",
        closeCode: 4004,
      },
    ]);
  });

  it("identifies when a reconnectable close has no resume checkpoint", () => {
    let machine = createGatewayMachine(
      checkpoint({ sessionId: null, resumeGatewayUrl: null, sequence: null }),
    );
    machine = transitionGateway(machine, { type: "start" }).machine;
    machine = transitionGateway(machine, { type: "socket-open" }).machine;

    const result = transitionGateway(machine, {
      type: "socket-closed",
      code: 4000,
      closedAt: 1_720_000_002_000,
    });

    expect(result.machine.connectionMode).toBe("identify");
    expect(result.actions.at(-1)).toEqual({
      type: "schedule-reconnect",
      mode: "identify",
      reason: "socket-closed",
      closeCode: 4000,
    });
  });

  it("does not schedule a second retry when the expected close arrives", () => {
    const backingOff = transitionGateway(readyMachine(), {
      type: "reconnect-requested",
      receivedAt: 1_720_000_002_000,
    }).machine;

    const result = transitionGateway(backingOff, {
      type: "socket-closed",
      code: 4000,
      closedAt: 1_720_000_002_100,
    });

    expect(result.machine).toBe(backingOff);
    expect(result.actions).toEqual([]);
  });

  it("does not ignore a fatal close while already backing off", () => {
    const backingOff = transitionGateway(readyMachine(), {
      type: "reconnect-requested",
      receivedAt: 1_720_000_002_000,
    }).machine;

    const result = transitionGateway(backingOff, {
      type: "socket-closed",
      code: 4004,
      closedAt: 1_720_000_002_100,
    });

    expect(result.machine.status).toBe("fatal");
    expect(result.actions.at(-1)).toEqual({
      type: "report-fatal",
      reason: "fatal-close-code",
      closeCode: 4004,
    });
  });

  it("replaces a Resume retry when the close code requires Identify", () => {
    const backingOff = transitionGateway(readyMachine(), {
      type: "reconnect-requested",
      receivedAt: 1_720_000_002_000,
    }).machine;

    const result = transitionGateway(backingOff, {
      type: "socket-closed",
      code: 4007,
      closedAt: 1_720_000_002_100,
    });

    expect(result.machine.connectionMode).toBe("identify");
    expect(result.machine.checkpoint.sessionId).toBeNull();
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      {
        type: "schedule-reconnect",
        mode: "identify",
        reason: "socket-closed",
        closeCode: 4007,
      },
    ]);
  });
});

describe("Gateway reconnect and stop lifecycle", () => {
  it("opens the selected connection after the retry delay", () => {
    const backingOff = transitionGateway(readyMachine(), {
      type: "reconnect-requested",
      receivedAt: 1_720_000_002_000,
    }).machine;
    const result = transitionGateway(backingOff, {
      type: "reconnect-delay-elapsed",
    });

    expect(result.machine.status).toBe("connecting");
    expect(result.actions).toEqual([{ type: "open-socket", mode: "resume" }]);
  });

  it("suspends a generation without clearing resumable state", () => {
    const machine = readyMachine();
    const result = transitionGateway(machine, {
      type: "suspend",
      reason: "generation-replacement",
      suspendedAt: 1_720_000_002_000,
    });

    expect(result.machine.status).toBe("suspended");
    expect(result.machine.checkpoint).toEqual(machine.checkpoint);
    expect(result.actions).toEqual([
      {
        type: "close-socket",
        code: 4000,
        reason: "generation-replacement",
      },
      { type: "report-suspended", reason: "generation-replacement" },
    ]);
  });

  it("clears resumable state on an intentional stop", () => {
    const result = transitionGateway(readyMachine(), {
      type: "stop",
      reason: "operator-request",
      stoppedAt: 1_720_000_002_000,
    });

    expect(result.machine.status).toBe("stopped");
    expect(result.machine.checkpoint.sessionId).toBeNull();
    expect(result.machine.terminal).toEqual({
      reason: "operator-request",
      closeCode: 1000,
    });
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      { type: "close-socket", code: 1000, reason: "operator-request" },
      { type: "report-stopped", reason: "operator-request" },
    ]);
  });
});

describe("server-requested heartbeats", () => {
  it("sends immediately even when a periodic heartbeat ACK is outstanding", () => {
    const waitingForAck = transitionGateway(readyMachine(), {
      type: "heartbeat-due",
      sentAt: 1_720_000_002_000,
    }).machine;
    const result = transitionGateway(waitingForAck, {
      type: "heartbeat-requested",
      sentAt: 1_720_000_002_100,
    });

    expect(result.machine.heartbeat?.awaitingAck).toBe(true);
    expect(result.machine.checkpoint.lastHeartbeatSentAt).toBe(
      1_720_000_002_100,
    );
    expect(result.actions).toEqual([
      { type: "persist-checkpoint" },
      { type: "send-heartbeat", sequence: 12 },
    ]);
  });
});
