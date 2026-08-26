import { WorkerEntrypoint } from "cloudflare:workers";
import { z } from "zod";
import { readWorkerSecret, type WorkerSecretSource } from "../../../packages/worker-secrets/src";
import {
  buildRollHelperMessage,
  DISCORD_AUDIENCE_SNAPSHOT_VERSION,
  DISCORD_COMPONENTS_V2_FLAG,
  DISCORD_EPHEMERAL_FLAG,
  DISCORD_GLOBAL_COMMANDS,
  isComponentsV2Message,
  isCompleteGuildRollLoggingContext,
  isDiscordRollChannelType,
  parseRollLoggingContext,
  rollLogContextDescription,
  rollLogMetadataDescription,
  rollLogResultDescription,
  parseDiscordChannelContextRequestV1,
  validateDiscordMessage,
  parseDiscordChannelContextResponseV1,
  parseGameDetectionAnnouncementV1,
  parseRollLifecycleAlert,
  rollLogTelemetryContext,
  validateRollLogArtifact,
  type DeliverRollLogInputV1,
  type DeliverRollLogResultV1,
  type DiscordAudienceCaptureV1,
  type DiscordChannelContextResultV1,
  type DiscordComponentsV2Message,
  type DiscordRollChannelType,
  type GameDetectionAnnouncementV1,
  type RollLifecycleAlert,
  type RollLifecycleMessageProbeOutcome,
  type RollLoggingContext,
  type RollLogArtifact,
  type RollLogDisplayContextV1,
  type RollLogShardV1,
} from "../../../packages/discord-contracts/src";
import {
  boundaryObjectSchema,
  type BoundaryObject,
  type SchemaInput,
  safeIntegerSchema,
  snowflakeSchema,
  strictObjectSchema,
} from "../../../packages/discord-contracts/src/schema-primitives";

export type DiscordRestEnv = {
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_TEST_GUILD_ID: string;
  INVITE_LINK: string;
  SUPPORT_SERVER_LINK: string;
  LOG_OUTPUT_CHANNEL_ID: string;
  ROLL_LIFECYCLE_ALERT_CHANNEL_ID: string;
  GAME_DETECTION_CHANNEL_ID: string;
  TOPGG_KEY: string;
  DISCORD_BOT_LIST_KEY: string;
};

export type DiscordRestBindings = Omit<
  DiscordRestEnv,
  "DISCORD_BOT_TOKEN" | "TOPGG_KEY" | "DISCORD_BOT_LIST_KEY"
> & {
  DISCORD_BOT_TOKEN: WorkerSecretSource;
  TOPGG_KEY: WorkerSecretSource;
  DISCORD_BOT_LIST_KEY: WorkerSecretSource;
};

const DISCORD_API = "https://discord.com/api/v10";
const MESSAGE_PROBE_TIMEOUT_MS = 1_000;
const MAX_DISCORD_RESPONSE_BODY_BYTES = 8 * 1_024;
const MAX_ROLL_PNG_BYTES = 10 * 1_024 * 1_024;
const DICE_WITCH_ADMIN_ROLE = "Dice Witch Admin";
const ADMINISTRATOR_PERMISSION = 1n << 3n;
const VIEW_CHANNEL_PERMISSION = 1n << 10n;
const SEND_MESSAGES_PERMISSION = 1n << 11n;
const USE_APPLICATION_COMMANDS_PERMISSION = 1n << 31n;
const POST_CHANNEL_PERMISSIONS =
  VIEW_CHANNEL_PERMISSION | SEND_MESSAGES_PERMISSION;
const INVOKE_DICE_WITCH_PERMISSIONS =
  POST_CHANNEL_PERMISSIONS | USE_APPLICATION_COMMANDS_PERMISSION;
const MAX_GUILDS_PER_STATS_RUN = 100_000;
const MAX_SHARDS_PER_STATS_RUN = 1_000;
const PNG_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/i;
const ROLL_LOG_TITLE = "receivedCommand: /roll";
const INVALID_ROLL_LOG_TITLE = "invalidRoll: /roll";

const DiscordResourceIdentitySchema = z.looseObject({ id: snowflakeSchema });
const DiscordGuildSchema = z.looseObject({
  id: snowflakeSchema,
  name: z.string().min(1),
});
const DiscordGuildOwnerSchema = z.looseObject({ owner_id: snowflakeSchema });
const DiscordChannelIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  guild_id: snowflakeSchema,
  name: z.string().min(1),
  type: safeIntegerSchema,
});
const DiscordErrorSchema = z.looseObject({ code: safeIntegerSchema });
const DiscordBodyStreamSchema = z.custom<ReadableStream<Uint8Array>>(
  (value) => value instanceof ReadableStream,
);
const DiscordErrorFieldsSchema = z.looseObject({ errors: boundaryObjectSchema });
const DiscordRateLimitSchema = z.looseObject({ retry_after: z.number() });
const NonNegativeNumericHeaderSchema = z
  .string()
  .transform(Number)
  .pipe(z.number().nonnegative());
const DiscordGuildMemberSchema = z.looseObject({
  roles: z.array(snowflakeSchema).max(250),
  communication_disabled_until: z.string().nullable().optional(),
});
const DiscordRoleIdentitySchema = z.looseObject({ id: snowflakeSchema });
const DiscordAssignedRoleSchema = z.looseObject({
  id: snowflakeSchema,
  name: z.string().max(100),
  permissions: z.string().max(32).regex(/^(0|[1-9][0-9]*)$/u),
});
const PermissionStringSchema = z.string().max(32).regex(/^(0|[1-9][0-9]*)$/u);
const PermissionOverwriteIdentitySchema = z.looseObject({
  id: snowflakeSchema,
  type: z.union([z.literal(0), z.literal(1)]),
});
const DiscordChannelTypeSchema = z.looseObject({ type: safeIntegerSchema });
const DiscordTextChannelSchema = z.looseObject({
  id: snowflakeSchema,
  name: z.string().min(1).max(100),
  type: z.union([z.literal(0), z.literal(5)]),
});
const DiscordGuildPageEntrySchema = z.looseObject({
  id: snowflakeSchema,
  approximate_member_count: safeIntegerSchema.nonnegative(),
});
const DiscordGuildListEntrySchema = z.looseObject({ id: snowflakeSchema });
const DiscordCommandSchema = z.looseObject({
  id: snowflakeSchema,
  name: z.string(),
});
const DiscordCommandOptionSchema = z.looseObject({
  name: z.string(),
});
const DiscordCommandChoiceSchema = z.looseObject({ value: z.string() });
const GuildLifecycleLogInputSchema = strictObjectSchema({
  eventType: z.enum(["guildAdd", "guildRemove"]),
  guildName: z.string().min(1).max(255),
  mutationId: z.string().min(1).max(255),
});
const RollHelperInputSchema = strictObjectSchema({
  rollId: snowflakeSchema,
  userId: snowflakeSchema,
});
const ShardCountSchema = safeIntegerSchema.min(1).max(
  MAX_SHARDS_PER_STATS_RUN,
);
const ShardCountInputSchema = strictObjectSchema({
  shardCount: ShardCountSchema,
});
const TimestampSchema = safeIntegerSchema.nonnegative();
const TrimmedSecretSchema = z.string().min(1).refine((value) =>
  value.trim() === value
);
const BotListReportingConfigurationSchema = z.looseObject({
  DISCORD_APPLICATION_ID: snowflakeSchema,
  TOPGG_KEY: TrimmedSecretSchema,
  DISCORD_BOT_LIST_KEY: TrimmedSecretSchema,
});
const MessageProbeInputSchema = strictObjectSchema({
  channelId: snowflakeSchema,
  messageId: snowflakeSchema,
});
const RollLogInputSchema = z.looseObject({
  rollId: snowflakeSchema,
  source: z.enum(["discord", "web"]),
  notation: z.string().min(1),
  username: z.string().min(1),
  guildId: snowflakeSchema.nullable(),
  channelId: snowflakeSchema,
  context: z.unknown().optional(),
});
const RollLogShardSchema = z.discriminatedUnion("status", [
  strictObjectSchema({ status: z.literal("not-applicable") }),
  strictObjectSchema({ status: z.literal("unavailable") }),
  strictObjectSchema({
    status: z.literal("available"),
    shardId: safeIntegerSchema.nonnegative(),
    shardCount: safeIntegerSchema.positive(),
    generation: safeIntegerSchema.positive(),
  }).refine((shard) => shard.shardId < shard.shardCount),
]);
const ChannelRollMessageInputBaseSchema = {
  version: z.literal(1),
  channelId: snowflakeSchema,
  payload: boundaryObjectSchema,
};
const ChannelRollMessageInputSchema = z.discriminatedUnion("operation", [
  strictObjectSchema({
    ...ChannelRollMessageInputBaseSchema,
    operation: z.literal("create-clatter"),
    rollId: snowflakeSchema,
  }),
  strictObjectSchema({
    ...ChannelRollMessageInputBaseSchema,
    operation: z.literal("create-result"),
    rollId: snowflakeSchema,
    filename: z.string().regex(PNG_FILENAME),
    png: z.instanceof(Uint8Array).refine(
      (png) => png.byteLength > 0 && png.byteLength <= MAX_ROLL_PNG_BYTES,
    ),
  }),
  strictObjectSchema({
    ...ChannelRollMessageInputBaseSchema,
    operation: z.literal("edit-result"),
    messageId: snowflakeSchema,
    filename: z.string().regex(PNG_FILENAME),
    png: z.instanceof(Uint8Array).refine(
      (png) => png.byteLength > 0 && png.byteLength <= MAX_ROLL_PNG_BYTES,
    ),
  }),
]);
const UnknownArraySchema = z.array(z.unknown());
const DiscordRolesResponseSchema = UnknownArraySchema.max(250);
const PermissionOverwritesResponseSchema = UnknownArraySchema.max(1_000);
const DiscordGuildStatsPageSchema = UnknownArraySchema.max(200);
const DiscordGuildListPageSchema = z
  .array(DiscordGuildListEntrySchema)
  .max(200);
const DiscordCommandsResponseSchema = z.array(DiscordCommandSchema);
const DiscordAssignedRolesResponseSchema = z.array(DiscordAssignedRoleSchema);

const WebRollInputSchema = z.looseObject({
  rollId: snowflakeSchema.optional(),
  guildId: snowflakeSchema,
  channelId: snowflakeSchema,
  payload: boundaryObjectSchema,
  clatter: z.string().min(1).max(2_000),
  filename: z.string().regex(PNG_FILENAME),
  png: z.instanceof(Uint8Array).refine((png) => png.byteLength > 0),
  skipDelay: z.boolean(),
  delayMs: safeIntegerSchema.min(0).max(5_000),
}).refine((input) =>
  input.skipDelay ? input.delayMs === 0 : input.delayMs >= 1
);

export type MembershipInspection =
  | {
      status: "found";
      isAdmin: boolean;
      isDiceWitchAdmin: boolean;
    }
  | { status: "missing" };

export type RollerGuildInspection =
  | {
      status: "found";
      isAdmin: boolean;
      isDiceWitchAdmin: boolean;
      hasUsableChannel: boolean;
    }
  | { status: "missing" };

export type TextChannel = {
  id: string;
  name: string;
  type: 0 | 5;
};

export type GameDetectionAnnouncementDeliveryResult =
  | { status: "delivered"; messageId: string; httpStatus: number }
  | { status: "failed"; httpStatus: number }
  | {
      status: "retryable";
      httpStatus: number | null;
      retryAfterMs: number | null;
    };

export type RollLifecycleAlertDeliveryResult =
  | { status: "delivered"; messageId: string; httpStatus: number }
  | { status: "failed"; httpStatus: number }
  | {
      status: "retryable";
      httpStatus: number | null;
      retryAfterMs: number | null;
    };

