import { customFetch } from "@/lib/api";
import type { Channel, Guild, RollerGuild } from "@/types/guild";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;

export const MUTUAL_GUILDS_QUERY_KEY = ["guilds"] as const;
export const ROLLER_GUILDS_QUERY_KEY = ["guilds", "roller"] as const;

export function guildChannelsQueryKey(guildId: string) {
  return ["channels", guildId] as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]);
}

function parseGuild(
  value: unknown,
  expectedKeys: readonly string[],
): Guild {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    !isRecord(value.guilds) ||
    !hasExactKeys(value.guilds, ["icon", "id", "name"]) ||
    typeof value.guilds.id !== "string" ||
    !SNOWFLAKE.test(value.guilds.id) ||
    typeof value.guilds.name !== "string" ||
    value.guilds.name.length < 1 ||
    value.guilds.name.length > 255 ||
    (value.guilds.icon !== null && typeof value.guilds.icon !== "string") ||
    typeof value.isAdmin !== "boolean" ||
    typeof value.isDiceWitchAdmin !== "boolean"
  ) {
    throw new Error("Guild response is invalid");
  }
  return {
    guilds: {
      id: value.guilds.id,
      name: value.guilds.name,
      icon: value.guilds.icon,
    },
    isAdmin: value.isAdmin,
    isDiceWitchAdmin: value.isDiceWitchAdmin,
  };
}

function parseMutualGuild(value: unknown): Guild {
  return parseGuild(value, ["guilds", "isAdmin", "isDiceWitchAdmin"]);
}

function parseRollerGuild(value: unknown): RollerGuild {
  const guild = parseGuild(value, [
    "guilds",
    "isAdmin",
    "isDiceWitchAdmin",
    "isRollable",
  ]);
  if (!isRecord(value) || typeof value.isRollable !== "boolean") {
    throw new Error("Guild response is invalid");
  }
  return { ...guild, isRollable: value.isRollable };
}

function parseGuildEnvelope<Value>(
  value: unknown,
  parseGuildValue: (guild: unknown) => Value,
): Value[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["guilds"]) ||
    !Array.isArray(value.guilds) ||
    value.guilds.length > 250
  ) {
    throw new Error("Guild response is invalid");
  }
  return value.guilds.map(parseGuildValue);
}

export function parseMutualGuilds(value: unknown): Guild[] {
  return parseGuildEnvelope(value, parseMutualGuild);
}

export function parseRollerGuilds(value: unknown): RollerGuild[] {
  return parseGuildEnvelope(value, parseRollerGuild);
}

export function parseGuildChannels(value: unknown): Channel[] {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["channels"]) ||
    !Array.isArray(value.channels)
  ) {
    throw new Error("Guild channels response is invalid");
  }
  return value.channels.map((channel) => {
    if (
      !isRecord(channel) ||
      !hasExactKeys(channel, ["id", "name", "type"]) ||
      typeof channel.id !== "string" ||
      !SNOWFLAKE.test(channel.id) ||
      typeof channel.name !== "string" ||
      (channel.type !== 0 && channel.type !== 5)
    ) {
      throw new Error("Guild channels response is invalid");
    }
    return { id: channel.id, name: channel.name, type: channel.type };
  });
}

async function responseJson(
  response: Response,
  message: string,
): Promise<unknown> {
  if (!response.ok) throw new Error(message);
  try {
    return await response.json();
  } catch {
    throw new Error(message);
  }
}

export async function listMutualGuilds(): Promise<Guild[]> {
  const response = await customFetch("/api/guilds/mutual");
  return parseMutualGuilds(
    await responseJson(response, "Guilds are unavailable"),
  );
}

export async function listRollerGuilds(): Promise<RollerGuild[]> {
  const response = await customFetch("/api/guilds/mutual?view=roller");
  return parseRollerGuilds(
    await responseJson(response, "Roller guilds are unavailable"),
  );
}

export async function listGuildChannels(guildId: string): Promise<Channel[]> {
  const response = await customFetch(`/api/guilds/${guildId}/channels`);
  return parseGuildChannels(
    await responseJson(response, "Guild channels are unavailable"),
  );
}
