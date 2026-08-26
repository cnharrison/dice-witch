import { z } from "zod";
import { GatewayOpcode } from "../../../packages/gateway-protocol/src";

const DISPATCH_EVENT = /^[A-Z][A-Z0-9_]{0,63}$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const SafeIntegerSchema = z.number().refine(Number.isSafeInteger);
const NonNegativeSafeIntegerSchema = SafeIntegerSchema.nonnegative();
const PositiveSafeIntegerSchema = SafeIntegerSchema.positive();
const GatewayBotResponseSchema = z.looseObject({
  url: z.string(),
  shards: PositiveSafeIntegerSchema,
  session_start_limit: z.looseObject({
    total: PositiveSafeIntegerSchema,
    remaining: NonNegativeSafeIntegerSchema,
    reset_after: NonNegativeSafeIntegerSchema,
    max_concurrency: PositiveSafeIntegerSchema,
  }),
});
const GatewayEnvelopeSchema = z.looseObject({
  op: z.number(),
  s: z.unknown().optional(),
  t: z.unknown().optional(),
  d: z.unknown().optional(),
});
const GatewayObjectDataSchema = z.looseObject({});
const GatewayReadySessionSchema = z.looseObject({
  session_id: z.string().min(1),
  resume_gateway_url: z.string(),
  guilds: z.array(z.unknown()),
});
const GatewayReadyGuildSchema = z.looseObject({
  id: z.string().regex(SNOWFLAKE),
});
const GatewayHelloSchema = z.looseObject({
  heartbeat_interval: PositiveSafeIntegerSchema,
});
const DispatchEventSchema = z.string().regex(DISPATCH_EVENT);
const BooleanSchema = z.boolean();
const SerializedPayloadSchema = z.string();

type GatewayBotResponseInput = Parameters<
  typeof GatewayBotResponseSchema.safeParse
>[0];
type GatewayEnvelope = z.output<typeof GatewayEnvelopeSchema>;
export type GatewayDispatchData = Parameters<
  typeof GatewayEnvelopeSchema.safeParse
>[0];

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
      data: GatewayDispatchData;
    };

export function parseGatewayBotResponse(
  value: GatewayBotResponseInput,
  observedAt: number,
  allowedHostname?: string,
): GatewayBotInfo {
  const result = GatewayBotResponseSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Get Gateway Bot response is invalid");
  }
  const {
    url,
    shards,
    session_start_limit: {
      total,
      remaining,
      reset_after: resetAfter,
      max_concurrency: maxConcurrency,
    },
  } = result.data;
  const resetAt = observedAt + resetAfter;
  if (
    remaining > total ||
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

function requireSequence(value: GatewayDispatchData): number {
  const result = NonNegativeSafeIntegerSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Gateway Dispatch sequence is invalid");
  }
  return result.data;
}

function parseDispatch(payload: GatewayEnvelope): ParsedGatewayMessage {
  const sequence = requireSequence(payload.s);
  const eventType = DispatchEventSchema.safeParse(payload.t);
  if (!eventType.success) {
    throw new Error("Gateway Dispatch event type is invalid");
  }
  if (eventType.data === "RESUMED") {
    return { type: "resumed", sequence };
  }
  if (eventType.data === "READY") {
    const objectData = GatewayObjectDataSchema.safeParse(payload.d);
    if (!objectData.success) {
      throw new Error("Gateway Ready data is invalid");
    }
    const session = GatewayReadySessionSchema.safeParse(objectData.data);
    if (!session.success) {
      throw new Error("Gateway Ready session is invalid");
    }
    const initialGuildIds = session.data.guilds.map((guild) => {
      const identity = GatewayReadyGuildSchema.safeParse(guild);
      if (!identity.success) {
        throw new Error("Gateway Ready session is invalid");
      }
      return identity.data.id;
    });
    return {
      type: "ready",
      sequence,
      sessionId: session.data.session_id,
      resumeGatewayUrl: session.data.resume_gateway_url,
      initialGuildIds,
    };
  }
  return {
    type: "dispatch",
    sequence,
    eventType: eventType.data,
    data: payload.d,
  };
}

export function parseGatewayMessage(message: string): ParsedGatewayMessage {
  let input: GatewayBotResponseInput;
  try {
    input = JSON.parse(message);
  } catch {
    throw new Error("Gateway message is not valid JSON");
  }
  const envelope = GatewayEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    throw new Error("Gateway message envelope is invalid");
  }
  const payload = envelope.data;

  switch (payload.op) {
    case GatewayOpcode.Dispatch:
      return parseDispatch(payload);
    case GatewayOpcode.Heartbeat:
      return { type: "heartbeat-requested" };
    case GatewayOpcode.Reconnect:
      return { type: "reconnect-requested" };
    case GatewayOpcode.InvalidSession: {
      const resumable = BooleanSchema.safeParse(payload.d);
      if (!resumable.success) {
        throw new Error("Gateway Invalid Session data is invalid");
      }
      return { type: "invalid-session", resumable: resumable.data };
    }
    case GatewayOpcode.Hello: {
      const hello = GatewayHelloSchema.safeParse(payload.d);
      if (!hello.success) {
        throw new Error("Gateway Hello heartbeat interval is invalid");
      }
      return {
        type: "hello",
        heartbeatIntervalMs: hello.data.heartbeat_interval,
      };
    }
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

export function serializeGatewayPayload(payload: GatewayDispatchData): string {
  const result = SerializedPayloadSchema.safeParse(JSON.stringify(payload));
  if (!result.success) {
    throw new Error("Discord Gateway payload must serialize to JSON");
  }
  if (new TextEncoder().encode(result.data).byteLength > 4096) {
    throw new Error("Discord Gateway payload exceeds the 4096-byte limit");
  }
  return result.data;
}
