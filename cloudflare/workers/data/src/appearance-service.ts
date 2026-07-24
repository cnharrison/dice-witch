import {
  parseAppearanceProfileV3,
  parseGuildAppearanceProfileV3,
  type AppearanceProfileV3,
  type GuildAppearanceProfileV3,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_VALIDATION_CATALOG,
  APPEARANCE_VALIDATION_CATALOG_V3,
  BUILTIN_APPEARANCE_RECIPES,
  BUILTIN_APPEARANCE_RECIPES_V2,
  BUILTIN_APPEARANCE_RECIPES_V3,
  parseAppearanceProfile,
  parseAppearanceProfileV2,
  parseGuildAppearanceProfile,
  parseGuildAppearanceProfileV2,
  resolveEffectiveAppearanceRecipes,
  resolveEffectiveAppearanceRecipesV2,
  resolveEffectiveAppearanceRecipesV3,
  type AppearanceProfileV1,
  type AppearanceProfileV2,
  type GuildAppearanceProfileV1,
  type GuildAppearanceProfileV2,
} from "../../../packages/dice-appearance/src";
import {
  D1AppearanceRepository,
  type AppearanceProfileReadResult,
  type AppearanceProfileWriteResult,
  type GuildAppearanceProfileReadResult,
  type PutGuildAppearanceV1Input,
  type PutGuildAppearanceV2Input,
  type PutGuildAppearanceV3Input,
  type PutPersonalAppearanceV1Input,
  type PutPersonalAppearanceV2Input,
  type PutPersonalAppearanceV3Input,
} from "./appearance-repository";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const MAX_BODY_BYTES = 96 * 1024;
const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

async function readBoundedJson(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new Error("Appearance request content type is invalid");
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > MAX_BODY_BYTES)
  ) {
    throw new Error("Appearance request body is too large");
  }
  if (request.body === null) {
    throw new Error("Appearance request body is missing");
  }

  const reader = (
    request.body as ReadableStream<Uint8Array>
  ).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Appearance request body is too large");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  ) as unknown;
}

async function parseBody(
  request: Request,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const value = await readBoundedJson(request);
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Appearance request has invalid fields");
  }
  return value;
}

type ValidMutationFields = Record<string, unknown> & {
  expectedRevision: number;
  mutationId: string;
  occurredAt: number;
};

function validMutationFields(
  value: Record<string, unknown>,
): value is ValidMutationFields {
  return (
    typeof value.expectedRevision === "number" &&
    Number.isSafeInteger(value.expectedRevision) &&
    value.expectedRevision >= 0 &&
    value.expectedRevision < Number.MAX_SAFE_INTEGER &&
    typeof value.mutationId === "string" &&
    value.mutationId.length >= 1 &&
    value.mutationId.length <= 255 &&
    typeof value.occurredAt === "number" &&
    Number.isSafeInteger(value.occurredAt) &&
    value.occurredAt >= 0
  );
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: responseHeaders });
}

function writeResponse<Profile extends object>(
  result: AppearanceProfileWriteResult<Profile>,
): Response {
  if (result.status === "appearance_profile_version_conflict") {
    return errorResponse(result.status, 409);
  }
  let status = 200;
  if (result.status === "missing") status = 404;
  if (
    result.status === "revision_conflict" ||
    result.status === "mutation_conflict"
  ) {
    status = 409;
  }
  return Response.json(result, { status, headers: responseHeaders });
}

function readResponse<Profile extends object>(
  result:
    | AppearanceProfileReadResult<Profile>
    | GuildAppearanceProfileReadResult<Profile>,
): Response {
  return result.status === "appearance_profile_version_conflict"
    ? errorResponse(result.status, 409)
    : Response.json(result, { headers: responseHeaders });
}

function appearanceRepository(db: D1Database): D1AppearanceRepository {
  return new D1AppearanceRepository(db, {
    v1V2: APPEARANCE_VALIDATION_CATALOG,
    v3: APPEARANCE_VALIDATION_CATALOG_V3,
  });
}

