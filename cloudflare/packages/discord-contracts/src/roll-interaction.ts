import { z } from "zod";
import {
  MAX_NOTATION_LENGTH,
  MAX_REPETITIONS,
} from "../../roll-domain/src/constants";
import {
  boundaryObjectSchema,
  type BoundaryObject,
  boundedNameSchema,
  exactEnumSchema,
  interactionTokenSchema,
  type SchemaInput,
  snowflakeSchema,
  strictObjectSchema,
} from "./schema-primitives";

const MAX_TITLE_LENGTH = 256;

export type RollInteractionScope = {
  applicationId: string;
  guildId?: string;
};

export const DISCORD_ROLL_CHANNEL_TYPES = [
  0, 2, 5, 10, 11, 12, 13, 15, 16,
] as const;

const DiscordRollChannelTypeSchema = z.union([
  z.literal(0),
  z.literal(2),
  z.literal(5),
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
  z.literal(15),
  z.literal(16),
]);

export type DiscordRollChannelType = z.infer<
  typeof DiscordRollChannelTypeSchema
>;

export function isDiscordRollChannelType(
  value: SchemaInput,
): value is DiscordRollChannelType {
  return DiscordRollChannelTypeSchema.safeParse(value).success;
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

const InteractionUserSchema = z.looseObject({
  username: boundedNameSchema(1, 32),
});
const DmRollLoggingContextSchema = strictObjectSchema({
  kind: z.literal("dm"),
  channelId: z.string(),
});
const GuildRollLoggingContextSchema = strictObjectSchema({
  kind: z.literal("guild"),
  guildId: z.string(),
  guildName: z.nullable(boundedNameSchema(2, 100)),
  channelId: z.string(),
  channelName: z.nullable(boundedNameSchema(1, 100)),
  channelType: z.nullable(DiscordRollChannelTypeSchema),
});
const RollLoggingContextSchema = z.discriminatedUnion("kind", [
  DmRollLoggingContextSchema,
  GuildRollLoggingContextSchema,
]);
const RollOptionSchema = z.looseObject({
  name: exactEnumSchema(["notation", "title", "times"]),
  type: z.literal(3),
  value: z.string(),
});
const RollOptionsSchema = z.array(z.unknown());

function requireSnowflake(value: SchemaInput, name: string): string {
  const result = snowflakeSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`${name} must be a Discord Snowflake`);
  }
  return result.data;
}

function parseUser(interaction: BoundaryObject) {
  const member = boundaryObjectSchema.safeParse(interaction.member);
  const memberUser = member.success
    ? boundaryObjectSchema.safeParse(member.data.user)
    : null;
  const userValue = memberUser?.success
    ? memberUser.data
    : interaction.user;
  const user = InteractionUserSchema.safeParse(userValue);
  if (!user.success) {
    throw new Error("Interaction user is invalid");
  }
  return {
    id: requireSnowflake(user.data.id, "Interaction user id"),
    username: user.data.username,
  };
}

function optionalDisplayName(
  value: SchemaInput,
  minimumLength: number,
): string | null {
  const result = boundedNameSchema(minimumLength, 100).safeParse(value);
  return result.success ? result.data : null;
}

