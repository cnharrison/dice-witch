import { z } from "zod";
import {
  nonNegativeSafeIntegerSchema,
  type SchemaInput,
  strictObjectSchema,
  timestampSchema,
} from "./schema-primitives";

export const DISCORD_AUDIENCE_SNAPSHOT_VERSION = 1;
export const DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1_000;

const captureFields = {
  version: z.literal(DISCORD_AUDIENCE_SNAPSHOT_VERSION),
  capturedAt: timestampSchema,
  liveGuilds: nonNegativeSafeIntegerSchema,
  estimatedGuildMemberships: nonNegativeSafeIntegerSchema,
  shardCount: nonNegativeSafeIntegerSchema.min(1),
  guildCountsByShard: z.array(nonNegativeSafeIntegerSchema),
};

function shardCountsAreValid(
  guildCountsByShard: readonly number[],
  shardCount: number,
  liveGuilds: number,
): boolean {
  if (guildCountsByShard.length !== shardCount) return false;
  let sum = 0;
  for (const count of guildCountsByShard) {
    sum += count;
    if (!Number.isSafeInteger(sum)) return false;
  }
  return sum === liveGuilds;
}

const DiscordAudienceCaptureV1Schema = strictObjectSchema(captureFields).refine(
  ({ guildCountsByShard, shardCount, liveGuilds }) =>
    shardCountsAreValid(guildCountsByShard, shardCount, liveGuilds),
);
const DiscordAudienceSnapshotV1Schema = strictObjectSchema({
  ...captureFields,
  knownDiceWitchUsers: nonNegativeSafeIntegerSchema,
}).refine(({ guildCountsByShard, shardCount, liveGuilds }) =>
  shardCountsAreValid(guildCountsByShard, shardCount, liveGuilds)
);
const DiscordAudienceSnapshotBoundarySchema = z.looseObject({
  knownDiceWitchUsers: z.unknown(),
});

export type DiscordAudienceCaptureV1 = z.infer<
  typeof DiscordAudienceCaptureV1Schema
>;
export type DiscordAudienceSnapshotV1 = z.infer<
  typeof DiscordAudienceSnapshotV1Schema
>;

export function parseDiscordAudienceCaptureV1(
  value: SchemaInput,
): DiscordAudienceCaptureV1 {
  const result = DiscordAudienceCaptureV1Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Discord audience capture is invalid");
  }
  return result.data;
}

export function parseDiscordAudienceSnapshotV1(
  value: SchemaInput,
): DiscordAudienceSnapshotV1 {
  const boundary = DiscordAudienceSnapshotBoundarySchema.safeParse(value);
  if (
    !boundary.success ||
    !nonNegativeSafeIntegerSchema.safeParse(
      boundary.data.knownDiceWitchUsers,
    ).success
  ) {
    throw new Error("Discord audience snapshot is invalid");
  }
  const result = DiscordAudienceSnapshotV1Schema.safeParse(value);
  if (!result.success) {
    throw new Error("Discord audience capture is invalid");
  }
  return result.data;
}
