export const DISCORD_AUDIENCE_SNAPSHOT_VERSION = 1;
export const DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1_000;

export type DiscordAudienceCaptureV1 = {
  version: 1;
  capturedAt: number;
  liveGuilds: number;
  estimatedGuildMemberships: number;
  shardCount: number;
  guildCountsByShard: number[];
};

export type DiscordAudienceSnapshotV1 = DiscordAudienceCaptureV1 & {
  knownDiceWitchUsers: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return JSON.stringify(actual) === JSON.stringify(sortedExpected);
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validShardCounts(value: unknown, shardCount: number, total: number): value is number[] {
  if (!Array.isArray(value) || value.length !== shardCount) return false;
  let sum = 0;
  for (const count of value) {
    if (!nonNegativeSafeInteger(count)) return false;
    sum += count;
    if (!Number.isSafeInteger(sum)) return false;
  }
  return sum === total;
}

export function parseDiscordAudienceCaptureV1(
  value: unknown,
): DiscordAudienceCaptureV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "capturedAt",
      "estimatedGuildMemberships",
      "guildCountsByShard",
      "liveGuilds",
      "shardCount",
      "version",
    ]) ||
    value.version !== DISCORD_AUDIENCE_SNAPSHOT_VERSION ||
    !nonNegativeSafeInteger(value.capturedAt) ||
    !nonNegativeSafeInteger(value.liveGuilds) ||
    !nonNegativeSafeInteger(value.estimatedGuildMemberships) ||
    !nonNegativeSafeInteger(value.shardCount) ||
    value.shardCount < 1 ||
    !validShardCounts(
      value.guildCountsByShard,
      value.shardCount,
      value.liveGuilds,
    )
  ) {
    throw new Error("Discord audience capture is invalid");
  }
  return {
    version: DISCORD_AUDIENCE_SNAPSHOT_VERSION,
    capturedAt: value.capturedAt,
    liveGuilds: value.liveGuilds,
    estimatedGuildMemberships: value.estimatedGuildMemberships,
    shardCount: value.shardCount,
    guildCountsByShard: [...value.guildCountsByShard],
  };
}

export function parseDiscordAudienceSnapshotV1(
  value: unknown,
): DiscordAudienceSnapshotV1 {
  if (!isRecord(value) || !nonNegativeSafeInteger(value.knownDiceWitchUsers)) {
    throw new Error("Discord audience snapshot is invalid");
  }
  const { knownDiceWitchUsers, ...capture } = value;
  return {
    ...parseDiscordAudienceCaptureV1(capture),
    knownDiceWitchUsers,
  };
}
