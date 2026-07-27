import {
  parseSavedRollDraftV1,
  parseSavedRollDraftV2,
} from "../../../packages/saved-rolls/src";
import {
  D1SavedRollRepository,
  type CreateSavedRollInputV1,
  type DeleteSavedRollBatchInputV2,
  type DeleteSavedRollInputV1,
  type ReorderSavedRollsInputV1,
  type SavedRollOwner,
  type UpdateSavedRollInputV1,
} from "./saved-roll-repository";

const MAX_BODY_BYTES = 64 * 1024;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class InvalidSavedRollRequest extends Error {}

function invalidRequest(message: string): never {
  throw new InvalidSavedRollRequest(message);
}

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
    invalidRequest("Saved roll request content type is invalid");
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > MAX_BODY_BYTES)
  ) {
    invalidRequest("Saved roll request body is too large");
  }
  if (request.body === null) invalidRequest("Saved roll request body is missing");

  const reader = (request.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      invalidRequest("Saved roll request body is too large");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown;
  } catch {
    invalidRequest("Saved roll request body is invalid");
  }
}

async function parseBody(
  request: Request,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const value = await readBoundedJson(request);
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    invalidRequest("Saved roll request has invalid fields");
  }
  return value;
}

function parseOwner(value: unknown): SavedRollOwner {
  if (!isRecord(value)) invalidRequest("Saved roll owner is invalid");
  if (
    hasExactKeys(value, ["type", "userId"]) &&
    value.type === "user" &&
    typeof value.userId === "string" &&
    SNOWFLAKE.test(value.userId)
  ) {
    return { type: "user", userId: value.userId };
  }
  if (
    hasExactKeys(value, ["guildId", "type"]) &&
    value.type === "guild" &&
    typeof value.guildId === "string" &&
    SNOWFLAKE.test(value.guildId)
  ) {
    return { type: "guild", guildId: value.guildId };
  }
  invalidRequest("Saved roll owner is invalid");
}

function parseNonNegativeInteger(value: unknown, name: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    invalidRequest(`${name} is invalid`);
  }
  return value;
}

function parseAuthorizationUpdatedAt(value: unknown): number | null {
  return value === null
    ? null
    : parseNonNegativeInteger(value, "Saved roll authorization timestamp");
}

function parseId(value: unknown): string {
  if (typeof value !== "string" || !UUID_V4.test(value)) {
    invalidRequest("Saved roll id is invalid");
  }
  return value;
}

type SavedRollContractVersion = 1 | 2;

function validateDraft(
  value: unknown,
  contractVersion: SavedRollContractVersion,
): void {
  try {
    if (contractVersion === 1) parseSavedRollDraftV1(value);
    else parseSavedRollDraftV2(value);
  } catch {
    invalidRequest("Library roll draft is invalid");
  }
}

function parseMutationFields(value: Record<string, unknown>): {
  actorUserId: string;
  authorizationUpdatedAt: number | null;
  expectedListRevision: number;
  mutationId: string;
  occurredAt: number;
  owner: SavedRollOwner;
} {
  if (
    typeof value.actorUserId !== "string" ||
    !SNOWFLAKE.test(value.actorUserId) ||
    typeof value.mutationId !== "string" ||
    value.mutationId.length < 1 ||
    value.mutationId.length > 255
  ) {
    invalidRequest("Saved roll mutation fields are invalid");
  }
  const owner = parseOwner(value.owner);
  const authorizationUpdatedAt = parseAuthorizationUpdatedAt(
    value.authorizationUpdatedAt,
  );
  if (
    (owner.type === "user" &&
      (value.actorUserId !== owner.userId || authorizationUpdatedAt !== null)) ||
    (owner.type === "guild" && authorizationUpdatedAt === null)
  ) {
    invalidRequest("Saved roll mutation authorization is invalid");
  }
  return {
    actorUserId: value.actorUserId,
    authorizationUpdatedAt,
    expectedListRevision: parseNonNegativeInteger(
      value.expectedListRevision,
      "Expected saved roll list revision",
    ),
    mutationId: value.mutationId,
    occurredAt: parseNonNegativeInteger(
      value.occurredAt,
      "Saved roll mutation timestamp",
    ),
    owner,
  };
}

function projectSavedRollContract(
  value: unknown,
  contractVersion: SavedRollContractVersion,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => projectSavedRollContract(entry, contractVersion));
  }
  if (!isRecord(value)) return value;
  const projected = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      projectSavedRollContract(entry, contractVersion),
    ]),
  );
  if (
    value.version === 1 &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.notation === "string" &&
    "nameColor" in value
  ) {
    if (contractVersion === 1) delete projected.nameColor;
    else projected.version = 2;
  }
  return projected;
}

function resultResponse(
  result: { status: string },
  contractVersion: SavedRollContractVersion = 1,
): Response {
  let status = 200;
  if (result.status === "missing") status = 404;
  else if (result.status === "unauthorized") status = 403;
  else if (
    result.status.endsWith("_conflict") ||
    result.status === "cap_reached"
  ) {
    status = 409;
  }
  return Response.json(projectSavedRollContract(result, contractVersion), {
    status,
    headers: responseHeaders,
  });
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: responseHeaders });
}

