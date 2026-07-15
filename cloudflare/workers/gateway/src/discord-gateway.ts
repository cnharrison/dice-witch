import { GatewayOpcode } from "../../../packages/gateway-protocol/src";

const DISPATCH_EVENT = /^[A-Z][A-Z0-9_]{0,63}$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

export type GatewayBotInfo = {
  url: string;
  shards: number;
  sessionStartLimit: {
    total: number;
    remaining: number;
    resetAt: number;
    maxConcurrency: number;
    observedAt: number;
  };
};

export type ParsedGatewayMessage =
  | { type: "hello"; heartbeatIntervalMs: number }
  | { type: "heartbeat-requested" }
  | { type: "reconnect-requested" }
  | { type: "invalid-session"; resumable: boolean }
  | { type: "heartbeat-ack" }
  | {
      type: "ready";
      sequence: number;
      sessionId: string;
      resumeGatewayUrl: string;
      initialGuildIds: string[];
    }
  | { type: "resumed"; sequence: number }
  | {
      type: "dispatch";
      sequence: number;
      eventType: string;
      data: unknown;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGatewayBotResponse(
  value: unknown,
  observedAt: number,
  allowedHostname?: string,
): GatewayBotInfo {
  if (!isRecord(value) || !isRecord(value.session_start_limit)) {
    throw new Error("Get Gateway Bot response is invalid");
  }
  const { url, shards } = value;
  const {
    total,
    remaining,
    reset_after: resetAfter,
    max_concurrency: maxConcurrency,
  } = value.session_start_limit;
  const resetAt =
    typeof resetAfter === "number" ? observedAt + resetAfter : Number.NaN;
  if (
    typeof url !== "string" ||
    typeof shards !== "number" ||
    !Number.isSafeInteger(shards) ||
    shards <= 0 ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    typeof remaining !== "number" ||
    !Number.isSafeInteger(remaining) ||
    remaining < 0 ||
    remaining > total ||
    typeof resetAfter !== "number" ||
    !Number.isSafeInteger(resetAfter) ||
    resetAfter < 0 ||
    typeof maxConcurrency !== "number" ||
    !Number.isSafeInteger(maxConcurrency) ||
    maxConcurrency <= 0 ||
    !Number.isSafeInteger(observedAt) ||
    observedAt < 0 ||
    !Number.isSafeInteger(resetAt)
  ) {
    throw new Error("Get Gateway Bot response is invalid");
  }
  normalizeDiscordGatewayUrl(url, allowedHostname);
  return {
    url,
    shards,
    sessionStartLimit: {
      total,
      remaining,
      resetAt,
      maxConcurrency,
      observedAt,
    },
  };
}

export function normalizeDiscordGatewayUrl(
  value: string,
  allowedHostname?: string,
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Discord Gateway URL is invalid");
  }
  const isDiscordGateway =
    url.hostname === "gateway.discord.gg" ||
    (url.hostname.startsWith("gateway-") &&
      url.hostname.endsWith(".discord.gg"));
  if (
    url.protocol !== "wss:" ||
    (!isDiscordGateway && url.hostname !== allowedHostname) ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Discord Gateway URL is invalid");
  }
  url.searchParams.set("v", "10");
  url.searchParams.set("encoding", "json");
  return url.toString();
}

function requireSequence(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Gateway Dispatch sequence is invalid");
  }
  return value;
}

function parseDispatch(payload: Record<string, unknown>): ParsedGatewayMessage {
  const sequence = requireSequence(payload.s);
  if (typeof payload.t !== "string" || !DISPATCH_EVENT.test(payload.t)) {
    throw new Error("Gateway Dispatch event type is invalid");
  }
  if (payload.t === "RESUMED") {
    return { type: "resumed", sequence };
  }
  if (payload.t === "READY") {
    if (!isRecord(payload.d)) {
      throw new Error("Gateway Ready data is invalid");
    }
    const sessionId = payload.d.session_id;
    const resumeGatewayUrl = payload.d.resume_gateway_url;
    if (
      typeof sessionId !== "string" ||
      sessionId.length === 0 ||
      typeof resumeGatewayUrl !== "string" ||
      !Array.isArray(payload.d.guilds)
    ) {
      throw new Error("Gateway Ready session is invalid");
    }
    const guilds: unknown[] = payload.d.guilds;
    const initialGuildIds = guilds.map((guild) => {
      if (
        !isRecord(guild) ||
        typeof guild.id !== "string" ||
        !SNOWFLAKE.test(guild.id)
      ) {
        throw new Error("Gateway Ready session is invalid");
      }
      return guild.id;
    });
    return {
      type: "ready",
      sequence,
      sessionId,
      resumeGatewayUrl,
      initialGuildIds,
    };
  }
  return {
    type: "dispatch",
    sequence,
    eventType: payload.t,
    data: payload.d,
  };
}

