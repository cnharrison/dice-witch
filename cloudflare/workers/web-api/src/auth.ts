import {
  parsePublicRenderModelV4,
  serializeRenderRequestV4,
  type PublicRenderModelV4,
} from "@dice-witch/dice-v4-model";
import { z } from "zod";
import {
  appearanceCatalogForPolicyV3,
  parseAppearanceCatalogPolicyV3,
  type AppearanceCatalogPolicyV3,
} from "../../../packages/dice-appearance/src";
import { MAX_NOTATION_LENGTH } from "../../../packages/roll-domain/src/constants";
import { parseSavedRollNameColorV2 } from "../../../packages/saved-rolls/src/color";
import { selectRollDelayMs } from "../../../packages/roll-domain/src/random";
import {
  DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS,
  parseDiscordAudienceSnapshotV1,
} from "../../../packages/discord-contracts/src";
import {
  safeIntegerSchema,
  seedSchema,
  snowflakeSchema,
  strictObjectSchema,
  uuidV4Schema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";
import { readWorkerSecret, type WorkerSecretSource } from "../../../packages/worker-secrets/src";
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../data/src/session-repository";
import {
  getGuildAppearanceStateV4,
  getGuildAppearanceV4,
  getPersonalAppearanceStateV4,
  getPersonalAppearanceV4,
  previewAppearanceV4,
  putGuildAppearanceStateV4,
  putGuildAppearanceV4,
  putPersonalAppearanceStateV4,
  putPersonalAppearanceV4,
  resetGuildAppearanceV4,
  resetPersonalAppearanceV4,
  restoreGuildAppearanceV4,
  restorePersonalAppearanceV4,
} from "./appearance-api";
import { synchronizeGuildProof } from "./guild-authorization";
import {
  appearanceThumbsVersion,
  bakeAppearanceThumbs,
  serveAppearanceThumb,
} from "./appearance-thumbs-api";
import { bytesToBase64, json, securityHeaders } from "./responses";
import { handleSavedRollApiRequest } from "./saved-roll-api";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/v10/users/@me";
const DISCORD_GUILDS_URL = "https://discord.com/api/v10/users/@me/guilds?limit=200";
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const STATE_TTL_MS = 10 * 60 * 1_000;
const MAX_AUTH_RETURN_LENGTH = 2_048;
const AUTHENTICATED_ROUTES = new Set([
  "/app",
  "/app/library",
  "/app/preferences",
]);
const FULL_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DELIVERY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const opaqueTokenSchema = z.string().regex(OPAQUE_TOKEN);
const sha256Schema = z.string().regex(SHA256);
const deliveryIdSchema = z.string().regex(DELIVERY_ID);
const nullableProfileStringSchema = z.string().max(255).nullable();
const positiveSafeIntegerSchema = safeIntegerSchema.positive();
const notationSchema = z.string().min(1).max(MAX_NOTATION_LENGTH);
const repetitionsSchema = safeIntegerSchema.min(1).max(50);
const pngSchema = z.instanceof(Uint8Array);

const ConfigurationSourceSchema = z.looseObject({
  APPEARANCE_CATALOG_POLICY: z.string(),
  BUILD_SHA: z.string().regex(FULL_SHA),
  DISCORD_CLIENT_ID: snowflakeSchema,
  DISCORD_REDIRECT_URI: z.string(),
  FRONTEND_ORIGIN: z.string(),
});
const OAuthStateTokenResponseSchema = z.looseObject({
  token: opaqueTokenSchema,
});
const DiscordTokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
});
const DiscordProfileSchema = z.looseObject({
  avatar: nullableProfileStringSchema,
  email: nullableProfileStringSchema,
  id: snowflakeSchema,
  username: z.string().max(255),
});
const DiscordGuildSchema = z.looseObject({
  icon: nullableProfileStringSchema,
  id: snowflakeSchema,
  name: z.string().min(1).max(255),
  permissions: z.string().regex(/^(0|[1-9][0-9]*)$/u),
});
const DiscordGuildsSchema = z
  .array(DiscordGuildSchema)
  .max(200)
  .refine((guilds) => new Set(guilds.map(({ id }) => id)).size === guilds.length);
const OAuthStateContextSchema = z.discriminatedUnion("purpose", [
  z.looseObject({
    expectedUserId: z.null(),
    purpose: z.literal("sign_in"),
    returnTo: z.string(),
  }),
  z.looseObject({
    expectedUserId: snowflakeSchema,
    purpose: z.literal("refresh"),
    returnTo: z.string(),
  }),
]);
const ConsumedOAuthStateResponseSchema = z.looseObject({
  context: OAuthStateContextSchema,
  status: z.literal("consumed"),
});
const GuildFilterResponseSchema = z.looseObject({
  guildIds: z
    .array(snowflakeSchema)
    .refine((guildIds) => new Set(guildIds).size === guildIds.length),
});
const AudienceSnapshotResponseSchema = z.looseObject({
  snapshot: z.unknown(),
  status: z.literal("found"),
});
const CompleteWebLoginResponseSchema = z.looseObject({
  session: z.looseObject({
    createdAt: z.number(),
    expiresAt: z.number(),
    userId: snowflakeSchema,
  }),
  status: z.enum(["applied", "existing"]),
});
const StoredSessionSchema = z.looseObject({
  createdAt: safeIntegerSchema,
  expiresAt: safeIntegerSchema,
  user: z.looseObject({
    avatar: nullableProfileStringSchema,
    email: nullableProfileStringSchema,
    id: snowflakeSchema,
    username: nullableProfileStringSchema,
  }),
});
const MutualGuildSchema = z.object({
  icon: nullableProfileStringSchema,
  id: snowflakeSchema,
  name: nullableProfileStringSchema,
});
const MembershipSchema = z.looseObject({
  guild: MutualGuildSchema.nullable(),
  isAdmin: z.boolean(),
  isDiceWitchAdmin: z.boolean(),
});
const MembershipListResponseSchema = z.looseObject({
  memberships: z.array(MembershipSchema),
});
const GuildAuthorizationResponseSchema = z.looseObject({
  memberships: z.array(z.unknown()),
});
const GuildAuthorizationMembershipSchema = z.looseObject({
  guild: z.looseObject({ id: z.string() }),
});
const TextChannelSchema = z.looseObject({
  id: snowflakeSchema,
  name: z.string(),
  type: z.union([z.literal(0), z.literal(5)]),
});
const TextChannelsSchema = z.array(TextChannelSchema);
const GuildSettingsV1ResponseSchema = z.looseObject({
  settings: z.looseObject({ skipDiceDelay: z.boolean() }),
  status: z.literal("found"),
});
const GuildSettingsV2ResponseSchema = z.looseObject({
  settings: z.looseObject({
    hideRollResultText: z.boolean(),
    skipDiceDelay: z.boolean(),
  }),
  status: z.literal("found"),
});
const GuildPreferencesV1RequestSchema = strictObjectSchema({
  skipDiceDelay: z.boolean(),
});
const GuildPreferencesV2RequestSchema = strictObjectSchema({
  hideRollResultText: z.boolean(),
  skipDiceDelay: z.boolean(),
});
const WebRollPreparationRequestSchema = z.union([
  strictObjectSchema({
    guildId: snowflakeSchema,
    notation: notationSchema,
    timesToRepeat: repetitionsSchema,
  }),
  strictObjectSchema({
    guildId: snowflakeSchema,
    notation: notationSchema,
    renderSeed: seedSchema,
    timesToRepeat: repetitionsSchema,
  }),
]);
const AppearanceIdentitiesSchema = z.array(
  z.array(z.string().min(1).max(512)),
);
const RerolledAppearanceIdentitiesSchema = z.array(z.string());
const RenderedPngSchema = z.looseObject({
  contentType: z.literal("image/png"),
  height: positiveSafeIntegerSchema,
  png: pngSchema,
  width: positiveSafeIntegerSchema,
});
const RollPreparationEnvelopeSchema = z.looseObject({ status: z.string() });
const InvalidRollPreparationSchema = z.looseObject({
  message: z.string(),
  status: z.literal("invalid"),
});
const PreparedRollSchema = z.looseObject({
  appearanceDigest: sha256Schema,
  appearanceIdentities: z.unknown(),
  groupSizes: z
    .array(positiveSafeIntegerSchema)
    .min(1)
    .max(50)
    .refine((sizes) => sizes.reduce((total, size) => total + size, 0) <= 50),
  renderModel: z.unknown().optional(),
  renderedImage: RenderedPngSchema,
  renderSeed: seedSchema,
  status: z.literal("prepared"),
});
const WebLibraryRollSelectionSchema = strictObjectSchema({
  id: uuidV4Schema,
  revision: positiveSafeIntegerSchema,
  scope: z.enum(["personal", "server"]),
});
const webRollRequestFields = {
  channelId: snowflakeSchema,
  deliveryId: deliveryIdSchema.optional(),
  guildId: snowflakeSchema,
  libraryRoll: WebLibraryRollSelectionSchema.optional(),
  notation: notationSchema,
  timesToRepeat: repetitionsSchema,
  title: z.string().min(1).max(256).optional(),
};
const LegacyWebRollRequestSchema = strictObjectSchema(webRollRequestFields);
const PreparedWebRollRequestSchema = strictObjectSchema({
  ...webRollRequestFields,
  appearanceDigest: sha256Schema,
  renderSeed: seedSchema,
});
const WebRollRequestSchema = z.union([
  PreparedWebRollRequestSchema,
  LegacyWebRollRequestSchema,
]);
const SavedRollResultSchema = z.discriminatedUnion("status", [
  z.looseObject({ status: z.literal("missing") }),
  z.looseObject({
    savedRoll: z.looseObject({
      displayName: z.string().min(1).max(1_024),
      nameColor: z.unknown(),
      notation: z.string(),
      repetitions: safeIntegerSchema,
      revision: safeIntegerSchema,
      title: z.string().nullable(),
    }),
    status: z.literal("found"),
  }),
]);
const RollEnvelopeSchema = z.looseObject({ status: z.string() });
const ConflictRollSchema = z.looseObject({
  message: z.string(),
  status: z.enum(["conflict", "expired"]),
});
const StaleRollSchema = z.looseObject({
  message: z.string(),
  status: z.literal("stale"),
});
const InvalidRollSchema = z.looseObject({
  message: z.string(),
  status: z.literal("invalid"),
});
const RolledSchema = z.looseObject({
  appearanceIdentities: z.unknown(),
  deliveryStatus: z
    .enum(["delivered", "failed", "pending", "permission_error"])
    .optional(),
  diceArray: z.array(z.array(z.unknown())),
  discord: z.looseObject({
    clatter: z.string(),
    filename: z.string(),
    payload: z.unknown(),
    png: pngSchema,
  }),
  message: z.string(),
  renderModel: z.unknown().optional(),
  renderedImage: RenderedPngSchema,
  rerolledAppearanceIdentities: z.unknown(),
  resultArray: z.array(z.unknown()),
  status: z.literal("rolled"),
});