async function libraries(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  const value = await parseBody(request, ["userId"]);
  if (typeof value.userId !== "string" || !SNOWFLAKE.test(value.userId)) {
    invalidRequest("Saved roll library user is invalid");
  }
  const result = {
    status: "found",
    libraries: await repository.listLibraryCandidates(value.userId),
  };
  return resultResponse(result);
}

async function search(
  request: Request,
  repository: D1SavedRollRepository,
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const value = await parseBody(request, [
    "direction",
    "guildIds",
    "offset",
    "query",
    "sort",
    "userId",
  ]);
  if (
    typeof value.userId !== "string" ||
    !SNOWFLAKE.test(value.userId) ||
    !Array.isArray(value.guildIds) ||
    value.guildIds.length > 200 ||
    !value.guildIds.every(
      (guildId) => typeof guildId === "string" && SNOWFLAKE.test(guildId),
    ) ||
    new Set(value.guildIds).size !== value.guildIds.length ||
    typeof value.query !== "string" ||
    value.query.length < 2 ||
    value.query.length > 128 ||
    !Number.isSafeInteger(value.offset) ||
    Number(value.offset) < 0 ||
    Number(value.offset) > 20_000 ||
    (value.sort !== "name" &&
      value.sort !== "roll" &&
      value.sort !== "created" &&
      value.sort !== "updated") ||
    (value.direction !== "asc" && value.direction !== "desc")
  ) {
    invalidRequest("Saved roll search is invalid");
  }
  return resultResponse(
    await repository.search({
      userId: value.userId,
      guildIds: value.guildIds as string[],
      query: value.query,
      offset: Number(value.offset),
      sort: value.sort,
      direction: value.direction,
    }),
    contractVersion,
  );
}

async function list(
  request: Request,
  repository: D1SavedRollRepository,
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const value = await parseBody(request, ["owner"]);
  return resultResponse(
    await repository.list(parseOwner(value.owner)),
    contractVersion,
  );
}

async function get(
  request: Request,
  repository: D1SavedRollRepository,
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const value = await parseBody(request, ["id", "owner"]);
  return resultResponse(
    await repository.get(parseOwner(value.owner), parseId(value.id)),
    contractVersion,
  );
}

async function createWithOperation(
  request: Request,
  repository: D1SavedRollRepository,
  operation: "create" | "copy",
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const value = await parseBody(request, [
    "actorUserId",
    "authorizationUpdatedAt",
    "draft",
    "expectedListRevision",
    "id",
    "mutationId",
    "occurredAt",
    "owner",
    "pinned",
  ]);
  if (typeof value.pinned !== "boolean") {
    invalidRequest("Saved roll create request is invalid");
  }
  validateDraft(value.draft, contractVersion);
  const input: CreateSavedRollInputV1 = {
    ...parseMutationFields(value),
    draft: value.draft,
    id: parseId(value.id),
    operation,
    pinned: value.pinned,
  };
  return resultResponse(await repository.create(input), contractVersion);
}

async function ensureUser(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  const value = await parseBody(request, ["occurredAt", "userId", "username"]);
  if (
    typeof value.userId !== "string" ||
    !SNOWFLAKE.test(value.userId) ||
    typeof value.username !== "string" ||
    value.username.length < 1 ||
    value.username.length > 32
  ) {
    invalidRequest("Saved roll user is invalid");
  }
  const occurredAt = parseNonNegativeInteger(value.occurredAt, "Occurred at");
  return resultResponse(
    await repository.ensureUser(value.userId, value.username, occurredAt),
  );
}

function create(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  return createWithOperation(request, repository, "create");
}

function copy(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  return createWithOperation(request, repository, "copy");
}

async function update(
  request: Request,
  repository: D1SavedRollRepository,
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const value = await parseBody(request, [
    "actorUserId",
    "authorizationUpdatedAt",
    "draft",
    "expectedListRevision",
    "expectedRecordRevision",
    "id",
    "mutationId",
    "occurredAt",
    "owner",
    "pinned",
  ]);
  if (typeof value.pinned !== "boolean") {
    invalidRequest("Saved roll update request is invalid");
  }
  validateDraft(value.draft, contractVersion);
  const expectedRecordRevision = parseNonNegativeInteger(
    value.expectedRecordRevision,
    "Expected saved roll record revision",
  );
  if (expectedRecordRevision < 1) {
    invalidRequest("Expected saved roll record revision is invalid");
  }
  const input: UpdateSavedRollInputV1 = {
    ...parseMutationFields(value),
    draft: value.draft,
    expectedRecordRevision,
    id: parseId(value.id),
    pinned: value.pinned,
  };
  return resultResponse(await repository.update(input), contractVersion);
}