export function parseRollLoggingContext(
  value: SchemaInput,
  guildId: string | null,
  channelId: string,
): RollLoggingContext {
  const result = RollLoggingContextSchema.safeParse(value);
  if (!result.success || result.data.channelId !== channelId) {
    throw new Error("Roll logging context is invalid");
  }
  if (result.data.kind === "dm") {
    if (guildId !== null) {
      throw new Error("Roll logging context is invalid");
    }
    return { kind: "dm", channelId };
  }
  if (guildId === null || result.data.guildId !== guildId) {
    throw new Error("Roll logging context is invalid");
  }
  return {
    kind: "guild",
    guildId,
    guildName: result.data.guildName,
    channelId,
    channelName: result.data.channelName,
    channelType: result.data.channelType,
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
  interaction: BoundaryObject,
  guildId: string | null,
): RollInteractionContextMissingReason[] {
  if (guildId === null) return [];

  const reasons: RollInteractionContextMissingReason[] = [];
  const guild = boundaryObjectSchema.safeParse(interaction.guild);
  if (!guild.success) reasons.push("guild-object-missing");
  else if (optionalDisplayName(guild.data.name, 2) === null) {
    reasons.push("guild-name-missing");
  }

  const channel = boundaryObjectSchema.safeParse(interaction.channel);
  if (!channel.success) reasons.push("channel-object-missing");
  else {
    if (optionalDisplayName(channel.data.name, 1) === null) {
      reasons.push("channel-name-missing");
    }
    if (!isDiscordRollChannelType(channel.data.type)) {
      reasons.push("channel-type-missing");
    }
  }
  return reasons;
}

export function extractRollLoggingContext(
  interaction: BoundaryObject,
  guildId: string | null,
  channelId: string,
): RollLoggingContext {
  const channelResult = boundaryObjectSchema.safeParse(interaction.channel);
  const channel = channelResult.success ? channelResult.data : null;
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

  const guildResult = boundaryObjectSchema.safeParse(interaction.guild);
  const guild = guildResult.success ? guildResult.data : null;
  if (
    (guild !== null &&
      requireSnowflake(guild.id, "Interaction guild id") !== guildId) ||
    (channel?.guild_id !== undefined && channel.guild_id !== guildId)
  ) {
    throw new Error("Interaction guild channel identity is invalid");
  }
  const channelType = DiscordRollChannelTypeSchema.safeParse(channel?.type);
  return {
    kind: "guild",
    guildId,
    guildName: optionalDisplayName(guild?.name, 2),
    channelId,
    channelName: optionalDisplayName(channel?.name, 1),
    channelType: channelType.success ? channelType.data : null,
  };
}

function parseOptions(value: SchemaInput): Map<string, string> {
  const result = RollOptionsSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Roll interaction options are invalid");
  }
  const options = new Map<string, string>();
  for (const optionValue of result.data) {
    const option = RollOptionSchema.safeParse(optionValue);
    if (!option.success || options.has(option.data.name)) {
      throw new Error("Roll interaction option is invalid");
    }
    options.set(option.data.name, option.data.value);
  }
  return options;
}

function parseRepetitions(value: string | undefined): number {
  if (value === undefined) return 1;
  if (!/^[1-9][0-9]*$/u.test(value)) {
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
  value: SchemaInput,
  scope: RollInteractionScope,
): RollInteraction | null {
  const interaction = boundaryObjectSchema.safeParse(value);
  if (!interaction.success) throw new Error("Interaction must be an object");

  const applicationId = requireSnowflake(
    interaction.data.application_id,
    "Interaction application_id",
  );
  const guildId = interaction.data.guild_id === undefined
    ? null
    : requireSnowflake(interaction.data.guild_id, "Interaction guild_id");
  if (
    applicationId !== scope.applicationId ||
    (scope.guildId !== undefined &&
      guildId !== null &&
      guildId !== scope.guildId) ||
    interaction.data.type !== 2
  ) {
    return null;
  }

  const command = boundaryObjectSchema.safeParse(interaction.data.data);
  if (!command.success) {
    throw new Error("Application command data is invalid");
  }
  if (command.data.name !== "roll" || command.data.type !== 1) return null;

  const token = interactionTokenSchema.safeParse(interaction.data.token);
  if (!token.success) {
    throw new Error("Interaction token is invalid");
  }
  const options = parseOptions(command.data.options);
  const rawNotation = options.get("notation")?.trim();
  if (
    rawNotation === undefined ||
    rawNotation.length === 0 ||
    rawNotation.length > MAX_NOTATION_LENGTH
  ) {
    throw new Error("Roll notation is invalid");
  }
  const user = parseUser(interaction.data);
  const channelId = requireSnowflake(
    interaction.data.channel_id,
    "Interaction channel_id",
  );
  return {
    id: requireSnowflake(interaction.data.id, "Interaction id"),
    applicationId,
    guildId,
    channelId,
    loggingContext: extractRollLoggingContext(
      interaction.data,
      guildId,
      channelId,
    ),
    userId: user.id,
    username: user.username,
    token: token.data,
    notation: rawNotation,
    title: parseTitle(options.get("title")),
    repetitions: parseRepetitions(options.get("times")),
    ephemeral: true,
  };
}
