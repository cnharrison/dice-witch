import { json } from "./responses";

const MAX_BODY_BYTES = 64 * 1024;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type MembershipInspection =
  | { status: "found"; isAdmin: boolean; isDiceWitchAdmin: boolean }
  | { status: "missing" };

type SavedRollApiEnv = {
  DATA_SERVICE: Fetcher;
  DISCORD_REST: {
    inspectMembership(
      guildId: string,
      userId: string,
    ): Promise<MembershipInspection>;
  };
};

type Owner =
  | { type: "user"; userId: string }
  | { type: "guild"; guildId: string };

type AuthorizedLibrary = {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
};

type SavedRollContractVersion = 1 | 2;

type Route = {
  owner: Owner;
  operation:
    | "list"
    | "get"
    | "create"
    | "copy"
    | "update"
    | "delete"
    | "delete-batch"
    | "reorder";
  contractVersion: SavedRollContractVersion;
  id?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
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
    throw new Error("Saved roll content type is invalid");
  }
  const length = request.headers.get("content-length");
  if (
    length !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_BODY_BYTES)
  ) {
    throw new Error("Saved roll body is too large");
  }
  if (request.body === null) throw new Error("Saved roll body is missing");
  const reader = (request.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
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
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  ) as unknown;
}

function personalRoute(
  pathname: string,
  method: string,
  userId: string,
): Route | null {
  const match = pathname.match(
    /^\/api\/saved-rolls\/(v1|v2)\/me(?:\/([0-9a-f-]+|copy|delete-batch|reorder))?$/,
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
  if (method === "GET") return { owner, operation: "get", id: suffix, contractVersion };
  if (method === "PATCH") return { owner, operation: "update", id: suffix, contractVersion };
  if (method === "DELETE") return { owner, operation: "delete", id: suffix, contractVersion };
  return null;
}

function guildRoute(pathname: string, method: string): Route | null {
  const match = pathname.match(
    /^\/api\/guilds\/([1-9][0-9]{16,19})\/saved-rolls\/(v1|v2)(?:\/([0-9a-f-]+|copy|delete-batch|reorder))?$/,
  );
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    !SNOWFLAKE.test(match[1])
  ) return null;
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
  if (method === "GET") return { owner, operation: "get", id: suffix, contractVersion };
  if (method === "PATCH") return { owner, operation: "update", id: suffix, contractVersion };
  if (method === "DELETE") return { owner, operation: "delete", id: suffix, contractVersion };
  return null;
}

function parseRoute(request: Request, userId: string): Route | null {
  const pathname = new URL(request.url).pathname;
  return personalRoute(pathname, request.method, userId) ?? guildRoute(pathname, request.method);
}

