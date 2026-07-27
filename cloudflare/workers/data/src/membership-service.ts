import { D1GuildRepository } from "./guild-repository";
import { D1MembershipRepository } from "./membership-repository";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const MAX_GUILD_FILTER_IDS = 200;
const GUILD_FILTER_BATCH_SIZE = 100;
const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

async function parseBody(
  request: Request,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Membership request is invalid");
  }
  return value;
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: responseHeaders });
}

async function filterGuilds(
  request: Request,
  db: D1Database,
  activeOnly: boolean,
): Promise<Response> {
  let guildIds: string[];
  try {
    const value = await parseBody(request, ["guildIds"]);
    if (
      !Array.isArray(value.guildIds) ||
      value.guildIds.length > MAX_GUILD_FILTER_IDS ||
      !value.guildIds.every(
        (guildId): guildId is string =>
          typeof guildId === "string" && SNOWFLAKE.test(guildId),
      ) ||
      new Set(value.guildIds).size !== value.guildIds.length
    ) {
      throw new Error("Guild filter is invalid");
    }
    guildIds = value.guildIds;
  } catch {
    return errorResponse("Guild filter is invalid", 400);
  }

  if (guildIds.length === 0) {
    return Response.json({ guildIds: [] }, { headers: responseHeaders });
  }
  try {
    const matchingIds = new Set<string>();
    const session = db.withSession("first-primary");
    for (
      let offset = 0;
      offset < guildIds.length;
      offset += GUILD_FILTER_BATCH_SIZE
    ) {
      const batch = guildIds.slice(offset, offset + GUILD_FILTER_BATCH_SIZE);
      const placeholders = batch.map(() => "?").join(", ");
      const result = await session
        .prepare(
          `SELECT id FROM guilds
           WHERE id IN (${placeholders})${activeOnly ? " AND is_active = 1" : ""}`,
        )
        .bind(...batch)
        .all<{ id: string }>();
      for (const { id } of result.results) matchingIds.add(id);
    }
    return Response.json(
      { guildIds: guildIds.filter((id) => matchingIds.has(id)) },
      { headers: responseHeaders },
    );
  } catch {
    return errorResponse("Guild filter failed", 500);
  }
}

async function getGuildSettings(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let guildId: string;
  try {
    const value = await parseBody(request, ["guildId"]);
    if (typeof value.guildId !== "string" || !SNOWFLAKE.test(value.guildId)) {
      throw new Error("Guild settings request is invalid");
    }
    guildId = value.guildId;
  } catch {
    return errorResponse("Guild settings request is invalid", 400);
  }
  try {
    const result = await new D1GuildRepository(db).getSettings(guildId);
    return Response.json(result, {
      status: result.status === "missing" ? 404 : 200,
      headers: responseHeaders,
    });
  } catch {
    return errorResponse("Guild settings lookup failed", 500);
  }
}

async function updateGuildSettings(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, [
      "guildId",
      "mutationId",
      "occurredAt",
      "skipDiceDelay",
    ]);
    if (
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.skipDiceDelay !== "boolean" ||
      typeof value.mutationId !== "string" ||
      value.mutationId.length < 1 ||
      value.mutationId.length > 255 ||
      typeof value.occurredAt !== "number" ||
      !Number.isSafeInteger(value.occurredAt) ||
      value.occurredAt < 0
    ) {
      throw new Error("Guild settings update is invalid");
    }
  } catch {
    return errorResponse("Guild settings update is invalid", 400);
  }
  try {
    const result = await new D1GuildRepository(db).setSkipDiceDelay({
      guildId: value.guildId,
      skipDiceDelay: value.skipDiceDelay,
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    });
    let status = 200;
    if (result.status === "missing") status = 404;
    if (result.status === "conflict") status = 409;
    return Response.json(result, { status, headers: responseHeaders });
  } catch {
    return errorResponse("Guild settings update failed", 500);
  }
}

