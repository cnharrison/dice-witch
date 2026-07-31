export type GameDetectionAnnouncementV1 = Readonly<{
  version: 1;
  detectionId: string;
  sessionId: string;
  previousGameId: string | null;
  gameId: string;
  gameName: string;
  confidence: "plausible" | "strong" | "distinctive";
  detectedAt: number;
  scope: "guild" | "dm";
  guildId: string | null;
  channelId: string;
  guildName: string | null;
  channelName: string | null;
  rollCount: number;
  sessionStartedAt: number;
  sessionLastRollAt: number;
}>;

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/u;
const DETECTION_ID = /^[1-9][0-9]{16,19}:[a-f0-9]{16}$/u;
const GAME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONFIDENCE = new Set(["plausible", "strong", "distinctive"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function nullableName(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && value.length >= 1 && value.length <= 100)
  );
}

export function parseGameDetectionAnnouncementV1(
  value: unknown,
): GameDetectionAnnouncementV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "channelId",
      "channelName",
      "confidence",
      "detectedAt",
      "detectionId",
      "gameId",
      "gameName",
      "guildId",
      "guildName",
      "previousGameId",
      "rollCount",
      "scope",
      "sessionId",
      "sessionLastRollAt",
      "sessionStartedAt",
      "version",
    ]) ||
    value.version !== 1 ||
    typeof value.detectionId !== "string" ||
    !DETECTION_ID.test(value.detectionId) ||
    typeof value.sessionId !== "string" ||
    !SNOWFLAKE.test(value.sessionId) ||
    !value.detectionId.startsWith(`${value.sessionId}:`) ||
    (value.scope !== "guild" && value.scope !== "dm") ||
    typeof value.channelId !== "string" ||
    !SNOWFLAKE.test(value.channelId) ||
    (value.guildId !== null &&
      (typeof value.guildId !== "string" || !SNOWFLAKE.test(value.guildId))) ||
    (value.scope === "guild" && value.guildId === null) ||
    (value.scope === "dm" && value.guildId !== null) ||
    !nullableName(value.guildName) ||
    !nullableName(value.channelName) ||
    (value.scope === "guild" && value.guildName === null) ||
    typeof value.gameId !== "string" ||
    value.gameId.length > 100 ||
    !GAME_ID.test(value.gameId) ||
    (value.previousGameId !== null &&
      (typeof value.previousGameId !== "string" ||
        value.previousGameId.length > 100 ||
        !GAME_ID.test(value.previousGameId))) ||
    value.previousGameId === value.gameId ||
    typeof value.gameName !== "string" ||
    value.gameName.length < 1 ||
    value.gameName.length > 100 ||
    typeof value.confidence !== "string" ||
    !CONFIDENCE.has(value.confidence) ||
    typeof value.detectedAt !== "number" ||
    !Number.isSafeInteger(value.detectedAt) ||
    value.detectedAt < 0 ||
    typeof value.rollCount !== "number" ||
    !Number.isSafeInteger(value.rollCount) ||
    value.rollCount < 1 ||
    typeof value.sessionStartedAt !== "number" ||
    !Number.isSafeInteger(value.sessionStartedAt) ||
    value.sessionStartedAt < 0 ||
    typeof value.sessionLastRollAt !== "number" ||
    !Number.isSafeInteger(value.sessionLastRollAt) ||
    value.sessionLastRollAt < value.sessionStartedAt ||
    value.detectedAt < value.sessionStartedAt
  ) {
    throw new Error("Game-detection announcement is invalid");
  }

  return value as unknown as GameDetectionAnnouncementV1;
}