export type WebRollDeliveryResult =
  | { status: "delivered"; messageId: string }
  | { status: "permission_error" }
  | { status: "failed"; httpStatus: number }
  | {
      status: "retryable";
      httpStatus: number;
      retryAfterMs: number | null;
    };

export type ChannelRollMessageDeliveryResultV1 =
  | { status: "delivered"; messageId: string; httpStatus: number }
  | { status: "invalid_response" }
  | {
      status: "retryable";
      httpStatus: number | null;
      retryAfterMs: number | null;
    }
  | {
      status: "failed";
      httpStatus: number;
      discordErrorCode: number | null;
    };

export type ChannelRollMessageDeliveryInputV1 =
  | {
      version: 1;
      operation: "create-clatter";
      rollId: string;
      channelId: string;
      payload: DiscordComponentsV2Message;
    }
  | {
      version: 1;
      operation: "create-result";
      rollId: string;
      channelId: string;
      payload: DiscordComponentsV2Message;
      filename: string;
      png: Uint8Array;
    }
  | {
      version: 1;
      operation: "edit-result";
      channelId: string;
      messageId: string;
      payload: DiscordComponentsV2Message;
      filename: string;
      png: Uint8Array;
    };

type LegacyPublicDiscordStats = { servers: number; users: number };

type LegacyBotListReportResult = LegacyPublicDiscordStats & {
  status: "reported" | "failed" | "skipped";
  topggHttpStatus: number | null;
  discordBotListHttpStatus: number | null;
};

export type PublicDiscordStats = Pick<
  DiscordAudienceCaptureV1,
  | "estimatedGuildMemberships"
  | "guildCountsByShard"
  | "liveGuilds"
  | "shardCount"
>;

export type BotListReportResult = DiscordAudienceCaptureV1 & {
  status: "reported" | "failed" | "skipped";
  topggHttpStatus: number | null;
  discordBotListHttpStatus: number | null;
};

export type CommandRegistrationResult = {
  status: "registered";
  commandNames: string[];
};

export type RollLogInput = {
  rollId: string;
  source: "discord" | "web";
  notation: string;
  username: string;
  guildId: string | null;
  channelId: string;
  context?: RollLoggingContext;
};

export type GuildLifecycleLogResult = { status: "delivered" };
export type RollHelperResult = { status: "delivered" };

export type RollLogResult =
  | { status: "delivered" }
  | {
      status: "retryable" | "failed";
      stage: "context" | "delivery";
      httpStatus: number;
    };

type RequestFetch = (request: Request) => Promise<Response>;

type AssignedRolesInspection = {
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
};

function isBoundaryObject(value: SchemaInput): value is BoundaryObject {
  return boundaryObjectSchema.safeParse(value).success;
}

async function readBoundedDiscordJson(response: Response): Promise<SchemaInput> {
  if (response.body === null) return null;
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > MAX_DISCORD_RESPONSE_BODY_BYTES)
  ) {
    return null;
  }
  const stream = DiscordBodyStreamSchema.safeParse(response.body);
  if (!stream.success) return null;
  const reader = stream.data.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAX_DISCORD_RESPONSE_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(chunk.value);
    }
  } catch {
    return null;
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: SchemaInput = JSON.parse(new TextDecoder().decode(body));
    return parsed;
  } catch {
    return null;
  }
}

function isAdvancingGuildCursor(
  after: string | null,
  nextAfter: string,
): boolean {
  return after === null || BigInt(nextAfter) > BigInt(after);
}

function isRollLoggingContext(
  value: SchemaInput,
  guildId: string | null,
  channelId: string,
): value is RollLoggingContext {
  try {
    const context = parseRollLoggingContext(value, guildId, channelId);
    return context.kind === "dm" || isCompleteGuildRollLoggingContext(context);
  } catch {
    return false;
  }
}

function isRollLogInput(value: SchemaInput): value is RollLogInput {
  const result = RollLogInputSchema.safeParse(value);
  return result.success &&
    (result.data.context === undefined ||
      isRollLoggingContext(
        result.data.context,
        result.data.guildId,
        result.data.channelId,
      ));
}

type DiscordGuildMember = z.output<typeof DiscordGuildMemberSchema>;

function parseGuildMember(value: SchemaInput): DiscordGuildMember {
  const result = DiscordGuildMemberSchema.safeParse(value);
  if (
    !result.success ||
    new Set(result.data.roles).size !== result.data.roles.length
  ) {
    throw new Error("Discord guild member response is invalid");
  }
  return result.data;
}

function parseMemberRoles(value: SchemaInput): string[] {
  return parseGuildMember(value).roles;
}

function parsePermission(value: SchemaInput, source: string): bigint {
  const result = PermissionStringSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`${source} permissions are invalid`);
  }
  return BigInt(result.data);
}

function memberTimeout(member: DiscordGuildMember, now: number): boolean {
  const timeout = member.communication_disabled_until;
  if (timeout === undefined || timeout === null) return false;
  const expiresAt = Date.parse(timeout);
  if (!Number.isFinite(expiresAt)) {
    throw new Error("Discord guild member response is invalid");
  }
  return expiresAt > now;
}

function rolePermissions(value: SchemaInput): Map<string, bigint> {
  const roles = DiscordRolesResponseSchema.safeParse(value);
  if (!roles.success) {
    throw new Error("Discord guild roles response is invalid");
  }
  const permissions = new Map<string, bigint>();
  for (const roleValue of roles.data) {
    const role = DiscordRoleIdentitySchema.safeParse(roleValue);
    if (!role.success || permissions.has(role.data.id)) {
      throw new Error("Discord guild roles response is invalid");
    }
    permissions.set(
      role.data.id,
      parsePermission(role.data.permissions, "Discord guild role"),
    );
  }
  return permissions;
}

type PermissionOverwrite = {
  id: string;
  type: 0 | 1;
  allow: bigint;
  deny: bigint;
};

function permissionOverwrites(value: SchemaInput): PermissionOverwrite[] {
  const values = PermissionOverwritesResponseSchema.safeParse(value);
  if (!values.success) {
    throw new Error("Discord channel permission overwrites are invalid");
  }
  const overwrites: PermissionOverwrite[] = [];
  const keys = new Set<string>();
  for (const overwriteValue of values.data) {
    const overwrite = PermissionOverwriteIdentitySchema.safeParse(overwriteValue);
    if (!overwrite.success) {
      throw new Error("Discord channel permission overwrites are invalid");
    }
    const key = `${String(overwrite.data.type)}:${overwrite.data.id}`;
    if (keys.has(key)) {
      throw new Error("Discord channel permission overwrites are invalid");
    }
    keys.add(key);
    overwrites.push({
      id: overwrite.data.id,
      type: overwrite.data.type,
      allow: parsePermission(
        overwrite.data.allow,
        "Discord channel overwrite",
      ),
      deny: parsePermission(overwrite.data.deny, "Discord channel overwrite"),
    });
  }
  return overwrites;
}

function applyPermissionOverwrite(
  permissions: bigint,
  overwrite: Pick<PermissionOverwrite, "allow" | "deny">,
): bigint {
  return (permissions & ~overwrite.deny) | overwrite.allow;
}

function inspectAssignedRoles(
  value: SchemaInput,
  assignedRoleIds: Set<string>,
): AssignedRolesInspection {
  const roles = DiscordAssignedRolesResponseSchema.safeParse(value);
  if (!roles.success) {
    throw new Error("Discord guild roles response is invalid");
  }
  let isAdmin = false;
  let isDiceWitchAdmin = false;
  for (const role of roles.data) {
    if (!assignedRoleIds.has(role.id)) continue;
    if ((BigInt(role.permissions) & 8n) === 8n) isAdmin = true;
    if (role.name === DICE_WITCH_ADMIN_ROLE) isDiceWitchAdmin = true;
  }
  return { isAdmin, isDiceWitchAdmin };
}

function parseGuildOwnerId(value: SchemaInput): string {
  const result = DiscordGuildOwnerSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Discord guild response is invalid");
  }
  return result.data.owner_id;
}

type RegisteredCommand = z.output<typeof DiscordCommandSchema>;

function hasRegisteredFudgeChoice(command: RegisteredCommand): boolean {
  const options = UnknownArraySchema.safeParse(command.options);
  if (!options.success) return false;
  const topic = options.data
    .map((option) => DiscordCommandOptionSchema.safeParse(option))
    .find((option) => option.success && option.data.name === "topic");
  if (topic === undefined || !topic.success) return false;
  const choices = UnknownArraySchema.safeParse(topic.data.choices);
  if (!choices.success) return false;
  return choices.data.some((choice) => {
    const result = DiscordCommandChoiceSchema.safeParse(choice);
    return result.success && result.data.value === "fudge";
  });
}

async function registerCommands(
  env: Pick<DiscordRestEnv, "DISCORD_APPLICATION_ID" | "DISCORD_BOT_TOKEN">,
  path: string,
  discordFetch: RequestFetch,
): Promise<CommandRegistrationResult> {
  const response = await discordFetch(
    new Request(`${DISCORD_API}${path}`, {
      method: "PUT",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "content-type": "application/json",
        "user-agent": "Dice-Witch",
      },
      body: JSON.stringify(DISCORD_GLOBAL_COMMANDS),
    }),
  );
  if (!response.ok) throw new Error("Discord command registration failed");
  const commands = DiscordCommandsResponseSchema.safeParse(
    await response.json(),
  );
  if (
    !commands.success ||
    commands.data.length !== DISCORD_GLOBAL_COMMANDS.length
  ) {
    throw new Error("Discord command registration response is invalid");
  }
  const commandNames: string[] = [];
  let hasFudgeChoice = false;
  for (const command of commands.data) {
    commandNames.push(command.name);
    if (command.name === "knowledgebase") {
      hasFudgeChoice = hasRegisteredFudgeChoice(command);
    }
  }
  commandNames.sort();
  const expectedNames = DISCORD_GLOBAL_COMMANDS.map(({ name }) => name).sort();
  if (
    !hasFudgeChoice ||
    JSON.stringify(commandNames) !== JSON.stringify(expectedNames)
  ) {
    throw new Error("Discord command registration response is invalid");
  }
  return { status: "registered", commandNames };
}