async function upsertMembership(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, [
      "guildIcon",
      "guildId",
      "guildMutationId",
      "guildName",
      "isAdmin",
      "isDiceWitchAdmin",
      "mutationId",
      "occurredAt",
      "userId",
    ]);
    if (
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.guildName !== "string" ||
      value.guildName.length < 1 ||
      value.guildName.length > 255 ||
      (value.guildIcon !== null &&
        (typeof value.guildIcon !== "string" || value.guildIcon.length > 255)) ||
      typeof value.guildMutationId !== "string" ||
      value.guildMutationId.length < 1 ||
      value.guildMutationId.length > 255 ||
      typeof value.userId !== "string" ||
      !SNOWFLAKE.test(value.userId) ||
      typeof value.isAdmin !== "boolean" ||
      typeof value.isDiceWitchAdmin !== "boolean" ||
      typeof value.mutationId !== "string" ||
      value.mutationId.length < 1 ||
      value.mutationId.length > 255 ||
      typeof value.occurredAt !== "number" ||
      !Number.isSafeInteger(value.occurredAt) ||
      value.occurredAt < 0
    ) {
      throw new Error("Membership upsert is invalid");
    }
  } catch {
    return errorResponse("Membership upsert is invalid", 400);
  }

  try {
    const guildResult = await new D1GuildRepository(db).setDisplayProfile({
      guildId: value.guildId,
      profile: { name: value.guildName, icon: value.guildIcon },
      mutationId: value.guildMutationId,
      occurredAt: value.occurredAt,
    });
    if (guildResult.status === "missing") {
      return errorResponse("Membership guild is missing", 404);
    }
    if (guildResult.status === "conflict") {
      return errorResponse("Guild profile mutation conflicts", 409);
    }
    const result = await new D1MembershipRepository(db).upsertPermissions({
      userId: value.userId,
      guildId: value.guildId,
      permissions: {
        isAdmin: value.isAdmin,
        isDiceWitchAdmin: value.isDiceWitchAdmin,
      },
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    });
    let status = 200;
    if (result.status === "missing") status = 404;
    if (result.status === "conflict") status = 409;
    return Response.json(result, { status, headers: responseHeaders });
  } catch {
    return errorResponse("Membership upsert failed", 500);
  }
}

async function upsertMembershipPermissions(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, [
      "guildId",
      "isAdmin",
      "isDiceWitchAdmin",
      "mutationId",
      "occurredAt",
      "userId",
    ]);
    if (
      typeof value.guildId !== "string" ||
      !SNOWFLAKE.test(value.guildId) ||
      typeof value.userId !== "string" ||
      !SNOWFLAKE.test(value.userId) ||
      typeof value.isAdmin !== "boolean" ||
      typeof value.isDiceWitchAdmin !== "boolean" ||
      typeof value.mutationId !== "string" ||
      value.mutationId.length < 1 ||
      value.mutationId.length > 255 ||
      typeof value.occurredAt !== "number" ||
      !Number.isSafeInteger(value.occurredAt) ||
      value.occurredAt < 0
    ) {
      throw new Error("Membership permission upsert is invalid");
    }
  } catch {
    return errorResponse("Membership permission upsert is invalid", 400);
  }

  try {
    const result = await new D1MembershipRepository(db).upsertPermissions({
      userId: value.userId,
      guildId: value.guildId,
      permissions: {
        isAdmin: value.isAdmin,
        isDiceWitchAdmin: value.isDiceWitchAdmin,
      },
      mutationId: value.mutationId,
      occurredAt: value.occurredAt,
    });
    let status = 200;
    if (result.status === "missing") status = 404;
    if (result.status === "conflict") status = 409;
    return Response.json(result, { status, headers: responseHeaders });
  } catch {
    return errorResponse("Membership permission upsert failed", 500);
  }
}

async function applyGuildLifecycle(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: Parameters<D1GuildRepository["applyLifecycle"]>[0];
  try {
    const value: unknown = await request.json();
    if (!isRecord(value)) throw new Error("Guild lifecycle request is invalid");
    if (value.type === "deactivate") {
      if (
        !hasExactKeys(value, [
          "guildId",
          "mutationId",
          "occurredAt",
          "type",
        ]) ||
        typeof value.guildId !== "string" ||
        typeof value.mutationId !== "string" ||
        typeof value.occurredAt !== "number"
      ) {
        throw new Error("Guild lifecycle request is invalid");
      }
      input = {
        type: "deactivate",
        guildId: value.guildId,
        mutationId: value.mutationId,
        occurredAt: value.occurredAt,
      };
    } else {
      if (
        value.type !== "upsert" ||
        !hasExactKeys(value, ["guild", "mutationId", "occurredAt", "type"]) ||
        !isRecord(value.guild) ||
        !hasExactKeys(value.guild, [
          "approximateMemberCount",
          "icon",
          "id",
          "isActive",
          "joinedTimestamp",
          "memberCount",
          "name",
          "ownerId",
          "preferredLocale",
        ]) ||
        typeof value.guild.id !== "string" ||
        typeof value.guild.name !== "string" ||
        (value.guild.icon !== null && typeof value.guild.icon !== "string") ||
        typeof value.guild.ownerId !== "string" ||
        typeof value.guild.memberCount !== "number" ||
        (value.guild.approximateMemberCount !== null &&
          typeof value.guild.approximateMemberCount !== "number") ||
        typeof value.guild.preferredLocale !== "string" ||
        typeof value.guild.joinedTimestamp !== "number" ||
        value.guild.isActive !== true ||
        typeof value.mutationId !== "string" ||
        typeof value.occurredAt !== "number"
      ) {
        throw new Error("Guild lifecycle request is invalid");
      }
      input = {
        type: "upsert",
        mutationId: value.mutationId,
        occurredAt: value.occurredAt,
        guild: {
          id: value.guild.id,
          name: value.guild.name,
          icon: value.guild.icon,
          ownerId: value.guild.ownerId,
          memberCount: value.guild.memberCount,
          approximateMemberCount: value.guild.approximateMemberCount,
          preferredLocale: value.guild.preferredLocale,
          joinedTimestamp: value.guild.joinedTimestamp,
          isActive: true,
        },
      };
    }
  } catch {
    return errorResponse("Guild lifecycle request is invalid", 400);
  }

  try {
    const repository = new D1GuildRepository(db);
    const result = await repository.applyLifecycle(input);
    const guildName =
      input.type === "upsert"
        ? input.guild.name
        : (await repository.getDisplayProfile(input.guildId))?.name ?? null;
    const status = result.status === "conflict" ? 409 : 200;
    return Response.json(
      { ...result, guildName },
      { status, headers: responseHeaders },
    );
  } catch {
    return errorResponse("Guild lifecycle update failed", 500);
  }
}

