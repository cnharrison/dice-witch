import {
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV4,
  validateAppearanceProfileFontsV4,
  type AppearanceProfileV4,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import { z } from "zod";
import {
  snowflakeSchema,
  strictObjectSchema,
  timestampSchema,
} from "../../../packages/discord-contracts/src/schema-primitives";
import {
  APPEARANCE_VALIDATION_CATALOG_V3,
  appearanceCatalogForPolicyV3,
  builtinAppearanceRecipesForPolicyV3,
  resolveEffectiveAppearanceV4,
  type AppearanceCatalogPolicyV3,
} from "../../../packages/dice-appearance/src";
import {
  D1AppearanceRepository,
  type AppearanceProfileReadResult,
  type AppearanceProfileWriteResult,
  type GuildAppearanceProfileReadResult,
  type PutGuildAppearanceV4Input,
  type PutPersonalAppearanceV4Input,
} from "./appearance-repository";

const MAX_BODY_BYTES = 96 * 1024;
const jsonValueSchema = z.json();
const expectedRevisionSchema = z
  .number()
  .refine(Number.isSafeInteger)
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
const mutationIdSchema = z.string().min(1).max(255);
const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const mutationFields = {
  expectedRevision: expectedRevisionSchema,
  mutationId: mutationIdSchema,
  occurredAt: timestampSchema,
};
const PersonalProfileLookupSchema = strictObjectSchema({
  userId: snowflakeSchema,
});
const PersonalProfileUpdateSchema = strictObjectSchema({
  ...mutationFields,
  profile: jsonValueSchema,
  userId: snowflakeSchema,
});
const GuildProfileLookupSchema = strictObjectSchema({
  guildId: snowflakeSchema,
});
const GuildProfileUpdateSchema = strictObjectSchema({
  ...mutationFields,
  guildId: snowflakeSchema,
  profile: jsonValueSchema,
  updatedByUserId: snowflakeSchema,
});
const EffectiveAppearanceLookupSchema = strictObjectSchema({
  guildId: z.nullable(snowflakeSchema),
  userId: snowflakeSchema,
});

async function readBoundedRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
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
  const body = request.body;
  if (body === null) {
    throw new Error("Appearance request body is missing");
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
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
  const json = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: false,
  }).decode(bytes);
  return schema.parse(JSON.parse(json));
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: responseHeaders });
}

function writeResponse<Profile extends object>(
  result: AppearanceProfileWriteResult<Profile>,
  includeRestoreState: boolean,
): Response {
  let status = 200;
  if (result.status === "missing" || result.status === "restore_missing") {
    status = 404;
  }
  if (
    result.status === "revision_conflict" ||
    result.status === "mutation_conflict"
  ) {
    status = 409;
  }
  const body =
    !includeRestoreState &&
    (result.status === "applied" || result.status === "existing")
      ? {
          status: result.status,
          revision: result.revision,
          profile: result.profile,
        }
      : result;
  return Response.json(body, { status, headers: responseHeaders });
}

function readResponse<Profile extends object>(
  result:
    | AppearanceProfileReadResult<Profile>
    | GuildAppearanceProfileReadResult<Profile>,
  includeRestoreState: boolean,
): Response {
  if (!includeRestoreState && result.status === "found") {
    const body = "updatedByUserId" in result
      ? {
          status: result.status,
          revision: result.revision,
          profile: result.profile,
          updatedByUserId: result.updatedByUserId,
        }
      : {
          status: result.status,
          revision: result.revision,
          profile: result.profile,
        };
    return Response.json(body, { headers: responseHeaders });
  }
  return Response.json(result, { headers: responseHeaders });
}

function appearanceRepository(db: D1Database): D1AppearanceRepository {
  return new D1AppearanceRepository(db, APPEARANCE_VALIDATION_CATALOG_V3);
}

function validateProfileFonts(
  profile: AppearanceProfileV4 | GuildAppearanceProfileV4,
  policy: AppearanceCatalogPolicyV3,
): void {
  validateAppearanceProfileFontsV4(
    profile,
    appearanceCatalogForPolicyV3(policy).fonts.map(({ id }) => id),
  );
}

async function getPersonalProfileV4(
  request: Request,
  db: D1Database,
  includeRestoreState: boolean,
): Promise<Response> {
  let input: z.output<typeof PersonalProfileLookupSchema>;
  try {
    input = await readBoundedRequest(request, PersonalProfileLookupSchema);
  } catch {
    return errorResponse("Personal appearance lookup is invalid", 400);
  }

  try {
    return readResponse(
      await appearanceRepository(db).getPersonalV4(input.userId),
      includeRestoreState,
    );
  } catch {
    return errorResponse("Personal appearance lookup failed", 500);
  }
}