export function registerGlobalCommands(
  env: Pick<DiscordRestEnv, "DISCORD_APPLICATION_ID" | "DISCORD_BOT_TOKEN">,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<CommandRegistrationResult> {
  if (!snowflakeSchema.safeParse(env.DISCORD_APPLICATION_ID).success) {
    throw new Error("Discord application id is invalid");
  }
  return registerCommands(
    env,
    `/applications/${env.DISCORD_APPLICATION_ID}/commands`,
    discordFetch,
  );
}

export function registerDevelopmentGuildCommands(
  env: Pick<
    DiscordRestEnv,
    "DISCORD_APPLICATION_ID" | "DISCORD_BOT_TOKEN" | "DISCORD_TEST_GUILD_ID"
  >,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<CommandRegistrationResult> {
  if (
    !snowflakeSchema.safeParse(env.DISCORD_APPLICATION_ID).success ||
    !snowflakeSchema.safeParse(env.DISCORD_TEST_GUILD_ID).success
  ) {
    throw new Error("Discord command registration scope is invalid");
  }
  return registerCommands(
    env,
    `/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_TEST_GUILD_ID}/commands`,
    discordFetch,
  );
}

export async function fetchPublicStats(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  shardCount: number,
  discordFetch: RequestFetch = (request) => fetch(request),
  wait: Sleep = sleep,
): Promise<PublicDiscordStats> {
  if (!ShardCountSchema.safeParse(shardCount).success) {
    throw new Error("Discord guild stats shard count is invalid");
  }
  const seen = new Set<string>();
  const guildCountsByShard = Array.from({ length: shardCount }, () => 0);
  let after: string | null = null;
  let estimatedGuildMemberships = 0;
  for (;;) {
    const url = new URL(`${DISCORD_API}/users/@me/guilds`);
    url.searchParams.set("limit", "200");
    url.searchParams.set("with_counts", "true");
    if (after !== null) url.searchParams.set("after", after);
    const response = await fetchGuildPageResponse(
      env,
      url,
      discordFetch,
      wait,
      "Discord guild stats",
    );
    const page = DiscordGuildStatsPageSchema.safeParse(
      await response.json(),
    );
    if (!page.success) {
      throw new Error("Discord guild stats response is invalid");
    }
    if (page.data.length === 0) break;
    let lastGuildId: string | undefined;
    for (const value of page.data) {
      const guild = DiscordGuildPageEntrySchema.safeParse(value);
      if (!guild.success || seen.has(guild.data.id)) {
        throw new Error("Discord guild stats response is invalid");
      }
      seen.add(guild.data.id);
      lastGuildId = guild.data.id;
      if (seen.size > MAX_GUILDS_PER_STATS_RUN) {
        throw new Error("Discord guild stats limit exceeded");
      }
      const shardId = Number(
        (BigInt(guild.data.id) >> 22n) % BigInt(shardCount),
      );
      const shardGuilds = guildCountsByShard[shardId];
      if (shardGuilds === undefined) {
        throw new Error("Discord guild stats shard calculation failed");
      }
      guildCountsByShard[shardId] = shardGuilds + 1;
      estimatedGuildMemberships += guild.data.approximate_member_count;
      if (!Number.isSafeInteger(estimatedGuildMemberships)) {
        throw new Error("Discord guild stats total is invalid");
      }
    }
    if (
      lastGuildId === undefined ||
      !isAdvancingGuildCursor(after, lastGuildId)
    ) {
      throw new Error("Discord guild stats response is invalid");
    }
    after = lastGuildId;
  }
  return {
    liveGuilds: seen.size,
    estimatedGuildMemberships,
    shardCount,
    guildCountsByShard,
  };
}

type BotListStatBody =
  | { server_count: number }
  | { guilds: number };

async function postBotListStat(
  url: string,
  token: string,
  body: BotListStatBody,
  externalFetch: RequestFetch,
): Promise<{ delivered: boolean; httpStatus: number | null }> {
  try {
    const response = await externalFetch(
      new Request(url, {
        method: "POST",
        headers: {
          authorization: token,
          "content-type": "application/json",
          "user-agent": "Dice-Witch",
        },
        body: JSON.stringify(body),
      }),
    );
    return { delivered: response.ok, httpStatus: response.status };
  } catch {
    return { delivered: false, httpStatus: null };
  }
}

export async function captureAudienceSnapshot(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  shardCount: number,
  discordFetch: RequestFetch = (request) => fetch(request),
  capturedAt = Date.now(),
): Promise<DiscordAudienceCaptureV1> {
  if (!TimestampSchema.safeParse(capturedAt).success) {
    throw new Error("Audience snapshot timestamp is invalid");
  }
  return {
    version: DISCORD_AUDIENCE_SNAPSHOT_VERSION,
    capturedAt,
    ...(await fetchPublicStats(env, shardCount, discordFetch)),
  };
}

export async function reportBotListStats(
  env: Pick<
    DiscordRestEnv,
    | "DISCORD_APPLICATION_ID"
    | "DISCORD_BOT_TOKEN"
    | "TOPGG_KEY"
    | "DISCORD_BOT_LIST_KEY"
  >,
  shardCount: number,
  externalFetch: RequestFetch = (request) => fetch(request),
  capturedAt = Date.now(),
): Promise<BotListReportResult> {
  if (!BotListReportingConfigurationSchema.safeParse(env).success) {
    throw new Error("Bot list reporting configuration is invalid");
  }
  const capture = await captureAudienceSnapshot(
    env,
    shardCount,
    externalFetch,
    capturedAt,
  );
  if (capture.liveGuilds === 0) {
    return {
      status: "skipped",
      ...capture,
      topggHttpStatus: null,
      discordBotListHttpStatus: null,
    };
  }
  const [topgg, discordBotList] = await Promise.all([
    postBotListStat(
      `https://top.gg/api/bots/${env.DISCORD_APPLICATION_ID}/stats`,
      env.TOPGG_KEY,
      { server_count: capture.liveGuilds },
      externalFetch,
    ),
    postBotListStat(
      `https://discordbotlist.com/api/v1/bots/${env.DISCORD_APPLICATION_ID}/stats`,
      env.DISCORD_BOT_LIST_KEY,
      { guilds: capture.liveGuilds },
      externalFetch,
    ),
  ]);
  return {
    status: topgg.delivered && discordBotList.delivered ? "reported" : "failed",
    ...capture,
    topggHttpStatus: topgg.httpStatus,
    discordBotListHttpStatus: discordBotList.httpStatus,
  };
}

export type CurrentGuildIdsPage = {
  guildIds: string[];
  nextAfter: string | null;
};

type Sleep = (delayMs: number) => Promise<void>;
const MAX_GUILD_PAGE_RATE_LIMIT_RETRIES = 5;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseShardCountInput(value: SchemaInput): number {
  const result = ShardCountInputSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Discord guild stats request is invalid");
  }
  return result.data.shardCount;
}

async function fetchGuildPageResponse(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  url: URL,
  discordFetch: RequestFetch,
  wait: Sleep,
  errorPrefix: string,
): Promise<Response> {
  for (let retries = 0; retries <= MAX_GUILD_PAGE_RATE_LIMIT_RETRIES; retries += 1) {
    const response = await discordFetch(
      new Request(url, {
        headers: {
          authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "user-agent": "Dice-Witch",
        },
      }),
    );
    if (response.status !== 429) {
      if (!response.ok) throw new Error(`${errorPrefix} request failed`);
      return response;
    }
    if (retries === MAX_GUILD_PAGE_RATE_LIMIT_RETRIES) {
      throw new Error(`${errorPrefix} rate limit retries exhausted`);
    }
    const rateLimit = DiscordRateLimitSchema.safeParse(await response.json());
    const delayMs = rateLimit.success
      ? Math.ceil(rateLimit.data.retry_after * 1_000)
      : NaN;
    if (
      !Number.isSafeInteger(delayMs) ||
      delayMs < 0 ||
      delayMs > MAX_TIMER_DELAY_MS
    ) {
      throw new Error(`${errorPrefix} rate limit response is invalid`);
    }
    await wait(delayMs);
  }
  throw new Error(`${errorPrefix} request failed`);
}

export async function listCurrentGuildIdsPage(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  after: string | null,
  discordFetch: RequestFetch = (request) => fetch(request),
  wait: Sleep = sleep,
): Promise<CurrentGuildIdsPage> {
  if (after !== null && !snowflakeSchema.safeParse(after).success) {
    throw new Error("Discord guild list cursor is invalid");
  }
  const url = new URL(`${DISCORD_API}/users/@me/guilds`);
  url.searchParams.set("limit", "200");
  if (after !== null) url.searchParams.set("after", after);
  const response = await fetchGuildPageResponse(
    env,
    url,
    discordFetch,
    wait,
    "Discord guild list",
  );
  const page = DiscordGuildListPageSchema.safeParse(
    await response.json(),
  );
  if (!page.success) {
    throw new Error("Discord guild list response is invalid");
  }
  const guildIds = page.data.map((guild) => guild.id);
  if (new Set(guildIds).size !== guildIds.length) {
    throw new Error("Discord guild list response is invalid");
  }
  const nextAfter = guildIds.at(-1) ?? null;
  if (nextAfter !== null && !isAdvancingGuildCursor(after, nextAfter)) {
    throw new Error("Discord guild list response is invalid");
  }
  return { guildIds, nextAfter };
}

export async function listCurrentGuildIds(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<string[]> {
  const guildIds: string[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  do {
    const page = await listCurrentGuildIdsPage(env, after, discordFetch);
    for (const guildId of page.guildIds) {
      if (seen.has(guildId)) {
        throw new Error("Discord guild list response is invalid");
      }
      seen.add(guildId);
      guildIds.push(guildId);
    }
    after = page.nextAfter;
  } while (after !== null);
  return guildIds;
}

export async function listTextChannels(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  guildId: string,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<TextChannel[]> {
  if (!snowflakeSchema.safeParse(guildId).success) {
    throw new Error("Guild id is invalid");
  }
  const response = await discordFetch(
    new Request(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "user-agent": "Dice-Witch",
      },
    }),
  );
  if (!response.ok) throw new Error("Discord guild channels request failed");
  const values = UnknownArraySchema.safeParse(await response.json());
  if (!values.success) {
    throw new Error("Discord guild channels response is invalid");
  }
  const channels: TextChannel[] = [];
  for (const value of values.data) {
    const channelType = DiscordChannelTypeSchema.safeParse(value);
    if (!channelType.success) {
      throw new Error("Discord guild channels response is invalid");
    }
    if (channelType.data.type !== 0 && channelType.data.type !== 5) continue;
    const channel = DiscordTextChannelSchema.safeParse(value);
    if (!channel.success) {
      throw new Error("Discord guild channels response is invalid");
    }
    channels.push({
      id: channel.data.id,
      name: channel.data.name,
      type: channel.data.type,
    });
  }
  return channels;
}

type GuildMemberPermissions = {
  userId: string;
  roleIds: Set<string>;
  base: bigint;
  isAdministrator: boolean;
  isTimedOut: boolean;
};

function guildMemberPermissions(
  value: SchemaInput,
  permissionsByRole: Map<string, bigint>,
  everyonePermissions: bigint,
  ownerId: string,
  userId: string,
  now: number,
): GuildMemberPermissions {
  const member = parseGuildMember(value);
  const roleIds = new Set(member.roles);
  let base = everyonePermissions;
  for (const roleId of roleIds) {
    const permissions = permissionsByRole.get(roleId);
    if (permissions === undefined) {
      throw new Error("Discord guild roles response is invalid");
    }
    base |= permissions;
  }
  const isAdministrator =
    ownerId === userId ||
    (base & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION;
  return {
    userId,
    roleIds,
    base,
    isAdministrator,
    isTimedOut: memberTimeout(member, now) && !isAdministrator,
  };
}

function canUseTextChannel(
  member: GuildMemberPermissions,
  guildId: string,
  overwrites: PermissionOverwrite[],
  requiredPermissions: bigint,
): boolean {
  if (member.isTimedOut) return false;
  if (member.isAdministrator) return true;
  let permissions = member.base;
  const everyone = overwrites.find(
    (overwrite) => overwrite.type === 0 && overwrite.id === guildId,
  );
  if (everyone !== undefined) {
    permissions = applyPermissionOverwrite(permissions, everyone);
  }
  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type === 0 && member.roleIds.has(overwrite.id)) {
      roleAllow |= overwrite.allow;
      roleDeny |= overwrite.deny;
    }
  }
  permissions = applyPermissionOverwrite(permissions, {
    allow: roleAllow,
    deny: roleDeny,
  });
  const memberOverwrite = overwrites.find(
    (overwrite) => overwrite.type === 1 && overwrite.id === member.userId,
  );
  if (memberOverwrite !== undefined) {
    permissions = applyPermissionOverwrite(permissions, memberOverwrite);
  }
  return (permissions & requiredPermissions) === requiredPermissions;
}

type MemberTextChannelInspection =
  | (Extract<RollerGuildInspection, { status: "found" }> & {
      channels: TextChannel[];
    })
  | { status: "missing" };

async function inspectMemberTextChannels(
  env: Pick<DiscordRestEnv, "DISCORD_APPLICATION_ID" | "DISCORD_BOT_TOKEN">,
  guildId: string,
  userId: string,
  discordFetch: RequestFetch,
  now: number,
): Promise<MemberTextChannelInspection> {
  if (
    !snowflakeSchema.safeParse(guildId).success ||
    !snowflakeSchema.safeParse(userId).success ||
    !snowflakeSchema.safeParse(env.DISCORD_APPLICATION_ID).success
  ) {
    throw new Error("Membership identifiers are invalid");
  }
  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "user-agent": "Dice-Witch",
  };
  const guildPath = `${DISCORD_API}/guilds/${guildId}`;
  const [memberResponse, botResponse, rolesResponse, guildResponse, channelsResponse] =
    await Promise.all([
      discordFetch(new Request(`${guildPath}/members/${userId}`, { headers })),
      discordFetch(
        new Request(`${guildPath}/members/${env.DISCORD_APPLICATION_ID}`, { headers }),
      ),
      discordFetch(new Request(`${guildPath}/roles`, { headers })),
      discordFetch(new Request(guildPath, { headers })),
      discordFetch(new Request(`${guildPath}/channels`, { headers })),
    ]);
  if (memberResponse.status === 404 || botResponse.status === 404) {
    return { status: "missing" };
  }
  if (!memberResponse.ok || !botResponse.ok) {
    throw new Error("Discord guild member request failed");
  }
  if (!rolesResponse.ok) throw new Error("Discord guild roles request failed");
  if (!guildResponse.ok) throw new Error("Discord guild request failed");
  if (!channelsResponse.ok) throw new Error("Discord guild channels request failed");

  const member: SchemaInput = await memberResponse.json();
  const bot: SchemaInput = await botResponse.json();
  const roles: SchemaInput = await rolesResponse.json();
  const permissionsByRole = rolePermissions(roles);
  const everyonePermissions = permissionsByRole.get(guildId);
  if (everyonePermissions === undefined) {
    throw new Error("Discord guild roles response is invalid");
  }
  const ownerId = parseGuildOwnerId(await guildResponse.json());
  const memberPermissions = guildMemberPermissions(
    member,
    permissionsByRole,
    everyonePermissions,
    ownerId,
    userId,
    now,
  );
  const botPermissions = guildMemberPermissions(
    bot,
    permissionsByRole,
    everyonePermissions,
    ownerId,
    env.DISCORD_APPLICATION_ID,
    now,
  );

  const values = UnknownArraySchema.safeParse(await channelsResponse.json());
  if (!values.success) {
    throw new Error("Discord guild channels response is invalid");
  }
  const channels: TextChannel[] = [];
  for (const value of values.data) {
    const channelType = DiscordChannelTypeSchema.safeParse(value);
    if (!channelType.success) {
      throw new Error("Discord guild channels response is invalid");
    }
    if (channelType.data.type !== 0 && channelType.data.type !== 5) continue;
    const channel = DiscordTextChannelSchema.safeParse(value);
    if (!channel.success) {
      throw new Error("Discord guild channels response is invalid");
    }
    const overwrites = permissionOverwrites(
      channel.data.permission_overwrites,
    );
    const memberCanUseDiceWitch = canUseTextChannel(
      memberPermissions,
      guildId,
      overwrites,
      INVOKE_DICE_WITCH_PERMISSIONS,
    );
    const botCanPost = canUseTextChannel(
      botPermissions,
      guildId,
      overwrites,
      POST_CHANNEL_PERMISSIONS,
    );
    if (memberCanUseDiceWitch && botCanPost) {
      channels.push({
        id: channel.data.id,
        name: channel.data.name,
        type: channel.data.type,
      });
    }
  }
  const assignedRoles = inspectAssignedRoles(
    roles,
    new Set([guildId, ...memberPermissions.roleIds]),
  );
  return {
    status: "found",
    isAdmin: memberPermissions.isAdministrator,
    isDiceWitchAdmin: assignedRoles.isDiceWitchAdmin,
    hasUsableChannel: channels.length > 0,
    channels,
  };
}