function randomUint32(): number {
  const value = crypto.getRandomValues(new Uint32Array(1))[0];
  if (value === undefined) throw new Error("Web roll delay generation failed");
  return value;
}

type AuthCrypto = {
  generateOpaqueToken: () => string;
  hashOpaqueToken: (token: string) => Promise<string>;
  randomUint32: () => number;
};

const defaultAuthCrypto: AuthCrypto = {
  generateOpaqueToken,
  hashOpaqueToken,
  randomUint32,
};

function webRollDelayMs(skipDelay: boolean, authCrypto: AuthCrypto): number {
  if (skipDelay) return 0;
  return selectRollDelayMs(authCrypto.randomUint32() / 2 ** 32);
}

type MembershipInspection =
  | {
      status: "found";
      isAdmin: boolean;
      isDiceWitchAdmin: boolean;
    }
  | { status: "missing" };

type RollerGuildInspection =
  | (Extract<MembershipInspection, { status: "found" }> & {
      hasUsableChannel: boolean;
    })
  | { status: "missing" };

type MutualGuild = z.output<typeof MutualGuildSchema>;
type TextChannel = { id: string; name: string; type: 0 | 5 };

type WebRollPreparationInput = {
  guildId: string;
  notation: string;
  renderSeed?: number;
  repetitions: number;
  userId: string;
};

type SavedRollAttribution = {
  name: string;
  nameColor: string | null;
  scope: "personal" | "guild";
};

type WebRollExecutionInput = {
  applicationId?: string;
  appearanceDigest?: string;
  channelId?: string;
  deliveryId?: string;
  guildId: string;
  hideRollResultText?: boolean;
  notation: string;
  renderSeed?: number;
  repetitions: number;
  savedRoll?: SavedRollAttribution;
  skipDelay?: boolean;
  title: string | null;
  userId: string;
  username: string;
};

type DiscordRestService = {
  deliverWebRoll(input: {
    guildId: string;
    channelId: string;
    payload: SchemaInput;
    clatter: string;
    filename: string;
    png: Uint8Array;
    skipDelay: boolean;
    delayMs: number;
  }): Promise<{
    status: "delivered" | "permission_error" | "failed" | "retryable";
  }>;
  listTextChannels(guildId: string, userId?: string): Promise<TextChannel[]>;
  inspectMembership(
    guildId: string,
    userId: string,
  ): Promise<MembershipInspection>;
  inspectRollerGuild(
    guildId: string,
    userId: string,
  ): Promise<RollerGuildInspection>;
};

export type WebApiBindings = {
  DATA_SERVICE: Fetcher;
  DISCORD_REST: DiscordRestService;
  ROLL_WEB: {
    prepare(value: WebRollPreparationInput): Promise<SchemaInput>;
    execute(value: WebRollExecutionInput): Promise<SchemaInput>;
    previewV4(value: SchemaInput): Promise<SchemaInput>;
    previewRendererRevisionV4(): Promise<string>;
  };
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: WorkerSecretSource;
  DISCORD_REDIRECT_URI: string;
  FRONTEND_ORIGIN: string;
  BUILD_SHA: string;
  APPEARANCE_CATALOG_POLICY: string;
  THUMBS: R2Bucket;
  APPEARANCE_THUMBS_BAKE_SECRET: WorkerSecretSource;
};

type ValidatedConfiguration = {
  APPEARANCE_CATALOG_POLICY: AppearanceCatalogPolicyV3;
  BUILD_SHA: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  FRONTEND_ORIGIN: string;
  apiOrigin: string;
  frontendUrl: URL;
};

type RequestFetch = (request: Request) => Promise<Response>;
type DiscordToken = { accessToken: string };
type OAuthStateContext =
  | { purpose: "sign_in"; expectedUserId: null; returnTo: string }
  | { purpose: "refresh"; expectedUserId: string; returnTo: string };
type DiscordProfile = {
  avatar: string | null;
  email: string | null;
  id: string;
  username: string;
};
type DiscordGuild = {
  icon: string | null;
  id: string;
  name: string;
  permissions: string;
};
type StoredSession = {
  createdAt: number;
  expiresAt: number;
  user: {
    avatar: string | null;
    email: string | null;
    id: string;
    username: string | null;
  };
};
type RenderModelContainer = { renderModel?: SchemaInput };

function parseOptionalRenderModel(
  roll: RenderModelContainer,
): PublicRenderModelV4 | undefined {
  if (!Object.hasOwn(roll, "renderModel")) return undefined;
  const renderModel = parsePublicRenderModelV4(roll.renderModel);
  serializeRenderRequestV4(renderModel);
  return renderModel;
}

function parseAppearanceIdentities(
  value: SchemaInput,
  groupSizes: readonly number[],
): string[][] {
  const parsed = AppearanceIdentitiesSchema.safeParse(value);
  if (!parsed.success || parsed.data.length !== groupSizes.length) {
    throw new Error("Roll appearance identities are invalid");
  }
  const identities = parsed.data;
  for (let groupIndex = 0; groupIndex < identities.length; groupIndex += 1) {
    if (identities[groupIndex]?.length !== groupSizes[groupIndex]) {
      throw new Error("Roll appearance identities are invalid");
    }
  }
  const flattened = identities.flat();
  if (new Set(flattened).size !== flattened.length) {
    throw new Error("Roll appearance identities are invalid");
  }
  return identities;
}

function parseRerolledAppearanceIdentities(
  value: SchemaInput,
  appearanceIdentities: readonly (readonly string[])[],
): string[] {
  const parsed = RerolledAppearanceIdentitiesSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Rerolled appearance identities are invalid");
  }
  const identities = parsed.data;
  const validIdentities = new Set(appearanceIdentities.flat());
  if (
    new Set(identities).size !== identities.length ||
    identities.some((identity) => !validIdentities.has(identity))
  ) {
    throw new Error("Rerolled appearance identities are invalid");
  }
  return [...identities];
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...securityHeaders, location },
  });
}

function sessionCookie(token: string, maxAge: number): string {
  return `session_id=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function stateCookie(token: string, maxAge: number): string {
  return `auth_state=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function appendCookie(response: Response, cookie: string): Response {
  response.headers.append("set-cookie", cookie);
  return response;
}

function withCors(
  response: Response,
  configuration: ValidatedConfiguration,
): Response {
  response.headers.set("access-control-allow-credentials", "true");
  response.headers.set(
    "access-control-allow-origin",
    configuration.FRONTEND_ORIGIN,
  );
  response.headers.append("vary", "Origin");
  return response;
}

function isFrontendRequest(
  request: Request,
  configuration: ValidatedConfiguration,
): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === configuration.FRONTEND_ORIGIN;
  return new URL(request.url).origin === configuration.FRONTEND_ORIGIN;
}

