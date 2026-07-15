import {
  clearGatewaySession,
  hasResumableGatewaySession,
  validateGatewaySessionCheckpoint,
} from "./checkpoint";
import { classifyGatewayClose } from "./close-policy";
import type {
  GatewayAction,
  GatewayConnectionMode,
  GatewayEvent,
  GatewayLifecycleStatus,
  GatewayMachine,
  GatewaySessionCheckpoint,
  GatewayTransition,
} from "./types";

const HEARTBEATING_STATES = new Set<GatewayLifecycleStatus>([
  "awaiting-identify-permit",
  "identifying",
  "resuming",
  "ready",
]);

const CONNECTED_STATES: GatewayLifecycleStatus[] = [
  "connecting",
  "awaiting-hello",
  "awaiting-identify-permit",
  "identifying",
  "resuming",
  "ready",
];

export class GatewayTransitionError extends Error {
  constructor(
    status: GatewayLifecycleStatus,
    eventType: GatewayEvent["type"],
    detail?: string,
  ) {
    super(detail ?? `Cannot apply ${eventType} while Gateway is ${status}`);
    this.name = "GatewayTransitionError";
  }
}

function requireStatus(
  machine: GatewayMachine,
  event: GatewayEvent,
  allowed: GatewayLifecycleStatus[],
): void {
  if (!allowed.includes(machine.status)) {
    throw new GatewayTransitionError(machine.status, event.type);
  }
}

function requireNonNegativeInteger(
  value: number,
  name: string,
  machine: GatewayMachine,
  event: GatewayEvent,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      `${name} must be a non-negative safe integer`,
    );
  }
}

function getReconnectMode(
  checkpoint: GatewaySessionCheckpoint,
): GatewayConnectionMode {
  return hasResumableGatewaySession(checkpoint) ? "resume" : "identify";
}

function recordDispatch(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "dispatch" }>,
): GatewayTransition {
  requireStatus(machine, event, ["resuming", "ready"]);
  requireNonNegativeInteger(event.sequence, "Dispatch sequence", machine, event);
  requireNonNegativeInteger(event.receivedAt, "Dispatch timestamp", machine, event);
  if (
    machine.checkpoint.sequence !== null &&
    event.sequence < machine.checkpoint.sequence
  ) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Dispatch sequence moved backward",
    );
  }
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(event.eventType)) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Dispatch event type is invalid",
    );
  }

  return {
    machine: {
      ...machine,
      checkpoint: {
        ...machine.checkpoint,
        sequence: event.sequence,
        lastDispatchAt: event.receivedAt,
        updatedAt: event.receivedAt,
      },
    },
    actions: [
      { type: "persist-checkpoint" },
      {
        type: "emit-dispatch",
        eventType: event.eventType,
        sequence: event.sequence,
      },
    ],
  };
}

function startHeartbeat(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "hello" }>,
): GatewayTransition {
  requireStatus(machine, event, ["awaiting-hello"]);
  if (
    !Number.isSafeInteger(event.heartbeatIntervalMs) ||
    event.heartbeatIntervalMs <= 0
  ) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Heartbeat interval must be a positive safe integer",
    );
  }
  if (machine.connectionMode === null) {
    throw new GatewayTransitionError(machine.status, event.type);
  }

  const heartbeat = {
    intervalMs: event.heartbeatIntervalMs,
    awaitingAck: false,
  };
  const scheduleAction: GatewayAction = {
    type: "schedule-heartbeat",
    intervalMs: event.heartbeatIntervalMs,
    initialJitterRequired: true,
  };

  if (machine.connectionMode === "resume") {
    if (!hasResumableGatewaySession(machine.checkpoint)) {
      throw new GatewayTransitionError(
        machine.status,
        event.type,
        "Resume connection has no valid checkpoint",
      );
    }
    return {
      machine: { ...machine, status: "resuming", heartbeat },
      actions: [
        scheduleAction,
        {
          type: "send-resume",
          sessionId: machine.checkpoint.sessionId,
          sequence: machine.checkpoint.sequence,
        },
      ],
    };
  }

  return {
    machine: {
      ...machine,
      status: "awaiting-identify-permit",
      heartbeat,
    },
    actions: [scheduleAction, { type: "request-identify-permit" }],
  };
}