export async function listMemberTextChannels(
  env: Pick<DiscordRestEnv, "DISCORD_APPLICATION_ID" | "DISCORD_BOT_TOKEN">,
  guildId: string,
  userId: string,
  discordFetch: RequestFetch = (request) => fetch(request),
  now = Date.now(),
): Promise<TextChannel[]> {
  const inspection = await inspectMemberTextChannels(
    env,
    guildId,
    userId,
    discordFetch,
    now,
  );
  return inspection.status === "found" ? inspection.channels : [];
}

export async function inspectRollerGuild(
  env: Pick<DiscordRestEnv, "DISCORD_APPLICATION_ID" | "DISCORD_BOT_TOKEN">,
  guildId: string,
  userId: string,
  discordFetch: RequestFetch = (request) => fetch(request),
  now = Date.now(),
): Promise<RollerGuildInspection> {
  const inspection = await inspectMemberTextChannels(
    env,
    guildId,
    userId,
    discordFetch,
    now,
  );
  if (inspection.status === "missing") return inspection;
  return {
    status: inspection.status,
    isAdmin: inspection.isAdmin,
    isDiceWitchAdmin: inspection.isDiceWitchAdmin,
    hasUsableChannel: inspection.hasUsableChannel,
  };
}

function isRetryableDiscordStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function failedRollLogResult(
  stage: "context" | "delivery",
  status: number,
): RollLogResult {
  const isRetryable =
    isRetryableDiscordStatus(status) ||
    (stage === "delivery" && status === 404);
  return {
    status: isRetryable ? "retryable" : "failed",
    stage,
    httpStatus: status,
  };
}

function numericResponseHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (value === null) return null;
  const parsed = NonNegativeNumericHeaderSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function discordErrorCode(response: Response): Promise<number | null> {
  try {
    const result = DiscordErrorSchema.safeParse(await response.clone().json());
    return result.success ? result.data.code : null;
  } catch {
    return null;
  }
}

async function discordJson(
  url: string,
  token: string,
  body: BoundaryObject,
  discordFetch: RequestFetch,
): Promise<Response> {
  return discordFetch(
    new Request(url, {
      method: "POST",
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
        "user-agent": "Dice-Witch",
      },
      body: JSON.stringify(body),
    }),
  );
}

export async function logGuildLifecycle(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "LOG_OUTPUT_CHANNEL_ID">,
  input: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<GuildLifecycleLogResult> {
  const parsedInput = GuildLifecycleLogInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error("Guild lifecycle log request is invalid");
  }
  const lifecycle = parsedInput.data;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(lifecycle.mutationId),
  );
  const nonce = [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const response = await discordJson(
    `${DISCORD_API}/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
    env.DISCORD_BOT_TOKEN,
    {
      nonce,
      enforce_nonce: true,
      flags: 1 << 15,
      components: [
        {
          type: 17,
          accent_color: lifecycle.eventType === "guildAdd" ? 0x00_ff_00 : 0xff_00_00,
          components: [
            {
              type: 10,
              content: `## ${lifecycle.eventType}\n${escapeDiscordMarkdown(lifecycle.guildName)}`,
            },
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    },
    discordFetch,
  );
  if (!response.ok) throw new Error("Guild lifecycle log delivery failed");
  return { status: "delivered" };
}

export async function sendRollHelper(
  env: Pick<
    DiscordRestEnv,
    "DISCORD_BOT_TOKEN" | "INVITE_LINK" | "SUPPORT_SERVER_LINK"
  >,
  input: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<RollHelperResult> {
  const parsedInput = RollHelperInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new Error("Roll helper request is invalid");
  }
  const helper = parsedInput.data;
  const channelResponse = await discordJson(
    `${DISCORD_API}/users/@me/channels`,
    env.DISCORD_BOT_TOKEN,
    { recipient_id: helper.userId },
    discordFetch,
  );
  if (!channelResponse.ok) throw new Error("Discord DM channel request failed");
  const channel = DiscordResourceIdentitySchema.safeParse(
    await channelResponse.json(),
  );
  if (!channel.success) {
    throw new Error("Discord DM channel response is invalid");
  }
  const messageResponse = await discordJson(
    `${DISCORD_API}/channels/${channel.data.id}/messages`,
    env.DISCORD_BOT_TOKEN,
    {
      ...buildRollHelperMessage({
        inviteUrl: env.INVITE_LINK,
        supportUrl: env.SUPPORT_SERVER_LINK,
      }),
      nonce: helper.rollId,
      enforce_nonce: true,
    },
    discordFetch,
  );
  if (!messageResponse.ok) throw new Error("Discord roll helper delivery failed");
  const message = DiscordResourceIdentitySchema.safeParse(
    await messageResponse.json(),
  );
  if (!message.success) {
    throw new Error("Discord roll helper response is invalid");
  }
  return { status: "delivered" };
}

function escapeDiscordMarkdown(value: string): string {
  const specialCharacters = [
    "\\",
    "`",
    "*",
    "_",
    "{",
    "}",
    "[",
    "]",
    "(",
    ")",
    "#",
    "+",
    "-",
    ".",
    "!",
    "|",
    "<",
    ">",
    "~",
  ];
  let escaped = value;
  for (const character of specialCharacters) {
    escaped = escaped.replaceAll(character, `\\${character}`);
  }
  return escaped;
}

function rollLogLocation(context: RollLoggingContext): string {
  if (context.kind === "dm") return "**DM** [HTTP]";
  if (!isCompleteGuildRollLoggingContext(context)) {
    throw new Error("Roll log display context is incomplete");
  }
  const channelType = [10, 11, 12].includes(context.channelType)
    ? "thread"
    : "channel";
  return `${channelType} **${escapeDiscordMarkdown(context.channelName)}** on **${escapeDiscordMarkdown(context.guildName)}** [HTTP]`;
}