async function getPersonalProfile(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let userId: string;
  try {
    const value = await parseBody(request, ["userId"]);
    if (typeof value.userId !== "string" || !SNOWFLAKE.test(value.userId)) {
      throw new Error("Personal appearance lookup is invalid");
    }
    userId = value.userId;
  } catch {
    return errorResponse("Personal appearance lookup is invalid", 400);
  }

  try {
    return readResponse(
      await appearanceRepository(db).getPersonalV1(userId),
    );
  } catch {
    return errorResponse("Personal appearance lookup failed", 500);
  }
}

async function getPersonalProfileV2(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let userId: string;
  try {
    const value = await parseBody(request, ["userId"]);
    if (typeof value.userId !== "string" || !SNOWFLAKE.test(value.userId)) {
      throw new Error("Personal appearance lookup is invalid");
    }
    userId = value.userId;
  } catch {
    return errorResponse("Personal appearance lookup is invalid", 400);
  }

  try {
    return readResponse(
      await appearanceRepository(db).getPersonalV2(userId),
    );
  } catch {
    return errorResponse("Personal appearance lookup failed", 500);
  }
}

async function getPersonalProfileV3(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let userId: string;
  try {
    const value = await parseBody(request, ["userId"]);
    if (typeof value.userId !== "string" || !SNOWFLAKE.test(value.userId)) {
      throw new Error("Personal appearance lookup is invalid");
    }
    userId = value.userId;
  } catch {
    return errorResponse("Personal appearance lookup is invalid", 400);
  }

  try {
    return readResponse(
      await appearanceRepository(db).getPersonalV3(userId),
    );
  } catch {
    return errorResponse("Personal appearance lookup failed", 500);
  }
}

async function putPersonalProfile(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: PutPersonalAppearanceV1Input & { profile: AppearanceProfileV1 };
  try {
    const value = await parseBody(request, [
      "expectedRevision",
      "mutationId",
      "occurredAt",
      "profile",
      "userId",
    ]);
    if (
      typeof value.userId !== "string" ||
      !SNOWFLAKE.test(value.userId) ||
      !validMutationFields(value)
    ) {
      throw new Error("Personal appearance update is invalid");
    }
    input = {
      userId: value.userId,
      expectedRevision: value.expectedRevision,
      profile: parseAppearanceProfile(
        value.profile,
        APPEARANCE_VALIDATION_CATALOG,
      ),
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    };
  } catch {
    return errorResponse("Personal appearance update is invalid", 400);
  }

  try {
    return writeResponse(
      await appearanceRepository(db).putPersonalV1(input),
    );
  } catch {
    return errorResponse("Personal appearance update failed", 500);
  }
}

async function putPersonalProfileV2(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: PutPersonalAppearanceV2Input & { profile: AppearanceProfileV2 };
  try {
    const value = await parseBody(request, [
      "expectedRevision",
      "mutationId",
      "occurredAt",
      "profile",
      "userId",
    ]);
    if (
      typeof value.userId !== "string" ||
      !SNOWFLAKE.test(value.userId) ||
      !validMutationFields(value)
    ) {
      throw new Error("Personal appearance update is invalid");
    }
    input = {
      userId: value.userId,
      expectedRevision: value.expectedRevision,
      profile: parseAppearanceProfileV2(
        value.profile,
        APPEARANCE_VALIDATION_CATALOG,
      ),
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    };
  } catch {
    return errorResponse("Personal appearance update is invalid", 400);
  }

  try {
    return writeResponse(
      await appearanceRepository(db).putPersonalV2(input),
    );
  } catch {
    return errorResponse("Personal appearance update failed", 500);
  }
}

