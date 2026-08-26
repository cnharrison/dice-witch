import { z } from "zod";
import {
  snowflakeSchema,
  strictObjectSchema,
  timestampSchema,
} from "../../../packages/discord-contracts/src/schema-primitives";
import {
  D1GuildRepository,
  type GuildLifecycleInput,
} from "./guild-repository";
import { D1MembershipRepository } from "./membership-repository";

const MAX_GUILD_FILTER_IDS = 200;
const GUILD_FILTER_BATCH_SIZE = 100;
const mutationIdSchema = z.string().min(1).max(255);
const guildIdListSchema = z
  .array(snowflakeSchema)
  .refine((guildIds) => new Set(guildIds).size === guildIds.length);
const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const GuildFilterRequestSchema = strictObjectSchema({
  guildIds: guildIdListSchema.max(MAX_GUILD_FILTER_IDS),
});
const GuildFilterRowSchema = strictObjectSchema({ id: snowflakeSchema });
const GuildSettingsRequestV1Schema = strictObjectSchema({
  guildId: snowflakeSchema,
});
const GuildSettingsRequestV2Schema = strictObjectSchema({
  guildId: snowflakeSchema,
  version: z.literal(2),
});
const GuildSettingsRequestSchema = z.union([
  GuildSettingsRequestV1Schema,
  GuildSettingsRequestV2Schema,
]);
const guildSettingsMutationFields = {
  guildId: snowflakeSchema,
  mutationId: mutationIdSchema,
  occurredAt: timestampSchema,
  skipDiceDelay: z.boolean(),
};
const GuildSettingsUpdateV1Schema = strictObjectSchema(
  guildSettingsMutationFields,
);
const GuildSettingsUpdateV2Schema = strictObjectSchema({
  ...guildSettingsMutationFields,
  hideRollResultText: z.boolean(),
  version: z.literal(2),
});
const GuildSettingsUpdateSchema = z.union([
  GuildSettingsUpdateV1Schema,
  GuildSettingsUpdateV2Schema,
]);
const membershipPermissionFields = {
  guildId: snowflakeSchema,
  isAdmin: z.boolean(),
  isDiceWitchAdmin: z.boolean(),
  mutationId: mutationIdSchema,
  occurredAt: timestampSchema,
  userId: snowflakeSchema,
};
const MembershipUpsertSchema = strictObjectSchema({
  ...membershipPermissionFields,
  guildIcon: z.nullable(z.string().max(255)),
  guildMutationId: mutationIdSchema,
  guildName: z.string().min(1).max(255),
});
const MembershipPermissionUpsertSchema = strictObjectSchema(
  membershipPermissionFields,
);
const LifecycleDeactivateSchema = strictObjectSchema({
  guildId: z.string(),
  mutationId: z.string(),
  occurredAt: z.number(),
  type: z.literal("deactivate"),
});
const LifecycleGuildSchema = strictObjectSchema({
  approximateMemberCount: z.nullable(z.number()),
  icon: z.nullable(z.string()),
  id: z.string(),
  isActive: z.literal(true),
  joinedTimestamp: z.number(),
  memberCount: z.number(),
  name: z.string(),
  ownerId: z.string(),
  preferredLocale: z.string(),
});
const LifecycleUpsertSchema = strictObjectSchema({
  guild: LifecycleGuildSchema,
  mutationId: z.string(),
  occurredAt: z.number(),
  type: z.literal("upsert"),
});
const GuildLifecycleRequestSchema = z.discriminatedUnion("type", [
  LifecycleDeactivateSchema,
  LifecycleUpsertSchema,
]);
const GuildReconciliationRequestSchema = strictObjectSchema({
  guildIds: guildIdListSchema,
  occurredAt: timestampSchema,
  runId: z.string().min(1).max(234),
});
const StatusStatsRequestSchema = strictObjectSchema({
  shardCount: z.number().refine(Number.isSafeInteger).min(1),
});
const MembershipLookupSchema = strictObjectSchema({
  userId: snowflakeSchema,
});