export async function logRoll(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "LOG_OUTPUT_CHANNEL_ID">,
  input: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<RollLogResult> {
  if (!snowflakeSchema.safeParse(env.LOG_OUTPUT_CHANNEL_ID).success || !isRollLogInput(input)) {
    throw new Error("Roll log request is invalid");
  }

  let location: string;
  if (input.context !== undefined) {
    location = rollLogLocation(input.context);
  } else if (input.guildId === null) {
    location = `**DM** [HTTP]`;
  } else {
    const headers = {
      authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "user-agent": "Dice-Witch",
    };
    const [channelResponse, guildResponse] = await Promise.all([
      discordFetch(
        new Request(`${DISCORD_API}/channels/${input.channelId}`, { headers }),
      ),
      discordFetch(
        new Request(`${DISCORD_API}/guilds/${input.guildId}`, { headers }),
      ),
    ]);
    if (!channelResponse.ok || !guildResponse.ok) {
      const failedResponses = [channelResponse, guildResponse].filter(
        (response) => !response.ok,
      );
      const retryableResponse = failedResponses.find(({ status }) =>
        isRetryableDiscordStatus(status),
      );
      if (retryableResponse !== undefined) {
        return failedRollLogResult("context", retryableResponse.status);
      }
      const rejectedResponse = failedResponses.find(
        ({ status }) => status !== 403 && status !== 404,
      );
      if (rejectedResponse !== undefined) {
        return failedRollLogResult("context", rejectedResponse.status);
      }
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "Discord roll log context is inaccessible",
          channelHttpStatus: channelResponse.status,
          guildHttpStatus: guildResponse.status,
        }),
      );
      location = "an **inaccessible channel/server** [HTTP]";
    } else {
      const channelValue: SchemaInput = await channelResponse.json();
      const guildValue: SchemaInput = await guildResponse.json();
      const channel = DiscordChannelIdentitySchema.safeParse(channelValue);
      if (
        !channel.success ||
        channel.data.id !== input.channelId ||
        channel.data.guild_id !== input.guildId ||
        !isDiscordRollChannelType(channel.data.type)
      ) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Discord roll log context response is invalid",
            context: "channel",
            channelType: isBoundaryObject(channelValue)
              ? Number(channelValue.type)
              : null,
          }),
        );
        throw new Error("Discord roll log context response is invalid");
      }
      const guild = DiscordGuildSchema.safeParse(guildValue);
      if (!guild.success || guild.data.id !== input.guildId) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Discord roll log context response is invalid",
            context: "guild",
          }),
        );
        throw new Error("Discord roll log context response is invalid");
      }
      const channelType = [10, 11, 12].includes(channel.data.type)
        ? "thread"
        : "channel";
      location = `${channelType} **${escapeDiscordMarkdown(channel.data.name)}** on **${escapeDiscordMarkdown(guild.data.name)}** [HTTP]`;
    }
  }

  const source = input.source === "web" ? "Web" : "Discord";
  const description = `${escapeDiscordMarkdown(input.notation)} from **${escapeDiscordMarkdown(input.username)}** [${source}] in ${location}`;
  const logContent = `## receivedCommand: /roll\n${description}`;
  if (logContent.length > 4_000) {
    throw new Error("Roll log description is invalid");
  }
  const response = await discordJson(
    `${DISCORD_API}/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
    env.DISCORD_BOT_TOKEN,
    {
      nonce: `log:${input.rollId}`,
      enforce_nonce: true,
      flags: 1 << 15,
      components: [
        {
          type: 17,
          accent_color: 0x99_99_99,
          components: [
            {
              type: 10,
              content: logContent,
            },
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    },
    discordFetch,
  );
  if (!response.ok) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Discord roll log delivery was rejected",
        httpStatus: response.status,
        discordCode: await discordErrorCode(response),
        failedRequestCount: numericResponseHeader(
          response,
          "x-failed-requests",
        ),
        rateLimitRemaining: numericResponseHeader(
          response,
          "x-ratelimit-remaining",
        ),
        retryAfterSeconds: numericResponseHeader(response, "retry-after"),
      }),
    );
    return failedRollLogResult("delivery", response.status);
  }
  const message = DiscordResourceIdentitySchema.safeParse(await response.json());
  if (!message.success) {
    throw new Error("Discord roll log response is invalid");
  }
  return { status: "delivered" };
}

function validateRollLogShard(
  value: SchemaInput,
  guildId: string | null,
): RollLogShardV1 {
  const shard = RollLogShardSchema.safeParse(value);
  if (
    !shard.success ||
    (shard.data.status === "not-applicable" && guildId !== null) ||
    (shard.data.status !== "not-applicable" && guildId === null)
  ) {
    throw new Error("Roll log shard is invalid");
  }
  return shard.data;
}

async function isImageSpecificDiscordRejection(
  response: Response,
): Promise<boolean> {
  if (response.status === 413) return true;
  if (response.status !== 400) return false;
  const code = await discordErrorCode(response);
  if (code === 40_005 || code === 50_045) return true;
  try {
    const body = DiscordErrorFieldsSchema.safeParse(
      await response.clone().json(),
    );
    if (!body.success) return false;
    return Object.keys(body.data.errors).some(
      (key) => key === "attachments" || key === "files",
    );
  } catch {
    return false;
  }
}

type ResolvedRollLogDisplayContext = RollLogDisplayContextV1 & {
  channelType: DiscordRollChannelType | null;
};

type RollLogContextResolution =
  | {
      status: "resolved";
      artifact: RollLogArtifact;
      displayContext: ResolvedRollLogDisplayContext | null;
    }
  | Extract<DeliverRollLogResultV1, { status: "retryable" | "failed" }>;

function rollLogDisplayTelemetry(
  artifact: RollLogArtifact,
  displayContext: ResolvedRollLogDisplayContext | null,
) {
  if (displayContext === null) return {};
  if (artifact.guildId === null) {
    throw new Error("Roll log display context requires a guild");
  }
  return {
    context: {
      kind: "guild-partial",
      guildId: artifact.guildId,
      guildName: displayContext.guildName,
      channelId: artifact.channelId,
      channelName: displayContext.channelName,
      channelType: displayContext.channelType,
    },
    guildName: displayContext.guildName,
    channelName: displayContext.channelName,
    channelType: displayContext.channelType,
  };
}

async function rollLogChannelContext(
  response: Response,
  artifact: RollLogArtifact,
): Promise<{ name: string; type: DiscordRollChannelType }> {
  const channel = DiscordChannelIdentitySchema.safeParse(await response.json());
  if (
    !channel.success ||
    channel.data.id !== artifact.channelId ||
    channel.data.guild_id !== artifact.guildId ||
    !isDiscordRollChannelType(channel.data.type)
  ) {
    throw new Error("Discord roll log channel response is invalid");
  }
  return { name: channel.data.name, type: channel.data.type };
}

async function rollLogGuildName(
  response: Response,
  guildId: string,
): Promise<string> {
  const guild = DiscordGuildSchema.safeParse(await response.json());
  if (!guild.success || guild.data.id !== guildId) {
    throw new Error("Discord roll log guild response is invalid");
  }
  return guild.data.name;
}

async function resolveRollLogContext(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  artifact: RollLogArtifact,
  discordFetch: RequestFetch,
): Promise<RollLogContextResolution> {
  if (
    artifact.guildId === null ||
    isCompleteGuildRollLoggingContext(artifact.context)
  ) {
    return { status: "resolved", artifact, displayContext: null };
  }
  const guildId = artifact.guildId;
  const existing = artifact.context?.kind === "guild"
    ? artifact.context
    : null;
  const needsChannel =
    existing === null ||
    existing.channelName === null ||
    existing.channelType === null;
  const needsGuild = existing === null || existing.guildName === null;
  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "user-agent": "Dice-Witch",
  };
  const [channelResponse, guildResponse] = await Promise.all([
    needsChannel
      ? discordFetch(
          new Request(`${DISCORD_API}/channels/${artifact.channelId}`, {
            headers,
          }),
        )
      : null,
    needsGuild
      ? discordFetch(
          new Request(`${DISCORD_API}/guilds/${guildId}`, { headers }),
        )
      : null,
  ]);
  const failedResponses = [channelResponse, guildResponse].filter(
    (response): response is Response => response !== null && !response.ok,
  );
  const responseStatuses = {
    channelHttpStatus: channelResponse?.status ?? null,
    guildHttpStatus: guildResponse?.status ?? null,
  };
  if (failedResponses.length > 0) {
    const retryableResponse = failedResponses.find(({ status }) =>
      isRetryableDiscordStatus(status),
    );
    if (retryableResponse !== undefined) {
      const retryAfterSeconds = numericResponseHeader(
        retryableResponse,
        "retry-after",
      );
      const retryAfterMs =
        retryAfterSeconds === null
          ? null
          : Math.ceil(retryAfterSeconds * 1_000);
      console.warn(
        JSON.stringify({
          telemetryVersion: 2,
          level: "warn",
          message: "Discord roll log context lookup will retry",
          subsystem: "private-roll-log",
          ...rollLogTelemetryContext(artifact, null),
          userImpact: "none",
          failureKind: "context-retryable",
          ...responseStatuses,
          httpStatus: retryableResponse.status,
          retryAfterMs,
        }),
      );
      return {
        status: "retryable",
        httpStatus: retryableResponse.status,
        retryAfterMs,
      };
    }
    const rejectedResponse = failedResponses.find(
      ({ status }) => status !== 403 && status !== 404,
    );
    if (rejectedResponse !== undefined) {
      console.error(
        JSON.stringify({
          telemetryVersion: 2,
          level: "error",
          message: "Discord roll log context lookup failed",
          subsystem: "private-roll-log",
          ...rollLogTelemetryContext(artifact, null),
          userImpact: "none",
          failureKind: "context-rejected",
          ...responseStatuses,
          httpStatus: rejectedResponse.status,
        }),
      );
      return { status: "failed", httpStatus: rejectedResponse.status };
    }
    const channel = channelResponse?.ok
      ? await rollLogChannelContext(channelResponse, artifact)
      : null;
    const guildName = guildResponse?.ok
      ? await rollLogGuildName(guildResponse, guildId)
      : null;
    const displayContext: ResolvedRollLogDisplayContext = {
      guildName: existing?.guildName ?? guildName,
      channelName: existing?.channelName ?? channel?.name ?? null,
      channelType: existing?.channelType ?? channel?.type ?? null,
    };
    console.warn(
      JSON.stringify({
        telemetryVersion: 2,
        level: "warn",
        message: "Discord roll log context is inaccessible",
        subsystem: "private-roll-log",
        ...rollLogTelemetryContext(artifact, null),
        ...rollLogDisplayTelemetry(artifact, displayContext),
        userImpact: "none",
        failureKind: "context-inaccessible",
        ...responseStatuses,
      }),
    );
    return { status: "resolved", artifact, displayContext };
  }

  const channel = channelResponse === null
    ? null
    : await rollLogChannelContext(channelResponse, artifact);
  const guildName = guildResponse === null
    ? null
    : await rollLogGuildName(guildResponse, guildId);
  const resolvedContext: RollLoggingContext = {
    kind: "guild",
    guildId,
    guildName: existing?.guildName ?? guildName,
    channelId: artifact.channelId,
    channelName: existing?.channelName ?? channel?.name ?? null,
    channelType: existing?.channelType ?? channel?.type ?? null,
  };
  if (!isCompleteGuildRollLoggingContext(resolvedContext)) {
    throw new Error("Discord roll log context resolution is incomplete");
  }
  return {
    status: "resolved",
    artifact: { ...artifact, context: resolvedContext },
    displayContext: null,
  };
}

function savedRollLogAttribution(artifact: RollLogArtifact): string | null {
  if (artifact.version === 2) {
    return artifact.presentation.savedRoll === null
      ? null
      : `from ${artifact.presentation.savedRoll.scope} library · ${escapeDiscordMarkdown(artifact.presentation.savedRoll.name)}`;
  }
  const resultFooter = artifact.payload.embeds?.[0]?.footer?.text;
  if (resultFooter === undefined) return null;
  const prefix = `sent to ${artifact.user.username} via ${artifact.source} · `;
  if (!resultFooter.startsWith(prefix)) return null;
  const attribution = resultFooter.slice(prefix.length);
  return /^from (?:personal|server) library · .+$/u.test(attribution)
    ? attribution
    : null;
}

function buildRollLogComponents(
  artifact: RollLogArtifact,
  shard: RollLogShardV1,
  displayContext: RollLogDisplayContextV1 | undefined,
) {
  const resultDescription = rollLogResultDescription(artifact);
  const isInvalidRoll =
    artifact.image.status === "unavailable" &&
    artifact.image.reason === "not-applicable";
  const errorDescription =
    isInvalidRoll && artifact.version === 1
      ? artifact.payload.content
      : undefined;
  const errorSuffix =
    errorDescription === undefined ? "" : `\n\n${errorDescription}`;
  const description =
    resultDescription === null
      ? `${rollLogMetadataDescription(
          artifact,
          shard,
          4_000 - errorSuffix.length,
          displayContext,
        )}${errorSuffix}`
      : `${rollLogContextDescription(artifact, shard, displayContext)}\n\n${resultDescription}`;
  const title = isInvalidRoll ? INVALID_ROLL_LOG_TITLE : ROLL_LOG_TITLE;
  const footer = [
    savedRollLogAttribution(artifact),
    artifact.image.status === "unavailable" &&
    artifact.image.reason !== "not-applicable"
      ? "Image unavailable"
      : null,
  ].filter((part): part is string => part !== null).join(" · ");
  if (description.length > 4_000 || footer.length > 4_000) {
    throw new Error("Roll log components exceed Discord's limits");
  }
  return [
    {
      type: 17,
      accent_color: isInvalidRoll ? 0xff_00_00 : 0x99_99_99,
      components: [
        { type: 10, content: `## ${title}` },
        { type: 10, content: description },
        ...(artifact.image.status === "available"
          ? [{
              type: 12,
              items: [{
                media: { url: `attachment://${artifact.image.filename}` },
                description: "Rendered dice result",
              }],
            }]
          : []),
        ...(footer.length === 0
          ? []
          : [{ type: 10, content: `-# ${footer}` }]),
      ],
    },
  ];
}