async function putPersonalProfileV3(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: PutPersonalAppearanceV3Input & { profile: AppearanceProfileV3 };
  try {
    const value = await parseBody(request, [
      "expectedRevision",
      "mutationId",
      "occurredAt",
      "profile",
      "userId",
    ]);
    if (
      typeof value.userId !== "string" ||
      !SNOWFLAKE.test(value.userId) ||
      !validMutationFields(value)
    ) {
      throw new Error("Personal appearance update is invalid");
    }
    input = {
      userId: value.userId,
      expectedRevision: value.expectedRevision,
      profile: parseAppearanceProfileV3(
        value.profile,
        APPEARANCE_VALIDATION_CATALOG_V3,
      ),
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    };
  } catch {
    return errorResponse("Personal appearance update is invalid", 400);
  }

  try {
    return writeResponse(
      await appearanceRepository(db).putPersonalV3(input),
    );
  } catch {
    return errorResponse("Personal appearance update failed", 500);
  }
}

async function getGuildProfile(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let guildId: string;
  try {
    const value = await parseBody(request, ["guildId"]);
    if (typeof value.guildId !== "string" || !SNOWFLAKE.test(value.guildId)) {
      throw new Error("Guild appearance lookup is invalid");
    }
    guildId = value.guildId;
  } catch {
    return errorResponse("Guild appearance lookup is invalid", 400);
  }

  try {
    return readResponse(await appearanceRepository(db).getGuildV1(guildId));
  } catch {
    return errorResponse("Guild appearance lookup failed", 500);
  }
}

async function getGuildProfileV2(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let guildId: string;
  try {
    const value = await parseBody(request, ["guildId"]);
    if (typeof value.guildId !== "string" || !SNOWFLAKE.test(value.guildId)) {
      throw new Error("Guild appearance lookup is invalid");
    }
    guildId = value.guildId;
  } catch {
    return errorResponse("Guild appearance lookup is invalid", 400);
  }

  try {
    return readResponse(await appearanceRepository(db).getGuildV2(guildId));
  } catch {
    return errorResponse("Guild appearance lookup failed", 500);
  }
}

async function getGuildProfileV3(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let guildId: string;
  try {
    const value = await parseBody(request, ["guildId"]);
    if (typeof value.guildId !== "string" || !SNOWFLAKE.test(value.guildId)) {
      throw new Error("Guild appearance lookup is invalid");
    }
    guildId = value.guildId;
  } catch {
    return errorResponse("Guild appearance lookup is invalid", 400);
  }

  try {
    return readResponse(await appearanceRepository(db).getGuildV3(guildId));
  } catch {
    return errorResponse("Guild appearance lookup failed", 500);
  }
}

async function putGuildProfile(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: PutGuildAppearanceV1Input & {
    profile: GuildAppearanceProfileV1;
  };
  try {
    const value = await parseBody(request, [
      "expectedRevision",
      "guildId",
      "mutationId",
      "occurredAt",
      "profile",
      "updatedByUserId",
    ]);
    if (
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.updatedByUserId !== "string" ||
      !SNOWFLAKE.test(value.updatedByUserId) ||
      !validMutationFields(value)
    ) {
      throw new Error("Guild appearance update is invalid");
    }
    input = {
      guildId: value.guildId,
      updatedByUserId: value.updatedByUserId,
      expectedRevision: value.expectedRevision,
      profile: parseGuildAppearanceProfile(
        value.profile,
        APPEARANCE_VALIDATION_CATALOG,
      ),
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    };
  } catch {
    return errorResponse("Guild appearance update is invalid", 400);
  }

  try {
    return writeResponse(
      await appearanceRepository(db).putGuildV1(input),
    );
  } catch {
    return errorResponse("Guild appearance update failed", 500);
  }
}