async function parseRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  return schema.parse(await request.json());
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
    ({ guildIds } = await parseRequest(request, GuildFilterRequestSchema));
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
        .all();
      const rows = z.array(GuildFilterRowSchema).parse(result.results);
      for (const { id } of rows) matchingIds.add(id);
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
  let input: z.output<typeof GuildSettingsRequestSchema>;
  try {
    input = await parseRequest(request, GuildSettingsRequestSchema);
  } catch {
    return errorResponse("Guild settings request is invalid", 400);
  }
  try {
    const result = await new D1GuildRepository(db).getSettings(input.guildId);
    const version = "version" in input ? 2 : 1;
    const body = result.status === "missing" || version === 2
      ? result
      : {
          status: "found" as const,
          settings: { skipDiceDelay: result.settings.skipDiceDelay },
        };
    return Response.json(body, {
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
  let input: z.output<typeof GuildSettingsUpdateSchema>;
  try {
    input = await parseRequest(request, GuildSettingsUpdateSchema);
  } catch {
    return errorResponse("Guild settings update is invalid", 400);
  }
  try {
    const repository = new D1GuildRepository(db);
    const result = "version" in input
      ? await repository.setSettings({
          guildId: input.guildId,
          settings: {
            skipDiceDelay: input.skipDiceDelay,
            hideRollResultText: input.hideRollResultText,
          },
          mutationId: input.mutationId,
          occurredAt: input.occurredAt,
        })
      : await repository.setSkipDiceDelay(input);
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
  let input: z.output<typeof MembershipUpsertSchema>;
  try {
    input = await parseRequest(request, MembershipUpsertSchema);
  } catch {
    return errorResponse("Membership upsert is invalid", 400);
  }

  try {
    const guildResult = await new D1GuildRepository(db).setDisplayProfile({
      guildId: input.guildId,
      profile: { name: input.guildName, icon: input.guildIcon },
      mutationId: input.guildMutationId,
      occurredAt: input.occurredAt,
    });
    if (guildResult.status === "missing") {
      return errorResponse("Membership guild is missing", 404);
    }
    if (guildResult.status === "conflict") {
      return errorResponse("Guild profile mutation conflicts", 409);
    }
    const result = await new D1MembershipRepository(db).upsertPermissions({
      userId: input.userId,
      guildId: input.guildId,
      permissions: {
        isAdmin: input.isAdmin,
        isDiceWitchAdmin: input.isDiceWitchAdmin,
      },
      mutationId: input.mutationId,
      occurredAt: input.occurredAt,
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
  let input: z.output<typeof MembershipPermissionUpsertSchema>;
  try {
    input = await parseRequest(request, MembershipPermissionUpsertSchema);
  } catch {
    return errorResponse("Membership permission upsert is invalid", 400);
  }

  try {
    const result = await new D1MembershipRepository(db).upsertPermissions({
      userId: input.userId,
      guildId: input.guildId,
      permissions: {
        isAdmin: input.isAdmin,
        isDiceWitchAdmin: input.isDiceWitchAdmin,
      },
      mutationId: input.mutationId,
      occurredAt: input.occurredAt,
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
  let input: GuildLifecycleInput;
  try {
    input = await parseRequest(request, GuildLifecycleRequestSchema);
  } catch {
    return errorResponse("Guild lifecycle request is invalid", 400);
  }

  try {
    const repository = new D1GuildRepository(db);
    const result = await repository.applyLifecycle(input);
    const guildName = input.type === "upsert"
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
  let input: z.output<typeof GuildReconciliationRequestSchema>;
  try {
    input = await parseRequest(request, GuildReconciliationRequestSchema);
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
  let input: z.output<typeof StatusStatsRequestSchema>;
  try {
    input = await parseRequest(request, StatusStatsRequestSchema);
  } catch {
    return errorResponse("Status stats request is invalid", 400);
  }

  try {
    const stats = await new D1GuildRepository(db).getStatusStats(input.shardCount);
    return Response.json(stats, { headers: responseHeaders });
  } catch {
    return errorResponse("Status stats lookup failed", 500);
  }
}

async function listMemberships(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let input: z.output<typeof MembershipLookupSchema>;
  try {
    input = await parseRequest(request, MembershipLookupSchema);
  } catch {
    return errorResponse("Membership lookup is invalid", 400);
  }

  try {
    const memberships = await new D1MembershipRepository(db).listMutualGuilds(
      input.userId,
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