export async function deliverRollLogV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "LOG_OUTPUT_CHANNEL_ID">,
  input: DeliverRollLogInputV1,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<DeliverRollLogResultV1> {
  if (
    !snowflakeSchema.safeParse(env.LOG_OUTPUT_CHANNEL_ID).success ||
    !isBoundaryObject(input) ||
    Object.keys(input).sort().join(",") !== "artifact,logicalShard"
  ) {
    throw new Error("Roll log delivery request is invalid");
  }
  const inputArtifact = validateRollLogArtifact(input.artifact);
  const context = await resolveRollLogContext(
    env,
    inputArtifact,
    discordFetch,
  );
  if (context.status !== "resolved") return context;
  const artifact = context.artifact;
  const shard = validateRollLogShard(input.logicalShard, artifact.guildId);
  const telemetryContext = {
    ...rollLogTelemetryContext(artifact, shard),
    ...rollLogDisplayTelemetry(artifact, context.displayContext),
  };
  const payload = {
    flags: 1 << 15,
    components: buildRollLogComponents(
      artifact,
      shard,
      context.displayContext ?? undefined,
    ),
    nonce: `log:${artifact.rollId}`,
    enforce_nonce: true,
    allowed_mentions: { parse: [] },
  };
  const messagesUrl = `${DISCORD_API}/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`;
  let response: Response;
  if (artifact.image.status === "available") {
    const form = new FormData();
    form.set(
      "payload_json",
      JSON.stringify({
        ...payload,
        attachments: [
          {
            id: 0,
            filename: artifact.image.filename,
            description: "Rendered dice result",
          },
        ],
      }),
    );
    form.set(
      "files[0]",
      new Blob([artifact.image.png.slice().buffer], { type: "image/png" }),
      artifact.image.filename,
    );
    response = await discordFetch(
      new Request(messagesUrl, {
        method: "POST",
        headers: {
          authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "user-agent": "Dice-Witch",
        },
        body: form,
      }),
    );
  } else {
    response = await discordJson(
      messagesUrl,
      env.DISCORD_BOT_TOKEN,
      payload,
      discordFetch,
    );
  }
  if (!response.ok) {
    if (isRetryableDiscordStatus(response.status) || response.status === 404) {
      const retryAfterSeconds = numericResponseHeader(response, "retry-after");
      console.warn(
        JSON.stringify({
          telemetryVersion: 2,
          level: "warn",
          message: "Private roll log delivery is retryable",
          subsystem: "private-roll-log",
          ...telemetryContext,
          userImpact: "none",
          failureKind: "delivery-retryable",
          httpStatus: response.status,
        }),
      );
      return {
        status: "retryable",
        httpStatus: response.status,
        retryAfterMs:
          retryAfterSeconds === null
            ? null
            : Math.ceil(retryAfterSeconds * 1_000),
      };
    }
    if (
      artifact.image.status === "available" &&
      (await isImageSpecificDiscordRejection(response))
    ) {
      console.warn(
        JSON.stringify({
          telemetryVersion: 2,
          level: "warn",
          message: "Private roll log image was rejected",
          subsystem: "private-roll-log",
          ...telemetryContext,
          userImpact: "none",
          failureKind: "image-rejected",
          httpStatus: response.status,
        }),
      );
      return { status: "image-rejected", httpStatus: response.status };
    }
    console.error(
      JSON.stringify({
        telemetryVersion: 2,
        level: "error",
        message: "Private roll log delivery failed",
        subsystem: "private-roll-log",
        ...telemetryContext,
        userImpact: "none",
        failureKind: "delivery-rejected",
        httpStatus: response.status,
      }),
    );
    return { status: "failed", httpStatus: response.status };
  }
  const message = DiscordResourceIdentitySchema.safeParse(await response.json());
  if (!message.success) {
    throw new Error("Discord roll log response is invalid");
  }
  console.info(
    JSON.stringify({
      telemetryVersion: 2,
      level: "info",
      message: "Private roll log delivered",
      subsystem: "private-roll-log",
      ...telemetryContext,
      logMessageId: message.data.id,
      userImpact: "none",
      httpStatus: response.status,
    }),
  );
  return { status: "delivered", httpStatus: response.status };
}

function parseChannelRollMessageDeliveryInputV1(
  value: SchemaInput,
): ChannelRollMessageDeliveryInputV1 {
  const result = ChannelRollMessageInputSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Channel roll message delivery request is invalid");
  }
  let payload;
  try {
    payload = validateDiscordMessage(result.data.payload);
  } catch {
    throw new Error("Channel roll message delivery request is invalid");
  }
  if (
    !isComponentsV2Message(payload) ||
    (payload.flags & DISCORD_EPHEMERAL_FLAG) !== 0
  ) {
    throw new Error("Channel roll message delivery request is invalid");
  }
  return { ...result.data, payload };
}

function channelRollResultForm(
  input: Extract<
    ChannelRollMessageDeliveryInputV1,
    { operation: "create-result" | "edit-result" }
  >,
): FormData {
  const form = new FormData();
  form.set(
    "payload_json",
    JSON.stringify({
      ...input.payload,
      allowed_mentions: { parse: [] },
      ...(input.operation === "create-result"
        ? { nonce: input.rollId, enforce_nonce: true }
        : { content: null, embeds: [] }),
      attachments: [
        {
          id: 0,
          filename: input.filename,
          description: "Rendered dice result",
        },
      ],
    }),
  );
  form.set(
    "files[0]",
    new Blob([input.png], { type: "image/png" }),
    input.filename,
  );
  return form;
}

export async function deliverChannelRollMessageV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  value: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<ChannelRollMessageDeliveryResultV1> {
  const input = parseChannelRollMessageDeliveryInputV1(value);
  const messagesUrl = `${DISCORD_API}/channels/${input.channelId}/messages`;
  let response: Response;
  try {
    if (input.operation === "create-clatter") {
      response = await discordJson(
        messagesUrl,
        env.DISCORD_BOT_TOKEN,
        {
          ...input.payload,
          allowed_mentions: { parse: [] },
          nonce: `c${input.rollId}`,
          enforce_nonce: true,
        },
        discordFetch,
      );
    } else {
      const url = input.operation === "create-result"
        ? messagesUrl
        : `${messagesUrl}/${input.messageId}`;
      response = await discordFetch(
        new Request(url, {
          method: input.operation === "create-result" ? "POST" : "PATCH",
          headers: {
            authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
            "user-agent": "Dice-Witch",
          },
          body: channelRollResultForm(input),
        }),
      );
    }
  } catch {
    return { status: "retryable", httpStatus: null, retryAfterMs: null };
  }
  if (!response.ok) {
    if (isRetryableDiscordStatus(response.status)) {
      const retryAfterSeconds = numericResponseHeader(response, "retry-after");
      return {
        status: "retryable",
        httpStatus: response.status,
        retryAfterMs: retryAfterSeconds === null
          ? null
          : Math.ceil(retryAfterSeconds * 1_000),
      };
    }
    return {
      status: "failed",
      httpStatus: response.status,
      discordErrorCode: await discordErrorCode(response),
    };
  }
  const responseBody = DiscordResourceIdentitySchema.safeParse(
    await readBoundedDiscordJson(response),
  );
  if (!responseBody.success) {
    return { status: "invalid_response" };
  }
  return {
    status: "delivered",
    messageId: responseBody.data.id,
    httpStatus: response.status,
  };
}

export async function deliverWebRoll(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  input: {
    rollId?: string;
    guildId: string;
    channelId: string;
    payload: SchemaInput;
    clatter: string;
    filename: string;
    png: Uint8Array;
    skipDelay: boolean;
    delayMs: number;
  },
  discordFetch: RequestFetch = (request) => fetch(request),
  wait: Sleep = sleep,
): Promise<WebRollDeliveryResult> {
  const result = WebRollInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error("Web roll delivery request is invalid");
  }
  const webRoll = result.data;
  const channels = await listTextChannels(env, webRoll.guildId, discordFetch);
  if (!channels.some(({ id }) => id === webRoll.channelId)) {
    return { status: "failed", httpStatus: 404 };
  }

  let referenceId: string | null = null;
  const messagesUrl = `${DISCORD_API}/channels/${webRoll.channelId}/messages`;
  if (!webRoll.skipDelay) {
    const clatterResponse = await discordJson(
      messagesUrl,
      env.DISCORD_BOT_TOKEN,
      webRoll.rollId === undefined
        ? {
            flags: DISCORD_COMPONENTS_V2_FLAG,
            components: [{ type: 10, content: webRoll.clatter }],
            allowed_mentions: { parse: [] },
          }
        : {
            flags: DISCORD_COMPONENTS_V2_FLAG,
            components: [{ type: 10, content: webRoll.clatter }],
            allowed_mentions: { parse: [] },
            nonce: `c${webRoll.rollId}`,
            enforce_nonce: true,
          },
      discordFetch,
    );
    if (clatterResponse.status === 403) return { status: "permission_error" };
    if (!clatterResponse.ok) {
      if (isRetryableDiscordStatus(clatterResponse.status)) {
        const retryAfterSeconds = numericResponseHeader(
          clatterResponse,
          "retry-after",
        );
        return {
          status: "retryable",
          httpStatus: clatterResponse.status,
          retryAfterMs:
            retryAfterSeconds === null
              ? null
              : Math.ceil(retryAfterSeconds * 1_000),
        };
      }
      return { status: "failed", httpStatus: clatterResponse.status };
    }
    const clatterMessage = DiscordResourceIdentitySchema.safeParse(
      await clatterResponse.json(),
    );
    if (!clatterMessage.success) {
      throw new Error("Discord clatter response is invalid");
    }
    referenceId = clatterMessage.data.id;
    await wait(webRoll.delayMs);
  }

  // Empty legacy fields are edit controls for a retained pre-rollout clatter;
  // they do not add legacy content to the resulting Components V2 message.
  const attachments = [
    {
      id: 0,
      filename: webRoll.filename,
      description: "Rendered dice result",
    },
  ];
  let resultPayload;
  if (referenceId !== null) {
    resultPayload = {
      ...webRoll.payload,
      allowed_mentions: { parse: [] },
      content: null,
      embeds: [],
      attachments,
    };
  } else if (webRoll.rollId !== undefined) {
    resultPayload = {
      ...webRoll.payload,
      nonce: webRoll.rollId,
      enforce_nonce: true,
      allowed_mentions: { parse: [] },
      attachments,
    };
  } else {
    resultPayload = {
      ...webRoll.payload,
      allowed_mentions: { parse: [] },
      attachments,
    };
  }
  const form = new FormData();
  form.set("payload_json", JSON.stringify(resultPayload));
  form.set(
    "files[0]",
    new Blob([webRoll.png], { type: "image/png" }),
    webRoll.filename,
  );
  const resultUrl = referenceId === null
    ? messagesUrl
    : `${messagesUrl}/${referenceId}`;
  const response = await discordFetch(
    new Request(resultUrl, {
      method: referenceId === null ? "POST" : "PATCH",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "user-agent": "Dice-Witch",
      },
      body: form,
    }),
  );
  if (response.status === 403) return { status: "permission_error" };
  if (!response.ok) {
    if (isRetryableDiscordStatus(response.status)) {
      const retryAfterSeconds = numericResponseHeader(response, "retry-after");
      return {
        status: "retryable",
        httpStatus: response.status,
        retryAfterMs:
          retryAfterSeconds === null
            ? null
            : Math.ceil(retryAfterSeconds * 1_000),
      };
    }
    return { status: "failed", httpStatus: response.status };
  }
  const message = DiscordResourceIdentitySchema.safeParse(
    await readBoundedDiscordJson(response),
  );
  if (!message.success) {
    throw new Error("Discord web roll response is invalid");
  }
  return { status: "delivered", messageId: message.data.id };
}