function preflight(
  request: Request,
  configuration: ValidatedConfiguration,
  pathname: string,
): Response {
  if (request.headers.get("origin") !== configuration.FRONTEND_ORIGIN) {
    return json({ error: "Forbidden" }, 403);
  }
  let methods: string;
  let allowedHeaders: string | null = null;
  if (pathname === "/api/auth/session") {
    methods = "GET";
  } else if (pathname === "/api/auth/signout") {
    methods = "POST";
  } else if (
    pathname === "/api/dice/prepare" ||
    pathname === "/api/dice/roll"
  ) {
    methods = "POST";
    allowedHeaders = "content-type";
  } else if (
    /^\/api\/guilds\/[1-9][0-9]{16,19}\/preferences$/.test(pathname)
  ) {
    methods = "PATCH";
    allowedHeaders = "content-type, idempotency-key";
  } else if (pathname === "/api/appearance/v4/catalog") {
    methods = "GET";
  } else if (
    pathname === "/api/appearance/v4/me" ||
    /^\/api\/guilds\/[1-9][0-9]{16,19}\/appearance\/v4$/.test(pathname)
  ) {
    methods = "GET, PUT";
    allowedHeaders = "content-type, idempotency-key";
  } else if (
    pathname === "/api/appearance/v4/me/state" ||
    /^\/api\/guilds\/[1-9][0-9]{16,19}\/appearance\/v4\/state$/.test(
      pathname,
    )
  ) {
    methods = "GET, PUT";
    allowedHeaders = "content-type, idempotency-key";
  } else if (
    /^\/api\/appearance\/v4\/me\/state\/(?:reset|restore)$/.test(pathname) ||
    /^\/api\/guilds\/[1-9][0-9]{16,19}\/appearance\/v4\/state\/(?:reset|restore)$/.test(
      pathname,
    )
  ) {
    methods = "POST";
    allowedHeaders = "content-type, idempotency-key";
  } else if (
    /^\/api\/saved-rolls\/v[12]\/(?:libraries|search|me(?:\/(?:[0-9a-f-]+|copy|delete-batch|reorder))?)$/.test(
      pathname,
    ) ||
    /^\/api\/guilds\/[1-9][0-9]{16,19}\/saved-rolls\/v[12](?:\/(?:[0-9a-f-]+|copy|delete-batch|reorder))?$/.test(
      pathname,
    )
  ) {
    methods = "GET, POST, PATCH, DELETE";
    allowedHeaders = "content-type, idempotency-key";
  } else if (pathname === "/api/appearance/v4/preview") {
    methods = "POST";
    allowedHeaders = "content-type";
  } else {
    return json({ error: "Not found" }, 404);
  }
  const response = new Response(null, { status: 204, headers: securityHeaders });
  response.headers.set("access-control-allow-methods", methods);
  if (allowedHeaders !== null) {
    response.headers.set("access-control-allow-headers", allowedHeaders);
  }
  response.headers.set("access-control-max-age", "600");
  return withCors(response, configuration);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) return null;
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator === -1) continue;
    if (segment.slice(0, separator).trim() === name) {
      return segment.slice(separator + 1).trim();
    }
  }
  return null;
}

function sameToken(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

function exactOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    return value === url.origin &&
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
      ? url
      : null;
  } catch {
    return null;
  }
}

async function validateConfiguration(
  env: WebApiBindings,
): Promise<ValidatedConfiguration | null> {
  const source = ConfigurationSourceSchema.safeParse(env);
  if (!source.success) return null;
  const frontendUrl = exactOrigin(source.data.FRONTEND_ORIGIN);
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(source.data.DISCORD_REDIRECT_URI);
  } catch {
    return null;
  }
  let clientSecret: string;
  let appearanceCatalogPolicy: AppearanceCatalogPolicyV3;
  try {
    clientSecret = await readWorkerSecret(
      env.DISCORD_CLIENT_SECRET,
      "DISCORD_CLIENT_SECRET",
    );
    appearanceCatalogPolicy = parseAppearanceCatalogPolicyV3(
      source.data.APPEARANCE_CATALOG_POLICY,
    );
  } catch {
    return null;
  }
  if (
    redirectUrl.protocol !== "https:" ||
    redirectUrl.username !== "" ||
    redirectUrl.password !== "" ||
    redirectUrl.pathname !== "/api/auth/callback/discord" ||
    redirectUrl.search !== "" ||
    redirectUrl.hash !== "" ||
    redirectUrl.toString() !== source.data.DISCORD_REDIRECT_URI ||
    frontendUrl === null
  ) {
    return null;
  }
  return {
    DISCORD_CLIENT_ID: source.data.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: clientSecret,
    DISCORD_REDIRECT_URI: source.data.DISCORD_REDIRECT_URI,
    FRONTEND_ORIGIN: source.data.FRONTEND_ORIGIN,
    BUILD_SHA: source.data.BUILD_SHA,
    APPEARANCE_CATALOG_POLICY: appearanceCatalogPolicy,
    apiOrigin: redirectUrl.origin,
    frontendUrl,
  };
}

function hasExactCatalogBuild(url: URL, buildSha: string): boolean {
  return (
    url.searchParams.size === 1 &&
    url.searchParams.get("build") === buildSha
  );
}

