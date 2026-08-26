import { z } from "zod";
import type {
  GatewaySessionCheckpoint,
  ResumableGatewaySessionCheckpoint,
} from "./types";

const GatewaySessionCheckpointInputSchema = z.strictObject({
  version: z.unknown().optional(),
  generation: z.unknown().optional(),
  shardId: z.unknown().optional(),
  shardCount: z.unknown().optional(),
  allowedGatewayHostname: z.unknown().optional(),
  sessionId: z.unknown().optional(),
  resumeGatewayUrl: z.unknown().optional(),
  sequence: z.unknown().optional(),
  lastDispatchAt: z.unknown().optional(),
  lastHeartbeatSentAt: z.unknown().optional(),
  lastHeartbeatAckAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});
const NonNegativeSafeIntegerSchema = z
  .number()
  .refine(Number.isSafeInteger)
  .nonnegative();
const NonEmptyStringSchema = z.string().min(1);
const AllowedGatewayHostnameSchema = z
  .string()
  .min(1)
  .refine((value) => {
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
  });
type GatewaySessionCheckpointInput = Parameters<
  typeof GatewaySessionCheckpointInputSchema.parse
>[0];
type NonNegativeSafeIntegerInput = Parameters<
  typeof NonNegativeSafeIntegerSchema.parse
>[0];

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

function requireNonNegativeInteger(
  value: NonNegativeSafeIntegerInput,
  name: string,
): number {
  const result = NonNegativeSafeIntegerSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Gateway checkpoint ${name} must be a non-negative safe integer`,
    );
  }
  return result.data;
}

function requireNullableTimestamp(
  value: NonNegativeSafeIntegerInput,
  name: string,
): void {
  if (value !== null) requireNonNegativeInteger(value, name);
}

function assertGatewaySessionCheckpoint(
  value: GatewaySessionCheckpointInput,
): asserts value is GatewaySessionCheckpoint {
  const result = GatewaySessionCheckpointInputSchema.safeParse(value);
  if (!result.success) {
    const hasUnexpectedField = result.error.issues.some(
      ({ code }) => code === "unrecognized_keys",
    );
    throw new Error(
      hasUnexpectedField
        ? "Gateway checkpoint contains an unexpected field"
        : "Gateway checkpoint must be an object",
    );
  }
  const checkpoint = result.data;
  if (checkpoint.version !== 1) {
    throw new Error("Gateway checkpoint version must be 1");
  }
  requireNonNegativeInteger(checkpoint.generation, "generation");
  const shardId = requireNonNegativeInteger(checkpoint.shardId, "shardId");
  const shardCount = requireNonNegativeInteger(
    checkpoint.shardCount,
    "shardCount",
  );
  const allowedHostname = AllowedGatewayHostnameSchema.safeParse(
    checkpoint.allowedGatewayHostname,
  );
  if (
    checkpoint.allowedGatewayHostname !== undefined &&
    !allowedHostname.success
  ) {
    throw new Error("Gateway checkpoint allowedGatewayHostname is invalid");
  }
  if (shardCount === 0) {
    throw new Error("Gateway checkpoint shardCount must be positive");
  }
  if (shardId >= shardCount) {
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
    const sessionId = NonEmptyStringSchema.safeParse(checkpoint.sessionId);
    if (!sessionId.success) {
      throw new Error("Gateway checkpoint sessionId must be a non-empty string");
    }
    const resumeGatewayUrl = NonEmptyStringSchema.safeParse(
      checkpoint.resumeGatewayUrl,
    );
    if (
      !resumeGatewayUrl.success ||
      !isResumeGatewayUrl(
        resumeGatewayUrl.data,
        allowedHostname.success ? allowedHostname.data : undefined,
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
}

export function validateGatewaySessionCheckpoint(
  value: GatewaySessionCheckpointInput,
): GatewaySessionCheckpoint {
  assertGatewaySessionCheckpoint(value);
  return value;
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
