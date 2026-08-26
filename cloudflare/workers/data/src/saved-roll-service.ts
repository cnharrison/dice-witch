import { z } from "zod";
import {
  nonNegativeSafeIntegerSchema,
  snowflakeSchema,
  strictObjectSchema,
} from "../../../packages/discord-contracts/src/schema-primitives";
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
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuidV4Schema = z.string().regex(UUID_V4);
const DraftV1RequestSchema = strictObjectSchema({
  name: z.string(),
  notation: z.string(),
  repetitions: z.number(),
  title: z.union([z.null(), z.string()]),
  version: z.literal(1),
});
const DraftV2RequestSchema = strictObjectSchema({
  name: z.string(),
  nameColor: z.union([z.null(), z.string()]),
  notation: z.string(),
  repetitions: z.number(),
  title: z.union([z.null(), z.string()]),
  version: z.literal(2),
});
const SavedRollDraftRequestSchema = z.union([
  DraftV1RequestSchema,
  DraftV2RequestSchema,
]);
const boundedIntegerSchema = nonNegativeSafeIntegerSchema.max(
  Number.MAX_SAFE_INTEGER - 1,
);
const mutationIdSchema = z.string().min(1).max(255);
const jsonValueSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const SavedRollOwnerSchema = z.discriminatedUnion("type", [
  strictObjectSchema({ type: z.literal("user"), userId: snowflakeSchema }),
  strictObjectSchema({ guildId: snowflakeSchema, type: z.literal("guild") }),
]);
const mutationFields = {
  actorUserId: snowflakeSchema,
  authorizationUpdatedAt: z.nullable(boundedIntegerSchema),
  expectedListRevision: boundedIntegerSchema,
  mutationId: mutationIdSchema,
  occurredAt: boundedIntegerSchema,
  owner: SavedRollOwnerSchema,
};
const EnsureUserRequestSchema = strictObjectSchema({
  occurredAt: boundedIntegerSchema,
  userId: snowflakeSchema,
  username: z.string().min(1).max(32),
});
const LibrariesRequestSchema = strictObjectSchema({ userId: snowflakeSchema });
const SearchRequestSchema = strictObjectSchema({
  direction: z.enum(["asc", "desc"]),
  guildIds: z
    .array(snowflakeSchema)
    .max(200)
    .refine((guildIds) => new Set(guildIds).size === guildIds.length),
  offset: boundedIntegerSchema.max(20_000),
  query: z.string().min(2).max(128),
  sort: z.enum(["name", "roll", "created", "updated"]),
  userId: snowflakeSchema,
});
const ListRequestSchema = strictObjectSchema({ owner: SavedRollOwnerSchema });
const GetRequestSchema = strictObjectSchema({
  id: uuidV4Schema,
  owner: SavedRollOwnerSchema,
});
const CreateRequestSchema = strictObjectSchema({
  ...mutationFields,
  draft: SavedRollDraftRequestSchema,
  id: uuidV4Schema,
  pinned: z.boolean(),
});
const positiveRevisionSchema = boundedIntegerSchema.min(1);
const UpdateRequestSchema = strictObjectSchema({
  ...mutationFields,
  draft: SavedRollDraftRequestSchema,
  expectedRecordRevision: positiveRevisionSchema,
  id: uuidV4Schema,
  pinned: z.boolean(),
});
const DeleteRequestSchema = strictObjectSchema({
  ...mutationFields,
  expectedRecordRevision: positiveRevisionSchema,
  id: uuidV4Schema,
});
const DeleteBatchRequestSchema = strictObjectSchema({
  ...mutationFields,
  records: z
    .array(
      strictObjectSchema({
        id: uuidV4Schema,
        revision: positiveRevisionSchema,
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (records) => new Set(records.map(({ id }) => id)).size === records.length,
    ),
});
const ReorderRequestSchema = strictObjectSchema({
  ...mutationFields,
  orderedIds: z
    .array(uuidV4Schema)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
const LegacySavedRollSchema = z.looseObject({
  displayName: z.string(),
  id: z.string(),
  nameColor: jsonValueSchema,
  notation: z.string(),
  version: z.literal(1),
});

type SavedRollContractVersion = 1 | 2;
type JsonValue = z.output<typeof jsonValueSchema>;
type SavedRollDraftRequest = z.output<typeof SavedRollDraftRequestSchema>;
type SavedRollMutationFields = {
  actorUserId: string;
  authorizationUpdatedAt: number | null;
  expectedListRevision: number;
  mutationId: string;
  occurredAt: number;
  owner: SavedRollOwner;
};
type SavedRollServiceResult = { status: string };
type SavedRollHandler = (
  request: Request,
  repository: D1SavedRollRepository,
) => Promise<Response>;

class InvalidSavedRollRequest extends Error {}

function invalidRequest(message: string): never {
  throw new InvalidSavedRollRequest(message);
}

async function readBoundedRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
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
  const body = request.body;
  if (body === null) invalidRequest("Saved roll request body is missing");

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
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
    const json = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes);
    const result = schema.safeParse(JSON.parse(json));
    if (!result.success) {
      invalidRequest("Saved roll request has invalid fields");
    }
    return result.data;
  } catch (error) {
    if (error instanceof InvalidSavedRollRequest) throw error;
    invalidRequest("Saved roll request body is invalid");
  }
}

function parseMutationFields(
  value: SavedRollMutationFields,
): SavedRollMutationFields {
  const owner = value.owner;
  if (
    (owner.type === "user" &&
      (value.actorUserId !== owner.userId ||
        value.authorizationUpdatedAt !== null)) ||
    (owner.type === "guild" && value.authorizationUpdatedAt === null)
  ) {
    invalidRequest("Saved roll mutation authorization is invalid");
  }
  return value;
}

function validateDraft(
  value: SavedRollDraftRequest,
  contractVersion: SavedRollContractVersion,
): void {
  try {
    if (contractVersion === 1) parseSavedRollDraftV1(value);
    else parseSavedRollDraftV2(value);
  } catch {
    invalidRequest("Library roll draft is invalid");
  }
}

function projectSavedRollContract(
  value: JsonValue,
  contractVersion: SavedRollContractVersion,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => projectSavedRollContract(entry, contractVersion));
  }
  const object = jsonObjectSchema.safeParse(value);
  if (!object.success) return value;
  const projected = Object.fromEntries(
    Object.entries(object.data).map(([key, entry]) => [
      key,
      projectSavedRollContract(entry, contractVersion),
    ]),
  );
  if (LegacySavedRollSchema.safeParse(object.data).success) {
    if (contractVersion === 1) delete projected.nameColor;
    else projected.version = 2;
  }
  return projected;
}

