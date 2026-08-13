import {
  parsePublicRenderModelV4,
  serializeRenderRequestV4,
  type PublicRenderModelV4,
} from "@dice-witch/dice-v4-model";
import { APPEARANCE_CATALOG_V3 } from "../../../packages/dice-appearance/src";
import { MAX_NOTATION_LENGTH } from "../../../packages/roll-domain/src/constants";
import { parseSavedRollNameColorV2 } from "../../../packages/saved-rolls/src/color";
import { selectRollDelayMs } from "../../../packages/roll-domain/src/random";
import {
  DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS,
  parseDiscordAudienceSnapshotV1,
} from "../../../packages/discord-contracts/src";
import { readWorkerSecret, type WorkerSecretSource } from "../../../packages/worker-secrets/src";
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../data/src/session-repository";
import {
  getGuildAppearanceV4,
  getPersonalAppearanceV4,
  previewAppearanceV4,
  putGuildAppearanceV4,
  putPersonalAppearanceV4,
} from "./appearance-api";
import { synchronizeGuildProof } from "./guild-authorization";
import { bytesToBase64, json, securityHeaders } from "./responses";
import { handleSavedRollApiRequest } from "./saved-roll-api";

const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL = "https://discord.com/api/v10/users/@me";
const DISCORD_GUILDS_URL = "https://discord.com/api/v10/users/@me/guilds?limit=200";
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const STATE_TTL_MS = 10 * 60 * 1_000;
const MAX_AUTH_RETURN_LENGTH = 2_048;
const AUTHENTICATED_ROUTES = new Set([
  "/app",
  "/app/library",
  "/app/preferences",
]);
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DELIVERY_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function webRollDelayMs(skipDelay: boolean): number {
  if (skipDelay) return 0;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (seed === undefined) throw new Error("Web roll delay generation failed");
  return selectRollDelayMs(seed / 2 ** 32);
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

type TextChannel = { id: string; name: string; type: 0 | 5 };

type DiscordRestService = {
  deliverWebRoll(input: {
    guildId: string;
    channelId: string;
    payload: unknown;
    clatter: string;
    filename: string;
    png: Uint8Array;
    skipDelay: boolean;
    delayMs: number;
  }): Promise<{ status: "delivered" | "permission_error" }>;
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
    prepare(value: unknown): Promise<unknown>;
    execute(value: unknown): Promise<unknown>;
    previewV4(value: unknown): Promise<unknown>;
  };
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: WorkerSecretSource;
  DISCORD_REDIRECT_URI: string;
  FRONTEND_ORIGIN: string;
  BUILD_SHA: string;
};

type ValidatedConfiguration = Omit<
  Pick<
    WebApiBindings,
    | "DISCORD_CLIENT_ID"
    | "DISCORD_CLIENT_SECRET"
    | "DISCORD_REDIRECT_URI"
    | "FRONTEND_ORIGIN"
    | "BUILD_SHA"
  >,
  "DISCORD_CLIENT_SECRET"
> & {
  DISCORD_CLIENT_SECRET: string;
  apiOrigin: string;
  frontendUrl: URL;
};

type RequestFetch = (request: Request) => Promise<Response>;
type DiscordToken = { accessToken: string };
type OAuthStateContext = {
  purpose: "sign_in" | "refresh";
  expectedUserId: string | null;
  returnTo: string;
};
type DiscordProfile = {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
};

type DiscordGuild = {
  id: string;
  name: string;
  icon: string | null;
  permissions: string;
};