function recordReady(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "ready" }>,
): GatewayTransition {
  requireStatus(machine, event, ["identifying"]);
  requireNonNegativeInteger(event.sequence, "Ready sequence", machine, event);
  requireNonNegativeInteger(event.receivedAt, "Ready timestamp", machine, event);
  const checkpoint: GatewaySessionCheckpoint = {
    ...machine.checkpoint,
    sessionId: event.sessionId,
    resumeGatewayUrl: event.resumeGatewayUrl,
    sequence: event.sequence,
    lastDispatchAt: event.receivedAt,
    updatedAt: event.receivedAt,
  };
  if (!hasResumableGatewaySession(checkpoint)) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Ready event contains invalid resume state",
    );
  }
  return {
    machine: { ...machine, status: "ready", checkpoint },
    actions: [
      { type: "persist-checkpoint" },
      { type: "report-ready", resumed: false },
    ],
  };
}

function recordResumed(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "resumed" }>,
): GatewayTransition {
  requireStatus(machine, event, ["resuming"]);
  requireNonNegativeInteger(event.sequence, "Resumed sequence", machine, event);
  requireNonNegativeInteger(event.receivedAt, "Resumed timestamp", machine, event);
  if (
    machine.checkpoint.sequence !== null &&
    event.sequence < machine.checkpoint.sequence
  ) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Resumed sequence moved backward",
    );
  }
  return {
    machine: {
      ...machine,
      status: "ready",
      checkpoint: {
        ...machine.checkpoint,
        sequence: event.sequence,
        lastDispatchAt: event.receivedAt,
        updatedAt: event.receivedAt,
      },
    },
    actions: [
      { type: "persist-checkpoint" },
      { type: "report-ready", resumed: true },
    ],
  };
}

function handleHeartbeat(
  machine: GatewayMachine,
  event: Extract<
    GatewayEvent,
    { type: "heartbeat-due" | "heartbeat-requested" | "heartbeat-ack" }
  >,
): GatewayTransition {
  if (!HEARTBEATING_STATES.has(machine.status) || machine.heartbeat === null) {
    throw new GatewayTransitionError(machine.status, event.type);
  }

  if (event.type === "heartbeat-ack") {
    requireNonNegativeInteger(
      event.receivedAt,
      "Heartbeat ACK timestamp",
      machine,
      event,
    );
    if (!machine.heartbeat.awaitingAck) {
      throw new GatewayTransitionError(
        machine.status,
        event.type,
        "Heartbeat ACK arrived without an outstanding heartbeat",
      );
    }
    return {
      machine: {
        ...machine,
        heartbeat: { ...machine.heartbeat, awaitingAck: false },
        checkpoint: {
          ...machine.checkpoint,
          lastHeartbeatAckAt: event.receivedAt,
          updatedAt: event.receivedAt,
        },
      },
      actions: [{ type: "persist-checkpoint" }],
    };
  }

  requireNonNegativeInteger(event.sentAt, "Heartbeat timestamp", machine, event);
  if (event.type === "heartbeat-due" && machine.heartbeat.awaitingAck) {
    const mode = getReconnectMode(machine.checkpoint);
    return reconnect(
      machine,
      mode,
      "heartbeat-ack-timeout",
      null,
      machine.checkpoint,
      [{ type: "terminate-socket", preserveSession: mode === "resume" }],
    );
  }

  return {
    machine: {
      ...machine,
      heartbeat: { ...machine.heartbeat, awaitingAck: true },
      checkpoint: {
        ...machine.checkpoint,
        lastHeartbeatSentAt: event.sentAt,
        updatedAt: event.sentAt,
      },
    },
    actions: [
      { type: "persist-checkpoint" },
      { type: "send-heartbeat", sequence: machine.checkpoint.sequence },
    ],
  };
}