function resultResponse(
  result: SavedRollServiceResult,
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
  const value = jsonValueSchema.parse(result);
  return Response.json(projectSavedRollContract(value, contractVersion), {
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
  const input = await readBoundedRequest(request, LibrariesRequestSchema);
  const result = {
    status: "found",
    libraries: await repository.listLibraryCandidates(input.userId),
  };
  return resultResponse(result);
}

async function search(
  request: Request,
  repository: D1SavedRollRepository,
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const input = await readBoundedRequest(request, SearchRequestSchema);
  return resultResponse(await repository.search(input), contractVersion);
}

async function list(
  request: Request,
  repository: D1SavedRollRepository,
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const input = await readBoundedRequest(request, ListRequestSchema);
  return resultResponse(
    await repository.list(input.owner),
    contractVersion,
  );
}

async function get(
  request: Request,
  repository: D1SavedRollRepository,
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const input = await readBoundedRequest(request, GetRequestSchema);
  return resultResponse(
    await repository.get(input.owner, input.id),
    contractVersion,
  );
}

async function createWithOperation(
  request: Request,
  repository: D1SavedRollRepository,
  operation: "create" | "copy",
  contractVersion: SavedRollContractVersion = 1,
): Promise<Response> {
  const requestInput = await readBoundedRequest(request, CreateRequestSchema);
  validateDraft(requestInput.draft, contractVersion);
  const input: CreateSavedRollInputV1 = {
    ...parseMutationFields(requestInput),
    draft: requestInput.draft,
    id: requestInput.id,
    operation,
    pinned: requestInput.pinned,
  };
  return resultResponse(await repository.create(input), contractVersion);
}

async function ensureUser(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  const input = await readBoundedRequest(request, EnsureUserRequestSchema);
  return resultResponse(
    await repository.ensureUser(input.userId, input.username, input.occurredAt),
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
  const requestInput = await readBoundedRequest(request, UpdateRequestSchema);
  validateDraft(requestInput.draft, contractVersion);
  const input: UpdateSavedRollInputV1 = {
    ...parseMutationFields(requestInput),
    draft: requestInput.draft,
    expectedRecordRevision: requestInput.expectedRecordRevision,
    id: requestInput.id,
    pinned: requestInput.pinned,
  };
  return resultResponse(await repository.update(input), contractVersion);
}

async function remove(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  const requestInput = await readBoundedRequest(request, DeleteRequestSchema);
  const input: DeleteSavedRollInputV1 = {
    ...parseMutationFields(requestInput),
    expectedRecordRevision: requestInput.expectedRecordRevision,
    id: requestInput.id,
  };
  return resultResponse(await repository.delete(input));
}

async function removeBatch(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  const requestInput = await readBoundedRequest(
    request,
    DeleteBatchRequestSchema,
  );
  const input: DeleteSavedRollBatchInputV2 = {
    ...parseMutationFields(requestInput),
    records: requestInput.records,
  };
  return resultResponse(await repository.deleteBatch(input));
}

async function reorder(
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  const requestInput = await readBoundedRequest(request, ReorderRequestSchema);
  const input: ReorderSavedRollsInputV1 = {
    ...parseMutationFields(requestInput),
    orderedIds: requestInput.orderedIds,
  };
  return resultResponse(await repository.reorder(input));
}

async function runHandler(
  handler: SavedRollHandler,
  request: Request,
  repository: D1SavedRollRepository,
): Promise<Response> {
  try {
    return await handler(request, repository);
  } catch (error) {
    return error instanceof InvalidSavedRollRequest
      ? errorResponse("Saved roll request is invalid", 400)
      : errorResponse("Saved roll request failed", 500);
  }
}

export function handleSavedRollRequest(
  request: Request,
  db: D1Database,
): Promise<Response> | null {
  if (request.method !== "POST") return null;
  const repository = new D1SavedRollRepository(db);
  const handler: SavedRollHandler | null = (() => {
    switch (new URL(request.url).pathname) {
      case "/internal/saved-rolls/v1/ensure-user":
        return ensureUser;
      case "/internal/saved-rolls/v1/libraries":
        return libraries;
      case "/internal/saved-rolls/v1/search":
        return search;
      case "/internal/saved-rolls/v1/list":
        return list;
      case "/internal/saved-rolls/v1/get":
        return get;
      case "/internal/saved-rolls/v1/create":
        return create;
      case "/internal/saved-rolls/v1/copy":
        return copy;
      case "/internal/saved-rolls/v1/update":
        return update;
      case "/internal/saved-rolls/v1/delete":
        return remove;
      case "/internal/saved-rolls/v1/reorder":
        return reorder;
      case "/internal/saved-rolls/v2/libraries":
        return libraries;
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
      case "/internal/saved-rolls/v2/delete":
        return remove;
      case "/internal/saved-rolls/v2/delete-batch":
        return removeBatch;
      case "/internal/saved-rolls/v2/reorder":
        return reorder;
      default:
        return null;
    }
  })();
  if (handler === null) return null;
  return runHandler(handler, request, repository);
}
