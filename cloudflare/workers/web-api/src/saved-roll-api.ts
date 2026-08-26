import { z } from "zod";
import {
  nonNegativeSafeIntegerSchema,
  positiveSafeIntegerSchema,
  snowflakeSchema,
  strictObjectSchema,
  uuidV4Schema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";
import {
  synchronizeGuildProof,
  type GuildMembershipProof,
} from "./guild-authorization";
import { json } from "./responses";

const MAX_BODY_BYTES = 64 * 1024;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const revisionSchema = nonNegativeSafeIntegerSchema.max(
  Number.MAX_SAFE_INTEGER - 1,
);
const SavedRollOwnerSchema = z.discriminatedUnion("type", [
  strictObjectSchema({ type: z.literal("user"), userId: snowflakeSchema }),
  strictObjectSchema({ type: z.literal("guild"), guildId: snowflakeSchema }),
]);
const DraftV1Schema = strictObjectSchema({
  version: z.literal(1),
  name: z.string(),
  notation: z.string(),
  title: z.union([z.null(), z.string()]),
  repetitions: z.number(),
});
const DraftV2Schema = strictObjectSchema({
  version: z.literal(2),
  name: z.string(),
  nameColor: z.union([z.null(), z.string()]),
  notation: z.string(),
  title: z.union([z.null(), z.string()]),
  repetitions: z.number(),
});
const CreateV1Schema = strictObjectSchema({
  id: uuidV4Schema,
  expectedListRevision: revisionSchema,
  draft: DraftV1Schema,
  pinned: z.boolean(),
});
const CreateV2Schema = strictObjectSchema({
  id: uuidV4Schema,
  expectedListRevision: revisionSchema,
  draft: DraftV2Schema,
  pinned: z.boolean(),
});
const UpdateV1Schema = strictObjectSchema({
  expectedListRevision: revisionSchema,
  expectedRecordRevision: positiveSafeIntegerSchema,
  draft: DraftV1Schema,
  pinned: z.boolean(),
});
const UpdateV2Schema = strictObjectSchema({
  expectedListRevision: revisionSchema,
  expectedRecordRevision: positiveSafeIntegerSchema,
  draft: DraftV2Schema,
  pinned: z.boolean(),
});
const DeleteSchema = strictObjectSchema({
  expectedListRevision: revisionSchema,
  expectedRecordRevision: positiveSafeIntegerSchema,
});
const DeleteBatchSchema = strictObjectSchema({
  expectedListRevision: revisionSchema,
  records: z
    .array(
      strictObjectSchema({
        id: uuidV4Schema,
        revision: positiveSafeIntegerSchema,
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (records) => new Set(records.map(({ id }) => id)).size === records.length,
    ),
});
const ReorderSchema = strictObjectSchema({
  expectedListRevision: revisionSchema,
  orderedIds: z
    .array(uuidV4Schema)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
const LibraryCandidateSchema = strictObjectSchema({
  guildId: snowflakeSchema,
  guildName: z.string().min(1).max(255),
  guildIcon: z.string().max(255).nullable(),
});
const LibrariesResultSchema = strictObjectSchema({
  status: z.literal("found"),
  libraries: z.array(LibraryCandidateSchema).max(200),
});
const SavedRollWireSchema = strictObjectSchema({
  version: z.union([z.literal(1), z.literal(2)]).optional(),
  id: uuidV4Schema.optional(),
  owner: SavedRollOwnerSchema.optional(),
  displayName: z.string().optional(),
  comparisonKey: z.string().optional(),
  notation: z.string().optional(),
  title: z.string().nullable().optional(),
  repetitions: positiveSafeIntegerSchema.optional(),
  nameColor: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  manualOrder: nonNegativeSafeIntegerSchema.optional(),
  revision: positiveSafeIntegerSchema.optional(),
  createdByUserId: snowflakeSchema.optional(),
  updatedByUserId: snowflakeSchema.optional(),
  createdAt: nonNegativeSafeIntegerSchema.optional(),
  updatedAt: nonNegativeSafeIntegerSchema.optional(),
});
const SearchSavedRollSchema = SavedRollWireSchema.extend({
  owner: SavedRollOwnerSchema,
});
const SearchResultSchema = strictObjectSchema({
  status: z.literal("found"),
  entries: z
    .array(
      strictObjectSchema({
        savedRoll: SearchSavedRollSchema,
        listRevision: nonNegativeSafeIntegerSchema,
        guildName: z.string().nullable(),
        guildIcon: z.string().nullable(),
      }),
    )
    .max(50),
  hasMore: z.boolean(),
  total: nonNegativeSafeIntegerSchema,
});
const ProxyDataResultSchema = z.union([
  strictObjectSchema({ error: z.string() }),
  strictObjectSchema({ status: z.literal("missing") }),
  strictObjectSchema({ status: z.literal("unauthorized") }),
  strictObjectSchema({ status: z.literal("mutation_conflict") }),
  strictObjectSchema({
    status: z.literal("found"),
    listRevision: nonNegativeSafeIntegerSchema,
    savedRolls: z.array(SavedRollWireSchema),
  }),
  strictObjectSchema({
    status: z.literal("found"),
    savedRoll: SavedRollWireSchema,
  }),
  strictObjectSchema({
    status: z.enum(["applied", "existing"]),
    listRevision: positiveSafeIntegerSchema,
    savedRoll: SavedRollWireSchema,
  }),
  strictObjectSchema({
    status: z.enum(["applied", "existing"]),
    listRevision: positiveSafeIntegerSchema,
    recordRevision: positiveSafeIntegerSchema,
  }),
  strictObjectSchema({
    status: z.enum(["applied", "existing"]),
    listRevision: positiveSafeIntegerSchema,
  }),
  strictObjectSchema({
    status: z.enum([
      "list_revision_conflict",
      "name_conflict",
      "record_set_conflict",
    ]),
    listRevision: nonNegativeSafeIntegerSchema,
  }),
  strictObjectSchema({
    status: z.literal("record_revision_conflict"),
    recordRevision: positiveSafeIntegerSchema,
  }),
  strictObjectSchema({
    status: z.literal("cap_reached"),
    listRevision: nonNegativeSafeIntegerSchema,
    limit: positiveSafeIntegerSchema,
  }),
]);

type SavedRollApiEnv = {
  DATA_SERVICE: Fetcher;
  DISCORD_REST: {
    inspectMembership(
      guildId: string,
      userId: string,
    ): Promise<SchemaInput>;
  };
};

type Owner = z.output<typeof SavedRollOwnerSchema>;
type AuthorizedLibrary = z.output<typeof LibraryCandidateSchema> & {
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
};
type SavedRollContractVersion = 1 | 2;
type Operation =
  | "list"
  | "get"
  | "create"
  | "copy"
  | "update"
  | "delete"
  | "delete-batch"
  | "reorder";
type Route =
  | { owner: Owner; operation: "list"; contractVersion: SavedRollContractVersion }
  | {
      owner: Owner;
      operation: "get" | "update" | "delete";
      contractVersion: SavedRollContractVersion;
      id: string;
    }
  | {
      owner: Owner;
      operation: "create" | "copy" | "reorder";
      contractVersion: SavedRollContractVersion;
    }
  | {
      owner: Owner;
      operation: "delete-batch";
      contractVersion: 2;
    };
type SavedRollMutationBody =
  | z.output<typeof CreateV1Schema>
  | z.output<typeof CreateV2Schema>
  | z.output<typeof UpdateV1Schema>
  | z.output<typeof UpdateV2Schema>
  | z.output<typeof DeleteSchema>
  | z.output<typeof DeleteBatchSchema>
  | z.output<typeof ReorderSchema>;
type SavedRollReadDataRequest = { owner: Owner; id?: string };
type SavedRollMutationDataRequest = SavedRollMutationBody & {
  owner: Owner;
  actorUserId: string;
  authorizationUpdatedAt: number | null;
  mutationId: string;
  occurredAt: number;
  id?: string;
};
type SavedRollSearchDataRequest = {
  userId: string;
  guildIds: string[];
  query: string;
  offset: number;
  sort: "name" | "roll" | "created" | "updated";
  direction: "asc" | "desc";
};
type SavedRollDataRequest =
  | { userId: string }
  | SavedRollReadDataRequest
  | SavedRollMutationDataRequest
  | SavedRollSearchDataRequest;
type SavedRollDataPath =
  | "/internal/saved-rolls/v1/libraries"
  | `/internal/saved-rolls/v${SavedRollContractVersion}/${Operation | "search"}`;
type SearchResponseEntry = {
  savedRoll: z.output<typeof SearchSavedRollSchema>;
  listRevision: number;
  source:
    | { type: "personal" }
    | {
        type: "guild";
        guildId: string;
        guildName: string;
        guildIcon: string | null;
      };
  canManage: boolean;
};

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

async function readBoundedJson<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new Error("Saved roll content type is invalid");
  }
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_BODY_BYTES)
  ) {
    throw new Error("Saved roll body is too large");
  }
  const body = request.body;
  if (body === null) throw new Error("Saved roll body is missing");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Saved roll body is too large");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: SchemaInput = JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  );
  return schema.parse(value);
}

function personalRoute(
  pathname: string,
  method: string,
  userId: string,
): Route | null {
  const match = /^\/api\/saved-rolls\/(v1|v2)\/me(?:\/([0-9a-f-]+|copy|delete-batch|reorder))?$/.exec(
    pathname,
  );
  if (match === null || match[1] === undefined) return null;
  const contractVersion = match[1] === "v2" ? 2 : 1;
  const owner: Owner = { type: "user", userId };
  const suffix = match[2];
  if (suffix === undefined) {
    if (method === "GET") return { owner, operation: "list", contractVersion };
    if (method === "POST") return { owner, operation: "create", contractVersion };
    return null;
  }
  if (suffix === "copy" && method === "POST") {
    return { owner, operation: "copy", contractVersion };
  }
  if (suffix === "delete-batch" && contractVersion === 2 && method === "POST") {
    return { owner, operation: "delete-batch", contractVersion };
  }
  if (suffix === "reorder" && method === "POST") {
    return { owner, operation: "reorder", contractVersion };
  }
  if (!UUID_V4.test(suffix)) return null;
  if (method === "GET") {
    return { owner, operation: "get", id: suffix, contractVersion };
  }
  if (method === "PATCH") {
    return { owner, operation: "update", id: suffix, contractVersion };
  }
  if (method === "DELETE") {
    return { owner, operation: "delete", id: suffix, contractVersion };
  }
  return null;
}

function guildRoute(pathname: string, method: string): Route | null {
  const match = /^\/api\/guilds\/([1-9][0-9]{16,19})\/saved-rolls\/(v1|v2)(?:\/([0-9a-f-]+|copy|delete-batch|reorder))?$/.exec(
    pathname,
  );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  const contractVersion = match[2] === "v2" ? 2 : 1;
  const owner: Owner = { type: "guild", guildId: match[1] };
  const suffix = match[3];
  if (suffix === undefined) {
    if (method === "GET") return { owner, operation: "list", contractVersion };
    if (method === "POST") return { owner, operation: "create", contractVersion };
    return null;
  }
  if (suffix === "copy" && method === "POST") {
    return { owner, operation: "copy", contractVersion };
  }
  if (suffix === "delete-batch" && contractVersion === 2 && method === "POST") {
    return { owner, operation: "delete-batch", contractVersion };
  }
  if (suffix === "reorder" && method === "POST") {
    return { owner, operation: "reorder", contractVersion };
  }
  if (!UUID_V4.test(suffix)) return null;
  if (method === "GET") {
    return { owner, operation: "get", id: suffix, contractVersion };
  }
  if (method === "PATCH") {
    return { owner, operation: "update", id: suffix, contractVersion };
  }
  if (method === "DELETE") {
    return { owner, operation: "delete", id: suffix, contractVersion };
  }
  return null;
}

function parseRoute(request: Request, userId: string): Route | null {
  const pathname = new URL(request.url).pathname;
  return personalRoute(pathname, request.method, userId) ??
    guildRoute(pathname, request.method);
}

async function postData(
  dataService: Fetcher,
  path: SavedRollDataPath,
  body: SavedRollDataRequest,
): Promise<Response> {
  return dataService.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function synchronizeSavedRollGuildProof(
  env: SavedRollApiEnv,
  guildId: string,
  userId: string,
  now: number,
): Promise<GuildMembershipProof | Response> {
  const result = await synchronizeGuildProof(env, guildId, userId, now);
  return result.status === "verified"
    ? result.proof
    : json({ error: "Saved roll guild authorization failed" }, 502);
}

async function mutationBody(
  request: Request,
  route: Exclude<Route, { operation: "list" | "get" }>,
): Promise<SavedRollMutationBody> {
  if (route.operation === "create" || route.operation === "copy") {
    return readBoundedJson(
      request,
      route.contractVersion === 1 ? CreateV1Schema : CreateV2Schema,
    );
  }
  if (route.operation === "update") {
    return readBoundedJson(
      request,
      route.contractVersion === 1 ? UpdateV1Schema : UpdateV2Schema,
    );
  }
  if (route.operation === "delete") {
    return readBoundedJson(request, DeleteSchema);
  }
  if (route.operation === "delete-batch") {
    return readBoundedJson(request, DeleteBatchSchema);
  }
  return readBoundedJson(request, ReorderSchema);
}

async function proxyDataResponse(response: Response): Promise<Response> {
  let value: z.output<typeof ProxyDataResultSchema>;
  try {
    value = ProxyDataResultSchema.parse(await response.json());
  } catch {
    return json({ error: "Saved roll service response is invalid" }, 502);
  }
  if ([200, 400, 403, 404, 409].includes(response.status)) {
    return json(value, response.status);
  }
  return json({ error: "Saved roll service failed" }, 502);
}

async function authorizedLibraries(
  env: SavedRollApiEnv,
  userId: string,
  now: number,
): Promise<AuthorizedLibrary[] | Response> {
  const response = await postData(
    env.DATA_SERVICE,
    "/internal/saved-rolls/v1/libraries",
    { userId },
  );
  if (!response.ok) {
    return json({ error: "Saved roll library lookup failed" }, 502);
  }
  let value: z.output<typeof LibrariesResultSchema>;
  try {
    value = LibrariesResultSchema.parse(await response.json());
  } catch {
    return json({ error: "Saved roll library response is invalid" }, 502);
  }

  const libraries: AuthorizedLibrary[] = [];
  for (let offset = 0; offset < value.libraries.length; offset += 5) {
    const batch = value.libraries.slice(offset, offset + 5);
    const proofs = await Promise.all(
      batch.map((library) =>
        synchronizeSavedRollGuildProof(env, library.guildId, userId, now),
      ),
    );
    for (let index = 0; index < batch.length; index += 1) {
      const library = batch[index];
      const proof = proofs[index];
      if (library === undefined || proof === undefined) {
        return json({ error: "Saved roll guild authorization failed" }, 502);
      }
      if (proof instanceof Response) return proof;
      if (proof.status === "found") {
        libraries.push({ ...library, ...proof });
      }
    }
  }
  return libraries;
}

async function listLibraries(
  env: SavedRollApiEnv,
  userId: string,
  now: number,
): Promise<Response> {
  const libraries = await authorizedLibraries(env, userId, now);
  return libraries instanceof Response
    ? libraries
    : json({ status: "found", libraries });
}

async function searchSavedRolls(
  request: Request,
  env: SavedRollApiEnv,
  userId: string,
  now: number,
  contractVersion: SavedRollContractVersion,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    [...url.searchParams.keys()].sort().join(",") !==
    "direction,offset,query,sort"
  ) {
    return json({ error: "Saved roll search parameters are invalid" }, 400);
  }
  const query = url.searchParams.get("query")?.trim() ?? "";
  const offset = url.searchParams.get("offset") ?? "";
  const sort = url.searchParams.get("sort");
  const direction = url.searchParams.get("direction");
  if (
    query.length < 2 ||
    query.length > 128 ||
    containsControlCharacter(query) ||
    !/^(0|[1-9][0-9]{0,4})$/.test(offset) ||
    Number(offset) > 20_000 ||
    (sort !== "name" &&
      sort !== "roll" &&
      sort !== "created" &&
      sort !== "updated") ||
    (direction !== "asc" && direction !== "desc")
  ) {
    return json({ error: "Saved roll search parameters are invalid" }, 400);
  }
  const libraries = await authorizedLibraries(env, userId, now);
  if (libraries instanceof Response) return libraries;
  const managedLibraries = libraries.filter(
    (library) => library.isAdmin || library.isDiceWitchAdmin,
  );
  const response = await postData(
    env.DATA_SERVICE,
    `/internal/saved-rolls/v${contractVersion}/search`,
    {
      userId,
      guildIds: managedLibraries.map(({ guildId }) => guildId),
      query,
      offset: Number(offset),
      sort,
      direction,
    },
  );
  if (!response.ok) {
    return json({ error: "Saved roll search failed" }, 502);
  }
  let value: z.output<typeof SearchResultSchema>;
  try {
    value = SearchResultSchema.parse(await response.json());
  } catch {
    return json({ error: "Saved roll search response is invalid" }, 502);
  }
  const libraryById = new Map(
    managedLibraries.map((library) => [library.guildId, library]),
  );
  const entries: SearchResponseEntry[] = [];
  for (const entry of value.entries) {
    const owner = entry.savedRoll.owner;
    if (owner.type === "user" && owner.userId === userId) {
      entries.push({
        savedRoll: entry.savedRoll,
        listRevision: entry.listRevision,
        source: { type: "personal" },
        canManage: true,
      });
      continue;
    }
    if (owner.type !== "guild") {
      return json({ error: "Saved roll search response is invalid" }, 502);
    }
    const library = libraryById.get(owner.guildId);
    if (library === undefined) {
      return json({ error: "Saved roll search response is invalid" }, 502);
    }
    entries.push({
      savedRoll: entry.savedRoll,
      listRevision: entry.listRevision,
      source: {
        type: "guild",
        guildId: library.guildId,
        guildName: library.guildName,
        guildIcon: library.guildIcon,
      },
      canManage: library.isAdmin || library.isDiceWitchAdmin,
    });
  }
  return json({
    status: "found",
    entries,
    hasMore: value.hasMore,
    total: value.total,
  });
}

export async function handleSavedRollApiRequest(
  request: Request,
  env: SavedRollApiEnv,
  userId: string,
  now: number,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const topLevelMatch = /^\/api\/saved-rolls\/(v1|v2)\/(libraries|search)$/.exec(
    pathname,
  );
  if (topLevelMatch !== null && topLevelMatch[1] !== undefined) {
    const contractVersion = topLevelMatch[1] === "v2" ? 2 : 1;
    if (topLevelMatch[2] === "libraries") {
      return request.method === "GET" ? listLibraries(env, userId, now) : null;
    }
    return request.method === "GET"
      ? searchSavedRolls(request, env, userId, now, contractVersion)
      : null;
  }

  const route = parseRoute(request, userId);
  if (route === null) return null;

  const isRead = route.operation === "list" || route.operation === "get";
  let idempotencyKey: string | null = null;
  let body: SavedRollMutationBody | null = null;
  if (!isRead) {
    idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey === null || !UUID_V4.test(idempotencyKey)) {
      return json({ error: "Saved roll idempotency key is invalid" }, 400);
    }
    try {
      body = await mutationBody(request, route);
    } catch {
      return json({ error: "Saved roll request is invalid" }, 400);
    }
  }

  let authorizationUpdatedAt: number | null = null;
  if (route.owner.type === "guild") {
    const proof = await synchronizeSavedRollGuildProof(
      env,
      route.owner.guildId,
      userId,
      now,
    );
    if (proof instanceof Response) return proof;
    if (proof.status === "missing") {
      return json({ error: "Saved roll guild access is forbidden" }, 403);
    }
    if (!isRead && !proof.isAdmin && !proof.isDiceWitchAdmin) {
      return json({ error: "Saved roll guild mutation is forbidden" }, 403);
    }
    if (!isRead) authorizationUpdatedAt = now;
  }

  if (route.operation === "list" || route.operation === "get") {
    const readBody: SavedRollReadDataRequest = { owner: route.owner };
    if (route.operation === "get") readBody.id = route.id;
    const response = await postData(
      env.DATA_SERVICE,
      `/internal/saved-rolls/v${route.contractVersion}/${route.operation}`,
      readBody,
    );
    return proxyDataResponse(response);
  }

  if (idempotencyKey === null || body === null) {
    return json({ error: "Saved roll request is invalid" }, 500);
  }
  const dataBody: SavedRollMutationDataRequest = {
    owner: route.owner,
    actorUserId: userId,
    authorizationUpdatedAt,
    ...body,
    mutationId: `web-saved-roll:${route.operation}:${idempotencyKey}`,
    occurredAt: now,
  };
  if (route.operation === "update" || route.operation === "delete") {
    dataBody.id = route.id;
  }
  const response = await postData(
    env.DATA_SERVICE,
    `/internal/saved-rolls/v${route.contractVersion}/${route.operation}`,
    dataBody,
  );
  return proxyDataResponse(response);
}