async function postData(
  dataService: Fetcher,
  path: string,
  body: unknown,
): Promise<Response> {
  return dataService.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function synchronizeGuildProof(
  env: SavedRollApiEnv,
  guildId: string,
  userId: string,
  now: number,
): Promise<MembershipInspection | Response> {
  let inspection: MembershipInspection;
  try {
    inspection = await env.DISCORD_REST.inspectMembership(guildId, userId);
  } catch {
    return json({ error: "Saved roll guild authorization failed" }, 502);
  }
  const permissions =
    inspection.status === "found"
      ? inspection
      : { isAdmin: false, isDiceWitchAdmin: false };
  const response = await postData(
    env.DATA_SERVICE,
    "/internal/memberships/permissions",
    {
      userId,
      guildId,
      isAdmin: permissions.isAdmin,
      isDiceWitchAdmin: permissions.isDiceWitchAdmin,
      mutationId: `saved-roll-proof:${crypto.randomUUID()}`,
      occurredAt: now,
    },
  );
  if (!response.ok) {
    return json({ error: "Saved roll guild authorization failed" }, 502);
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return json({ error: "Saved roll guild authorization failed" }, 502);
  }
  if (
    !isRecord(result) ||
    (result.status !== "applied" &&
      result.status !== "existing" &&
      result.status !== "superseded") ||
    !isRecord(result.permissions) ||
    typeof result.permissions.isAdmin !== "boolean" ||
    typeof result.permissions.isDiceWitchAdmin !== "boolean"
  ) {
    return json({ error: "Saved roll guild authorization failed" }, 502);
  }
  return inspection.status === "missing"
    ? inspection
    : {
        status: "found",
        isAdmin: result.permissions.isAdmin,
        isDiceWitchAdmin: result.permissions.isDiceWitchAdmin,
      };
}

function mutationKeys(operation: Route["operation"]): readonly string[] {
  if (operation === "create" || operation === "copy") {
    return ["draft", "expectedListRevision", "id", "pinned"];
  }
  if (operation === "update") {
    return ["draft", "expectedListRevision", "expectedRecordRevision", "pinned"];
  }
  if (operation === "delete") {
    return ["expectedListRevision", "expectedRecordRevision"];
  }
  if (operation === "delete-batch") {
    return ["expectedListRevision", "records"];
  }
  if (operation === "reorder") {
    return ["expectedListRevision", "orderedIds"];
  }
  return [];
}

async function mutationBody(request: Request, operation: Route["operation"]): Promise<Record<string, unknown>> {
  const value = await readBoundedJson(request);
  const keys = mutationKeys(operation);
  if (!isRecord(value) || keys.length === 0 || !hasExactKeys(value, keys)) {
    throw new Error("Saved roll request is invalid");
  }
  return value;
}

async function proxyDataResponse(response: Response): Promise<Response> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return json({ error: "Saved roll service response is invalid" }, 502);
  }
  if (
    isRecord(value) &&
    [200, 400, 403, 404, 409].includes(response.status)
  ) {
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
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return json({ error: "Saved roll library response is invalid" }, 502);
  }
  if (
    !isRecord(value) ||
    value.status !== "found" ||
    !Array.isArray(value.libraries) ||
    value.libraries.length > 200
  ) {
    return json({ error: "Saved roll library response is invalid" }, 502);
  }
  const candidates: Omit<AuthorizedLibrary, "isAdmin" | "isDiceWitchAdmin">[] = [];
  for (const library of value.libraries) {
    if (
      !isRecord(library) ||
      typeof library.guildId !== "string" ||
      !SNOWFLAKE.test(library.guildId) ||
      typeof library.guildName !== "string" ||
      library.guildName.length < 1 ||
      library.guildName.length > 255 ||
      (library.guildIcon !== null &&
        (typeof library.guildIcon !== "string" ||
          library.guildIcon.length > 255))
    ) {
      return json({ error: "Saved roll library response is invalid" }, 502);
    }
    candidates.push({
      guildId: library.guildId,
      guildName: library.guildName,
      guildIcon: library.guildIcon,
    });
  }

  const libraries: AuthorizedLibrary[] = [];
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const batch = candidates.slice(offset, offset + 5);
    const proofs = await Promise.all(
      batch.map((library) =>
        synchronizeGuildProof(env, library.guildId, userId, now),
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
    `/internal/saved-rolls/v${String(contractVersion)}/search`,
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
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return json({ error: "Saved roll search response is invalid" }, 502);
  }
  if (
    !isRecord(value) ||
    value.status !== "found" ||
    !Array.isArray(value.entries) ||
    value.entries.length > 50 ||
    typeof value.hasMore !== "boolean" ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < 0
  ) {
    return json({ error: "Saved roll search response is invalid" }, 502);
  }
  const libraryById = new Map(
    managedLibraries.map((library) => [library.guildId, library]),
  );
  const entries: unknown[] = [];
  for (const entry of value.entries) {
    if (
      !isRecord(entry) ||
      !isRecord(entry.savedRoll) ||
      !isRecord(entry.savedRoll.owner) ||
      typeof entry.listRevision !== "number"
    ) {
      return json({ error: "Saved roll search response is invalid" }, 502);
    }
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
    if (owner.type !== "guild" || typeof owner.guildId !== "string") {
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
  const topLevelMatch = pathname.match(
    /^\/api\/saved-rolls\/(v1|v2)\/(libraries|search)$/,
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
  let body: Record<string, unknown> | null = null;
  if (!isRead) {
    idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey === null || !UUID_V4.test(idempotencyKey)) {
      return json({ error: "Saved roll idempotency key is invalid" }, 400);
    }
    try {
      body = await mutationBody(request, route.operation);
    } catch {
      return json({ error: "Saved roll request is invalid" }, 400);
    }
  }

  let authorizationUpdatedAt: number | null = null;
  if (route.owner.type === "guild") {
    const proof = await synchronizeGuildProof(
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

  if (isRead) {
    const response = await postData(
      env.DATA_SERVICE,
      `/internal/saved-rolls/v${String(route.contractVersion)}/${route.operation}`,
      {
        owner: route.owner,
        ...(route.id === undefined ? {} : { id: route.id }),
      },
    );
    return proxyDataResponse(response);
  }

  if (idempotencyKey === null || body === null) {
    return json({ error: "Saved roll request is invalid" }, 500);
  }
  const response = await postData(
    env.DATA_SERVICE,
    `/internal/saved-rolls/v${String(route.contractVersion)}/${route.operation}`,
    {
      owner: route.owner,
      actorUserId: userId,
      authorizationUpdatedAt,
      ...body,
      ...(route.id === undefined ? {} : { id: route.id }),
      mutationId: `web-saved-roll:${route.operation}:${idempotencyKey}`,
      occurredAt: now,
    },
  );
  return proxyDataResponse(response);
}
