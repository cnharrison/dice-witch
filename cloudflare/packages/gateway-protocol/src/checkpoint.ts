import type {
  GatewaySessionCheckpoint,
  ResumableGatewaySessionCheckpoint,
} from "./types";

const CHECKPOINT_FIELDS = new Set([
  "version",
  "generation",
  "shardId",
  "shardCount",
  "allowedGatewayHostname",
  "sessionId",
  "resumeGatewayUrl",
  "sequence",
  "lastDispatchAt",
  "lastHeartbeatSentAt",
  "lastHeartbeatAckAt",
  "updatedAt",
]);

function isAllowedGatewayHostname(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const url = new URL(`https://${value}`);
    return (
      url.hostname === value &&
      url.port === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isResumeGatewayUrl(
  value: string | null,
  allowedHostname?: string,
): value is string {
  if (value === null) return false;
  try {
    const url = new URL(value);
    const isDiscordGateway =
      url.hostname === "gateway.discord.gg" ||
      (url.hostname.startsWith("gateway-") &&
        url.hostname.endsWith(".discord.gg"));
    return (
      url.protocol === "wss:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      (isDiscordGateway || url.hostname === allowedHostname)
    );
  } catch {
    return false;
  }
}

function requireNonNegativeInteger(value: unknown, name: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Gateway checkpoint ${name} must be a non-negative safe integer`,
    );
  }
}

function requireNullableTimestamp(value: unknown, name: string): void {
  if (value !== null) requireNonNegativeInteger(value, name);
}

export function validateGatewaySessionCheckpoint(
  value: unknown,
): GatewaySessionCheckpoint {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Gateway checkpoint must be an object");
  }
  const checkpoint = value as Record<string, unknown>;
  const unexpectedField = Object.keys(checkpoint).find(
    (field) => !CHECKPOINT_FIELDS.has(field),
  );
  if (unexpectedField !== undefined) {
    throw new Error("Gateway checkpoint contains an unexpected field");
  }
  if (checkpoint.version !== 1) {
    throw new Error("Gateway checkpoint version must be 1");
  }
  requireNonNegativeInteger(checkpoint.generation, "generation");
  requireNonNegativeInteger(checkpoint.shardId, "shardId");
  requireNonNegativeInteger(checkpoint.shardCount, "shardCount");
  if (
    checkpoint.allowedGatewayHostname !== undefined &&
    !isAllowedGatewayHostname(checkpoint.allowedGatewayHostname)
  ) {
    throw new Error("Gateway checkpoint allowedGatewayHostname is invalid");
  }
  if (checkpoint.shardCount === 0) {
    throw new Error("Gateway checkpoint shardCount must be positive");
  }
  if (
    typeof checkpoint.shardId === "number" &&
    typeof checkpoint.shardCount === "number" &&
    checkpoint.shardId >= checkpoint.shardCount
  ) {
    throw new Error("Gateway checkpoint shardId must be below shardCount");
  }

  const sessionFields = [
    checkpoint.sessionId,
    checkpoint.resumeGatewayUrl,
    checkpoint.sequence,
  ];
  const nullSessionFields = sessionFields.filter(
    (field) => field === null,
  ).length;
  if (nullSessionFields !== 0 && nullSessionFields !== sessionFields.length) {
    throw new Error(
      "Gateway checkpoint resume fields must be all present or all null",
    );
  }
  if (nullSessionFields === 0) {
    if (
      typeof checkpoint.sessionId !== "string" ||
      checkpoint.sessionId.length === 0
    ) {
      throw new Error("Gateway checkpoint sessionId must be a non-empty string");
    }
    if (
      typeof checkpoint.resumeGatewayUrl !== "string" ||
      !isResumeGatewayUrl(
        checkpoint.resumeGatewayUrl,
        typeof checkpoint.allowedGatewayHostname === "string"
          ? checkpoint.allowedGatewayHostname
          : undefined,
      )
    ) {
      throw new Error("Gateway checkpoint resumeGatewayUrl is invalid");
    }
    requireNonNegativeInteger(checkpoint.sequence, "sequence");
  }

  requireNullableTimestamp(checkpoint.lastDispatchAt, "lastDispatchAt");
  requireNullableTimestamp(
    checkpoint.lastHeartbeatSentAt,
    "lastHeartbeatSentAt",
  );
  requireNullableTimestamp(
    checkpoint.lastHeartbeatAckAt,
    "lastHeartbeatAckAt",
  );
  requireNonNegativeInteger(checkpoint.updatedAt, "updatedAt");
  return value as GatewaySessionCheckpoint;
}

export function hasResumableGatewaySession(
  checkpoint: GatewaySessionCheckpoint,
): checkpoint is ResumableGatewaySessionCheckpoint {
  return (
    checkpoint.sessionId !== null &&
    checkpoint.sessionId.length > 0 &&
    isResumeGatewayUrl(
      checkpoint.resumeGatewayUrl,
      checkpoint.allowedGatewayHostname,
    ) &&
    checkpoint.sequence !== null &&
    Number.isSafeInteger(checkpoint.sequence) &&
    checkpoint.sequence >= 0
  );
}

export function clearGatewaySession(
  checkpoint: GatewaySessionCheckpoint,
  updatedAt: number,
): GatewaySessionCheckpoint {
  return {
    ...checkpoint,
    sessionId: null,
    resumeGatewayUrl: null,
    sequence: null,
    lastDispatchAt: null,
    lastHeartbeatSentAt: null,
    lastHeartbeatAckAt: null,
    updatedAt,
  };
}