async function mutatePersonalProfileV4(
  request: Request,
  db: D1Database,
  policy: AppearanceCatalogPolicyV3,
  action: "put" | "reset" | "restore",
  includeRestoreState: boolean,
): Promise<Response> {
  let input: PutPersonalAppearanceV4Input & { profile: AppearanceProfileV4 };
  try {
    const requestInput = await readBoundedRequest(
      request,
      PersonalProfileUpdateSchema,
    );
    const profile = parseAppearanceProfileV4(
      requestInput.profile,
      APPEARANCE_VALIDATION_CATALOG_V3,
    );
    validateProfileFonts(profile, policy);
    input = { ...requestInput, profile };
  } catch {
    return errorResponse("Personal appearance update is invalid", 400);
  }

  try {
    const repository = appearanceRepository(db);
    let result: AppearanceProfileWriteResult<AppearanceProfileV4>;
    if (action === "reset") {
      result = await repository.resetPersonalV4(input);
    } else if (action === "restore") {
      result = await repository.restorePersonalV4(input);
    } else {
      result = await repository.putPersonalV4(input);
    }
    return writeResponse(result, includeRestoreState);
  } catch {
    return errorResponse("Personal appearance update failed", 500);
  }
}

async function getGuildProfileV4(
  request: Request,
  db: D1Database,
  includeRestoreState: boolean,
): Promise<Response> {
  let input: z.output<typeof GuildProfileLookupSchema>;
  try {
    input = await readBoundedRequest(request, GuildProfileLookupSchema);
  } catch {
    return errorResponse("Guild appearance lookup is invalid", 400);
  }

  try {
    return readResponse(
      await appearanceRepository(db).getGuildV4(input.guildId),
      includeRestoreState,
    );
  } catch {
    return errorResponse("Guild appearance lookup failed", 500);
  }
}

async function mutateGuildProfileV4(
  request: Request,
  db: D1Database,
  policy: AppearanceCatalogPolicyV3,
  action: "put" | "reset" | "restore",
  includeRestoreState: boolean,
): Promise<Response> {
  let input: PutGuildAppearanceV4Input & {
    profile: GuildAppearanceProfileV4;
  };
  try {
    const requestInput = await readBoundedRequest(
      request,
      GuildProfileUpdateSchema,
    );
    const profile = parseGuildAppearanceProfileV4(
      requestInput.profile,
      APPEARANCE_VALIDATION_CATALOG_V3,
    );
    validateProfileFonts(profile, policy);
    input = { ...requestInput, profile };
  } catch {
    return errorResponse("Guild appearance update is invalid", 400);
  }

  try {
    const repository = appearanceRepository(db);
    let result: AppearanceProfileWriteResult<GuildAppearanceProfileV4>;
    if (action === "reset") {
      result = await repository.resetGuildV4(input);
    } else if (action === "restore") {
      result = await repository.restoreGuildV4(input);
    } else {
      result = await repository.putGuildV4(input);
    }
    return writeResponse(result, includeRestoreState);
  } catch {
    return errorResponse("Guild appearance update failed", 500);
  }
}

async function getEffectiveAppearanceV4(
  request: Request,
  db: D1Database,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  let lookup: z.output<typeof EffectiveAppearanceLookupSchema>;
  try {
    lookup = await readBoundedRequest(request, EffectiveAppearanceLookupSchema);
  } catch {
    return errorResponse("Effective appearance lookup is invalid", 400);
  }

  try {
    const repository = appearanceRepository(db);
    const [personal, guild] = await Promise.all([
      repository.getPersonalV4(lookup.userId),
      lookup.guildId === null
        ? Promise.resolve(null)
        : repository.getGuildV4(lookup.guildId),
    ]);
    const effective = resolveEffectiveAppearanceV4({
      personalProfile: personal.status === "found" ? personal.profile : null,
      guildProfile: guild?.status === "found" ? guild.profile : null,
      builtins: builtinAppearanceRecipesForPolicyV3(policy),
    });
    return Response.json(effective, { headers: responseHeaders });
  } catch {
    return errorResponse("Effective appearance lookup failed", 500);
  }
}

export function handleAppearanceRequest(
  request: Request,
  db: D1Database,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> | null {
  if (request.method !== "POST") return null;
  switch (new URL(request.url).pathname) {
    case "/internal/appearance/v4/personal/get":
      return getPersonalProfileV4(request, db, false);
    case "/internal/appearance/v4/personal/put":
      return mutatePersonalProfileV4(request, db, policy, "put", false);
    case "/internal/appearance/v4/personal/state/get":
      return getPersonalProfileV4(request, db, true);
    case "/internal/appearance/v4/personal/state/put":
      return mutatePersonalProfileV4(request, db, policy, "put", true);
    case "/internal/appearance/v4/personal/state/reset":
      return mutatePersonalProfileV4(request, db, policy, "reset", true);
    case "/internal/appearance/v4/personal/state/restore":
      return mutatePersonalProfileV4(request, db, policy, "restore", true);
    case "/internal/appearance/v4/guild/get":
      return getGuildProfileV4(request, db, false);
    case "/internal/appearance/v4/guild/put":
      return mutateGuildProfileV4(request, db, policy, "put", false);
    case "/internal/appearance/v4/guild/state/get":
      return getGuildProfileV4(request, db, true);
    case "/internal/appearance/v4/guild/state/put":
      return mutateGuildProfileV4(request, db, policy, "put", true);
    case "/internal/appearance/v4/guild/state/reset":
      return mutateGuildProfileV4(request, db, policy, "reset", true);
    case "/internal/appearance/v4/guild/state/restore":
      return mutateGuildProfileV4(request, db, policy, "restore", true);
    case "/internal/appearance/v4/effective":
      return getEffectiveAppearanceV4(request, db, policy);
    default:
      return null;
  }
}