type StoredSession = {
  user: {
    id: string;
    username: string | null;
    email: string | null;
    avatar: string | null;
  };
  createdAt: number;
  expiresAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOptionalRenderModel(
  roll: Record<string, unknown>,
): PublicRenderModelV4 | undefined {
  if (!Object.hasOwn(roll, "renderModel")) return undefined;
  const renderModel = parsePublicRenderModelV4(roll.renderModel);
  serializeRenderRequestV4(renderModel);
  return renderModel;
}

function parseAppearanceIdentities(
  value: unknown,
  groupSizes: readonly number[],
): string[][] {
  if (!Array.isArray(value) || value.length !== groupSizes.length) {
    throw new Error("Roll appearance identities are invalid");
  }
  const identities = value.map((group, groupIndex) => {
    const groupSize = groupSizes[groupIndex];
    if (!Array.isArray(group) || group.length !== groupSize) {
      throw new Error("Roll appearance identities are invalid");
    }
    return group.map((identity) => {
      if (
        typeof identity !== "string" ||
        identity.length < 1 ||
        identity.length > 512
      ) {
        throw new Error("Roll appearance identities are invalid");
      }
      return identity;
    });
  });
  const flattened = identities.flat();
  if (new Set(flattened).size !== flattened.length) {
    throw new Error("Roll appearance identities are invalid");
  }
  return identities;
}

function parseRerolledAppearanceIdentities(
  value: unknown,
  appearanceIdentities: readonly (readonly string[])[],
): string[] {
  if (
    !Array.isArray(value) ||
    value.some((identity) => typeof identity !== "string")
  ) {
    throw new Error("Rerolled appearance identities are invalid");
  }
  const identities = value as string[];
  const validIdentities = new Set(appearanceIdentities.flat());
  if (
    new Set(identities).size !== identities.length ||
    identities.some((identity) => !validIdentities.has(identity))
  ) {
    throw new Error("Rerolled appearance identities are invalid");
  }
  return [...identities];
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
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
  const frontendUrl = exactOrigin(env.FRONTEND_ORIGIN);
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(env.DISCORD_REDIRECT_URI);
  } catch {
    return null;
  }
  let clientSecret: string;
  try {
    clientSecret = await readWorkerSecret(
      env.DISCORD_CLIENT_SECRET,
      "DISCORD_CLIENT_SECRET",
    );
  } catch {
    return null;
  }
  if (
    !SNOWFLAKE.test(env.DISCORD_CLIENT_ID) ||
    redirectUrl.protocol !== "https:" ||
    redirectUrl.username !== "" ||
    redirectUrl.password !== "" ||
    redirectUrl.pathname !== "/api/auth/callback/discord" ||
    redirectUrl.search !== "" ||
    redirectUrl.hash !== "" ||
    redirectUrl.toString() !== env.DISCORD_REDIRECT_URI ||
    frontendUrl === null ||
    !FULL_SHA.test(env.BUILD_SHA)
  ) {
    return null;
  }
  return {
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET: clientSecret,
    DISCORD_REDIRECT_URI: env.DISCORD_REDIRECT_URI,
    FRONTEND_ORIGIN: env.FRONTEND_ORIGIN,
    BUILD_SHA: env.BUILD_SHA,
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
  body: unknown,
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
  const value: unknown = await stateResponse.json();
  if (
    !isRecord(value) ||
    typeof value.token !== "string" ||
    !OPAQUE_TOKEN.test(value.token)
  ) {
    return json({ error: "OAuth state response is invalid" }, 502);
  }

  return discordAuthorizationRedirect(configuration, value.token);
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
  const value: unknown = await stateResponse.json();
  if (
    !isRecord(value) ||
    typeof value.token !== "string" ||
    !OPAQUE_TOKEN.test(value.token)
  ) {
    return json({ error: "OAuth state response is invalid" }, 502);
  }
  return discordAuthorizationRedirect(configuration, value.token);
}

function parseDiscordToken(value: unknown): DiscordToken | null {
  if (
    !isRecord(value) ||
    typeof value.access_token !== "string" ||
    value.access_token.length === 0 ||
    value.token_type !== "Bearer"
  ) {
    return null;
  }
  return { accessToken: value.access_token };
}

function nullableString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 255);
}

