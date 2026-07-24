import { WorkerEntrypoint } from "cloudflare:workers";
import { readWorkerSecret, type WorkerSecretSource } from "../../../packages/worker-secrets/src";
import {
  buildRollHelperMessage,
  DISCORD_AUDIENCE_SNAPSHOT_VERSION,
  DISCORD_GLOBAL_COMMANDS,
  isDiscordRollChannelType,
  rollLogContextDescription,
  rollLogMetadataDescription,
  rollLogResultDescription,
  validateRollLogArtifact,
  type DeliverRollLogInputV1,
  type DeliverRollLogResultV1,
  type DiscordAudienceCaptureV1,
  type RollLoggingContext,
  type RollLogArtifactV1,
  type RollLogShardV1,
} from "../../../packages/discord-contracts/src";

export type DiscordRestEnv = {
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_TEST_GUILD_ID: string;
  INVITE_LINK: string;
  SUPPORT_SERVER_LINK: string;
  LOG_OUTPUT_CHANNEL_ID: string;
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
const DICE_WITCH_ADMIN_ROLE = "Dice Witch Admin";
const MAX_GUILDS_PER_STATS_RUN = 100_000;
const MAX_SHARDS_PER_STATS_RUN = 1_000;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const ROLL_LOG_TITLE = "receivedCommand: /roll";
const INVALID_ROLL_LOG_TITLE = "invalidRoll: /roll";
const MAX_EMBED_CHARACTERS = 6_000;

export type MembershipInspection =
  | { status: "found"; isDiceWitchAdmin: boolean }
  | { status: "missing" };

export type TextChannel = {
  id: string;
  name: string;
  type: 0 | 5;
};

export type WebRollDeliveryResult =
  | { status: "delivered" }
  | { status: "permission_error" }
  | { status: "failed"; httpStatus: number }
  | {
      status: "retryable";
      httpStatus: number;
      retryAfterMs: number | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdvancingGuildCursor(
  after: string | null,
  nextAfter: string,
): boolean {
  return after === null || BigInt(nextAfter) > BigInt(after);
}

function isRollLoggingContext(
  value: unknown,
  guildId: string | null,
  channelId: string,
): value is RollLoggingContext {
  if (!isRecord(value) || value.channelId !== channelId) return false;
  if (value.kind === "dm") {
    return guildId === null && Object.keys(value).length === 2;
  }
  return (
    value.kind === "guild" &&
    guildId !== null &&
    value.guildId === guildId &&
    typeof value.guildName === "string" &&
    value.guildName.length >= 2 &&
    value.guildName.length <= 100 &&
    typeof value.channelName === "string" &&
    value.channelName.length >= 1 &&
    value.channelName.length <= 100 &&
    isDiscordRollChannelType(value.channelType) &&
    Object.keys(value).length === 6
  );
}

function isRollLogInput(value: unknown): value is RollLogInput {
  return (
    isRecord(value) &&
    typeof value.rollId === "string" &&
    SNOWFLAKE.test(value.rollId) &&
    (value.source === "discord" || value.source === "web") &&
    typeof value.notation === "string" &&
    value.notation.length > 0 &&
    typeof value.username === "string" &&
    value.username.length > 0 &&
    (value.guildId === null ||
      (typeof value.guildId === "string" && SNOWFLAKE.test(value.guildId))) &&
    typeof value.channelId === "string" &&
    SNOWFLAKE.test(value.channelId) &&
    (value.context === undefined ||
      isRollLoggingContext(value.context, value.guildId, value.channelId))
  );
}

function parseMemberRoles(value: unknown): string[] {
  if (
    !isRecord(value) ||
    !Array.isArray(value.roles) ||
    !value.roles.every(
      (roleId): roleId is string =>
        typeof roleId === "string" && SNOWFLAKE.test(roleId),
    )
  ) {
    throw new Error("Discord guild member response is invalid");
  }
  return value.roles;
}

function hasNamedRole(value: unknown, assignedRoleIds: Set<string>): boolean {
  if (!Array.isArray(value)) {
    throw new Error("Discord guild roles response is invalid");
  }
  let hasRole = false;
  for (const role of value) {
    if (
      !isRecord(role) ||
      typeof role.id !== "string" ||
      !SNOWFLAKE.test(role.id) ||
      typeof role.name !== "string"
    ) {
      throw new Error("Discord guild roles response is invalid");
    }
    if (role.name === DICE_WITCH_ADMIN_ROLE && assignedRoleIds.has(role.id)) {
      hasRole = true;
    }
  }
  return hasRole;
}

function hasRegisteredFudgeChoice(command: Record<string, unknown>): boolean {
  if (!Array.isArray(command.options)) return false;
  const topic = (command.options as unknown[]).find(
    (option) => isRecord(option) && option.name === "topic",
  );
  if (!isRecord(topic) || !Array.isArray(topic.choices)) return false;
  return (topic.choices as unknown[]).some(
    (choice) =>
      isRecord(choice) &&
      choice.name === "Fudge dice" &&
      choice.value === "fudge",
  );
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
  const value: unknown = await response.json();
  if (!Array.isArray(value) || value.length !== DISCORD_GLOBAL_COMMANDS.length) {
    throw new Error("Discord command registration response is invalid");
  }
  const commandNames: string[] = [];
  let hasFudgeChoice = false;
  for (const command of value as unknown[]) {
    if (
      !isRecord(command) ||
      typeof command.id !== "string" ||
      !SNOWFLAKE.test(command.id) ||
      typeof command.name !== "string"
    ) {
      throw new Error("Discord command registration response is invalid");
    }
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
  if (!SNOWFLAKE.test(env.DISCORD_APPLICATION_ID)) {
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
    !SNOWFLAKE.test(env.DISCORD_APPLICATION_ID) ||
    !SNOWFLAKE.test(env.DISCORD_TEST_GUILD_ID)
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
  if (
    !Number.isSafeInteger(shardCount) ||
    shardCount < 1 ||
    shardCount > MAX_SHARDS_PER_STATS_RUN
  ) {
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
    const page: unknown = await response.json();
    if (!Array.isArray(page) || page.length > 200) {
      throw new Error("Discord guild stats response is invalid");
    }
    if (page.length === 0) break;
    for (const guild of page) {
      if (
        !isRecord(guild) ||
        typeof guild.id !== "string" ||
        !SNOWFLAKE.test(guild.id) ||
        seen.has(guild.id) ||
        !Number.isSafeInteger(guild.approximate_member_count) ||
        Number(guild.approximate_member_count) < 0
      ) {
        throw new Error("Discord guild stats response is invalid");
      }
      seen.add(guild.id);
      if (seen.size > MAX_GUILDS_PER_STATS_RUN) {
        throw new Error("Discord guild stats limit exceeded");
      }
      const shardId = Number((BigInt(guild.id) >> 22n) % BigInt(shardCount));
      const shardGuilds = guildCountsByShard[shardId];
      if (shardGuilds === undefined) {
        throw new Error("Discord guild stats shard calculation failed");
      }
      guildCountsByShard[shardId] = shardGuilds + 1;
      estimatedGuildMemberships += Number(guild.approximate_member_count);
      if (!Number.isSafeInteger(estimatedGuildMemberships)) {
        throw new Error("Discord guild stats total is invalid");
      }
    }
    const last: unknown = page[page.length - 1];
    if (
      !isRecord(last) ||
      typeof last.id !== "string" ||
      !isAdvancingGuildCursor(after, last.id)
    ) {
      throw new Error("Discord guild stats response is invalid");
    }
    after = last.id;
  }
  return {
    liveGuilds: seen.size,
    estimatedGuildMemberships,
    shardCount,
    guildCountsByShard,
  };
}

async function postBotListStat(
  url: string,
  token: string,
  body: unknown,
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
  if (!Number.isSafeInteger(capturedAt) || capturedAt < 0) {
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
  if (
    !SNOWFLAKE.test(env.DISCORD_APPLICATION_ID) ||
    env.TOPGG_KEY.trim() !== env.TOPGG_KEY ||
    env.TOPGG_KEY.length === 0 ||
    env.DISCORD_BOT_LIST_KEY.trim() !== env.DISCORD_BOT_LIST_KEY ||
    env.DISCORD_BOT_LIST_KEY.length === 0
  ) {
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

function parseShardCountInput(value: unknown): number {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Number.isSafeInteger(value.shardCount) ||
    Number(value.shardCount) < 1 ||
    Number(value.shardCount) > MAX_SHARDS_PER_STATS_RUN
  ) {
    throw new Error("Discord guild stats request is invalid");
  }
  return Number(value.shardCount);
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
    const value: unknown = await response.json();
    const retryAfter = isRecord(value) ? value.retry_after : undefined;
    const delayMs =
      typeof retryAfter === "number" ? Math.ceil(retryAfter * 1_000) : NaN;
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
  if (after !== null && !SNOWFLAKE.test(after)) {
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
  const page: unknown = await response.json();
  if (!Array.isArray(page) || page.length > 200) {
    throw new Error("Discord guild list response is invalid");
  }
  const guildIds = page.map((guild) => {
    if (
      !isRecord(guild) ||
      typeof guild.id !== "string" ||
      !SNOWFLAKE.test(guild.id)
    ) {
      throw new Error("Discord guild list response is invalid");
    }
    return guild.id;
  });
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
  if (!SNOWFLAKE.test(guildId)) {
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
  const value: unknown = await response.json();
  if (!Array.isArray(value)) {
    throw new Error("Discord guild channels response is invalid");
  }
  const channels: TextChannel[] = [];
  for (const channel of value) {
    if (!isRecord(channel) || typeof channel.type !== "number") {
      throw new Error("Discord guild channels response is invalid");
    }
    if (channel.type !== 0 && channel.type !== 5) continue;
    if (
      typeof channel.id !== "string" ||
      !SNOWFLAKE.test(channel.id) ||
      typeof channel.name !== "string" ||
      channel.name.length < 1 ||
      channel.name.length > 100
    ) {
      throw new Error("Discord guild channels response is invalid");
    }
    channels.push({ id: channel.id, name: channel.name, type: channel.type });
  }
  return channels;
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
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function discordErrorCode(response: Response): Promise<number | null> {
  try {
    const value: unknown = await response.clone().json();
    return isRecord(value) &&
      typeof value.code === "number" &&
      Number.isSafeInteger(value.code)
      ? value.code
      : null;
  } catch {
    return null;
  }
}

async function discordJson(
  url: string,
  token: string,
  body: unknown,
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
  input: unknown,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<GuildLifecycleLogResult> {
  if (
    !isRecord(input) ||
    Object.keys(input).length !== 3 ||
    (input.eventType !== "guildAdd" && input.eventType !== "guildRemove") ||
    typeof input.guildName !== "string" ||
    input.guildName.length < 1 ||
    input.guildName.length > 255 ||
    typeof input.mutationId !== "string" ||
    input.mutationId.length < 1 ||
    input.mutationId.length > 255
  ) {
    throw new Error("Guild lifecycle log request is invalid");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.mutationId),
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
      embeds: [
        {
          color: input.eventType === "guildAdd" ? 0x00_ff_00 : 0xff_00_00,
          title: input.eventType,
          description: input.guildName,
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
  input: unknown,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<RollHelperResult> {
  if (
    !isRecord(input) ||
    Object.keys(input).length !== 2 ||
    typeof input.rollId !== "string" ||
    !SNOWFLAKE.test(input.rollId) ||
    typeof input.userId !== "string" ||
    !SNOWFLAKE.test(input.userId)
  ) {
    throw new Error("Roll helper request is invalid");
  }
  const channelResponse = await discordJson(
    `${DISCORD_API}/users/@me/channels`,
    env.DISCORD_BOT_TOKEN,
    { recipient_id: input.userId },
    discordFetch,
  );
  if (!channelResponse.ok) throw new Error("Discord DM channel request failed");
  const channel: unknown = await channelResponse.json();
  if (!isRecord(channel) || typeof channel.id !== "string" || !SNOWFLAKE.test(channel.id)) {
    throw new Error("Discord DM channel response is invalid");
  }
  const messageResponse = await discordJson(
    `${DISCORD_API}/channels/${channel.id}/messages`,
    env.DISCORD_BOT_TOKEN,
    {
      ...buildRollHelperMessage({
        inviteUrl: env.INVITE_LINK,
        supportUrl: env.SUPPORT_SERVER_LINK,
      }),
      nonce: input.rollId,
      enforce_nonce: true,
    },
    discordFetch,
  );
  if (!messageResponse.ok) throw new Error("Discord roll helper delivery failed");
  const message: unknown = await messageResponse.json();
  if (!isRecord(message) || typeof message.id !== "string" || !SNOWFLAKE.test(message.id)) {
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
  const channelType = [10, 11, 12].includes(context.channelType)
    ? "thread"
    : "channel";
  return `${channelType} **${escapeDiscordMarkdown(context.channelName)}** on **${escapeDiscordMarkdown(context.guildName)}** [HTTP]`;
}

export async function logRoll(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "LOG_OUTPUT_CHANNEL_ID">,
  input: unknown,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<RollLogResult> {
  if (!SNOWFLAKE.test(env.LOG_OUTPUT_CHANNEL_ID) || !isRollLogInput(input)) {
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
      const channel: unknown = await channelResponse.json();
      const guild: unknown = await guildResponse.json();
      if (
        !isRecord(channel) ||
        channel.id !== input.channelId ||
        channel.guild_id !== input.guildId ||
        typeof channel.name !== "string" ||
        channel.name.length < 1 ||
        !isDiscordRollChannelType(channel.type)
      ) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Discord roll log context response is invalid",
            context: "channel",
            channelType: isRecord(channel) ? Number(channel.type) : null,
          }),
        );
        throw new Error("Discord roll log context response is invalid");
      }
      if (
        !isRecord(guild) ||
        guild.id !== input.guildId ||
        typeof guild.name !== "string" ||
        guild.name.length < 1
      ) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Discord roll log context response is invalid",
            context: "guild",
          }),
        );
        throw new Error("Discord roll log context response is invalid");
      }
      const channelType = [10, 11, 12].includes(channel.type)
        ? "thread"
        : "channel";
      location = `${channelType} **${escapeDiscordMarkdown(channel.name)}** on **${escapeDiscordMarkdown(guild.name)}** [HTTP]`;
    }
  }

  const source = input.source === "web" ? "Web" : "Discord";
  const description = `${input.notation} from **${input.username}** [${source}] in ${location}`;
  if (description.length > 4_096) {
    throw new Error("Roll log description is invalid");
  }
  const response = await discordJson(
    `${DISCORD_API}/channels/${env.LOG_OUTPUT_CHANNEL_ID}/messages`,
    env.DISCORD_BOT_TOKEN,
    {
      nonce: `log:${input.rollId}`,
      enforce_nonce: true,
      embeds: [
        {
          color: 0x99_99_99,
          title: "receivedCommand: /roll",
          description,
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
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.id !== "string" || !SNOWFLAKE.test(value.id)) {
    throw new Error("Discord roll log response is invalid");
  }
  return { status: "delivered" };
}

function validateRollLogShard(
  value: unknown,
  guildId: string | null,
): RollLogShardV1 {
  if (!isRecord(value)) throw new Error("Roll log shard is invalid");
  if (
    value.status === "not-applicable" &&
    guildId === null &&
    Object.keys(value).length === 1
  ) {
    return { status: "not-applicable" };
  }
  if (
    value.status === "unavailable" &&
    guildId !== null &&
    Object.keys(value).length === 1
  ) {
    return { status: "unavailable" };
  }
  if (
    value.status !== "available" ||
    guildId === null ||
    Object.keys(value).sort().join(",") !==
      "generation,shardCount,shardId,status" ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 1 ||
    !Number.isSafeInteger(value.shardCount) ||
    Number(value.shardCount) < 1 ||
    !Number.isSafeInteger(value.shardId) ||
    Number(value.shardId) < 0 ||
    Number(value.shardId) >= Number(value.shardCount)
  ) {
    throw new Error("Roll log shard is invalid");
  }
  return {
    status: "available",
    shardId: Number(value.shardId),
    shardCount: Number(value.shardCount),
    generation: Number(value.generation),
  };
}

async function isImageSpecificDiscordRejection(
  response: Response,
): Promise<boolean> {
  if (response.status === 413) return true;
  if (response.status !== 400) return false;
  const code = await discordErrorCode(response);
  if (code === 40_005 || code === 50_045) return true;
  try {
    const body: unknown = await response.clone().json();
    if (!isRecord(body) || !isRecord(body.errors)) return false;
    return Object.keys(body.errors).some(
      (key) => key === "attachments" || key === "files",
    );
  } catch {
    return false;
  }
}

async function resolveRollLogContext(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  artifact: RollLogArtifactV1,
  discordFetch: RequestFetch,
): Promise<RollLogArtifactV1> {
  if (artifact.guildId === null || artifact.context !== null) return artifact;
  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "user-agent": "Dice-Witch",
  };
  const [channelResponse, guildResponse] = await Promise.all([
    discordFetch(
      new Request(`${DISCORD_API}/channels/${artifact.channelId}`, { headers }),
    ),
    discordFetch(
      new Request(`${DISCORD_API}/guilds/${artifact.guildId}`, { headers }),
    ),
  ]);
  if (!channelResponse.ok || !guildResponse.ok) {
    throw new Error("Discord roll log context is unavailable");
  }
  const channel: unknown = await channelResponse.json();
  const guild: unknown = await guildResponse.json();
  if (
    !isRecord(channel) ||
    channel.id !== artifact.channelId ||
    channel.guild_id !== artifact.guildId ||
    typeof channel.name !== "string" ||
    channel.name.length < 1 ||
    !isDiscordRollChannelType(channel.type) ||
    !isRecord(guild) ||
    guild.id !== artifact.guildId ||
    typeof guild.name !== "string" ||
    guild.name.length < 1
  ) {
    throw new Error("Discord roll log context response is invalid");
  }
  return {
    ...artifact,
    context: {
      kind: "guild",
      guildId: artifact.guildId,
      guildName: guild.name,
      channelId: artifact.channelId,
      channelName: channel.name,
      channelType: channel.type,
    },
  };
}

function buildRollLogEmbed(
  artifact: RollLogArtifactV1,
  shard: RollLogShardV1,
) {
  const resultDescription = rollLogResultDescription(artifact);
  const isInvalidRoll =
    artifact.image.status === "unavailable" &&
    artifact.image.reason === "not-applicable";
  const errorDescription = isInvalidRoll ? artifact.payload.content : undefined;
  const errorSuffix =
    errorDescription === undefined ? "" : `\n\n${errorDescription}`;
  const description =
    resultDescription === null
      ? `${rollLogMetadataDescription(
          artifact,
          shard,
          4_096 - errorSuffix.length,
        )}${errorSuffix}`
      : `${rollLogContextDescription(artifact, shard)}\n\n${resultDescription}`;
  const title = isInvalidRoll ? INVALID_ROLL_LOG_TITLE : ROLL_LOG_TITLE;
  const footer =
    artifact.image.status === "unavailable" &&
    artifact.image.reason !== "not-applicable"
      ? { text: "Image unavailable" }
      : undefined;
  if (
    description.length > 4_096 ||
    title.length + description.length + (footer?.text.length ?? 0) >
      MAX_EMBED_CHARACTERS
  ) {
    throw new Error("Roll log embed exceeds Discord's limits");
  }
  return {
    color: isInvalidRoll ? 0xff_00_00 : 0x99_99_99,
    title,
    description,
    ...(footer === undefined ? {} : { footer }),
    ...(artifact.image.status === "available"
      ? { image: { url: `attachment://${artifact.image.filename}` } }
      : {}),
  };
}

export async function deliverRollLogV1(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN" | "LOG_OUTPUT_CHANNEL_ID">,
  input: DeliverRollLogInputV1,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<DeliverRollLogResultV1> {
  if (
    !SNOWFLAKE.test(env.LOG_OUTPUT_CHANNEL_ID) ||
    !isRecord(input) ||
    Object.keys(input).sort().join(",") !== "artifact,logicalShard"
  ) {
    throw new Error("Roll log delivery request is invalid");
  }
  const artifact = await resolveRollLogContext(
    env,
    validateRollLogArtifact(input.artifact),
    discordFetch,
  );
  const shard = validateRollLogShard(input.logicalShard, artifact.guildId);
  const payload = {
    embeds: [buildRollLogEmbed(artifact, shard)],
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
          level: "warn",
          message: "Private roll log delivery is retryable",
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
          level: "warn",
          message: "Private roll log image was rejected",
          httpStatus: response.status,
        }),
      );
      return { status: "image-rejected", httpStatus: response.status };
    }
    console.error(
      JSON.stringify({
        level: "error",
        message: "Private roll log delivery failed",
        httpStatus: response.status,
      }),
    );
    return { status: "failed", httpStatus: response.status };
  }
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.id !== "string" || !SNOWFLAKE.test(value.id)) {
    throw new Error("Discord roll log response is invalid");
  }
  console.info(
    JSON.stringify({ level: "info", message: "Private roll log delivered" }),
  );
  return { status: "delivered", httpStatus: response.status };
}

export async function deliverWebRoll(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  input: {
    rollId?: string;
    guildId: string;
    channelId: string;
    payload: unknown;
    clatter: string;
    filename: string;
    png: Uint8Array;
    skipDelay: boolean;
  },
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<WebRollDeliveryResult> {
  if (
    (input.rollId !== undefined && !SNOWFLAKE.test(input.rollId)) ||
    !SNOWFLAKE.test(input.guildId) ||
    !SNOWFLAKE.test(input.channelId) ||
    !isRecord(input.payload) ||
    input.clatter.length < 1 ||
    input.clatter.length > 2_000 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.png$/i.test(input.filename) ||
    !(input.png instanceof Uint8Array) ||
    input.png.byteLength === 0 ||
    typeof input.skipDelay !== "boolean"
  ) {
    throw new Error("Web roll delivery request is invalid");
  }
  const channels = await listTextChannels(env, input.guildId, discordFetch);
  if (!channels.some(({ id }) => id === input.channelId)) {
    return { status: "failed", httpStatus: 404 };
  }

  let referenceId: string | null = null;
  const messagesUrl = `${DISCORD_API}/channels/${input.channelId}/messages`;
  if (!input.skipDelay) {
    const clatterResponse = await discordJson(
      messagesUrl,
      env.DISCORD_BOT_TOKEN,
      {
        content: input.clatter,
        ...(input.rollId === undefined
          ? {}
          : { nonce: `c${input.rollId}`, enforce_nonce: true }),
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
    const clatterMessage: unknown = await clatterResponse.json();
    if (
      !isRecord(clatterMessage) ||
      typeof clatterMessage.id !== "string" ||
      !SNOWFLAKE.test(clatterMessage.id)
    ) {
      throw new Error("Discord clatter response is invalid");
    }
    referenceId = clatterMessage.id;
  }

  const payload = {
    ...input.payload,
    ...(input.rollId === undefined
      ? {}
      : { nonce: input.rollId, enforce_nonce: true }),
    allowed_mentions: { parse: [] },
    ...(referenceId === null
      ? {}
      : { message_reference: { message_id: referenceId } }),
  };
  const form = new FormData();
  form.set("payload_json", JSON.stringify(payload));
  form.set(
    "files[0]",
    new Blob([input.png], { type: "image/png" }),
    input.filename,
  );
  const response = await discordFetch(
    new Request(messagesUrl, {
      method: "POST",
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
  return { status: "delivered" };
}

export async function inspectMembership(
  env: Pick<DiscordRestEnv, "DISCORD_BOT_TOKEN">,
  guildId: string,
  userId: string,
  discordFetch: RequestFetch = (request) => fetch(request),
): Promise<MembershipInspection> {
  if (!SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(userId)) {
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
  const assignedRoleIds = new Set(
    parseMemberRoles(await memberResponse.json()),
  );
  const rolesResponse = await discordFetch(
    new Request(`${DISCORD_API}/guilds/${guildId}/roles`, { headers }),
  );
  if (!rolesResponse.ok) {
    throw new Error("Discord guild roles request failed");
  }
  return {
    status: "found",
    isDiceWitchAdmin: hasNamedRole(
      await rolesResponse.json(),
      assignedRoleIds,
    ),
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
    input: unknown,
  ): Promise<DiscordAudienceCaptureV1> {
    return captureAudienceSnapshot(
      await this.botEnv(),
      parseShardCountInput(input),
    );
  }

  async reportBotListStatsV1(input: unknown): Promise<BotListReportResult> {
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

  async logGuildLifecycle(input: unknown): Promise<GuildLifecycleLogResult> {
    return logGuildLifecycle(await this.botEnv(), input);
  }

  async sendRollHelper(input: unknown): Promise<RollHelperResult> {
    return sendRollHelper(await this.botEnv(), input);
  }

  async logRoll(input: unknown): Promise<RollLogResult> {
    return logRoll(await this.botEnv(), input);
  }

  async deliverRollLogV1(
    input: DeliverRollLogInputV1,
  ): Promise<DeliverRollLogResultV1> {
    return deliverRollLogV1(await this.botEnv(), input);
  }

  async deliverWebRoll(input: Parameters<typeof deliverWebRoll>[1]) {
    return deliverWebRoll(await this.botEnv(), input);
  }

  async listTextChannels(guildId: string): Promise<TextChannel[]> {
    return listTextChannels(await this.botEnv(), guildId);
  }

  async inspectMembership(
    guildId: string,
    userId: string,
  ): Promise<MembershipInspection> {
    return inspectMembership(await this.botEnv(), guildId, userId);
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
