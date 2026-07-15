export const GatewayOpcode = {
  Dispatch: 0,
  Heartbeat: 1,
  Identify: 2,
  PresenceUpdate: 3,
  VoiceStateUpdate: 4,
  Resume: 6,
  Reconnect: 7,
  RequestGuildMembers: 8,
  InvalidSession: 9,
  Hello: 10,
  HeartbeatAck: 11,
  RequestSoundboardSounds: 31,
  RequestChannelInfo: 43,
} as const;

export type GatewayOpcodeValue =
  (typeof GatewayOpcode)[keyof typeof GatewayOpcode];

export type GatewayReconnectAction = "resume" | "identify" | "stop";

export type GatewayCloseDecision = {
  action: GatewayReconnectAction;
  invalidateSession: boolean;
  reason:
    | "transport-disconnect"
    | "reconnectable-close-code"
    | "session-invalidated"
    | "fatal-close-code"
    | "undocumented-close-code";
};

export type GatewaySessionCheckpoint = {
  version: 1;
  generation: number;
  shardId: number;
  shardCount: number;
  allowedGatewayHostname?: string;
  sessionId: string | null;
  resumeGatewayUrl: string | null;
  sequence: number | null;
  lastDispatchAt: number | null;
  lastHeartbeatSentAt: number | null;
  lastHeartbeatAckAt: number | null;
  updatedAt: number;
};

export type ResumableGatewaySessionCheckpoint = GatewaySessionCheckpoint & {
  sessionId: string;
  resumeGatewayUrl: string;
  sequence: number;
};

export type GatewayConnectionMode = "identify" | "resume";

export type GatewayLifecycleStatus =
  | "idle"
  | "connecting"
  | "awaiting-hello"
  | "awaiting-identify-permit"
  | "identifying"
  | "resuming"
  | "ready"
  | "backing-off"
  | "suspended"
  | "stopped"
  | "fatal";

export type GatewayHeartbeatState = {
  intervalMs: number;
  awaitingAck: boolean;
};

export type GatewayTerminalState = {
  reason: string;
  closeCode: number | null;
};

export type GatewayMachine = {
  status: GatewayLifecycleStatus;
  connectionMode: GatewayConnectionMode | null;
  heartbeat: GatewayHeartbeatState | null;
  checkpoint: GatewaySessionCheckpoint;
  terminal: GatewayTerminalState | null;
};

export type GatewayEvent =
  | { type: "start" }
  | { type: "socket-open" }
  | { type: "hello"; heartbeatIntervalMs: number }
  | { type: "identify-permit-granted" }
  | {
      type: "ready";
      sequence: number;
      sessionId: string;
      resumeGatewayUrl: string;
      receivedAt: number;
    }
  | { type: "resumed"; sequence: number; receivedAt: number }
  | {
      type: "dispatch";
      eventType: string;
      sequence: number;
      receivedAt: number;
    }
  | { type: "heartbeat-due"; sentAt: number }
  | { type: "heartbeat-requested"; sentAt: number }
  | { type: "heartbeat-ack"; receivedAt: number }
  | { type: "reconnect-requested"; receivedAt: number }
  | { type: "invalid-session"; resumable: boolean; receivedAt: number }
  | { type: "socket-closed"; code: number | null; closedAt: number }
  | { type: "reconnect-delay-elapsed" }
  | { type: "suspend"; reason: string; suspendedAt: number }
  | { type: "stop"; reason: string; stoppedAt: number };

export type GatewayAction =
  | { type: "open-socket"; mode: GatewayConnectionMode }
  | {
      type: "schedule-heartbeat";
      intervalMs: number;
      initialJitterRequired: true;
    }
  | { type: "request-identify-permit" }
  | { type: "send-identify" }
  | { type: "send-resume"; sessionId: string; sequence: number }
  | { type: "persist-checkpoint" }
  | { type: "report-ready"; resumed: boolean }
  | { type: "emit-dispatch"; eventType: string; sequence: number }
  | { type: "send-heartbeat"; sequence: number | null }
  | { type: "terminate-socket"; preserveSession: boolean }
  | {
      type: "schedule-reconnect";
      mode: GatewayConnectionMode;
      reason:
        | "heartbeat-ack-timeout"
        | "gateway-reconnect"
        | "invalid-session"
        | "socket-closed";
      closeCode: number | null;
    }
  | { type: "close-socket"; code: 1000 | 4000; reason: string }
  | { type: "report-suspended"; reason: string }
  | { type: "report-stopped"; reason: string }
  | {
      type: "report-fatal";
      reason: GatewayCloseDecision["reason"];
      closeCode: number | null;
    };

export type GatewayTransition = {
  machine: GatewayMachine;
  actions: GatewayAction[];
};
