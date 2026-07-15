import type { GatewayCloseDecision } from "./types";

const RESUMABLE_CLOSE_CODES = new Set([4000, 4001, 4002, 4003, 4005, 4008]);
const IDENTIFY_CLOSE_CODES = new Set([1000, 1001, 4007, 4009]);
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export function classifyGatewayClose(code: number | null): GatewayCloseDecision {
  if (code === null || code === 1006) {
    return {
      action: "resume",
      invalidateSession: false,
      reason: "transport-disconnect",
    };
  }
  if (RESUMABLE_CLOSE_CODES.has(code)) {
    return {
      action: "resume",
      invalidateSession: false,
      reason: "reconnectable-close-code",
    };
  }
  if (IDENTIFY_CLOSE_CODES.has(code)) {
    return {
      action: "identify",
      invalidateSession: true,
      reason: "session-invalidated",
    };
  }
  if (FATAL_CLOSE_CODES.has(code)) {
    return {
      action: "stop",
      invalidateSession: true,
      reason: "fatal-close-code",
    };
  }
  return {
    action: "stop",
    invalidateSession: true,
    reason: "undocumented-close-code",
  };
}