function parseDiscordProfile(value: unknown): DiscordProfile | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !SNOWFLAKE.test(value.id) ||
    typeof value.username !== "string" ||
    value.username.length > 255 ||
    !nullableString(value.email) ||
    !nullableString(value.avatar)
  ) {
    return null;
  }
  return {
    id: value.id,
    username: value.username,
    email: value.email,
    avatar: value.avatar,
  };
}

function parseDiscordGuilds(value: unknown): DiscordGuild[] | null {
  if (!Array.isArray(value) || value.length > 200) return null;
  const guilds: DiscordGuild[] = [];
  const ids = new Set<string>();
  for (const guild of value) {
    if (
      !isRecord(guild) ||
      typeof guild.id !== "string" ||
      !SNOWFLAKE.test(guild.id) ||
      typeof guild.name !== "string" ||
      guild.name.length < 1 ||
      guild.name.length > 255 ||
      !nullableString(guild.icon) ||
      typeof guild.permissions !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(guild.permissions) ||
      ids.has(guild.id)
    ) {
      return null;
    }
    ids.add(guild.id);
    guilds.push({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      permissions: guild.permissions,
    });
  }
  return guilds;
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
    const value: unknown = await response.json();
    if (
      !isRecord(value) ||
      value.status !== "consumed" ||
      !isRecord(value.context) ||
      (value.context.purpose !== "sign_in" &&
        value.context.purpose !== "refresh") ||
      (value.context.expectedUserId !== null &&
        (typeof value.context.expectedUserId !== "string" ||
          !SNOWFLAKE.test(value.context.expectedUserId))) ||
      (value.context.purpose === "sign_in" &&
        value.context.expectedUserId !== null) ||
      (value.context.purpose === "refresh" &&
        value.context.expectedUserId === null) ||
      typeof value.context.returnTo !== "string" ||
      parseAuthenticatedReturnTo(value.context.returnTo) === null
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "consumed",
      context: {
        purpose: value.context.purpose,
        expectedUserId: value.context.expectedUserId,
        returnTo: value.context.returnTo,
      },
    };
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
  const filtered: unknown = await filterResponse.json();
  if (
    !isRecord(filtered) ||
    !Array.isArray(filtered.guildIds) ||
    !filtered.guildIds.every(
      (guildId): guildId is string =>
        typeof guildId === "string" && SNOWFLAKE.test(guildId),
    ) ||
    filtered.guildIds.length > guilds.length ||
    new Set(filtered.guildIds).size !== filtered.guildIds.length
  ) {
    throw new Error("Guild filter response is invalid");
  }
  const guildById = new Map(guilds.map((guild) => [guild.id, guild]));
  for (const guildId of filtered.guildIds) {
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
): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const savedState = readCookie(request, "auth_state");
  if (
    state === null ||
    savedState === null ||
    !OPAQUE_TOKEN.test(state) ||
    !OPAQUE_TOKEN.test(savedState) ||
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

  const stateHash = await hashOpaqueToken(state);
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

  const sessionToken = generateOpaqueToken();
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
  const login: unknown = await loginResponse.json();
  if (
    !isRecord(login) ||
    (login.status !== "applied" && login.status !== "existing") ||
    !isRecord(login.session) ||
    login.session.userId !== profile.id ||
    login.session.createdAt !== now ||
    login.session.expiresAt !== expiresAt
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

function parseStoredSession(value: unknown): StoredSession | null {
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    typeof value.user.id !== "string" ||
    !SNOWFLAKE.test(value.user.id) ||
    !nullableString(value.user.username) ||
    !nullableString(value.user.email) ||
    !nullableString(value.user.avatar) ||
    !Number.isSafeInteger(value.createdAt) ||
    !Number.isSafeInteger(value.expiresAt)
  ) {
    return null;
  }
  return value as StoredSession;
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
  if (token === null || !OPAQUE_TOKEN.test(token)) {
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
  if (token === null || !OPAQUE_TOKEN.test(token)) {
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
  if (token === null || !OPAQUE_TOKEN.test(token)) {
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
  const value: unknown = await membershipResponse.json();
  if (!isRecord(value) || !Array.isArray(value.memberships)) {
    return json({ error: "Mutual guild response is invalid" }, 502);
  }
  const candidates: Array<{
    guilds: { id: string; name: string | null; icon: string | null };
  }> = [];
  for (const membership of value.memberships) {
    if (
      !isRecord(membership) ||
      typeof membership.isAdmin !== "boolean" ||
      typeof membership.isDiceWitchAdmin !== "boolean"
    ) {
      return json({ error: "Mutual guild response is invalid" }, 502);
    }
    if (membership.guild === null) continue;
    if (
      !isRecord(membership.guild) ||
      typeof membership.guild.id !== "string" ||
      !SNOWFLAKE.test(membership.guild.id) ||
      !nullableString(membership.guild.name) ||
      !nullableString(membership.guild.icon)
    ) {
      return json({ error: "Mutual guild response is invalid" }, 502);
    }
    candidates.push({
      guilds: {
        id: membership.guild.id,
        name: membership.guild.name,
        icon: membership.guild.icon,
      },
    });
  }

  const guilds: unknown[] = [];
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const batch = candidates.slice(offset, offset + 5);
    let inspections: Array<MembershipInspection | RollerGuildInspection>;
    try {
      inspections = await Promise.all(
        batch.map(({ guilds: guild }) =>
          rollerView
            ? env.DISCORD_REST.inspectRollerGuild(guild.id, session.user.id)
            : env.DISCORD_REST.inspectMembership(guild.id, session.user.id),
        ),
      );
    } catch {
      return json({ error: "Mutual guild verification failed" }, 502);
    }
    for (let index = 0; index < batch.length; index += 1) {
      const candidate = batch[index];
      const inspection = inspections[index];
      if (candidate === undefined || inspection?.status !== "found") continue;
      const isRollable = "hasUsableChannel" in inspection
        ? inspection.hasUsableChannel
        : null;
      if (rollerView !== (isRollable !== null)) {
        return json({ error: "Mutual guild verification failed" }, 502);
      }
      guilds.push({
        ...candidate,
        isAdmin: inspection.isAdmin,
        isDiceWitchAdmin: inspection.isDiceWitchAdmin,
        ...(isRollable === null ? {} : { isRollable }),
      });
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
  if (token === null || !OPAQUE_TOKEN.test(token)) {
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
  let channels: unknown;
  try {
    channels = await env.DISCORD_REST.listTextChannels(
      guildId,
      session.user.id,
    );
  } catch {
    return json({ error: "Guild channels lookup failed" }, 502);
  }
  if (
    !Array.isArray(channels) ||
    !channels.every(
      (channel) =>
        isRecord(channel) &&
        typeof channel.id === "string" &&
        SNOWFLAKE.test(channel.id) &&
        typeof channel.name === "string" &&
        (channel.type === 0 || channel.type === 5),
    )
  ) {
    return json({ error: "Guild channels response is invalid" }, 502);
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
  const response = await postData(env, "/internal/guilds/settings", {
    guildId,
    ...(version === 2 ? { version: 2 } : {}),
  });
  if (!response.ok) return json({ error: "Guild settings lookup failed" }, 502);
  const value: unknown = await response.json();
  if (
    !isRecord(value) ||
    value.status !== "found" ||
    !isRecord(value.settings) ||
    typeof value.settings.skipDiceDelay !== "boolean" ||
    (version === 2 && typeof value.settings.hideRollResultText !== "boolean")
  ) {
    return json({ error: "Guild settings response is invalid" }, 502);
  }
  return json({
    preferences: version === 1
      ? { skipDiceDelay: value.settings.skipDiceDelay }
      : {
          skipDiceDelay: value.settings.skipDiceDelay,
          hideRollResultText: value.settings.hideRollResultText,
        },
  });
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
  if (idempotencyKey === null || !UUID_V4.test(idempotencyKey)) {
    return json({ error: "Idempotency key is invalid" }, 400);
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Guild preference request is invalid" }, 400);
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      version === 1
        ? ["skipDiceDelay"]
        : ["hideRollResultText", "skipDiceDelay"],
    ) ||
    typeof value.skipDiceDelay !== "boolean" ||
    (version === 2 && typeof value.hideRollResultText !== "boolean")
  ) {
    return json({ error: "Guild preference request is invalid" }, 400);
  }
  const response = await postData(env, "/internal/guilds/settings/update", {
    ...(version === 2 ? { version: 2 } : {}),
    guildId,
    skipDiceDelay: value.skipDiceDelay,
    ...(version === 2
      ? { hideRollResultText: value.hideRollResultText }
      : {}),
    mutationId: `web-preference${version === 2 ? "-v2" : ""}:${idempotencyKey}`,
    occurredAt: now,
  });
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
  let value: Record<string, unknown>;
  try {
    value = await request.json();
    if (
      !isRecord(value) ||
      (!hasExactKeys(value, ["guildId", "notation", "timesToRepeat"]) &&
        !hasExactKeys(value, [
          "guildId",
          "notation",
          "renderSeed",
          "timesToRepeat",
        ])) ||
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.notation !== "string" ||
      value.notation.length < 1 ||
      value.notation.length > MAX_NOTATION_LENGTH ||
      typeof value.timesToRepeat !== "number" ||
      !Number.isSafeInteger(value.timesToRepeat) ||
      value.timesToRepeat < 1 ||
      value.timesToRepeat > 50 ||
      (value.renderSeed !== undefined &&
        (typeof value.renderSeed !== "number" ||
          !Number.isInteger(value.renderSeed) ||
          value.renderSeed < 0 ||
          value.renderSeed > 0xffff_ffff))
    ) {
      throw new Error("Web roll preparation request is invalid");
    }
  } catch {
    return json({ error: "Web roll preparation request is invalid" }, 400);
  }

  const token = readCookie(request, "session_id");
  if (token === null || !OPAQUE_TOKEN.test(token)) {
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
  const memberships: unknown = await membershipsResponse.json();
  if (!isRecord(memberships) || !Array.isArray(memberships.memberships)) {
    return json({ error: "Guild authorization response is invalid" }, 502);
  }
  const authorized = memberships.memberships.some(
    (membership) =>
      isRecord(membership) &&
      isRecord(membership.guild) &&
      membership.guild.id === value.guildId,
  );
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  const preparation: unknown = await env.ROLL_WEB.prepare({
    notation: value.notation,
    repetitions: value.timesToRepeat,
    userId: session.user.id,
    guildId: value.guildId,
    ...(value.renderSeed === undefined ? {} : { renderSeed: value.renderSeed }),
  });
  if (!isRecord(preparation) || typeof preparation.status !== "string") {
    return json({ error: "Roll preparation response is invalid" }, 502);
  }
  if (
    preparation.status === "invalid" &&
    typeof preparation.message === "string"
  ) {
    return json(
      { error: preparation.message, message: preparation.message },
      400,
    );
  }
  if (
    preparation.status !== "prepared" ||
    typeof preparation.appearanceDigest !== "string" ||
    !SHA256.test(preparation.appearanceDigest) ||
    typeof preparation.renderSeed !== "number" ||
    !Number.isInteger(preparation.renderSeed) ||
    preparation.renderSeed < 0 ||
    preparation.renderSeed > 0xffff_ffff ||
    !Array.isArray(preparation.groupSizes) ||
    preparation.groupSizes.length < 1 ||
    preparation.groupSizes.length > 50 ||
    !preparation.groupSizes.every(
      (size) => Number.isSafeInteger(size) && Number(size) >= 1,
    ) ||
    preparation.groupSizes.reduce<number>(
      (total, size) => total + Number(size),
      0,
    ) > 50 ||
    !isRecord(preparation.renderedImage) ||
    preparation.renderedImage.contentType !== "image/png" ||
    !Number.isSafeInteger(preparation.renderedImage.width) ||
    Number(preparation.renderedImage.width) < 1 ||
    !Number.isSafeInteger(preparation.renderedImage.height) ||
    Number(preparation.renderedImage.height) < 1 ||
    !(preparation.renderedImage.png instanceof Uint8Array)
  ) {
    return json({ error: "Roll preparation response is invalid" }, 502);
  }
  const groupSizes = preparation.groupSizes.map(Number);
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
  return json({
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
    ...(renderModel === undefined ? {} : { renderModel }),
  });
}

type WebLibraryRollSelection = {
  scope: "personal" | "server";
  id: string;
  revision: number;
};

function parseWebLibraryRollSelection(value: unknown): WebLibraryRollSelection | null {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "revision", "scope"]) ||
    (value.scope !== "personal" && value.scope !== "server") ||
    typeof value.id !== "string" ||
    !UUID_V4.test(value.id) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) {
    throw new Error("Web Library roll selection is invalid");
  }
  return { scope: value.scope, id: value.id, revision: value.revision };
}

async function resolveWebLibraryRoll(
  env: WebApiBindings,
  selection: WebLibraryRollSelection,
  userId: string,
  guildId: string,
  composition: {
    notation: unknown;
    repetitions: unknown;
    title: unknown;
  },
): Promise<
  { scope: "personal" | "guild"; name: string; nameColor: string | null } | Response
> {
  const owner = selection.scope === "personal"
    ? { type: "user", userId }
    : { type: "guild", guildId };
  const response = await postData(env, "/internal/saved-rolls/v2/get", {
    owner,
    id: selection.id,
  });
  if (!response.ok) return json({ error: "Library roll lookup failed" }, 502);
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return json({ error: "Library roll response is invalid" }, 502);
  }
  if (isRecord(result) && result.status === "missing") {
    return json({ error: "That Library roll no longer exists" }, 404);
  }
  if (
    !isRecord(result) ||
    result.status !== "found" ||
    !isRecord(result.savedRoll) ||
    typeof result.savedRoll.displayName !== "string" ||
    result.savedRoll.displayName.length < 1 ||
    result.savedRoll.displayName.length > 1_024 ||
    typeof result.savedRoll.revision !== "number" ||
    !Number.isSafeInteger(result.savedRoll.revision) ||
    typeof result.savedRoll.notation !== "string" ||
    (result.savedRoll.title !== null && typeof result.savedRoll.title !== "string") ||
    typeof result.savedRoll.repetitions !== "number" ||
    !Number.isSafeInteger(result.savedRoll.repetitions)
  ) {
    return json({ error: "Library roll response is invalid" }, 502);
  }
  if (
    result.savedRoll.revision !== selection.revision ||
    result.savedRoll.notation !== composition.notation ||
    result.savedRoll.title !== composition.title ||
    result.savedRoll.repetitions !== composition.repetitions
  ) {
    return json({ error: "That Library roll changed. Roll it again." }, 409);
  }
  let nameColor: string | null;
  try {
    nameColor = parseSavedRollNameColorV2(result.savedRoll.nameColor);
  } catch {
    return json({ error: "Library roll response is invalid" }, 502);
  }
  return {
    scope: selection.scope === "personal" ? "personal" : "guild",
    name: result.savedRoll.displayName,
    nameColor,
  };
}

async function postWebRoll(
  request: Request,
  env: WebApiBindings,
  now: number,
): Promise<Response> {
  let value: Record<string, unknown>;
  let preparedRequest: boolean;
  let libraryRoll: WebLibraryRollSelection | null;
  try {
    value = await request.json();
    const legacyKeys = [
      "channelId",
      "guildId",
      "notation",
      "timesToRepeat",
    ];
    const hasDeliveryId =
      isRecord(value) && typeof value.deliveryId === "string";
    const baseKeys = hasDeliveryId
      ? [...legacyKeys, "deliveryId"]
      : legacyKeys;
    const hasLibraryRoll = isRecord(value) && value.libraryRoll !== undefined;
    const requestKeys = hasLibraryRoll
      ? [...baseKeys, "libraryRoll"]
      : baseKeys;
    const isLegacyRequest =
      isRecord(value) &&
      (hasExactKeys(value, requestKeys) ||
        hasExactKeys(value, [...requestKeys, "title"]));
    preparedRequest =
      isRecord(value) &&
      (hasExactKeys(value, [
        ...requestKeys,
        "appearanceDigest",
        "renderSeed",
      ]) ||
        hasExactKeys(value, [
          ...requestKeys,
          "appearanceDigest",
          "renderSeed",
          "title",
        ]));
    if (
      !isRecord(value) ||
      (!isLegacyRequest && !preparedRequest) ||
      (value.deliveryId !== undefined &&
        (typeof value.deliveryId !== "string" ||
          !DELIVERY_ID.test(value.deliveryId))) ||
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.channelId !== "string" ||
      !SNOWFLAKE.test(value.channelId) ||
      (preparedRequest &&
        (typeof value.appearanceDigest !== "string" ||
          !SHA256.test(value.appearanceDigest))) ||
      typeof value.notation !== "string" ||
      value.notation.length < 1 ||
      value.notation.length > MAX_NOTATION_LENGTH ||
      (preparedRequest &&
        (typeof value.renderSeed !== "number" ||
          !Number.isInteger(value.renderSeed) ||
          value.renderSeed < 0 ||
          value.renderSeed > 0xffff_ffff)) ||
      typeof value.timesToRepeat !== "number" ||
      !Number.isSafeInteger(value.timesToRepeat) ||
      value.timesToRepeat < 1 ||
      value.timesToRepeat > 50 ||
      (value.title !== undefined &&
        (typeof value.title !== "string" ||
          value.title.length < 1 ||
          value.title.length > 256))
    ) {
      throw new Error("Web roll request is invalid");
    }
    libraryRoll = parseWebLibraryRollSelection(value.libraryRoll);
  } catch {
    return json({ error: "Web roll request is invalid" }, 400);
  }

  const token = readCookie(request, "session_id");
  if (token === null || !OPAQUE_TOKEN.test(token)) {
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
  const settings: unknown = await settingsResponse.json();
  if (
    !isRecord(settings) ||
    settings.status !== "found" ||
    !isRecord(settings.settings) ||
    typeof settings.settings.skipDiceDelay !== "boolean" ||
    typeof settings.settings.hideRollResultText !== "boolean"
  ) {
    return json({ error: "Guild settings response is invalid" }, 502);
  }

  if (session.user.username === null || session.user.username.length === 0) {
    return json({ error: "Session username is missing" }, 502);
  }
  if (
    settings.settings.hideRollResultText &&
    value.deliveryId === undefined
  ) {
    return json({ error: "Reload Dice Witch before rolling in this server" }, 409);
  }
  const roll: unknown = await env.ROLL_WEB.execute({
    notation: value.notation,
    repetitions: value.timesToRepeat,
    username: session.user.username,
    title: value.title ?? null,
    userId: session.user.id,
    guildId: value.guildId,
    ...(savedRollAttribution === undefined
      ? {}
      : { savedRoll: savedRollAttribution }),
    ...(value.deliveryId === undefined
      ? {}
      : {
          deliveryId: value.deliveryId,
          applicationId: env.DISCORD_CLIENT_ID,
          channelId: value.channelId,
          skipDelay: settings.settings.skipDiceDelay,
          hideRollResultText: settings.settings.hideRollResultText,
        }),
    ...(preparedRequest
      ? {
          renderSeed: value.renderSeed,
          appearanceDigest: value.appearanceDigest,
        }
      : {}),
  });
  if (!isRecord(roll) || typeof roll.status !== "string") {
    return json({ error: "Roll response is invalid" }, 502);
  }
  if (
    (roll.status === "conflict" || roll.status === "expired") &&
    typeof roll.message === "string"
  ) {
    return json({ error: roll.message }, 409);
  }
  if (roll.status === "stale" && typeof roll.message === "string") {
    return json({ error: roll.message }, 409);
  }
  if (roll.status === "invalid" && typeof roll.message === "string") {
    return json(
      {
        error: roll.message,
        message: roll.message,
        diceArray: [],
        resultArray: [],
        appearanceIdentities: [],
        rerolledAppearanceIdentities: [],
      },
      400,
    );
  }
  if (
    roll.status !== "rolled" ||
    typeof roll.message !== "string" ||
    !Array.isArray(roll.diceArray) ||
    !Array.isArray(roll.resultArray) ||
    !isRecord(roll.renderedImage) ||
    roll.renderedImage.contentType !== "image/png" ||
    !Number.isSafeInteger(roll.renderedImage.width) ||
    Number(roll.renderedImage.width) < 1 ||
    !Number.isSafeInteger(roll.renderedImage.height) ||
    Number(roll.renderedImage.height) < 1 ||
    !(roll.renderedImage.png instanceof Uint8Array) ||
    !isRecord(roll.discord) ||
    typeof roll.discord.clatter !== "string" ||
    typeof roll.discord.filename !== "string" ||
    !(roll.discord.png instanceof Uint8Array) ||
    !sameBytes(roll.renderedImage.png, roll.discord.png) ||
    (roll.deliveryStatus !== undefined &&
      roll.deliveryStatus !== "delivered" &&
      roll.deliveryStatus !== "failed" &&
      roll.deliveryStatus !== "pending" &&
      roll.deliveryStatus !== "permission_error")
  ) {
    return json({ error: "Roll response is invalid" }, 502);
  }
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
          skipDelay: settings.settings.skipDiceDelay,
          delayMs: webRollDelayMs(settings.settings.skipDiceDelay),
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
  if (token !== null && OPAQUE_TOKEN.test(token)) {
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
      const response = Response.json(APPEARANCE_CATALOG_V3, {
        headers: {
          ...securityHeaders,
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
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
          )
        : await putPersonalAppearanceV4(
            request,
            env.DATA_SERVICE,
            authentication.session.user.id,
            now,
          );
      return exactOrigin ? withCors(response, configuration) : response;
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
    if (request.method === "GET" && pathname === "/api/stats/public") {
      const response = await env.DATA_SERVICE.fetch(
        new Request("https://data.internal/internal/audience-snapshot"),
      );
      if (!response.ok) {
        return json({ error: "Public stats are unavailable" }, 502);
      }
      const result: unknown = await response.json();
      if (
        !isRecord(result) ||
        result.status !== "found" ||
        !isRecord(result.snapshot)
      ) {
        return json({ error: "Public stats response is invalid" }, 502);
      }
      try {
        const snapshot = parseDiscordAudienceSnapshotV1(result.snapshot);
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
      /^\/api\/guilds\/([1-9][0-9]{16,19})\/appearance\/v4$/,
    );
    if (
      appearanceMatch !== null &&
      (request.method === "GET" || request.method === "PUT")
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
        (request.method === "PUT" && !exactOrigin)
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
      const response = request.method === "GET"
        ? await getGuildAppearanceV4(env.DATA_SERVICE, guildId)
        : await putGuildAppearanceV4(
            request,
            env.DATA_SERVICE,
            guildId,
            authorization.userId,
            now,
          );
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
          : await postWebRoll(request, env, now);
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