async function putGuildProfileV2(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: PutGuildAppearanceV2Input & {
    profile: GuildAppearanceProfileV2;
  };
  try {
    const value = await parseBody(request, [
      "expectedRevision",
      "guildId",
      "mutationId",
      "occurredAt",
      "profile",
      "updatedByUserId",
    ]);
    if (
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.updatedByUserId !== "string" ||
      !SNOWFLAKE.test(value.updatedByUserId) ||
      !validMutationFields(value)
    ) {
      throw new Error("Guild appearance update is invalid");
    }
    input = {
      guildId: value.guildId,
      updatedByUserId: value.updatedByUserId,
      expectedRevision: value.expectedRevision,
      profile: parseGuildAppearanceProfileV2(
        value.profile,
        APPEARANCE_VALIDATION_CATALOG,
      ),
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    };
  } catch {
    return errorResponse("Guild appearance update is invalid", 400);
  }

  try {
    return writeResponse(
      await appearanceRepository(db).putGuildV2(input),
    );
  } catch {
    return errorResponse("Guild appearance update failed", 500);
  }
}

async function putGuildProfileV3(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: PutGuildAppearanceV3Input & {
    profile: GuildAppearanceProfileV3;
  };
  try {
    const value = await parseBody(request, [
      "expectedRevision",
      "guildId",
      "mutationId",
      "occurredAt",
      "profile",
      "updatedByUserId",
    ]);
    if (
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.updatedByUserId !== "string" ||
      !SNOWFLAKE.test(value.updatedByUserId) ||
      !validMutationFields(value)
    ) {
      throw new Error("Guild appearance update is invalid");
    }
    input = {
      guildId: value.guildId,
      updatedByUserId: value.updatedByUserId,
      expectedRevision: value.expectedRevision,
      profile: parseGuildAppearanceProfileV3(
        value.profile,
        APPEARANCE_VALIDATION_CATALOG_V3,
      ),
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    };
  } catch {
    return errorResponse("Guild appearance update is invalid", 400);
  }

  try {
    return writeResponse(await appearanceRepository(db).putGuildV3(input));
  } catch {
    return errorResponse("Guild appearance update failed", 500);
  }
}

type EffectiveAppearanceLookup = {
  userId: string;
  guildId: string | null;
};

async function parseEffectiveAppearanceLookup(
  request: Request,
): Promise<EffectiveAppearanceLookup> {
  const value = await parseBody(request, ["guildId", "userId"]);
  if (
    typeof value.userId !== "string" ||
    !SNOWFLAKE.test(value.userId) ||
    (value.guildId !== null &&
      (typeof value.guildId !== "string" || !SNOWFLAKE.test(value.guildId)))
  ) {
    throw new Error("Effective appearance lookup is invalid");
  }
  return { userId: value.userId, guildId: value.guildId };
}

async function getEffectiveAppearance(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let lookup: EffectiveAppearanceLookup;
  try {
    lookup = await parseEffectiveAppearanceLookup(request);
  } catch {
    return errorResponse("Effective appearance lookup is invalid", 400);
  }
  const { userId, guildId } = lookup;

  try {
    const repository = appearanceRepository(db);
    const [personal, guild] = await Promise.all([
      repository.getPersonalV1(userId),
      guildId === null
        ? Promise.resolve(null)
        : repository.getGuildV1(guildId),
    ]);
    if (
      personal.status === "appearance_profile_version_conflict" ||
      guild?.status === "appearance_profile_version_conflict"
    ) {
      return errorResponse("appearance_profile_version_conflict", 409);
    }
    const recipes = resolveEffectiveAppearanceRecipes({
      personalProfile:
        personal.status === "found" ? personal.profile : null,
      guildProfile:
        guild?.status === "found" ? guild.profile : null,
      builtins: BUILTIN_APPEARANCE_RECIPES,
    });
    return Response.json(
      { version: 1, recipes },
      { headers: responseHeaders },
    );
  } catch {
    return errorResponse("Effective appearance lookup failed", 500);
  }
}