async function remove(request: Request, repository: D1SavedRollRepository): Promise<Response> {
  const value = await parseBody(request, [
    "actorUserId",
    "authorizationUpdatedAt",
    "expectedListRevision",
    "expectedRecordRevision",
    "id",
    "mutationId",
    "occurredAt",
    "owner",
  ]);
  const expectedRecordRevision = parseNonNegativeInteger(
    value.expectedRecordRevision,
    "Expected saved roll record revision",
  );
  if (expectedRecordRevision < 1) {
    invalidRequest("Expected saved roll record revision is invalid");
  }
  const input: DeleteSavedRollInputV1 = {
    ...parseMutationFields(value),
    expectedRecordRevision,
    id: parseId(value.id),
  };
  return resultResponse(await repository.delete(input));
}

async function removeBatch(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  const value = await parseBody(request, [
    "actorUserId",
    "authorizationUpdatedAt",
    "expectedListRevision",
    "mutationId",
    "occurredAt",
    "owner",
    "records",
  ]);
  if (
    !Array.isArray(value.records) ||
    value.records.length < 1 ||
    value.records.length > 100
  ) {
    invalidRequest("Library roll batch delete records are invalid");
  }
  const records = value.records.map((record) => {
    if (!isRecord(record) || !hasExactKeys(record, ["id", "revision"])) {
      invalidRequest("Library roll batch delete record is invalid");
    }
    const revision = parseNonNegativeInteger(
      record.revision,
      "Expected saved roll record revision",
    );
    if (revision < 1) {
      invalidRequest("Expected saved roll record revision is invalid");
    }
    return { id: parseId(record.id), revision };
  });
  if (new Set(records.map(({ id }) => id)).size !== records.length) {
    invalidRequest("Library roll batch delete ids must be unique");
  }
  const input: DeleteSavedRollBatchInputV2 = {
    ...parseMutationFields(value),
    records,
  };
  return resultResponse(await repository.deleteBatch(input));
}

async function reorder(request: Request, repository: D1SavedRollRepository): Promise<Response> {
  const value = await parseBody(request, [
    "actorUserId",
    "authorizationUpdatedAt",
    "expectedListRevision",
    "mutationId",
    "occurredAt",
    "orderedIds",
    "owner",
  ]);
  if (!Array.isArray(value.orderedIds) || value.orderedIds.length > 100) {
    invalidRequest("Saved roll reorder request is invalid");
  }
  const orderedIds = value.orderedIds.map(parseId);
  if (new Set(orderedIds).size !== orderedIds.length) {
    invalidRequest("Saved roll reorder ids must be unique");
  }
  const input: ReorderSavedRollsInputV1 = {
    ...parseMutationFields(value),
    orderedIds,
  };
  return resultResponse(await repository.reorder(input));
}

export function handleSavedRollRequest(
  request: Request,
  db: D1Database,
): Promise<Response> | null {
  if (request.method !== "POST") return null;
  const repository = new D1SavedRollRepository(db);
  const handler = (() => {
    switch (new URL(request.url).pathname) {
      case "/internal/saved-rolls/v1/ensure-user": return ensureUser;
      case "/internal/saved-rolls/v1/libraries": return libraries;
      case "/internal/saved-rolls/v1/search": return search;
      case "/internal/saved-rolls/v1/list": return list;
      case "/internal/saved-rolls/v1/get": return get;
      case "/internal/saved-rolls/v1/create": return create;
      case "/internal/saved-rolls/v1/copy": return copy;
      case "/internal/saved-rolls/v1/update": return update;
      case "/internal/saved-rolls/v1/delete": return remove;
      case "/internal/saved-rolls/v1/reorder": return reorder;
      case "/internal/saved-rolls/v2/libraries": return libraries;
      case "/internal/saved-rolls/v2/search":
        return (
          nextRequest: Request,
          nextRepository: D1SavedRollRepository,
        ) => search(nextRequest, nextRepository, 2);
      case "/internal/saved-rolls/v2/list":
        return (
          nextRequest: Request,
          nextRepository: D1SavedRollRepository,
        ) => list(nextRequest, nextRepository, 2);
      case "/internal/saved-rolls/v2/get":
        return (
          nextRequest: Request,
          nextRepository: D1SavedRollRepository,
        ) => get(nextRequest, nextRepository, 2);
      case "/internal/saved-rolls/v2/create":
        return (
          nextRequest: Request,
          nextRepository: D1SavedRollRepository,
        ) => createWithOperation(nextRequest, nextRepository, "create", 2);
      case "/internal/saved-rolls/v2/copy":
        return (
          nextRequest: Request,
          nextRepository: D1SavedRollRepository,
        ) => createWithOperation(nextRequest, nextRepository, "copy", 2);
      case "/internal/saved-rolls/v2/update":
        return (
          nextRequest: Request,
          nextRepository: D1SavedRollRepository,
        ) => update(nextRequest, nextRepository, 2);
      case "/internal/saved-rolls/v2/delete": return remove;
      case "/internal/saved-rolls/v2/delete-batch": return removeBatch;
      case "/internal/saved-rolls/v2/reorder": return reorder;
      default: return null;
    }
  })();
  if (handler === null) return null;
  return handler(request, repository).catch((error: unknown) =>
    error instanceof InvalidSavedRollRequest
      ? errorResponse("Saved roll request is invalid", 400)
      : errorResponse("Saved roll request failed", 500),
  );
}