async function reconcileGuilds(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: Parameters<D1GuildRepository["reconcileActiveGuilds"]>[0];
  try {
    const value: unknown = await request.json();
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ["guildIds", "occurredAt", "runId"]) ||
      !Array.isArray(value.guildIds) ||
      !value.guildIds.every(
        (guildId): guildId is string =>
          typeof guildId === "string" && SNOWFLAKE.test(guildId),
      ) ||
      new Set(value.guildIds).size !== value.guildIds.length ||
      typeof value.runId !== "string" ||
      value.runId.length < 1 ||
      value.runId.length > 234 ||
      typeof value.occurredAt !== "number" ||
      !Number.isSafeInteger(value.occurredAt) ||
      value.occurredAt < 0
    ) {
      throw new Error("Guild reconciliation request is invalid");
    }
    input = {
      guildIds: value.guildIds,
      runId: value.runId,
      occurredAt: value.occurredAt,
    };
  } catch {
    return errorResponse("Guild reconciliation request is invalid", 400);
  }

  try {
    const result = await new D1GuildRepository(db).reconcileActiveGuilds(input);
    return Response.json(result, { headers: responseHeaders });
  } catch {
    return errorResponse("Guild reconciliation failed", 500);
  }
}

async function getStatusStats(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let shardCount: number;
  try {
    const value = await parseBody(request, ["shardCount"]);
    if (
      typeof value.shardCount !== "number" ||
      !Number.isSafeInteger(value.shardCount) ||
      value.shardCount < 1
    ) {
      throw new Error("Status stats request is invalid");
    }
    shardCount = value.shardCount;
  } catch {
    return errorResponse("Status stats request is invalid", 400);
  }

  try {
    const stats = await new D1GuildRepository(db).getStatusStats(shardCount);
    return Response.json(stats, { headers: responseHeaders });
  } catch {
    return errorResponse("Status stats lookup failed", 500);
  }
}

async function listMemberships(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let userId: string;
  try {
    const value = await parseBody(request, ["userId"]);
    if (typeof value.userId !== "string" || !SNOWFLAKE.test(value.userId)) {
      throw new Error("Membership lookup is invalid");
    }
    userId = value.userId;
  } catch {
    return errorResponse("Membership lookup is invalid", 400);
  }

  try {
    const memberships = await new D1MembershipRepository(db).listMutualGuilds(
      userId,
    );
    return Response.json({ memberships }, { headers: responseHeaders });
  } catch {
    return errorResponse("Membership lookup failed", 500);
  }
}

export function handleMembershipRequest(
  request: Request,
  db: D1Database,
): Promise<Response> | null {
  if (request.method !== "POST") return null;
  switch (new URL(request.url).pathname) {
    case "/internal/guilds/filter":
      return filterGuilds(request, db, true);
    case "/internal/guilds/existing":
      return filterGuilds(request, db, false);
    case "/internal/guilds/settings":
      return getGuildSettings(request, db);
    case "/internal/guilds/settings/update":
      return updateGuildSettings(request, db);
    case "/internal/guilds/lifecycle":
      return applyGuildLifecycle(request, db);
    case "/internal/guilds/reconcile":
      return reconcileGuilds(request, db);
    case "/internal/status-stats":
      return getStatusStats(request, db);
    case "/internal/memberships":
      return upsertMembership(request, db);
    case "/internal/memberships/permissions":
      return upsertMembershipPermissions(request, db);
    case "/internal/memberships/list":
      return listMemberships(request, db);
    default:
      return null;
  }
}