function reconnect(
  machine: GatewayMachine,
  mode: GatewayConnectionMode,
  reason: Extract<GatewayAction, { type: "schedule-reconnect" }>["reason"],
  closeCode: number | null,
  checkpoint: GatewaySessionCheckpoint,
  precedingActions: GatewayAction[],
): GatewayTransition {
  return {
    machine: {
      ...machine,
      status: "backing-off",
      connectionMode: mode,
      heartbeat: null,
      checkpoint,
      terminal: null,
    },
    actions: [
      ...precedingActions,
      { type: "schedule-reconnect", mode, reason, closeCode },
    ],
  };
}

function handleReconnectRequested(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "reconnect-requested" }>,
): GatewayTransition {
  requireStatus(machine, event, CONNECTED_STATES);
  requireNonNegativeInteger(
    event.receivedAt,
    "Reconnect timestamp",
    machine,
    event,
  );
  const mode = getReconnectMode(machine.checkpoint);
  return reconnect(
    machine,
    mode,
    "gateway-reconnect",
    null,
    machine.checkpoint,
    [{ type: "terminate-socket", preserveSession: mode === "resume" }],
  );
}

function handleInvalidSession(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "invalid-session" }>,
): GatewayTransition {
  requireStatus(machine, event, ["identifying", "resuming", "ready"]);
  requireNonNegativeInteger(
    event.receivedAt,
    "Invalid Session timestamp",
    machine,
    event,
  );
  if (event.resumable) {
    if (!hasResumableGatewaySession(machine.checkpoint)) {
      throw new GatewayTransitionError(
        machine.status,
        event.type,
        "Invalid Session is resumable but no resume checkpoint exists",
      );
    }
    return reconnect(
      machine,
      "resume",
      "invalid-session",
      null,
      machine.checkpoint,
      [{ type: "terminate-socket", preserveSession: true }],
    );
  }

  const checkpoint = clearGatewaySession(machine.checkpoint, event.receivedAt);
  return reconnect(
    machine,
    "identify",
    "invalid-session",
    null,
    checkpoint,
    [
      { type: "persist-checkpoint" },
      { type: "terminate-socket", preserveSession: false },
    ],
  );
}

function handleSocketClosed(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "socket-closed" }>,
): GatewayTransition {
  const wasBackingOff = machine.status === "backing-off";
  requireStatus(machine, event, [...CONNECTED_STATES, "backing-off"]);
  requireNonNegativeInteger(
    event.closedAt,
    "Socket close timestamp",
    machine,
    event,
  );
  if (
    event.code !== null &&
    (!Number.isInteger(event.code) || event.code < 1000 || event.code > 4999)
  ) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Socket close code is invalid",
    );
  }

  const decision = classifyGatewayClose(event.code);
  if (decision.action === "stop") {
    const checkpoint = clearGatewaySession(machine.checkpoint, event.closedAt);
    return {
      machine: {
        ...machine,
        status: "fatal",
        connectionMode: null,
        heartbeat: null,
        checkpoint,
        terminal: { reason: decision.reason, closeCode: event.code },
      },
      actions: [
        { type: "persist-checkpoint" },
        {
          type: "report-fatal",
          reason: decision.reason,
          closeCode: event.code,
        },
      ],
    };
  }

  let mode: GatewayConnectionMode = "resume";
  let checkpoint = machine.checkpoint;
  let precedingActions: GatewayAction[] = [];
  if (
    decision.action !== "resume" ||
    !hasResumableGatewaySession(machine.checkpoint)
  ) {
    mode = "identify";
    checkpoint = clearGatewaySession(machine.checkpoint, event.closedAt);
    precedingActions = [{ type: "persist-checkpoint" }];
  }
  if (wasBackingOff && machine.connectionMode === mode) {
    return { machine, actions: [] };
  }
  return reconnect(
    machine,
    mode,
    "socket-closed",
    event.code,
    checkpoint,
    precedingActions,
  );
}