export async function resolveDiscordChannelContextV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  value: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<DiscordChannelContextResultV1> {
  const input = parseDiscordChannelContextRequestV1(value);
  let response: Response;
  try {
    response = await discordFetch(
      new Request(`${DISCORD_API}/channels/${input.channelId}`, {
        headers: {
          authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "user-agent": "Dice-Witch",
        },
      }),
    );
  } catch {
    return { status: "retryable", httpStatus: null, retryAfterMs: null };
  }

  if (response.ok) {
    return parseDiscordChannelContextResponseV1(await response.json(), input);
  }
  if (response.status === 403 || response.status === 404) {
    return { status: "unavailable", httpStatus: response.status };
  }
  if (isRetryableDiscordStatus(response.status)) {
    const retryAfterSeconds = numericResponseHeader(response, "retry-after");
    return {
      status: "retryable",
      httpStatus: response.status,
      retryAfterMs:
        retryAfterSeconds === null
          ? null
          : Math.ceil(retryAfterSeconds * 1_000),
    };
  }
  return { status: "failed", httpStatus: response.status };
}

// Keep the original RPC during coordinated Worker rollouts so an older Data
// revision can still resolve context while Discord REST deploys first. Remove
// it after every Data environment uses resolveDiscordChannelContextV1.
export function resolveGameDetectionChannelContextV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  value: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<DiscordChannelContextResultV1> {
  return resolveDiscordChannelContextV1(env, value, discordFetch);
}

function gameDetectionDestination(
  detection: GameDetectionAnnouncementV1,
): string {
  if (detection.scope === "dm") {
    return `Direct message channel ${detection.channelId}`;
  }
  const guild = detection.guildName === null
    ? `Guild ${detection.guildId}`
    : escapeDiscordMarkdown(detection.guildName);
  const channel = detection.channelName === null
    ? `<#${detection.channelId}>`
    : `${escapeDiscordMarkdown(detection.channelName)} (<#${detection.channelId}>)`;
  return `${guild} / ${channel}`;
}

function gameDetectionPayload(detection: GameDetectionAnnouncementV1) {
  const destination = gameDetectionDestination(detection);
  const fields = [
    {
      name: "Game",
      value: `${escapeDiscordMarkdown(detection.gameName)} (\`${detection.gameId}\`)`,
      inline: false,
    },
    {
      name: "Confidence",
      value: detection.confidence,
      inline: true,
    },
    {
      name: "Observed rolls",
      value: String(detection.rollCount),
      inline: true,
    },
    {
      name: "Origin",
      value: destination,
      inline: false,
    },
  ];
  if (detection.previousGameId !== null) {
    fields.push({
      name: "Previous detected game",
      value: `\`${detection.previousGameId}\``,
      inline: false,
    });
  }
  const title = detection.previousGameId === null
    ? "Game detected"
    : "New game detected";
  return {
    flags: (1 << 12) | (1 << 15),
    allowed_mentions: { parse: [] },
    nonce: `g${detection.sessionId.slice(-8)}${detection.detectionId.slice(-16)}`,
    enforce_nonce: true,
    components: [
      {
        type: 17,
        accent_color: 0x9b_59_b6,
        components: [
          { type: 10, content: `## ${title}` },
          ...fields.map((field) => ({
            type: 10,
            content: `**${field.name}**\n${field.value}`,
          })),
          {
            type: 10,
            content: `-# Session ${new Date(detection.sessionStartedAt).toISOString()} – ${new Date(detection.sessionLastRollAt).toISOString()} · detected ${new Date(detection.detectedAt).toISOString()}`,
          },
        ],
      },
    ],
  };
}