async function postData(
  env: WebApiBindings,
  path: string,
  body: SchemaInput,
): Promise<Response> {
  return env.DATA_SERVICE.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function parseAuthenticatedReturnTo(value: string): string | null {
  if (value.length > MAX_AUTH_RETURN_LENGTH) return null;
  try {
    const url = new URL(value, "https://return.invalid");
    if (
      url.origin !== "https://return.invalid" ||
      !AUTHENTICATED_ROUTES.has(url.pathname) ||
      url.hash !== ""
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function discordAuthorizationRedirect(
  configuration: ValidatedConfiguration,
  state: string,
): Response {
  const authorizationUrl = new URL(DISCORD_AUTHORIZE_URL);
  authorizationUrl.search = new URLSearchParams({
    client_id: configuration.DISCORD_CLIENT_ID,
    redirect_uri: configuration.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify email guilds",
    state,
  }).toString();
  const response = redirect(authorizationUrl.toString());
  return appendCookie(response, stateCookie(state, STATE_TTL_MS / 1_000));
}

async function startAuthorization(
  request: Request,
  env: WebApiBindings,
  configuration: ValidatedConfiguration,
  now: number,
): Promise<Response> {
  const requestedReturnTo = new URL(request.url).searchParams.get("returnTo");
  const returnTo = requestedReturnTo === null
    ? "/app"
    : parseAuthenticatedReturnTo(requestedReturnTo);
  if (returnTo === null) {
    return json({ error: "Return route is invalid" }, 400);
  }
  const stateResponse = await postData(env, "/internal/oauth-states", {
    createdAt: now,
    expiresAt: now + STATE_TTL_MS,
    purpose: "sign_in",
    expectedUserId: null,
    returnTo,
  });
  if (stateResponse.status !== 201) {
    return json({ error: "OAuth state creation failed" }, 502);
  }
  const value = OAuthStateTokenResponseSchema.safeParse(
    await stateResponse.json(),
  );
  if (!value.success) {
    return json({ error: "OAuth state response is invalid" }, 502);
  }

  return discordAuthorizationRedirect(configuration, value.data.token);
}

async function startGuildRefresh(
  request: Request,
  env: WebApiBindings,
  configuration: ValidatedConfiguration,
  now: number,
): Promise<Response> {
  const authentication = await authenticateSession(request, env, now);
  if (!authentication.authenticated) return authentication.response;

  const stateResponse = await postData(env, "/internal/oauth-states", {
    createdAt: now,
    expiresAt: now + STATE_TTL_MS,
    purpose: "refresh",
    expectedUserId: authentication.session.user.id,
    returnTo: "/app/preferences",
  });
  if (stateResponse.status !== 201) {
    return json({ error: "OAuth state creation failed" }, 502);
  }
  const value = OAuthStateTokenResponseSchema.safeParse(
    await stateResponse.json(),
  );
  if (!value.success) {
    return json({ error: "OAuth state response is invalid" }, 502);
  }
  return discordAuthorizationRedirect(configuration, value.data.token);
}

function parseDiscordToken(value: SchemaInput): DiscordToken | null {
  const parsed = DiscordTokenResponseSchema.safeParse(value);
  return parsed.success ? { accessToken: parsed.data.access_token } : null;
}

function parseDiscordProfile(value: SchemaInput): DiscordProfile | null {
  const parsed = DiscordProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseDiscordGuilds(value: SchemaInput): DiscordGuild[] | null {
  const parsed = DiscordGuildsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function exchangeCode(
  code: string,
  configuration: ValidatedConfiguration,
  discordFetch: RequestFetch,
): Promise<DiscordToken | null> {
  const response = await discordFetch(
    new Request(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({
        client_id: configuration.DISCORD_CLIENT_ID,
        client_secret: configuration.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: configuration.DISCORD_REDIRECT_URI,
      }),
    }),
  );
  return response.ok ? parseDiscordToken(await response.json()) : null;
}

async function fetchProfile(
  accessToken: string,
  discordFetch: RequestFetch,
): Promise<DiscordProfile | null> {
  const response = await discordFetch(
    new Request(DISCORD_USER_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  return response.ok ? parseDiscordProfile(await response.json()) : null;
}

async function fetchGuilds(
  accessToken: string,
  discordFetch: RequestFetch,
): Promise<DiscordGuild[] | null> {
  const response = await discordFetch(
    new Request(DISCORD_GUILDS_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    }),
  );
  return response.ok ? parseDiscordGuilds(await response.json()) : null;
}

async function consumeState(
  env: WebApiBindings,
  token: string,
  now: number,
): Promise<
  | { status: "consumed"; context: OAuthStateContext }
  | { status: "invalid" | "unavailable" }
> {
  const response = await postData(env, "/internal/oauth-states/consume", {
    token,
    consumedAt: now,
  });
  if (response.ok) {
    const value = ConsumedOAuthStateResponseSchema.safeParse(
      await response.json(),
    );
    if (
      !value.success ||
      parseAuthenticatedReturnTo(value.data.context.returnTo) === null
    ) {
      return { status: "unavailable" };
    }
    return { status: "consumed", context: value.data.context };
  }
  return {
    status: [404, 409, 410].includes(response.status)
      ? "invalid"
      : "unavailable",
  };
}

async function syncMemberships(
  env: WebApiBindings,
  userId: string,
  guilds: DiscordGuild[],
  stateHash: string,
  occurredAt: number,
): Promise<void> {
  const filterResponse = await postData(env, "/internal/guilds/filter", {
    guildIds: guilds.map(({ id }) => id),
  });
  if (!filterResponse.ok) throw new Error("Guild filtering failed");
  const filtered = GuildFilterResponseSchema.safeParse(
    await filterResponse.json(),
  );
  if (!filtered.success || filtered.data.guildIds.length > guilds.length) {
    throw new Error("Guild filter response is invalid");
  }
  const guildById = new Map(guilds.map((guild) => [guild.id, guild]));
  for (const guildId of filtered.data.guildIds) {
    const guild = guildById.get(guildId);
    if (guild === undefined) {
      throw new Error("Guild filter response is invalid");
    }
    const inspection = await env.DISCORD_REST.inspectMembership(
      guildId,
      userId,
    );
    if (inspection.status === "missing") continue;
    const response = await postData(env, "/internal/memberships", {
      userId,
      guildId,
      guildName: guild.name,
      guildIcon: guild.icon,
      guildMutationId: `oauth-guild-profile:${stateHash}:${guildId}`,
      isAdmin: inspection.isAdmin,
      isDiceWitchAdmin: inspection.isDiceWitchAdmin,
      mutationId: `oauth-membership:${stateHash}:${guildId}`,
      occurredAt,
    });
    if (!response.ok) throw new Error("Membership upsert failed");
  }
}

async function revokeFailedSession(
  env: WebApiBindings,
  token: string,
  revokedAt: number,
): Promise<void> {
  await postData(env, "/internal/sessions/revoke", { token, revokedAt });
}

async function completeCallback(
  request: Request,
  env: WebApiBindings,
  configuration: ValidatedConfiguration,
  discordFetch: RequestFetch,
  now: number,
  authCrypto: AuthCrypto,
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const savedState = readCookie(request, "auth_state");
  if (
    state === null ||
    savedState === null ||
    !opaqueTokenSchema.safeParse(state).success ||
    !opaqueTokenSchema.safeParse(savedState).success ||
    !sameToken(state, savedState)
  ) {
    return json({ error: "Invalid OAuth state" }, 400);
  }
  const stateResult = await consumeState(env, state, now);
  if (stateResult.status !== "consumed") {
    return appendCookie(
      json(
        {
          error:
            stateResult.status === "invalid"
              ? "Invalid OAuth state"
              : "OAuth state validation failed",
        },
        stateResult.status === "invalid" ? 400 : 502,
      ),
      stateCookie("", 0),
    );
  }
  let refreshSession: StoredSession | null = null;
  if (stateResult.context.purpose === "refresh") {
    const authentication = await authenticateSession(request, env, now);
    if (!authentication.authenticated) {
      return appendCookie(authentication.response, stateCookie("", 0));
    }
    if (
      authentication.session.user.id !== stateResult.context.expectedUserId
    ) {
      return appendCookie(
        json({ error: "Discord refresh identity is invalid" }, 403),
        stateCookie("", 0),
      );
    }
    refreshSession = authentication.session;
  }

  const code = url.searchParams.get("code");
  if (
    url.searchParams.has("error") ||
    code === null ||
    code.length === 0 ||
    code.length > 2_048
  ) {
    return appendCookie(
      json({ error: "Discord authorization was not completed" }, 400),
      stateCookie("", 0),
    );
  }

  const token = await exchangeCode(code, configuration, discordFetch);
  if (token === null) {
    return appendCookie(
      json({ error: "Discord token exchange failed" }, 502),
      stateCookie("", 0),
    );
  }
  const [profile, guilds] = await Promise.all([
    fetchProfile(token.accessToken, discordFetch),
    fetchGuilds(token.accessToken, discordFetch),
  ]);
  if (profile === null || guilds === null) {
    return appendCookie(
      json({ error: "Discord account request failed" }, 502),
      stateCookie("", 0),
    );
  }

  const stateHash = await authCrypto.hashOpaqueToken(state);
  if (refreshSession !== null) {
    if (profile.id !== refreshSession.user.id) {
      return appendCookie(
        json({ error: "Discord refresh account does not match" }, 403),
        stateCookie("", 0),
      );
    }
    try {
      await syncMemberships(env, profile.id, guilds, stateHash, now);
    } catch {
      return appendCookie(
        json({ error: "Discord membership synchronization failed" }, 502),
        stateCookie("", 0),
      );
    }
    const response = redirect(
      new URL(
        stateResult.context.returnTo,
        configuration.frontendUrl,
      ).toString(),
    );
    return appendCookie(response, stateCookie("", 0));
  }

  const sessionToken = authCrypto.generateOpaqueToken();
  const expiresAt = now + SESSION_TTL_MS;
  const loginResponse = await postData(env, "/internal/web-logins", {
    token: sessionToken,
    userId: profile.id,
    profile: {
      username: profile.username,
      email: profile.email,
      avatar: profile.avatar,
    },
    mutationId: `oauth-login:${stateHash}`,
    createdAt: now,
    expiresAt,
  });
  if (!loginResponse.ok) {
    return appendCookie(
      json({ error: "Session creation failed" }, 502),
      stateCookie("", 0),
    );
  }
  const login = CompleteWebLoginResponseSchema.safeParse(
    await loginResponse.json(),
  );
  if (
    !login.success ||
    login.data.session.userId !== profile.id ||
    login.data.session.createdAt !== now ||
    login.data.session.expiresAt !== expiresAt
  ) {
    return appendCookie(
      json({ error: "Session response is invalid" }, 502),
      stateCookie("", 0),
    );
  }

  try {
    await syncMemberships(env, profile.id, guilds, stateHash, now);
  } catch {
    await revokeFailedSession(env, sessionToken, now);
    return appendCookie(
      json({ error: "Discord membership synchronization failed" }, 502),
      stateCookie("", 0),
    );
  }

  const response = redirect(
    new URL(stateResult.context.returnTo, configuration.frontendUrl).toString(),
  );
  appendCookie(response, sessionCookie(sessionToken, SESSION_TTL_MS / 1_000));
  return appendCookie(response, stateCookie("", 0));
}

function parseStoredSession(value: SchemaInput): StoredSession | null {
  const parsed = StoredSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type SessionAuthentication =
  | { authenticated: true; session: StoredSession }
  | { authenticated: false; response: Response };

async function authenticateSession(
  request: Request,
  env: WebApiBindings,
  now: number,
): Promise<SessionAuthentication> {
  const token = readCookie(request, "session_id");
  if (token === null || !opaqueTokenSchema.safeParse(token).success) {
    return {
      authenticated: false,
      response: json({ error: "Unauthorized" }, 401),
    };
  }
  const response = await postData(env, "/internal/sessions/current", {
    token,
    now,
  });
  if (response.status === 401) {
    return {
      authenticated: false,
      response: appendCookie(
        json({ error: "Unauthorized" }, 401),
        sessionCookie("", 0),
      ),
    };
  }
  if (!response.ok) {
    return {
      authenticated: false,
      response: json({ error: "Session lookup failed" }, 502),
    };
  }
  const session = parseStoredSession(await response.json());
  return session === null
    ? {
        authenticated: false,
        response: json({ error: "Session response is invalid" }, 502),
      }
    : { authenticated: true, session };
}

async function getSession(
  request: Request,
  env: WebApiBindings,
  now: number,
): Promise<Response> {
  const token = readCookie(request, "session_id");
  if (token === null || !opaqueTokenSchema.safeParse(token).success) {
    return json({ user: null }, 401);
  }
  const storedResponse = await postData(env, "/internal/sessions/current", {
    token,
    now,
  });
  if (storedResponse.status === 401) {
    return appendCookie(json({ user: null }, 401), sessionCookie("", 0));
  }
  if (!storedResponse.ok) return json({ error: "Session lookup failed" }, 502);
  const session = parseStoredSession(await storedResponse.json());
  if (session === null) return json({ error: "Session response is invalid" }, 502);
  const { user } = session;
  return json({
    user: {
      id: user.id,
      name: user.username,
      email: user.email,
      image:
        user.avatar === null
          ? null
          : `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
      discordId: user.id,
    },
    expires: new Date(session.expiresAt).toISOString(),
  });
}

async function getMutualGuilds(
  request: Request,
  env: WebApiBindings,
  now: number,
): Promise<Response> {
  const view = new URL(request.url).searchParams.get("view");
  if (view !== null && view !== "roller") {
    return json({ error: "Guild view is invalid" }, 400);
  }
  const rollerView = view === "roller";
  const token = readCookie(request, "session_id");
  if (token === null || !opaqueTokenSchema.safeParse(token).success) {
    return json({ error: "Unauthorized" }, 401);
  }
  const sessionResponse = await postData(env, "/internal/sessions/current", {
    token,
    now,
  });
  if (sessionResponse.status === 401) {
    return appendCookie(
      json({ error: "Unauthorized" }, 401),
      sessionCookie("", 0),
    );
  }
  if (!sessionResponse.ok) {
    return json({ error: "Session lookup failed" }, 502);
  }
  const session = parseStoredSession(await sessionResponse.json());
  if (session === null) {
    return json({ error: "Session response is invalid" }, 502);
  }
  const membershipResponse = await postData(
    env,
    "/internal/memberships/list",
    { userId: session.user.id },
  );
  if (!membershipResponse.ok) {
    return json({ error: "Mutual guild lookup failed" }, 502);
  }
  const value = MembershipListResponseSchema.safeParse(
    await membershipResponse.json(),
  );
  if (!value.success) {
    return json({ error: "Mutual guild response is invalid" }, 502);
  }
  const candidates: Array<{ guilds: MutualGuild }> = [];
  for (const membership of value.data.memberships) {
    if (membership.guild === null) continue;
    candidates.push({ guilds: membership.guild });
  }

  const guilds: Array<{
    guilds: MutualGuild;
    isAdmin: boolean;
    isDiceWitchAdmin: boolean;
    isRollable?: boolean;
  }> = [];
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const batch = candidates.slice(offset, offset + 5);
    let inspections: Array<
      | {
          status: "found";
          isAdmin: boolean;
          isDiceWitchAdmin: boolean;
          isRollable: boolean | null;
        }
      | { status: "missing" }
    >;
    try {
      inspections = await Promise.all(
        batch.map(async ({ guilds: guild }) => {
          if (rollerView) {
            const inspection = await env.DISCORD_REST.inspectRollerGuild(
              guild.id,
              session.user.id,
            );
            return inspection.status === "missing"
              ? inspection
              : {
                  ...inspection,
                  isRollable: inspection.hasUsableChannel,
                };
          }
          const inspection = await env.DISCORD_REST.inspectMembership(
            guild.id,
            session.user.id,
          );
          return inspection.status === "missing"
            ? inspection
            : { ...inspection, isRollable: null };
        }),
      );
    } catch {
      return json({ error: "Mutual guild verification failed" }, 502);
    }
    for (let index = 0; index < batch.length; index += 1) {
      const candidate = batch[index];
      const inspection = inspections[index];
      if (candidate === undefined || inspection?.status !== "found") continue;
      const { isRollable } = inspection;
      if (rollerView !== (isRollable !== null)) {
        return json({ error: "Mutual guild verification failed" }, 502);
      }
      const guild = {
        ...candidate,
        isAdmin: inspection.isAdmin,
        isDiceWitchAdmin: inspection.isDiceWitchAdmin,
      };
      guilds.push(isRollable === null ? guild : { ...guild, isRollable });
    }
  }
  return json({ guilds });
}

async function getGuildChannels(
  request: Request,
  env: WebApiBindings,
  guildId: string,
  now: number,
): Promise<Response> {
  const token = readCookie(request, "session_id");
  if (token === null || !opaqueTokenSchema.safeParse(token).success) {
    return json({ error: "Unauthorized" }, 401);
  }
  const sessionResponse = await postData(env, "/internal/sessions/current", {
    token,
    now,
  });
  if (sessionResponse.status === 401) {
    return appendCookie(
      json({ error: "Unauthorized" }, 401),
      sessionCookie("", 0),
    );
  }
  if (!sessionResponse.ok) return json({ error: "Session lookup failed" }, 502);
  const session = parseStoredSession(await sessionResponse.json());
  if (session === null) {
    return json({ error: "Session response is invalid" }, 502);
  }
  let channels: TextChannel[];
  try {
    const result = TextChannelsSchema.safeParse(
      await env.DISCORD_REST.listTextChannels(guildId, session.user.id),
    );
    if (!result.success) {
      return json({ error: "Guild channels response is invalid" }, 502);
    }
    channels = result.data;
  } catch {
    return json({ error: "Guild channels lookup failed" }, 502);
  }
  return json({ channels });
}

type AppearanceAccessFailure =
  | "authentication"
  | "authorization"
  | "service";

function v3AppearanceAccessError(
  reason: AppearanceAccessFailure,
  source: Response,
): Response {
  let response: Response;
  if (reason === "authentication") {
    response = json({ error: "appearance_authentication_required" }, 401);
  } else if (reason === "authorization") {
    response = json({ error: "appearance_guild_forbidden" }, 403);
  } else {
    response = json({ error: "appearance_service_unavailable" }, 502);
  }
  const cookie = source.headers.get("set-cookie");
  if (cookie !== null) response.headers.append("set-cookie", cookie);
  return response;
}

async function authorizeGuild(
  request: Request,
  env: WebApiBindings,
  guildId: string,
  now: number,
): Promise<
  | { authorized: true; userId: string }
  | {
      authorized: false;
      reason: AppearanceAccessFailure;
      response: Response;
    }
> {
  const authentication = await authenticateSession(request, env, now);
  if (!authentication.authenticated) {
    return {
      authorized: false,
      reason:
        authentication.response.status === 401
          ? "authentication"
          : "service",
      response: authentication.response,
    };
  }
  const userId = authentication.session.user.id;
  const result = await synchronizeGuildProof(env, guildId, userId, now);
  if (result.status === "unavailable") {
    return {
      authorized: false,
      reason: "service",
      response: json({ error: "Guild authorization failed" }, 502),
    };
  }
  const proof = result.proof;
  return proof.status === "found" &&
      (proof.isAdmin || proof.isDiceWitchAdmin)
    ? { authorized: true, userId }
    : {
        authorized: false,
        reason: "authorization",
        response: json({ error: "Forbidden" }, 403),
      };
}

function guildPreferencesVersion(request: Request): 1 | 2 | null {
  const parameters = [...new URL(request.url).searchParams];
  if (parameters.length === 0) return 1;
  return parameters.length === 1 &&
      parameters[0]?.[0] === "version" &&
      parameters[0][1] === "2"
    ? 2
    : null;
}

async function getGuildPreferences(
  request: Request,
  env: WebApiBindings,
  guildId: string,
): Promise<Response> {
  const version = guildPreferencesVersion(request);
  if (version === null) {
    return json({ error: "Guild preference version is invalid" }, 400);
  }
  const requestBody = version === 1 ? { guildId } : { guildId, version: 2 };
  const response = await postData(
    env,
    "/internal/guilds/settings",
    requestBody,
  );
  if (!response.ok) return json({ error: "Guild settings lookup failed" }, 502);
  const responseBody: SchemaInput = await response.json();
  if (version === 1) {
    const value = GuildSettingsV1ResponseSchema.safeParse(responseBody);
    return value.success
      ? json({ preferences: { skipDiceDelay: value.data.settings.skipDiceDelay } })
      : json({ error: "Guild settings response is invalid" }, 502);
  }
  const value = GuildSettingsV2ResponseSchema.safeParse(responseBody);
  return value.success
    ? json({
        preferences: {
          skipDiceDelay: value.data.settings.skipDiceDelay,
          hideRollResultText: value.data.settings.hideRollResultText,
        },
      })
    : json({ error: "Guild settings response is invalid" }, 502);
}

async function patchGuildPreferences(
  request: Request,
  env: WebApiBindings,
  guildId: string,
  now: number,
): Promise<Response> {
  const version = guildPreferencesVersion(request);
  if (version === null) {
    return json({ error: "Guild preference version is invalid" }, 400);
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey === null || !uuidV4Schema.safeParse(idempotencyKey).success) {
    return json({ error: "Idempotency key is invalid" }, 400);
  }
  const mutationId = `web-preference${version === 2 ? "-v2" : ""}:${idempotencyKey}`;
  let updateBody: SchemaInput;
  try {
    const requestBody: SchemaInput = await request.json();
    if (version === 1) {
      const value = GuildPreferencesV1RequestSchema.parse(requestBody);
      updateBody = {
        guildId,
        skipDiceDelay: value.skipDiceDelay,
        mutationId,
        occurredAt: now,
      };
    } else {
      const value = GuildPreferencesV2RequestSchema.parse(requestBody);
      updateBody = {
        version: 2,
        guildId,
        skipDiceDelay: value.skipDiceDelay,
        hideRollResultText: value.hideRollResultText,
        mutationId,
        occurredAt: now,
      };
    }
  } catch {
    return json({ error: "Guild preference request is invalid" }, 400);
  }
  const response = await postData(
    env,
    "/internal/guilds/settings/update",
    updateBody,
  );
  if (response.status === 409) {
    return json({ error: "Guild preference mutation conflicts" }, 409);
  }
  if (!response.ok) return json({ error: "Guild preference update failed" }, 502);
  return json({ success: true });
}

async function postWebRollPreparation(
  request: Request,
  env: WebApiBindings,
  now: number,
): Promise<Response> {
  let value: z.output<typeof WebRollPreparationRequestSchema>;
  try {
    value = WebRollPreparationRequestSchema.parse(await request.json());
  } catch {
    return json({ error: "Web roll preparation request is invalid" }, 400);
  }

  const token = readCookie(request, "session_id");
  if (token === null || !opaqueTokenSchema.safeParse(token).success) {
    return json({ error: "Unauthorized" }, 401);
  }
  const sessionResponse = await postData(env, "/internal/sessions/current", {
    token,
    now,
  });
  if (sessionResponse.status === 401) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!sessionResponse.ok) {
    return json({ error: "Session lookup failed" }, 502);
  }
  const session = parseStoredSession(await sessionResponse.json());
  if (session === null) {
    return json({ error: "Session response is invalid" }, 502);
  }

  const membershipsResponse = await postData(
    env,
    "/internal/memberships/list",
    { userId: session.user.id },
  );
  if (!membershipsResponse.ok) {
    return json({ error: "Guild authorization failed" }, 502);
  }
  const memberships = GuildAuthorizationResponseSchema.safeParse(
    await membershipsResponse.json(),
  );
  if (!memberships.success) {
    return json({ error: "Guild authorization response is invalid" }, 502);
  }
  const authorized = memberships.data.memberships.some((membership) => {
    const parsed = GuildAuthorizationMembershipSchema.safeParse(membership);
    return parsed.success && parsed.data.guild.id === value.guildId;
  });
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  const preparationInput: WebRollPreparationInput = {
    notation: value.notation,
    repetitions: value.timesToRepeat,
    userId: session.user.id,
    guildId: value.guildId,
  };
  if ("renderSeed" in value) preparationInput.renderSeed = value.renderSeed;
  const preparationValue = await env.ROLL_WEB.prepare(preparationInput);
  const envelope = RollPreparationEnvelopeSchema.safeParse(preparationValue);
  if (!envelope.success) {
    return json({ error: "Roll preparation response is invalid" }, 502);
  }
  const invalid = InvalidRollPreparationSchema.safeParse(preparationValue);
  if (invalid.success) {
    return json(
      { error: invalid.data.message, message: invalid.data.message },
      400,
    );
  }
  const prepared = PreparedRollSchema.safeParse(preparationValue);
  if (!prepared.success) {
    return json({ error: "Roll preparation response is invalid" }, 502);
  }
  const preparation = prepared.data;
  const groupSizes = preparation.groupSizes;
  let renderModel: PublicRenderModelV4 | undefined;
  let appearanceIdentities: string[][];
  try {
    renderModel = parseOptionalRenderModel(preparation);
    appearanceIdentities = parseAppearanceIdentities(
      preparation.appearanceIdentities,
      groupSizes,
    );
    if (
      renderModel !== undefined &&
      renderModel.groups.some(
        (group, index) => group.length !== groupSizes[index],
      )
    ) {
      throw new Error("Prepared render model groups are invalid");
    }
  } catch {
    return json({ error: "Roll preparation response is invalid" }, 502);
  }
  const responseBody = {
    renderSeed: preparation.renderSeed,
    appearanceDigest: preparation.appearanceDigest,
    groupSizes,
    appearanceIdentities,
    renderedImage: {
      contentType: "image/png",
      width: preparation.renderedImage.width,
      height: preparation.renderedImage.height,
      base64: bytesToBase64(preparation.renderedImage.png),
    },
  };
  return json(
    renderModel === undefined ? responseBody : { ...responseBody, renderModel },
  );
}

type WebLibraryRollSelection = z.output<
  typeof WebLibraryRollSelectionSchema
>;

async function resolveWebLibraryRoll(
  env: WebApiBindings,
  selection: WebLibraryRollSelection,
  userId: string,
  guildId: string,
  composition: {
    notation: string;
    repetitions: number;
    title: string | null;
  },
): Promise<SavedRollAttribution | Response> {
  const owner = selection.scope === "personal"
    ? { type: "user", userId }
    : { type: "guild", guildId };
  const response = await postData(env, "/internal/saved-rolls/v2/get", {
    owner,
    id: selection.id,
  });
  if (!response.ok) return json({ error: "Library roll lookup failed" }, 502);
  let result: z.output<typeof SavedRollResultSchema>;
  try {
    result = SavedRollResultSchema.parse(await response.json());
  } catch {
    return json({ error: "Library roll response is invalid" }, 502);
  }
  if (result.status === "missing") {
    return json({ error: "That Library roll no longer exists" }, 404);
  }
  const savedRoll = result.savedRoll;
  if (
    savedRoll.revision !== selection.revision ||
    savedRoll.notation !== composition.notation ||
    savedRoll.title !== composition.title ||
    savedRoll.repetitions !== composition.repetitions
  ) {
    return json({ error: "That Library roll changed. Roll it again." }, 409);
  }
  let nameColor: string | null;
  try {
    nameColor = parseSavedRollNameColorV2(savedRoll.nameColor);
  } catch {
    return json({ error: "Library roll response is invalid" }, 502);
  }
  return {
    scope: selection.scope === "personal" ? "personal" : "guild",
    name: savedRoll.displayName,
    nameColor,
  };
}

async function postWebRoll(
  request: Request,
  env: WebApiBindings,
  now: number,
  authCrypto: AuthCrypto,
): Promise<Response> {
  let value: z.output<typeof WebRollRequestSchema>;
  try {
    value = WebRollRequestSchema.parse(await request.json());
  } catch {
    return json({ error: "Web roll request is invalid" }, 400);
  }
  const libraryRoll: WebLibraryRollSelection | null = value.libraryRoll ?? null;

  const token = readCookie(request, "session_id");
  if (token === null || !opaqueTokenSchema.safeParse(token).success) {
    return json({ error: "Unauthorized" }, 401);
  }
  const sessionResponse = await postData(env, "/internal/sessions/current", {
    token,
    now,
  });
  if (sessionResponse.status === 401) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!sessionResponse.ok) {
    return json({ error: "Session lookup failed" }, 502);
  }
  const session = parseStoredSession(await sessionResponse.json());
  if (session === null) return json({ error: "Session response is invalid" }, 502);

  let availableChannels: TextChannel[];
  try {
    availableChannels = await env.DISCORD_REST.listTextChannels(
      value.guildId,
      session.user.id,
    );
  } catch {
    return json({ error: "Guild channel authorization failed" }, 502);
  }
  if (!availableChannels.some(({ id }) => id === value.channelId)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const savedRollAttribution = libraryRoll === null
    ? undefined
    : await resolveWebLibraryRoll(
        env,
        libraryRoll,
        session.user.id,
        value.guildId,
        {
          notation: value.notation,
          repetitions: value.timesToRepeat,
          title: value.title ?? null,
        },
      );
  if (savedRollAttribution instanceof Response) return savedRollAttribution;

  const settingsResponse = await postData(env, "/internal/guilds/settings", {
    guildId: value.guildId,
    version: 2,
  });
  if (!settingsResponse.ok) {
    return json({ error: "Guild settings lookup failed" }, 502);
  }
  const settings = GuildSettingsV2ResponseSchema.safeParse(
    await settingsResponse.json(),
  );
  if (!settings.success) {
    return json({ error: "Guild settings response is invalid" }, 502);
  }

  if (session.user.username === null || session.user.username.length === 0) {
    return json({ error: "Session username is missing" }, 502);
  }
  if (
    settings.data.settings.hideRollResultText &&
    value.deliveryId === undefined
  ) {
    return json({ error: "Reload Dice Witch before rolling in this server" }, 409);
  }
  const rollInput: WebRollExecutionInput = {
    notation: value.notation,
    repetitions: value.timesToRepeat,
    username: session.user.username,
    title: value.title ?? null,
    userId: session.user.id,
    guildId: value.guildId,
  };
  if (savedRollAttribution !== undefined) {
    rollInput.savedRoll = savedRollAttribution;
  }
  if (value.deliveryId !== undefined) {
    rollInput.deliveryId = value.deliveryId;
    rollInput.applicationId = env.DISCORD_CLIENT_ID;
    rollInput.channelId = value.channelId;
    rollInput.skipDelay = settings.data.settings.skipDiceDelay;
    rollInput.hideRollResultText = settings.data.settings.hideRollResultText;
  }
  if ("appearanceDigest" in value) {
    rollInput.renderSeed = value.renderSeed;
    rollInput.appearanceDigest = value.appearanceDigest;
  }
  const rollValue = await env.ROLL_WEB.execute(rollInput);
  const envelope = RollEnvelopeSchema.safeParse(rollValue);
  if (!envelope.success) {
    return json({ error: "Roll response is invalid" }, 502);
  }
  const conflict = ConflictRollSchema.safeParse(rollValue);
  if (conflict.success) {
    return json({ error: conflict.data.message }, 409);
  }
  const stale = StaleRollSchema.safeParse(rollValue);
  if (stale.success) {
    return json({ error: stale.data.message }, 409);
  }
  const invalid = InvalidRollSchema.safeParse(rollValue);
  if (invalid.success) {
    return json(
      {
        error: invalid.data.message,
        message: invalid.data.message,
        diceArray: [],
        resultArray: [],
        appearanceIdentities: [],
        rerolledAppearanceIdentities: [],
      },
      400,
    );
  }
  const rolled = RolledSchema.safeParse(rollValue);
  if (
    !rolled.success ||
    !sameBytes(rolled.data.renderedImage.png, rolled.data.discord.png)
  ) {
    return json({ error: "Roll response is invalid" }, 502);
  }
  const roll = rolled.data;
  let renderModel: PublicRenderModelV4 | undefined;
  let appearanceIdentities: string[][];
  let rerolledAppearanceIdentities: string[];
  try {
    const groupSizes = roll.diceArray.map((group) => {
      if (!Array.isArray(group)) {
        throw new Error("Roll dice groups are invalid");
      }
      return group.length;
    });
    if (roll.resultArray.length !== groupSizes.length) {
      throw new Error("Roll result groups are invalid");
    }
    renderModel = parseOptionalRenderModel(roll);
    appearanceIdentities = parseAppearanceIdentities(
      roll.appearanceIdentities,
      groupSizes,
    );
    rerolledAppearanceIdentities = parseRerolledAppearanceIdentities(
      roll.rerolledAppearanceIdentities,
      appearanceIdentities,
    );
    if (
      renderModel !== undefined &&
      renderModel.groups.some(
        (group, index) => group.length !== groupSizes[index],
      )
    ) {
      throw new Error("Roll render model groups are invalid");
    }
  } catch {
    return json({ error: "Roll response is invalid" }, 502);
  }
  const renderedImage = {
    contentType: "image/png",
    width: roll.renderedImage.width,
    height: roll.renderedImage.height,
    base64: bytesToBase64(roll.renderedImage.png),
  };
  const renderModelResponse =
    renderModel === undefined ? {} : { renderModel };
  const delivery =
    roll.deliveryStatus === undefined
      ? await env.DISCORD_REST.deliverWebRoll({
          guildId: value.guildId,
          channelId: value.channelId,
          payload: roll.discord.payload,
          clatter: roll.discord.clatter,
          filename: roll.discord.filename,
          png: roll.discord.png,
          skipDelay: settings.data.settings.skipDiceDelay,
          delayMs: webRollDelayMs(
            settings.data.settings.skipDiceDelay,
            authCrypto,
          ),
        })
      : { status: roll.deliveryStatus };
  if (delivery.status === "pending" || delivery.status === "retryable") {
    return json({ error: "Discord delivery is pending" }, 503);
  }
  if (delivery.status === "failed") {
    return json({ error: "Discord delivery failed" }, 502);
  }
  if (delivery.status === "permission_error") {
    return json(
      {
        error: "PERMISSION_ERROR",
        message:
          "Dice Witch needs permission to read message history, attach files, and embed links to show you the dice. 😊",
        diceArray: roll.diceArray,
        resultArray: roll.resultArray,
        appearanceIdentities,
        rerolledAppearanceIdentities,
        renderedImage,
        ...renderModelResponse,
      },
      403,
    );
  }
  return json({
    message: "Message sent to Discord channel",
    diceArray: roll.diceArray,
    resultArray: roll.resultArray,
    appearanceIdentities,
    rerolledAppearanceIdentities,
    renderedImage,
    ...renderModelResponse,
  });
}

async function signOut(
  request: Request,
  env: WebApiBindings,
  configuration: ValidatedConfiguration,
  now: number,
): Promise<Response> {
  if (request.headers.get("origin") !== configuration.FRONTEND_ORIGIN) {
    return json({ error: "Forbidden" }, 403);
  }
  const token = readCookie(request, "session_id");
  if (token !== null && opaqueTokenSchema.safeParse(token).success) {
    const response = await postData(env, "/internal/sessions/revoke", {
      token,
      revokedAt: now,
    });
    if (!response.ok) {
      return appendCookie(
        json({ error: "Session revocation failed" }, 502),
        sessionCookie("", 0),
      );
    }
  }
  return appendCookie(json({ success: true }), sessionCookie("", 0));
}

export async function handleAuthRequest(
  request: Request,
  env: WebApiBindings,
  discordFetch: RequestFetch = (discordRequest) => fetch(discordRequest),
  clock: () => number = Date.now,
  authCrypto: AuthCrypto = defaultAuthCrypto,
): Promise<Response> {
  const configuration = await validateConfiguration(env);
  if (configuration === null) {
    return json({ error: "Web API configuration is invalid" }, 500);
  }
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== configuration.apiOrigin) {
    return json({ error: "Request origin is invalid" }, 400);
  }
  const { pathname } = requestUrl;
  const now = clock();
  try {
    if (request.method === "GET" && pathname === "/api/auth/signin/discord") {
      return await startAuthorization(request, env, configuration, now);
    }
    if (request.method === "GET" && pathname === "/api/auth/refresh/discord") {
      return await startGuildRefresh(request, env, configuration, now);
    }
    if (
      request.method === "GET" &&
      pathname === "/api/auth/callback/discord"
    ) {
      return await completeCallback(
        request,
        env,
        configuration,
        discordFetch,
        now,
        authCrypto,
      );
    }
    if (request.method === "OPTIONS") {
      return preflight(request, configuration, pathname);
    }
    if (
      request.method === "GET" &&
      pathname === "/api/appearance/v4/catalog"
    ) {
      if (!isFrontendRequest(request, configuration)) {
        return json({ error: "Forbidden" }, 403);
      }
      if (!hasExactCatalogBuild(requestUrl, configuration.BUILD_SHA)) {
        const response = json(
          { error: "appearance_catalog_build_mismatch" },
          409,
        );
        return request.headers.has("origin")
          ? withCors(response, configuration)
          : response;
      }
      const response = Response.json(
        appearanceCatalogForPolicyV3(
          configuration.APPEARANCE_CATALOG_POLICY,
        ),
        {
          headers: {
            ...securityHeaders,
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
      );
      return request.headers.has("origin")
        ? withCors(response, configuration)
        : response;
    }
    if (
      pathname === "/api/appearance/v4/me" &&
      (request.method === "GET" || request.method === "PUT")
    ) {
      const exactOrigin =
        request.headers.get("origin") === configuration.FRONTEND_ORIGIN;
      if (
        (request.method === "GET" &&
          !isFrontendRequest(request, configuration)) ||
        (request.method === "PUT" && !exactOrigin)
      ) {
        return json({ error: "appearance_origin_forbidden" }, 403);
      }
      const authentication = await authenticateSession(request, env, now);
      if (!authentication.authenticated) {
        const response = v3AppearanceAccessError(
          authentication.response.status === 401
            ? "authentication"
            : "service",
          authentication.response,
        );
        return exactOrigin ? withCors(response, configuration) : response;
      }
      const response = request.method === "GET"
        ? await getPersonalAppearanceV4(
            env.DATA_SERVICE,
            authentication.session.user.id,
            configuration.APPEARANCE_CATALOG_POLICY,
          )
        : await putPersonalAppearanceV4(
            request,
            env.DATA_SERVICE,
            authentication.session.user.id,
            now,
            configuration.APPEARANCE_CATALOG_POLICY,
          );
      return exactOrigin ? withCors(response, configuration) : response;
    }
    if (
      pathname === "/api/appearance/v4/me/state" &&
      (request.method === "GET" || request.method === "PUT")
    ) {
      const exactOrigin =
        request.headers.get("origin") === configuration.FRONTEND_ORIGIN;
      if (
        (request.method === "GET" &&
          !isFrontendRequest(request, configuration)) ||
        (request.method === "PUT" && !exactOrigin)
      ) {
        return json({ error: "appearance_origin_forbidden" }, 403);
      }
      const authentication = await authenticateSession(request, env, now);
      if (!authentication.authenticated) {
        const response = v3AppearanceAccessError(
          authentication.response.status === 401
            ? "authentication"
            : "service",
          authentication.response,
        );
        return exactOrigin ? withCors(response, configuration) : response;
      }
      const response = request.method === "GET"
        ? await getPersonalAppearanceStateV4(
            env.DATA_SERVICE,
            authentication.session.user.id,
            configuration.APPEARANCE_CATALOG_POLICY,
          )
        : await putPersonalAppearanceStateV4(
            request,
            env.DATA_SERVICE,
            authentication.session.user.id,
            now,
            configuration.APPEARANCE_CATALOG_POLICY,
          );
      return exactOrigin ? withCors(response, configuration) : response;
    }
    const personalAppearanceAction = pathname.match(
      /^\/api\/appearance\/v4\/me\/state\/(reset|restore)$/,
    )?.[1];
    if (
      request.method === "POST" &&
      (personalAppearanceAction === "reset" ||
        personalAppearanceAction === "restore")
    ) {
      const exactOrigin =
        request.headers.get("origin") === configuration.FRONTEND_ORIGIN;
      if (!exactOrigin) {
        return json({ error: "appearance_origin_forbidden" }, 403);
      }
      const authentication = await authenticateSession(request, env, now);
      if (!authentication.authenticated) {
        return withCors(
          v3AppearanceAccessError(
            authentication.response.status === 401
              ? "authentication"
              : "service",
            authentication.response,
          ),
          configuration,
        );
      }
      const mutate = personalAppearanceAction === "reset"
        ? resetPersonalAppearanceV4
        : restorePersonalAppearanceV4;
      return withCors(
        await mutate(
          request,
          env.DATA_SERVICE,
          authentication.session.user.id,
          now,
          configuration.APPEARANCE_CATALOG_POLICY,
        ),
        configuration,
      );
    }
    if (
      request.method === "POST" &&
      pathname === "/api/appearance/v4/preview"
    ) {
      if (request.headers.get("origin") !== configuration.FRONTEND_ORIGIN) {
        return json({ error: "appearance_origin_forbidden" }, 403);
      }
      const authentication = await authenticateSession(request, env, now);
      if (!authentication.authenticated) {
        return withCors(
          v3AppearanceAccessError(
            authentication.response.status === 401
              ? "authentication"
              : "service",
            authentication.response,
          ),
          configuration,
        );
      }
      return withCors(
        await previewAppearanceV4(request, env.ROLL_WEB),
        configuration,
      );
    }
    if (
      request.method === "POST" &&
      pathname === "/api/internal/appearance/thumbs"
    ) {
      return await bakeAppearanceThumbs(request, env);
    }
    if (
      request.method === "GET" &&
      pathname === "/api/appearance/thumbs/version"
    ) {
      return await appearanceThumbsVersion(env);
    }
    if (request.method === "GET" && pathname.startsWith("/thumbs/")) {
      return await serveAppearanceThumb(pathname, env);
    }
    if (request.method === "GET" && pathname === "/api/stats/public") {
      const response = await env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/audience-snapshot"),
      );
      if (!response.ok) {
        return json({ error: "Public stats are unavailable" }, 502);
      }
      const result = AudienceSnapshotResponseSchema.safeParse(
        await response.json(),
      );
      if (!result.success) {
        return json({ error: "Public stats response is invalid" }, 502);
      }
      try {
        const snapshot = parseDiscordAudienceSnapshotV1(result.data.snapshot);
        if (
          snapshot.capturedAt > now ||
          now - snapshot.capturedAt > DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS
        ) {
          return json({ error: "Public stats are stale" }, 503);
        }
        return Response.json(snapshot, {
          headers: {
            ...securityHeaders,
            "cache-control": "public, max-age=3600",
          },
        });
      } catch {
        return json({ error: "Public stats response is invalid" }, 502);
      }
    }
    if (request.method === "GET" && pathname === "/api/auth/session") {
      if (!isFrontendRequest(request, configuration)) {
        return json({ error: "Forbidden" }, 403);
      }
      const response = await getSession(request, env, now);
      return request.headers.has("origin")
        ? withCors(response, configuration)
        : response;
    }
    if (request.method === "GET" && pathname === "/api/guilds/mutual") {
      if (!isFrontendRequest(request, configuration)) {
        return json({ error: "Forbidden" }, 403);
      }
      const response = await getMutualGuilds(request, env, now);
      return request.headers.has("origin")
        ? withCors(response, configuration)
        : response;
    }
    const isSavedRollPath =
      /^\/api\/saved-rolls\/v[12]\/(?:libraries|search|me(?:\/.*)?)$/.test(
        pathname,
      ) ||
      /^\/api\/guilds\/[1-9][0-9]{16,19}\/saved-rolls\/v[12](?:\/.*)?$/.test(
        pathname,
      );
    if (isSavedRollPath) {
      const exactOrigin =
        request.headers.get("origin") === configuration.FRONTEND_ORIGIN;
      if (
        (request.method === "GET" &&
          !isFrontendRequest(request, configuration)) ||
        (request.method !== "GET" && !exactOrigin)
      ) {
        return json({ error: "Forbidden" }, 403);
      }
      const authentication = await authenticateSession(request, env, now);
      if (!authentication.authenticated) {
        return exactOrigin
          ? withCors(authentication.response, configuration)
          : authentication.response;
      }
      const savedRollResponse = await handleSavedRollApiRequest(
        request,
        env,
        authentication.session.user.id,
        now,
      );
      const response =
        savedRollResponse ?? json({ error: "Not found" }, 404);
      return exactOrigin ? withCors(response, configuration) : response;
    }
    const channelMatch = pathname.match(
      /^\/api\/guilds\/([1-9][0-9]{16,19})\/channels$/,
    );
    if (request.method === "GET" && channelMatch !== null) {
      if (!isFrontendRequest(request, configuration)) {
        return json({ error: "Forbidden" }, 403);
      }
      const guildId = channelMatch[1];
      if (guildId === undefined) {
        return json({ error: "Guild id is invalid" }, 400);
      }
      const response = await getGuildChannels(request, env, guildId, now);
      return request.headers.has("origin")
        ? withCors(response, configuration)
        : response;
    }
    const appearanceMatch = pathname.match(
      /^\/api\/guilds\/([1-9][0-9]{16,19})\/appearance\/v4(?:\/(state)(?:\/(reset|restore))?)?$/,
    );
    const usesRestoreState = appearanceMatch?.[2] === "state";
    const guildAppearanceAction = appearanceMatch?.[3];
    if (
      appearanceMatch !== null &&
      ((guildAppearanceAction === undefined &&
        (request.method === "GET" || request.method === "PUT")) ||
        ((guildAppearanceAction === "reset" ||
          guildAppearanceAction === "restore") &&
          request.method === "POST"))
    ) {
      const guildId = appearanceMatch[1];
      if (guildId === undefined) {
        return json({ error: "Guild id is invalid" }, 400);
      }
      const exactOrigin =
        request.headers.get("origin") === configuration.FRONTEND_ORIGIN;
      if (
        (request.method === "GET" &&
          !isFrontendRequest(request, configuration)) ||
        (request.method !== "GET" && !exactOrigin)
      ) {
        return json({ error: "appearance_origin_forbidden" }, 403);
      }
      const authorization = await authorizeGuild(request, env, guildId, now);
      if (!authorization.authorized) {
        const response = v3AppearanceAccessError(
          authorization.reason,
          authorization.response,
        );
        return exactOrigin ? withCors(response, configuration) : response;
      }
      let response: Response;
      if (request.method === "GET") {
        const getAppearance = usesRestoreState
          ? getGuildAppearanceStateV4
          : getGuildAppearanceV4;
        response = await getAppearance(
          env.DATA_SERVICE,
          guildId,
          configuration.APPEARANCE_CATALOG_POLICY,
        );
      } else {
        let mutate = usesRestoreState
          ? putGuildAppearanceStateV4
          : putGuildAppearanceV4;
        if (guildAppearanceAction === "reset") {
          mutate = resetGuildAppearanceV4;
        } else if (guildAppearanceAction === "restore") {
          mutate = restoreGuildAppearanceV4;
        }
        response = await mutate(
          request,
          env.DATA_SERVICE,
          guildId,
          authorization.userId,
          now,
          configuration.APPEARANCE_CATALOG_POLICY,
        );
      }
      return exactOrigin ? withCors(response, configuration) : response;
    }
    const preferenceMatch = pathname.match(
      /^\/api\/guilds\/([1-9][0-9]{16,19})\/preferences$/,
    );
    if (
      preferenceMatch !== null &&
      (request.method === "GET" || request.method === "PATCH")
    ) {
      const guildId = preferenceMatch[1];
      if (guildId === undefined) {
        return json({ error: "Guild id is invalid" }, 400);
      }
      const exactOrigin =
        request.headers.get("origin") === configuration.FRONTEND_ORIGIN;
      if (
        (request.method === "GET" &&
          !isFrontendRequest(request, configuration)) ||
        (request.method === "PATCH" && !exactOrigin)
      ) {
        return json({ error: "Forbidden" }, 403);
      }
      const authorization = await authorizeGuild(request, env, guildId, now);
      if (!authorization.authorized) {
        return exactOrigin
          ? withCors(authorization.response, configuration)
          : authorization.response;
      }
      const response =
        request.method === "GET"
          ? await getGuildPreferences(request, env, guildId)
          : await patchGuildPreferences(request, env, guildId, now);
      return exactOrigin ? withCors(response, configuration) : response;
    }
    if (
      request.method === "POST" &&
      (pathname === "/api/dice/prepare" || pathname === "/api/dice/roll")
    ) {
      if (request.headers.get("origin") !== configuration.FRONTEND_ORIGIN) {
        return json({ error: "Forbidden" }, 403);
      }
      const response =
        pathname === "/api/dice/prepare"
          ? await postWebRollPreparation(request, env, now)
          : await postWebRoll(request, env, now, authCrypto);
      return withCors(response, configuration);
    }
    if (request.method === "POST" && pathname === "/api/auth/signout") {
      const response = await signOut(request, env, configuration, now);
      return request.headers.get("origin") === configuration.FRONTEND_ORIGIN
        ? withCors(response, configuration)
        : response;
    }
    return json({ error: "Not found" }, 404);
  } catch {
    return json({ error: "Web API request failed" }, 500);
  }
}
