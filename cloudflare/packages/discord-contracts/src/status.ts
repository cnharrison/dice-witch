import {
  DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS,
  parseDiscordAudienceSnapshotV1,
  type DiscordAudienceSnapshotV1,
} from "./audience-snapshot";
import {
  buildFooterComponents,
  type DiscordFooterLinks,
} from "./footer-links";

const DISCORD_EPOCH_MS = 1_420_070_400_000n;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const STATUS_COLOR = 0x99_99_99;

export type StatusCommandInteraction = {
  createdAt: number;
};

export type StatusGatewaySnapshot = {
  phase: string;
  shardCount: number;
  shards: Array<{ id: number; state: string; ping: number }>;
};

export type StatusDiscordStats = DiscordAudienceSnapshotV1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStatusCommandInteraction(
  value: unknown,
  applicationId: string,
  allowedGuildId?: string,
): StatusCommandInteraction | null {
  if (!isRecord(value)) throw new Error("Interaction must be an object");
  if (value.application_id !== applicationId || value.type !== 2) return null;
  const guildId = value.guild_id;
  if (
    (guildId !== undefined &&
      (typeof guildId !== "string" || !SNOWFLAKE.test(guildId))) ||
    (allowedGuildId !== undefined &&
      guildId !== undefined &&
      guildId !== allowedGuildId)
  ) {
    return null;
  }
  if (
    typeof value.id !== "string" ||
    !SNOWFLAKE.test(value.id) ||
    typeof value.token !== "string" ||
    !INTERACTION_TOKEN.test(value.token) ||
    !isRecord(value.data) ||
    value.data.type !== 1
  ) {
    throw new Error("Status interaction is invalid");
  }
  if (value.data.name !== "status") return null;
  if (
    value.data.options !== undefined &&
    (!Array.isArray(value.data.options) || value.data.options.length !== 0)
  ) {
    throw new Error("Status options are invalid");
  }
  return {
    createdAt: Number((BigInt(value.id) >> 22n) + DISCORD_EPOCH_MS),
  };
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
  stats: unknown,
  links: DiscordFooterLinks,
  now = Date.now(),
): Record<string, unknown> {
  let snapshot: DiscordAudienceSnapshotV1;
  try {
    snapshot = parseDiscordAudienceSnapshotV1(stats);
  } catch {
    throw new Error("Status response input is invalid");
  }
  if (
    !Number.isSafeInteger(now) ||
    now < interaction.createdAt ||
    snapshot.capturedAt > now ||
    now - snapshot.capturedAt > DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS ||
    !Number.isSafeInteger(gateway.shardCount) ||
    gateway.shardCount < 1 ||
    gateway.shards.length !== gateway.shardCount ||
    snapshot.shardCount !== gateway.shardCount
  ) {
    throw new Error("Status response input is invalid");
  }
  let shardStatusText = "\n\n__Shard Status:__\n";
  for (let index = 0; index < gateway.shards.length; index += 1) {
    const shard = gateway.shards[index];
    const guildCount = snapshot.guildCountsByShard[index];
    if (
      shard === undefined ||
      shard.id !== index ||
      guildCount === undefined ||
      !Number.isSafeInteger(guildCount) ||
      guildCount < 0 ||
      typeof shard.state !== "string" ||
      !Number.isSafeInteger(shard.ping)
    ) {
      throw new Error("Status shard input is invalid");
    }
    const status = shardStatusName(shard.state, guildCount);
    const emoji = shardStatusEmoji(status);
    const ping = shard.ping >= 0 ? `${shard.ping}ms` : "unknown";
    shardStatusText += `${emoji} Shard ${shard.id}: ${status} (${guildCount} servers, ${ping})\n`;
  }
  return {
    type: 4,
    data: {
      embeds: [
        {
          color: STATUS_COLOR,
          title: "Status",
          description: `Latency: **${now - interaction.createdAt}ms**\nI'm in **${snapshot.liveGuilds}** discord servers with **${snapshot.knownDiceWitchUsers}** users 😈${shardStatusText}`,
        },
      ],
      components: buildFooterComponents(links),
      allowed_mentions: { parse: [] },
    },
  };
}

export function buildStatusUnavailableResponse(
  links: DiscordFooterLinks,
): Record<string, unknown> {
  return {
    type: 4,
    data: {
      embeds: [
        {
          color: 0xff_00_00,
          title: "Error",
          description: "Failed to fetch status information",
        },
      ],
      components: buildFooterComponents(links),
      allowed_mentions: { parse: [] },
    },
  };
}
