import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const USAGE =
  "Usage: node tools/verify-audience-snapshot.mjs --config <wrangler-config> --max-age-ms <milliseconds>";

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === undefined || value === undefined || !name.startsWith("--")) {
      throw new Error(USAGE);
    }
    values.set(name.slice(2), value);
  }
  const config = values.get("config");
  const maxAge = values.get("max-age-ms");
  if (config === undefined || maxAge === undefined) throw new Error(USAGE);
  return { config, maxAgeMs: positiveInteger(maxAge, "max-age-ms") };
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

const NonNegativeIntegerSchema = z.number().int().nonnegative();
const AudienceSnapshotRowSchema = z.object({
  version: z.literal(1),
  captured_at: NonNegativeIntegerSchema,
  live_guilds: NonNegativeIntegerSchema,
  estimated_guild_memberships: NonNegativeIntegerSchema,
  known_dice_witch_users: NonNegativeIntegerSchema,
  shard_count: z.number().int().positive(),
  guild_counts_by_shard_json: z.string(),
});

export function validateAudienceSnapshotRows(rows, now, maxAgeMs) {
  const parsedRows = z.array(AudienceSnapshotRowSchema).length(1).safeParse(rows);
  if (
    !parsedRows.success ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs < 1
  ) {
    throw new Error("Audience snapshot gate failed");
  }
  const [row] = parsedRows.data;
  if (
    row === undefined ||
    row.captured_at > now ||
    now - row.captured_at > maxAgeMs
  ) {
    throw new Error("Audience snapshot gate failed");
  }
  let guildCounts;
  try {
    guildCounts = JSON.parse(row.guild_counts_by_shard_json);
  } catch {
    throw new Error("Audience snapshot gate failed");
  }
  if (
    !Array.isArray(guildCounts) ||
    guildCounts.length !== row.shard_count ||
    !guildCounts.every(nonNegativeInteger)
  ) {
    throw new Error("Audience snapshot gate failed");
  }
  const guildTotal = guildCounts.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(guildTotal) || guildTotal !== row.live_guilds) {
    throw new Error("Audience snapshot gate failed");
  }
  return {
    version: row.version,
    capturedAt: row.captured_at,
    liveGuilds: row.live_guilds,
    estimatedGuildMemberships: row.estimated_guild_memberships,
    knownDiceWitchUsers: row.known_dice_witch_users,
    shardCount: row.shard_count,
    guildCountsByShard: guildCounts,
  };
}

async function main(argv) {
  const { config, maxAgeMs } = parseArguments(argv);
  const sql = `SELECT version, captured_at, live_guilds,
    estimated_guild_memberships, known_dice_witch_users,
    shard_count, guild_counts_by_shard_json
    FROM discord_audience_snapshot WHERE singleton = 1`;
  const { stdout } = await execFileAsync(
    "npx",
    [
      "--no-install",
      "wrangler",
      "d1",
      "execute",
      "DATA",
      "--remote",
      "--config",
      config,
      "--json",
      "--command",
      sql,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const result = JSON.parse(stdout);
  const rows = result?.[0]?.results;
  const snapshot = validateAudienceSnapshotRows(rows, Date.now(), maxAgeMs);
  console.log(JSON.stringify({ status: "ready", snapshot }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : "Audience snapshot gate failed");
    process.exitCode = 1;
  });
}
