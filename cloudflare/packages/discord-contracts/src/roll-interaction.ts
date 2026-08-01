import {
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
} from "../../roll-domain/src/constants";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const INTERACTION_TOKEN = /^[A-Za-z0-9._-]{1,512}$/;
const MAX_TITLE_LENGTH = 256;

export type RollInteractionScope = {
  applicationId: string;
  guildId?: string;
};

export const DISCORD_ROLL_CHANNEL_TYPES = [
  0, 2, 5, 10, 11, 12, 13, 15, 16,
] as const;

export type DiscordRollChannelType =
  (typeof DISCORD_ROLL_CHANNEL_TYPES)[number];

export function isDiscordRollChannelType(
  value: unknown,
): value is DiscordRollChannelType {
  return (
    typeof value === "number" &&
    DISCORD_ROLL_CHANNEL_TYPES.some((channelType) => channelType === value)
  );
}

export type GuildRollLoggingContext = {
  kind: "guild";
  guildId: string;
  guildName: string | null;
  channelId: string;
  channelName: string | null;
  channelType: DiscordRollChannelType | null;
};

export type RollLoggingContext =
  | { kind: "dm"; channelId: string }
  | GuildRollLoggingContext;

export type RollInteractionContextMissingReason =
  | "guild-object-missing"
  | "guild-name-missing"
  | "channel-object-missing"
  | "channel-name-missing"
  | "channel-type-missing";

export type RollInteraction = {
  id: string;
  applicationId: string;
  guildId: string | null;
  channelId: string;
  loggingContext: RollLoggingContext | null;
  userId: string;
  username: string;
  token: string;
  notation: string;
  title: string | null;
  repetitions: number;
  ephemeral: true;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireSnowflake(value: unknown, name: string): string {
  if (typeof value !== "string" || !SNOWFLAKE.test(value)) {
    throw new Error(`${name} must be a Discord Snowflake`);
  }
  return value;
}

function parseUser(interaction: Record<string, unknown>): {
  id: string;
  username: string;
} {
  const member = interaction.member;
  const user =
    isRecord(member) && isRecord(member.user)
      ? member.user
      : interaction.user;
  if (
    !isRecord(user) ||
    typeof user.username !== "string" ||
    user.username.length === 0 ||
    user.username.length > 32
  ) {
    throw new Error("Interaction user is invalid");
  }
  return {
    id: requireSnowflake(user.id, "Interaction user id"),
    username: user.username,
  };
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

function optionalDisplayName(
  value: unknown,
  minimumLength: number,
): string | null {
  return typeof value === "string" &&
      value.length >= minimumLength &&
      value.length <= 100
    ? value
    : null;
}

function isNullableDisplayName(
  value: unknown,
  minimumLength: number,
): value is string | null {
  return value === null || optionalDisplayName(value, minimumLength) !== null;
}

export function parseRollLoggingContext(
  value: unknown,
  guildId: string | null,
  channelId: string,
): RollLoggingContext {
  if (!isRecord(value) || value.channelId !== channelId) {
    throw new Error("Roll logging context is invalid");
  }
  if (
    value.kind === "dm" &&
    guildId === null &&
    hasExactKeys(value, ["channelId", "kind"])
  ) {
    return { kind: "dm", channelId };
  }
  if (
    value.kind !== "guild" ||
    guildId === null ||
    value.guildId !== guildId ||
    !hasExactKeys(value, [
      "channelId",
      "channelName",
      "channelType",
      "guildId",
      "guildName",
      "kind",
    ])
  ) {
    throw new Error("Roll logging context is invalid");
  }
  const { guildName, channelName, channelType } = value;
  if (
    !isNullableDisplayName(guildName, 2) ||
    !isNullableDisplayName(channelName, 1) ||
    (channelType !== null && !isDiscordRollChannelType(channelType))
  ) {
    throw new Error("Roll logging context is invalid");
  }
  return {
    kind: "guild",
    guildId,
    guildName,
    channelId,
    channelName,
    channelType,
  };
}

export function isCompleteGuildRollLoggingContext(
  context: RollLoggingContext | null | undefined,
): context is GuildRollLoggingContext & {
  guildName: string;
  channelName: string;
  channelType: DiscordRollChannelType;
} {
  return context?.kind === "guild" &&
    context.guildName !== null &&
    context.channelName !== null &&
    context.channelType !== null;
}

export function rollInteractionContextMissingReasons(
  interaction: Record<string, unknown>,
  guildId: string | null,
): RollInteractionContextMissingReason[] {
  if (guildId === null) return [];

  const reasons: RollInteractionContextMissingReason[] = [];
  const guild = isRecord(interaction.guild) ? interaction.guild : null;
  if (guild === null) reasons.push("guild-object-missing");
  else if (optionalDisplayName(guild.name, 2) === null) {
    reasons.push("guild-name-missing");
  }

  const channel = isRecord(interaction.channel) ? interaction.channel : null;
  if (channel === null) reasons.push("channel-object-missing");
  else {
    if (optionalDisplayName(channel.name, 1) === null) {
      reasons.push("channel-name-missing");
    }
    if (!isDiscordRollChannelType(channel.type)) {
      reasons.push("channel-type-missing");
    }
  }
  return reasons;
}

export function extractRollLoggingContext(
  interaction: Record<string, unknown>,
  guildId: string | null,
  channelId: string,
): RollLoggingContext {
  const channel = isRecord(interaction.channel) ? interaction.channel : null;
  if (
    channel !== null &&
    requireSnowflake(channel.id, "Interaction channel id") !== channelId
  ) {
    throw new Error("Interaction channel does not match channel_id");
  }
  if (guildId === null) {
    if (channel?.type !== undefined && channel.type !== 1) {
      throw new Error("Interaction DM channel is invalid");
    }
    return { kind: "dm", channelId };
  }

  const guild = isRecord(interaction.guild) ? interaction.guild : null;
  if (
    (guild !== null &&
      requireSnowflake(guild.id, "Interaction guild id") !== guildId) ||
    (channel?.guild_id !== undefined && channel.guild_id !== guildId)
  ) {
    throw new Error("Interaction guild channel identity is invalid");
  }
  return {
    kind: "guild",
    guildId,
    guildName: optionalDisplayName(guild?.name, 2),
    channelId,
    channelName: optionalDisplayName(channel?.name, 1),
    channelType: isDiscordRollChannelType(channel?.type)
      ? channel.type
      : null,
  };
}

function parseOptions(value: unknown): Map<string, string> {
  if (!Array.isArray(value)) {
    throw new Error("Roll interaction options are invalid");
  }
  const options = new Map<string, string>();
  for (const option of value) {
    if (
      !isRecord(option) ||
      typeof option.name !== "string" ||
      option.type !== 3 ||
      typeof option.value !== "string" ||
      !["notation", "title", "times"].includes(option.name) ||
      options.has(option.name)
    ) {
      throw new Error("Roll interaction option is invalid");
    }
    options.set(option.name, option.value);
  }
  return options;
}

function parseRepetitions(value: string | undefined): number {
  if (value === undefined) return 1;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("Roll repetitions are invalid");
  }
  const repetitions = Number(value);
  if (!Number.isSafeInteger(repetitions) || repetitions > MAX_REPETITIONS) {
    throw new Error("Roll repetitions are invalid");
  }
  return repetitions;
}

function parseTitle(value: string | undefined): string | null {
  if (value === undefined) return null;
  const title = value.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    throw new Error("Roll title is invalid");
  }
  return title;
}