export async function createGameDetectionAnnouncementV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "GAME_DETECTION_CHANNEL_ID">,
  value: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<GameDetectionAnnouncementDeliveryResult> {
  const detection = parseGameDetectionAnnouncementV1(value);
  if (!snowflakeSchema.safeParse(env.GAME_DETECTION_CHANNEL_ID).success) {
    throw new Error("Game-detection channel is invalid");
  }

  let response: Response;
  try {
    response = await discordFetch(
      new Request(
        `${DISCORD_API}/channels/${env.GAME_DETECTION_CHANNEL_ID}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
            "content-type": "application/json",
            "user-agent": "Dice-Witch",
          },
          body: JSON.stringify(gameDetectionPayload(detection)),
        },
      ),
    );
  } catch {
    return { status: "retryable", httpStatus: null, retryAfterMs: null };
  }
  if (!response.ok) {
    if (isRetryableDiscordStatus(response.status)) {
      const retryAfterSeconds = numericResponseHeader(response, "retry-after");
      return {
        status: "retryable",
        httpStatus: response.status,
        retryAfterMs:
          retryAfterSeconds === null
            ? null
            : Math.ceil(retryAfterSeconds * 1_000),
      };
    }
    return { status: "failed", httpStatus: response.status };
  }

  const created = DiscordResourceIdentitySchema.safeParse(await response.json());
  if (!created.success) {
    throw new Error("Discord game-detection response is invalid");
  }
  return {
    status: "delivered",
    messageId: created.data.id,
    httpStatus: response.status,
  };
}

function lifecycleAlertPresentation(state: RollLifecycleAlert["state"]) {
  switch (state) {
    case "delivered":
      return { label: "Recovered", color: 0x2e_cc71 };
    case "failed":
      return { label: "Failed", color: 0xe7_4c3c };
    default:
      return { label: "No terminal outcome", color: 0xf3_9c12 };
  }
}

function lifecycleAlertDestination(
  context: RollLifecycleAlert["context"],
): string {
  if (context.guildId === null) return `DM channel ${context.channelId}`;
  const guild = context.guildName === null
    ? `Guild ${context.guildId}`
    : `${escapeDiscordMarkdown(context.guildName)} (${context.guildId})`;
  const channel = context.channelName === null
    ? `<#${context.channelId}> (${context.channelId})`
    : `${escapeDiscordMarkdown(context.channelName)} (${context.channelId})`;
  return `${guild} / ${channel}`;
}

function lifecycleDiagnosticFields(alert: RollLifecycleAlert) {
  if (alert.version === 1) return [];
  const { diagnostics } = alert;
  const acknowledgementAge =
    diagnostics.acknowledgementPreparedAt - alert.receivedAt;
  const providerAttempt = diagnostics.firstProviderAttemptAt === null
    ? "not observed"
    : `${diagnostics.firstProviderAttemptAt - alert.receivedAt} ms after creation`;
  const clatter = diagnostics.clatterSucceededAt === null
    ? "not observed"
    : `${diagnostics.clatterSucceededAt - alert.receivedAt} ms after creation`;
  const destinationError = diagnostics.discordErrorCode === null
    ? "No Discord error code"
    : `Discord ${diagnostics.discordErrorCode}`;
  const messageState = diagnostics.originalResponseProbe ??
    (diagnostics.originalResponseMessageId === null ? "not observed" : "observed");
  return [
    {
      name: "Interaction timing",
      value: `Created → handler ${diagnostics.handlerStartedAt - alert.receivedAt} ms · handler → acknowledgement ${diagnostics.acknowledgementPreparedAt - diagnostics.handlerStartedAt} ms · total ${acknowledgementAge} ms (${acknowledgementAge >= 3_000 ? "prepared after 3 s" : "prepared before 3 s"}; edge delivery requires invocation logs) · type ${diagnostics.acknowledgementType}`,
      inline: false,
    },
    {
      name: "Discord destination",
      value: `${destinationError} · ${diagnostics.discordOperation ?? "no failed operation"} · provider attempt ${providerAttempt} · clatter ${clatter} · original message ${messageState}`,
      inline: false,
    },
  ];
}

function lifecycleAlertPayload(alert: RollLifecycleAlert) {
  const { context } = alert;
  const presentation = lifecycleAlertPresentation(alert.state);
  const resultSummary = JSON.stringify(context.outcome);
  const fields = [
    { name: "Interaction", value: alert.interactionId },
    { name: "State", value: alert.state },
    { name: "Attempts", value: String(alert.attempts) },
    {
      name: "User",
      value: `${escapeDiscordMarkdown(context.username)} (${context.userId})`,
    },
    { name: "Destination", value: lifecycleAlertDestination(context) },
    {
      name: "Notation",
      value: escapeDiscordMarkdown(context.notation).slice(0, 1_024),
    },
    {
      name: "Failure",
      value: alert.failureCode === null
        ? "No terminal failure code"
        : `${alert.failureCode} · ${alert.failurePhase ?? "unknown phase"}`,
    },
    {
      name: "Result snapshot",
      value: escapeDiscordMarkdown(resultSummary).slice(0, 1_024),
    },
    ...lifecycleDiagnosticFields(alert),
  ];
  const filename = `roll-lifecycle-${alert.interactionId}.json`;
  const textComponents = [
    { type: 10, content: `## Roll lifecycle alert: ${presentation.label}` },
    ...fields.map((field) => ({
      type: 10,
      content: `**${field.name}**\n${field.value}`,
    })),
    {
      type: 10,
      content: `-# ${alert.acceptedAt === null ? "Deferred" : "Accepted"} ${new Date(alert.acceptedAt ?? alert.deferredAt).toISOString()} · HTTP ${alert.httpStatus === null ? "n/a" : String(alert.httpStatus)}`,
    },
  ];
  const containers = [];
  for (let index = 0; index < textComponents.length; index += 10) {
    containers.push({
      type: 17,
      accent_color: presentation.color,
      components: textComponents.slice(index, index + 10),
    });
  }
  return {
    flags: (1 << 12) | DISCORD_COMPONENTS_V2_FLAG,
    allowed_mentions: { parse: [] },
    components: [
      ...containers,
      { type: 13, file: { url: `attachment://${filename}` } },
    ],
  };
}

function lifecycleAlertForm(alert: RollLifecycleAlert, create: boolean): FormData {
  const filename = `roll-lifecycle-${alert.interactionId}.json`;
  const payload = {
    ...lifecycleAlertPayload(alert),
    ...(create
      ? { nonce: `l${alert.interactionId}`, enforce_nonce: true }
      : { content: null, embeds: [] }),
    attachments: [
      {
        id: "0",
        filename,
        description: "Token-free roll lifecycle diagnostic context",
      },
    ],
  };
  const form = new FormData();
  form.set("payload_json", JSON.stringify(payload));
  form.set(
    "files[0]",
    new Blob([JSON.stringify(alert, null, 2)], {
      type: "application/json",
    }),
    filename,
  );
  return form;
}

async function deliverRollLifecycleAlert(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "ROLL_LIFECYCLE_ALERT_CHANNEL_ID">,
  value: SchemaInput,
  operation: "create" | "update",
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<RollLifecycleAlertDeliveryResult> {
  const alert = parseRollLifecycleAlert(value);
  if (!snowflakeSchema.safeParse(env.ROLL_LIFECYCLE_ALERT_CHANNEL_ID).success) {
    throw new Error("Roll lifecycle alert channel is invalid");
  }
  if (operation === "update" && alert.alertMessageId === null) {
    throw new Error("Roll lifecycle alert message id is required");
  }
  const messageId = alert.alertMessageId;
  const url = messageId === null
    ? `${DISCORD_API}/channels/${env.ROLL_LIFECYCLE_ALERT_CHANNEL_ID}/messages`
    : `${DISCORD_API}/channels/${env.ROLL_LIFECYCLE_ALERT_CHANNEL_ID}/messages/${messageId}`;
  let response: Response;
  try {
    response = await discordFetch(
      new Request(url, {
        method: messageId === null ? "POST" : "PATCH",
        headers: {
          authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "user-agent": "Dice-Witch",
        },
        body: lifecycleAlertForm(alert, messageId === null),
      }),
    );
  } catch {
    return { status: "retryable", httpStatus: null, retryAfterMs: null };
  }
  if (!response.ok) {
    if (isRetryableDiscordStatus(response.status)) {
      const retryAfterSeconds = numericResponseHeader(response, "retry-after");
      return {
        status: "retryable",
        httpStatus: response.status,
        retryAfterMs:
          retryAfterSeconds === null
            ? null
            : Math.ceil(retryAfterSeconds * 1_000),
      };
    }
    return { status: "failed", httpStatus: response.status };
  }
  const created = DiscordResourceIdentitySchema.safeParse(await response.json());
  if (
    !created.success ||
    (messageId !== null && created.data.id !== messageId)
  ) {
    throw new Error("Discord roll lifecycle alert response is invalid");
  }
  return {
    status: "delivered",
    messageId: created.data.id,
    httpStatus: response.status,
  };
}

export function createRollLifecycleAlertV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "ROLL_LIFECYCLE_ALERT_CHANNEL_ID">,
  value: SchemaInput,
  discordFetch?: RequestFetch,
): Promise<RollLifecycleAlertDeliveryResult> {
  return deliverRollLifecycleAlert(env, value, "create", discordFetch);
}

export function updateRollLifecycleAlertV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "ROLL_LIFECYCLE_ALERT_CHANNEL_ID">,
  value: SchemaInput,
  discordFetch?: RequestFetch,
): Promise<RollLifecycleAlertDeliveryResult> {
  return deliverRollLifecycleAlert(env, value, "update", discordFetch);
}

export function createRollLifecycleAlertV2(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "ROLL_LIFECYCLE_ALERT_CHANNEL_ID">,
  value: SchemaInput,
  discordFetch?: RequestFetch,
): Promise<RollLifecycleAlertDeliveryResult> {
  return deliverRollLifecycleAlert(env, value, "create", discordFetch);
}

export function updateRollLifecycleAlertV2(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "ROLL_LIFECYCLE_ALERT_CHANNEL_ID">,
  value: SchemaInput,
  discordFetch?: RequestFetch,
): Promise<RollLifecycleAlertDeliveryResult> {
  return deliverRollLifecycleAlert(env, value, "update", discordFetch);
}

export type DiscordMessageExistenceResult = {
  outcome: RollLifecycleMessageProbeOutcome;
};

export async function inspectDiscordMessageExistence(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  value: SchemaInput,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<DiscordMessageExistenceResult> {
  const input = MessageProbeInputSchema.safeParse(value);
  if (!input.success) {
    throw new Error("Discord message existence request is invalid");
  }
  let response: Response;
  try {
    response = await discordFetch(
      new Request(
        `${DISCORD_API}/channels/${input.data.channelId}/messages/${input.data.messageId}`,
        {
          headers: {
            authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
            "user-agent": "Dice-Witch",
          },
          signal: AbortSignal.timeout(MESSAGE_PROBE_TIMEOUT_MS),
        },
      ),
    );
  } catch {
    return { outcome: "probe-failed" };
  }
  if (response.ok) return { outcome: "exists" };
  if (response.status === 403) return { outcome: "inaccessible" };
  if (response.status !== 404) return { outcome: "probe-failed" };
  try {
    const error = DiscordErrorSchema.safeParse(
      await readBoundedDiscordJson(response),
    );
    if (error.success && error.data.code === 10_008) {
      return { outcome: "missing" };
    }
    if (
      error.success &&
      (error.data.code === 10_003 || error.data.code === 50_001)
    ) {
      return { outcome: "inaccessible" };
    }
  } catch {
    // A malformed provider response is inconclusive.
  }
  return { outcome: "probe-failed" };
}

export async function inspectMembership(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  guildId: string,
  userId: string,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<MembershipInspection> {
  if (
    !snowflakeSchema.safeParse(guildId).success ||
    !snowflakeSchema.safeParse(userId).success
  ) {
    throw new Error("Membership identifiers are invalid");
  }
  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "user-agent": "Dice-Witch",
  };
  const memberResponse = await discordFetch(
    new Request(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
      headers,
    }),
  );
  if (memberResponse.status === 404) return { status: "missing" };
  if (!memberResponse.ok) {
    throw new Error("Discord guild member request failed");
  }
  const assignedRoleIds = new Set([
    guildId,
    ...parseMemberRoles(await memberResponse.json()),
  ]);
  const [rolesResponse, guildResponse] = await Promise.all([
    discordFetch(
      new Request(`${DISCORD_API}/guilds/${guildId}/roles`, { headers }),
    ),
    discordFetch(new Request(`${DISCORD_API}/guilds/${guildId}`, { headers })),
  ]);
  if (!rolesResponse.ok) {
    throw new Error("Discord guild roles request failed");
  }
  if (!guildResponse.ok) {
    throw new Error("Discord guild request failed");
  }
  const roles = inspectAssignedRoles(
    await rolesResponse.json(),
    assignedRoleIds,
  );
  return {
    status: "found",
    isAdmin:
      roles.isAdmin || parseGuildOwnerId(await guildResponse.json()) === userId,
    isDiceWitchAdmin: roles.isDiceWitchAdmin,
  };
}

export class DiscordRestService extends WorkerEntrypoint<DiscordRestBindings> {
  private async botEnv() {
    return {
      ...this.env,
      DISCORD_BOT_TOKEN: await readWorkerSecret(
        this.env.DISCORD_BOT_TOKEN,
        "DISCORD_BOT_TOKEN",
      ),
    };
  }

  async registerGlobalCommands(): Promise<CommandRegistrationResult> {
    return registerGlobalCommands(await this.botEnv());
  }

  async registerDevelopmentGuildCommands(): Promise<CommandRegistrationResult> {
    return registerDevelopmentGuildCommands(await this.botEnv());
  }

  async getPublicStats(): Promise<LegacyPublicDiscordStats> {
    const stats = await fetchPublicStats(await this.botEnv(), 1);
    return {
      servers: stats.liveGuilds,
      users: stats.estimatedGuildMemberships,
    };
  }

  async reportBotListStats(): Promise<LegacyBotListReportResult> {
    const result = await this.reportBotListStatsV1({ shardCount: 1 });
    return {
      status: result.status,
      servers: result.liveGuilds,
      users: result.estimatedGuildMemberships,
      topggHttpStatus: result.topggHttpStatus,
      discordBotListHttpStatus: result.discordBotListHttpStatus,
    };
  }

  async captureAudienceSnapshotV1(
    input: SchemaInput,
  ): Promise<DiscordAudienceCaptureV1> {
    return captureAudienceSnapshot(
      await this.botEnv(),
      parseShardCountInput(input),
    );
  }

  async reportBotListStatsV1(input: SchemaInput): Promise<BotListReportResult> {
    const env = await this.botEnv();
    return reportBotListStats(
      {
        ...env,
        TOPGG_KEY: await readWorkerSecret(this.env.TOPGG_KEY, "TOPGG_KEY"),
        DISCORD_BOT_LIST_KEY: await readWorkerSecret(
          this.env.DISCORD_BOT_LIST_KEY,
          "DISCORD_BOT_LIST_KEY",
        ),
      },
      parseShardCountInput(input),
    );
  }

  async listCurrentGuildIds(): Promise<string[]> {
    return listCurrentGuildIds(await this.botEnv());
  }

  async listCurrentGuildIdsPage(
    after: string | null,
  ): Promise<CurrentGuildIdsPage> {
    return listCurrentGuildIdsPage(await this.botEnv(), after);
  }

  async logGuildLifecycle(input: SchemaInput): Promise<GuildLifecycleLogResult> {
    return logGuildLifecycle(await this.botEnv(), input);
  }

  async sendRollHelper(input: SchemaInput): Promise<RollHelperResult> {
    return sendRollHelper(await this.botEnv(), input);
  }

  async logRoll(input: SchemaInput): Promise<RollLogResult> {
    return logRoll(await this.botEnv(), input);
  }

  async deliverRollLogV1(
    input: DeliverRollLogInputV1,
  ): Promise<DeliverRollLogResultV1> {
    return deliverRollLogV1(await this.botEnv(), input);
  }

  async createGameDetectionAnnouncementV1(input: SchemaInput) {
    return createGameDetectionAnnouncementV1(await this.botEnv(), input);
  }

  async resolveDiscordChannelContextV1(input: SchemaInput) {
    return resolveDiscordChannelContextV1(await this.botEnv(), input);
  }

  async resolveGameDetectionChannelContextV1(input: SchemaInput) {
    return resolveDiscordChannelContextV1(await this.botEnv(), input);
  }

  async createRollLifecycleAlertV1(input: SchemaInput) {
    return createRollLifecycleAlertV1(await this.botEnv(), input);
  }

  async updateRollLifecycleAlertV1(input: SchemaInput) {
    return updateRollLifecycleAlertV1(await this.botEnv(), input);
  }

  async createRollLifecycleAlertV2(input: SchemaInput) {
    return createRollLifecycleAlertV2(await this.botEnv(), input);
  }

  async updateRollLifecycleAlertV2(input: SchemaInput) {
    return updateRollLifecycleAlertV2(await this.botEnv(), input);
  }

  async deliverChannelRollMessageV1(input: SchemaInput) {
    return deliverChannelRollMessageV1(await this.botEnv(), input);
  }

  async deliverWebRoll(input: Parameters<typeof deliverWebRoll>[1]) {
    return deliverWebRoll(await this.botEnv(), input);
  }

  async listTextChannels(
    guildId: string,
    userId?: string,
  ): Promise<TextChannel[]> {
    const env = await this.botEnv();
    return userId === undefined
      ? listTextChannels(env, guildId)
      : listMemberTextChannels(env, guildId, userId);
  }

  async inspectMembership(
    guildId: string,
    userId: string,
  ): Promise<MembershipInspection> {
    return inspectMembership(await this.botEnv(), guildId, userId);
  }

  async inspectRollerGuild(
    guildId: string,
    userId: string,
  ): Promise<RollerGuildInspection> {
    return inspectRollerGuild(await this.botEnv(), guildId, userId);
  }
}

export class DiscordMessageProbeService extends WorkerEntrypoint<DiscordRestBindings> {
  async inspectDiscordMessageExistence(input: SchemaInput) {
    return inspectDiscordMessageExistence(
      {
        ...this.env,
        DISCORD_BOT_TOKEN: await readWorkerSecret(
          this.env.DISCORD_BOT_TOKEN,
          "DISCORD_BOT_TOKEN",
        ),
      },
      input,
    );
  }
}

export default {
  fetch(): Response {
    return Response.json(
      { error: "Not found" },
      {
        status: 404,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  },
} satisfies ExportedHandler<DiscordRestBindings>;