function suspend(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "suspend" }>,
): GatewayTransition {
  requireStatus(machine, event, ["ready"]);
  requireNonNegativeInteger(
    event.suspendedAt,
    "Suspend timestamp",
    machine,
    event,
  );
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(event.reason)) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Suspend reason is invalid",
    );
  }
  return {
    machine: {
      ...machine,
      status: "suspended",
      connectionMode: null,
      heartbeat: null,
      terminal: { reason: event.reason, closeCode: 4000 },
    },
    actions: [
      { type: "close-socket", code: 4000, reason: event.reason },
      { type: "report-suspended", reason: event.reason },
    ],
  };
}

function stop(
  machine: GatewayMachine,
  event: Extract<GatewayEvent, { type: "stop" }>,
): GatewayTransition {
  if (machine.status === "stopped" || machine.status === "fatal") {
    throw new GatewayTransitionError(machine.status, event.type);
  }
  requireNonNegativeInteger(event.stoppedAt, "Stop timestamp", machine, event);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(event.reason)) {
    throw new GatewayTransitionError(
      machine.status,
      event.type,
      "Stop reason is invalid",
    );
  }
  const checkpoint = clearGatewaySession(machine.checkpoint, event.stoppedAt);
  return {
    machine: {
      ...machine,
      status: "stopped",
      connectionMode: null,
      heartbeat: null,
      checkpoint,
      terminal: { reason: event.reason, closeCode: 1000 },
    },
    actions: [
      { type: "persist-checkpoint" },
      { type: "close-socket", code: 1000, reason: event.reason },
      { type: "report-stopped", reason: event.reason },
    ],
  };
}

export function createGatewayMachine(
  checkpoint: GatewaySessionCheckpoint,
): GatewayMachine {
  return {
    status: "idle",
    connectionMode: null,
    heartbeat: null,
    checkpoint: validateGatewaySessionCheckpoint(checkpoint),
    terminal: null,
  };
}

export function transitionGateway(
  machine: GatewayMachine,
  event: GatewayEvent,
): GatewayTransition {
  switch (event.type) {
    case "start": {
      requireStatus(machine, event, ["idle"]);
      const mode = getReconnectMode(machine.checkpoint);
      return {
        machine: {
          ...machine,
          status: "connecting",
          connectionMode: mode,
          heartbeat: null,
        },
        actions: [{ type: "open-socket", mode }],
      };
    }
    case "socket-open":
      requireStatus(machine, event, ["connecting"]);
      return {
        machine: { ...machine, status: "awaiting-hello" },
        actions: [],
      };
    case "hello":
      return startHeartbeat(machine, event);
    case "identify-permit-granted":
      requireStatus(machine, event, ["awaiting-identify-permit"]);
      return {
        machine: { ...machine, status: "identifying" },
        actions: [{ type: "send-identify" }],
      };
    case "ready":
      return recordReady(machine, event);
    case "resumed":
      return recordResumed(machine, event);
    case "dispatch":
      return recordDispatch(machine, event);
    case "heartbeat-due":
    case "heartbeat-requested":
    case "heartbeat-ack":
      return handleHeartbeat(machine, event);
    case "reconnect-requested":
      return handleReconnectRequested(machine, event);
    case "invalid-session":
      return handleInvalidSession(machine, event);
    case "socket-closed":
      return handleSocketClosed(machine, event);
    case "reconnect-delay-elapsed":
      requireStatus(machine, event, ["backing-off"]);
      if (machine.connectionMode === null) {
        throw new GatewayTransitionError(machine.status, event.type);
      }
      return {
        machine: { ...machine, status: "connecting", terminal: null },
        actions: [{ type: "open-socket", mode: machine.connectionMode }],
      };
    case "suspend":
      return suspend(machine, event);
    case "stop":
      return stop(machine, event);
  }
}
