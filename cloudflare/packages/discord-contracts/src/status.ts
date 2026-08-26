import { z } from "zod";
import {
  DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS,
  parseDiscordAudienceSnapshotV1,
  type DiscordAudienceSnapshotV1,
} from "./audience-snapshot";
import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";
import {
  boundaryObjectSchema,
  interactionTokenSchema,
  positiveSafeIntegerSchema,
  safeIntegerSchema,
  type SchemaInput,
  snowflakeSchema,
} from "./schema-primitives";

const DISCORD_EPOCH_MS = 1_420_070_400_000n;
const STATUS_COLOR = 0x99_99_99;

const StatusCommandInteractionSchema = z.strictObject({
  createdAt: safeIntegerSchema,
});
const statusShardFields = {
  id: safeIntegerSchema,
  state: z.string(),
  ping: safeIntegerSchema,
};
const StatusShardSchema = z.strictObject(statusShardFields);
const StatusShardBoundarySchema = z.looseObject(statusShardFields);
const StatusShardCountSchema = positiveSafeIntegerSchema;
const StatusGatewaySnapshotSchema = z.strictObject({
  phase: z.string(),
  shardCount: StatusShardCountSchema,
  shards: z.array(StatusShardSchema),
});
const StatusGatewayEnvelopeSchema = StatusGatewaySnapshotSchema.pick({
  shardCount: true,
}).extend({ shards: z.array(z.unknown()) }).loose();
const StatusInteractionIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  token: interactionTokenSchema,
  data: z.looseObject({ type: z.literal(1) }),
});
const EmptyOptionsSchema = z.tuple([]);

export type StatusCommandInteraction = z.infer<
  typeof StatusCommandInteractionSchema
>;
export type StatusGatewaySnapshot = z.infer<
  typeof StatusGatewaySnapshotSchema
>;
export type StatusDiscordStats = DiscordAudienceSnapshotV1;

export function parseStatusCommandInteraction(
  value: SchemaInput,
  applicationId: string,
  allowedGuildId?: string,
): StatusCommandInteraction | null {
  const interaction = boundaryObjectSchema.safeParse(value);
  if (!interaction.success) throw new Error("Interaction must be an object");
  if (
    interaction.data.application_id !== applicationId ||
    interaction.data.type !== 2
  ) {
    return null;
  }

  const guildId = interaction.data.guild_id;
  if (guildId !== undefined) {
    const guild = snowflakeSchema.safeParse(guildId);
    if (
      !guild.success ||
      (allowedGuildId !== undefined && guild.data !== allowedGuildId)
    ) {
      return null;
    }
  }

  const identity = StatusInteractionIdentitySchema.safeParse(interaction.data);
  if (!identity.success) throw new Error("Status interaction is invalid");
  if (identity.data.data.name !== "status") return null;
  if (
    identity.data.data.options !== undefined &&
    !EmptyOptionsSchema.safeParse(identity.data.data.options).success
  ) {
    throw new Error("Status options are invalid");
  }
  const result = StatusCommandInteractionSchema.safeParse({
    createdAt: Number((BigInt(identity.data.id) >> 22n) + DISCORD_EPOCH_MS),
  });
  if (!result.success) throw new Error("Status interaction is invalid");
  return result.data;
}

function shardStatusName(state: string, guildCount: number): string {
  if (guildCount > 0 || state === "ready") return "Online";
  if (
    state === "connecting" ||
    state === "awaiting-hello" ||
    state === "awaiting-identify-permit" ||
    state === "identifying" ||
    state === "resuming"
  ) {
    return "Connecting";
  }
  return state === "running" ? "Running" : "Offline";
}

function shardStatusEmoji(status: string): string {
  if (status === "Online") return "🟢";
  if (status === "Connecting" || status === "Running") return "🟡";
  return "🔴";
}

export function buildStatusCommandResponse(
  interaction: StatusCommandInteraction,
  gateway: StatusGatewaySnapshot,
  stats: SchemaInput,
  links: DiscordFooterLinks,
  now = Date.now(),
) {
  let snapshot: DiscordAudienceSnapshotV1;
  try {
    snapshot = parseDiscordAudienceSnapshotV1(stats);
  } catch {
    throw new Error("Status response input is invalid");
  }
  const gatewayEnvelope = StatusGatewayEnvelopeSchema.safeParse(gateway);
  if (
    !safeIntegerSchema.safeParse(now).success ||
    now < interaction.createdAt ||
    snapshot.capturedAt > now ||
    now - snapshot.capturedAt > DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS ||
    !gatewayEnvelope.success ||
    gatewayEnvelope.data.shards.length !== gatewayEnvelope.data.shardCount ||
    snapshot.shardCount !== gatewayEnvelope.data.shardCount
  ) {
    throw new Error("Status response input is invalid");
  }
  let shardStatusText = "\n\n__Shard Status:__\n";
  for (let index = 0; index < gateway.shards.length; index += 1) {
    const shard = StatusShardBoundarySchema.safeParse(gateway.shards[index]);
    const guildCount = snapshot.guildCountsByShard[index];
    if (!shard.success || shard.data.id !== index || guildCount === undefined) {
      throw new Error("Status shard input is invalid");
    }
    const status = shardStatusName(shard.data.state, guildCount);
    const emoji = shardStatusEmoji(status);
    const ping = shard.data.ping >= 0 ? `${shard.data.ping}ms` : "unknown";
    shardStatusText += `${emoji} Shard ${shard.data.id}: ${status} (${guildCount} servers, ${ping})\n`;
  }
  return {
    type: 4,
    data: {
      flags: 1 << 15,
      components: [
        {
          type: 17,
          accent_color: STATUS_COLOR,
          components: [
            {
              type: 10,
              content: `## Status\nLatency: **${now - interaction.createdAt}ms**\nI'm in **${snapshot.liveGuilds}** discord servers with **${snapshot.knownDiceWitchUsers}** users 😈${shardStatusText}`,
            },
            ...buildFooterComponents(links),
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    },
  };
}

export function buildStatusUnavailableResponse(
  links: DiscordFooterLinks,
) {
  return {
    type: 4,
    data: {
      flags: 1 << 15,
      components: [
        {
          type: 17,
          accent_color: 0xff_00_00,
          components: [
            {
              type: 10,
              content: "## Error\nFailed to fetch status information",
            },
            ...buildFooterComponents(links),
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    },
  };
}