async function getEffectiveAppearanceV2(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let lookup: EffectiveAppearanceLookup;
  try {
    lookup = await parseEffectiveAppearanceLookup(request);
  } catch {
    return errorResponse("Effective appearance lookup is invalid", 400);
  }
  const { userId, guildId } = lookup;

  try {
    const repository = appearanceRepository(db);
    const [personal, guild] = await Promise.all([
      repository.getPersonalV2(userId),
      guildId === null
        ? Promise.resolve(null)
        : repository.getGuildV2(guildId),
    ]);
    if (
      personal.status === "appearance_profile_version_conflict" ||
      guild?.status === "appearance_profile_version_conflict"
    ) {
      return errorResponse("appearance_profile_version_conflict", 409);
    }
    const recipes = resolveEffectiveAppearanceRecipesV2({
      personalProfile:
        personal.status === "found" ? personal.profile : null,
      guildProfile:
        guild?.status === "found" ? guild.profile : null,
      builtins: BUILTIN_APPEARANCE_RECIPES_V2,
    });
    return Response.json(
      { version: 2, recipes },
      { headers: responseHeaders },
    );
  } catch {
    return errorResponse("Effective appearance lookup failed", 500);
  }
}

async function getEffectiveAppearanceV3(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let lookup: EffectiveAppearanceLookup;
  try {
    lookup = await parseEffectiveAppearanceLookup(request);
  } catch {
    return errorResponse("Effective appearance lookup is invalid", 400);
  }
  const { userId, guildId } = lookup;

  try {
    const repository = appearanceRepository(db);
    const [personal, guild] = await Promise.all([
      repository.getPersonalV3(userId),
      guildId === null
        ? Promise.resolve(null)
        : repository.getGuildV3(guildId),
    ]);
    if (
      personal.status === "appearance_profile_version_conflict" ||
      guild?.status === "appearance_profile_version_conflict"
    ) {
      return errorResponse("appearance_profile_version_conflict", 409);
    }
    const recipes = resolveEffectiveAppearanceRecipesV3({
      personalProfile:
        personal.status === "found" ? personal.profile : null,
      guildProfile:
        guild?.status === "found" ? guild.profile : null,
      builtins: BUILTIN_APPEARANCE_RECIPES_V3,
    });
    return Response.json(
      { version: 3, recipes },
      { headers: responseHeaders },
    );
  } catch {
    return errorResponse("Effective appearance lookup failed", 500);
  }
}

export function handleAppearanceRequest(
  request: Request,
  db: D1Database,
): Promise<Response> | null {
  if (request.method !== "POST") return null;
  switch (new URL(request.url).pathname) {
    case "/internal/appearance/v3/personal/get":
      return getPersonalProfileV3(request, db);
    case "/internal/appearance/v3/personal/put":
      return putPersonalProfileV3(request, db);
    case "/internal/appearance/v3/guild/get":
      return getGuildProfileV3(request, db);
    case "/internal/appearance/v3/guild/put":
      return putGuildProfileV3(request, db);
    case "/internal/appearance/v3/effective":
      return getEffectiveAppearanceV3(request, db);
    case "/internal/appearance/v2/personal/get":
      return getPersonalProfileV2(request, db);
    case "/internal/appearance/v2/personal/put":
      return putPersonalProfileV2(request, db);
    case "/internal/appearance/v2/guild/get":
      return getGuildProfileV2(request, db);
    case "/internal/appearance/v2/guild/put":
      return putGuildProfileV2(request, db);
    case "/internal/appearance/v2/effective":
      return getEffectiveAppearanceV2(request, db);
    case "/internal/appearance/personal/get":
      return getPersonalProfile(request, db);
    case "/internal/appearance/personal/put":
      return putPersonalProfile(request, db);
    case "/internal/appearance/guild/get":
      return getGuildProfile(request, db);
    case "/internal/appearance/guild/put":
      return putGuildProfile(request, db);
    case "/internal/appearance/effective":
      return getEffectiveAppearance(request, db);
    default:
      return null;
  }
}