export function parseRollInteraction(
  value: unknown,
  scope: RollInteractionScope,
): RollInteraction | null {
  if (!isRecord(value)) throw new Error("Interaction must be an object");
  const applicationId = requireSnowflake(
    value.application_id,
    "Interaction application_id",
  );
  const guildId =
    value.guild_id === undefined
      ? null
      : requireSnowflake(value.guild_id, "Interaction guild_id");
  if (
    applicationId !== scope.applicationId ||
    (scope.guildId !== undefined &&
      guildId !== null &&
      guildId !== scope.guildId) ||
    value.type !== 2
  ) {
    return null;
  }
  if (!isRecord(value.data)) {
    throw new Error("Application command data is invalid");
  }
  if (value.data.name !== "roll" || value.data.type !== 1) return null;

  const token = value.token;
  if (typeof token !== "string" || !INTERACTION_TOKEN.test(token)) {
    throw new Error("Interaction token is invalid");
  }
  const options = parseOptions(value.data.options);
  const rawNotation = options.get("notation")?.trim();
  if (
    rawNotation === undefined ||
    rawNotation.length === 0 ||
    rawNotation.length > MAX_NOTATION_LENGTH
  ) {
    throw new Error("Roll notation is invalid");
  }
  const user = parseUser(value);
  const channelId = requireSnowflake(
    value.channel_id,
    "Interaction channel_id",
  );
  return {
    id: requireSnowflake(value.id, "Interaction id"),
    applicationId,
    guildId,
    channelId,
    loggingContext: extractRollLoggingContext(value, guildId, channelId),
    userId: user.id,
    username: user.username,
    token,
    notation: rawNotation,
    title: parseTitle(options.get("title")),
    repetitions: parseRepetitions(options.get("times")),
    ephemeral: true,
  };
}