export function parseGatewayMessage(message: string): ParsedGatewayMessage {
  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    throw new Error("Gateway message is not valid JSON");
  }
  if (!isRecord(payload) || typeof payload.op !== "number") {
    throw new Error("Gateway message envelope is invalid");
  }

  switch (payload.op) {
    case GatewayOpcode.Dispatch:
      return parseDispatch(payload);
    case GatewayOpcode.Heartbeat:
      return { type: "heartbeat-requested" };
    case GatewayOpcode.Reconnect:
      return { type: "reconnect-requested" };
    case GatewayOpcode.InvalidSession:
      if (typeof payload.d !== "boolean") {
        throw new Error("Gateway Invalid Session data is invalid");
      }
      return { type: "invalid-session", resumable: payload.d };
    case GatewayOpcode.Hello:
      if (
        !isRecord(payload.d) ||
        typeof payload.d.heartbeat_interval !== "number" ||
        !Number.isSafeInteger(payload.d.heartbeat_interval) ||
        payload.d.heartbeat_interval <= 0
      ) {
        throw new Error("Gateway Hello heartbeat interval is invalid");
      }
      return {
        type: "hello",
        heartbeatIntervalMs: payload.d.heartbeat_interval,
      };
    case GatewayOpcode.HeartbeatAck:
      return { type: "heartbeat-ack" };
    default:
      throw new Error("Gateway message opcode is unsupported");
  }
}

function requireToken(token: string): void {
  if (token.length === 0) throw new Error("Discord bot token is required");
}

function gatewayPresence() {
  return {
    since: null,
    activities: [{ name: "/roll", type: 0 }],
    status: "online",
    afk: false,
  };
}

export function buildGatewayPresenceUpdate() {
  return { op: GatewayOpcode.PresenceUpdate, d: gatewayPresence() };
}

export function buildGatewayIdentify(
  token: string,
  shard: { shardId: number; shardCount: number },
) {
  requireToken(token);
  if (
    !Number.isSafeInteger(shard.shardId) ||
    shard.shardId < 0 ||
    !Number.isSafeInteger(shard.shardCount) ||
    shard.shardCount <= 0 ||
    shard.shardId >= shard.shardCount
  ) {
    throw new Error("Discord Identify shard coordinates are invalid");
  }
  return {
    op: GatewayOpcode.Identify,
    d: {
      token,
      properties: {
        os: "linux",
        browser: "dice-witch-cloudflare",
        device: "dice-witch-cloudflare",
      },
      shard: [shard.shardId, shard.shardCount],
      presence: gatewayPresence(),
      intents: 1,
    },
  };
}

export function buildGatewayResume(
  token: string,
  sessionId: string,
  sequence: number,
) {
  requireToken(token);
  if (sessionId.length === 0 || !Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error("Discord resume state is invalid");
  }
  return {
    op: GatewayOpcode.Resume,
    d: { token, session_id: sessionId, seq: sequence },
  };
}

export function buildGatewayHeartbeat(sequence: number | null) {
  if (
    sequence !== null &&
    (!Number.isSafeInteger(sequence) || sequence < 0)
  ) {
    throw new Error("Discord heartbeat sequence is invalid");
  }
  return { op: GatewayOpcode.Heartbeat, d: sequence };
}

export function serializeGatewayPayload(payload: unknown): string {
  const serialized: unknown = JSON.stringify(payload);
  if (typeof serialized !== "string") {
    throw new Error("Discord Gateway payload must serialize to JSON");
  }
  if (new TextEncoder().encode(serialized).byteLength > 4096) {
    throw new Error("Discord Gateway payload exceeds the 4096-byte limit");
  }
  return serialized;
}
