import * as z from "zod";
import { customFetch } from "./api";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const HEX_COLOR = /^#[0-9A-F]{6}$/u;

export type SavedRollScope =
  | { type: "personal" }
  | { type: "guild"; guildId: string; guildName: string };

export type SavedRollDraft = {
  version: 2;
  name: string;
  nameColor: string | null;
  notation: string;
  title: string | null;
  repetitions: number;
};

export type SavedRoll = {
  version: 2;
  id: string;
  displayName: string;
  comparisonKey: string;
  notation: string;
  title: string | null;
  repetitions: number;
  nameColor: string | null;
  pinned: boolean;
  manualOrder: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type SavedRollList = {
  listRevision: number;
  savedRolls: SavedRoll[];
};

export type SavedRollLibrary = {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
};

export type SavedRollSearchSort = "name" | "roll" | "created" | "updated";

export type SavedRollSearchEntry = {
  savedRoll: SavedRoll;
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

export type SavedRollSearchPage = {
  entries: SavedRollSearchEntry[];
  hasMore: boolean;
  total: number;
};

export type SavedRollMutation =
  | { status: "applied" | "existing"; listRevision: number; savedRoll?: SavedRoll; recordRevision?: number }
  | { status: "list_revision_conflict" | "name_conflict" | "record_set_conflict"; listRevision: number }
  | { status: "record_revision_conflict"; recordRevision: number }
  | { status: "cap_reached"; listRevision: number; limit: number }
  | { status: "missing" | "mutation_conflict" | "unauthorized" };

export interface SavedRollApi {
  listSavedRollLibraries: () => Promise<SavedRollLibrary[]>;
  searchSavedRolls: (input: {
    query: string;
    offset: number;
    sort: SavedRollSearchSort;
    direction: "asc" | "desc";
  }) => Promise<SavedRollSearchPage>;
  listSavedRolls: (scope: SavedRollScope) => Promise<SavedRollList>;
  createSavedRoll: (
    scope: SavedRollScope,
    input: { draft: SavedRollDraft; expectedListRevision: number },
  ) => Promise<SavedRollMutation>;
  copySavedRoll: (
    scope: SavedRollScope,
    input: { draft: SavedRollDraft; expectedListRevision: number },
  ) => Promise<SavedRollMutation>;
  updateSavedRoll: (
    scope: SavedRollScope,
    savedRoll: SavedRoll,
    input: { draft: SavedRollDraft; expectedListRevision: number },
  ) => Promise<SavedRollMutation>;
  deleteSavedRoll: (
    scope: SavedRollScope,
    savedRoll: SavedRoll,
    expectedListRevision: number,
  ) => Promise<SavedRollMutation>;
  deleteSavedRollBatch: (
    scope: SavedRollScope,
    savedRolls: readonly SavedRoll[],
    expectedListRevision: number,
  ) => Promise<SavedRollMutation>;
  reorderSavedRolls: (
    scope: SavedRollScope,
    orderedIds: readonly string[],
    expectedListRevision: number,
  ) => Promise<SavedRollMutation>;
}

export class SavedRollApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const jsonValueSchema = z.json();
type JsonValue = z.infer<typeof jsonValueSchema>;

const savedRollSchema = z.object({
  version: z.literal(2),
  id: z.string().regex(UUID_V4),
  displayName: z.string(),
  comparisonKey: z.string(),
  notation: z.string(),
  title: z.string().nullable(),
  repetitions: z.number().int().min(1).max(50),
  nameColor: z.string().regex(HEX_COLOR).nullable(),
  pinned: z.boolean(),
  manualOrder: z.number().int().nonnegative(),
  revision: z.number().int().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).refine(({ createdAt, updatedAt }) => updatedAt >= createdAt);

const savedRollLibrarySchema = z.strictObject({
  guildId: z.string().regex(SNOWFLAKE),
  guildName: z.string().min(1).max(255),
  guildIcon: z.string().max(255).nullable(),
  isAdmin: z.boolean(),
  isDiceWitchAdmin: z.boolean(),
});

const revisionSchema = z.number().int().nonnegative();
const savedRollSourceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("personal") }),
  z.strictObject({
    type: z.literal("guild"),
    guildId: z.string().regex(SNOWFLAKE),
    guildName: z.string().min(1).max(255),
    guildIcon: z.string().max(255).nullable(),
  }),
]);

function parseApiValue<Schema extends z.ZodType>(
  schema: Schema,
  value: JsonValue,
  message: string,
): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SavedRollApiError(message, 502);
  return parsed.data;
}

export function savedRollQueryKey(scope: SavedRollScope): readonly string[] {
  return [
    "saved-rolls",
    scope.type,
    scope.type === "guild" ? scope.guildId : "me",
  ];
}

function scopePath(scope: SavedRollScope): string {
  return scope.type === "personal"
    ? "/api/saved-rolls/v2/me"
    : `/api/guilds/${scope.guildId}/saved-rolls/v2`;
}

async function responseValue(response: Response): Promise<JsonValue> {
  let value: JsonValue;
  try {
    value = jsonValueSchema.parse(await response.json());
  } catch {
    throw new SavedRollApiError("Saved roll response is invalid", 502);
  }
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(value);
    throw new SavedRollApiError(
      error.success ? error.data.error : "Saved roll request failed",
      response.status,
    );
  }
  return value;
}

async function listSavedRollLibrariesWith(
  fetchResponse: typeof customFetch,
): Promise<SavedRollLibrary[]> {
  const value = await responseValue(
    await fetchResponse("/api/saved-rolls/v2/libraries"),
  );
  const response = parseApiValue(
    z.strictObject({
      status: z.literal("found"),
      libraries: z.array(savedRollLibrarySchema).max(200),
    }),
    value,
    "Saved roll library response is invalid",
  );
  return response.libraries;
}

async function searchSavedRollsWith(
  fetchResponse: typeof customFetch,
  input: {
    query: string;
    offset: number;
    sort: SavedRollSearchSort;
    direction: "asc" | "desc";
  },
): Promise<SavedRollSearchPage> {
  const parameters = new URLSearchParams({
    query: input.query,
    offset: String(input.offset),
    sort: input.sort,
    direction: input.direction,
  });
  const value = await responseValue(
    await fetchResponse(`/api/saved-rolls/v2/search?${parameters.toString()}`),
  );
  return parseApiValue(
    z.strictObject({
      status: z.literal("found"),
      entries: z.array(z.strictObject({
        savedRoll: savedRollSchema,
        listRevision: revisionSchema,
        source: savedRollSourceSchema,
        canManage: z.boolean(),
      })).max(50),
      hasMore: z.boolean(),
      total: revisionSchema,
    }).transform(({ entries, hasMore, total }) => ({ entries, hasMore, total })),
    value,
    "Saved roll search response is invalid",
  );
}

async function listSavedRollsWith(
  fetchResponse: typeof customFetch,
  scope: SavedRollScope,
): Promise<SavedRollList> {
  const value = await responseValue(await fetchResponse(scopePath(scope)));
  const response = parseApiValue(
    z.strictObject({
      status: z.literal("found"),
      listRevision: revisionSchema,
      savedRolls: z.array(jsonValueSchema),
    }),
    value,
    "Saved roll list response is invalid",
  );
  return {
    listRevision: response.listRevision,
    savedRolls: response.savedRolls.map((savedRoll) =>
      parseApiValue(savedRollSchema, savedRoll, "Saved roll response is invalid")
    ),
  };
}

const mutationSchema = z.union([
  z.strictObject({ status: z.enum(["missing", "mutation_conflict", "unauthorized"]) }),
  z.strictObject({
    status: z.enum(["list_revision_conflict", "name_conflict", "record_set_conflict"]),
    listRevision: revisionSchema,
  }),
  z.strictObject({
    status: z.literal("record_revision_conflict"),
    recordRevision: revisionSchema,
  }),
  z.strictObject({
    status: z.literal("cap_reached"),
    listRevision: revisionSchema,
    limit: revisionSchema,
  }),
  z.strictObject({
    status: z.enum(["applied", "existing"]),
    listRevision: revisionSchema,
    savedRoll: savedRollSchema.optional(),
    recordRevision: revisionSchema.optional(),
  }),
]);

function parseMutation(value: JsonValue): SavedRollMutation {
  return parseApiValue(
    mutationSchema,
    value,
    "Saved roll mutation response is invalid",
  );
}

async function mutate(
  fetchResponse: typeof customFetch,
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: JsonValue,
): Promise<SavedRollMutation> {
  const response = await fetchResponse(path, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  let value: JsonValue;
  try {
    value = jsonValueSchema.parse(await response.json());
  } catch {
    throw new SavedRollApiError("Saved roll mutation response is invalid", 502);
  }
  const status = z.object({ status: z.string() }).safeParse(value);
  if (
    response.ok ||
    ([403, 404, 409].includes(response.status) && status.success)
  ) {
    return parseMutation(value);
  }
  const error = z.object({ error: z.string() }).safeParse(value);
  throw new SavedRollApiError(
    error.success ? error.data.error : "Saved roll request failed",
    response.status,
  );
}

export function createSavedRollApi(
  fetchResponse: typeof customFetch,
): SavedRollApi {
  return {
    listSavedRollLibraries: () => listSavedRollLibrariesWith(fetchResponse),
    searchSavedRolls: (input) => searchSavedRollsWith(fetchResponse, input),
    listSavedRolls: (scope) => listSavedRollsWith(fetchResponse, scope),
    createSavedRoll: (scope, input) =>
      mutate(fetchResponse, scopePath(scope), "POST", {
        id: crypto.randomUUID(),
        ...input,
        pinned: false,
      }),
    copySavedRoll: (scope, input) =>
      mutate(fetchResponse, `${scopePath(scope)}/copy`, "POST", {
        id: crypto.randomUUID(),
        ...input,
        pinned: false,
      }),
    updateSavedRoll: (scope, savedRoll, input) =>
      mutate(fetchResponse, `${scopePath(scope)}/${savedRoll.id}`, "PATCH", {
        ...input,
        expectedRecordRevision: savedRoll.revision,
        pinned: false,
      }),
    deleteSavedRoll: (scope, savedRoll, expectedListRevision) =>
      mutate(fetchResponse, `${scopePath(scope)}/${savedRoll.id}`, "DELETE", {
        expectedListRevision,
        expectedRecordRevision: savedRoll.revision,
      }),
    deleteSavedRollBatch: (scope, savedRolls, expectedListRevision) =>
      mutate(fetchResponse, `${scopePath(scope)}/delete-batch`, "POST", {
        expectedListRevision,
        records: savedRolls.map(({ id, revision }) => ({ id, revision })),
      }),
    reorderSavedRolls: (scope, orderedIds, expectedListRevision) =>
      mutate(fetchResponse, `${scopePath(scope)}/reorder`, "POST", {
        expectedListRevision,
        orderedIds,
      }),
  };
}

export const {
  listSavedRollLibraries,
  searchSavedRolls,
  listSavedRolls,
  createSavedRoll,
  copySavedRoll,
  updateSavedRoll,
  deleteSavedRoll,
  deleteSavedRollBatch,
  reorderSavedRolls,
} = createSavedRollApi(customFetch);

export function savedRollDraft(savedRoll: SavedRoll): SavedRollDraft {
  return {
    version: 2,
    name: savedRoll.displayName,
    nameColor: savedRoll.nameColor,
    notation: savedRoll.notation,
    title: savedRoll.title,
    repetitions: savedRoll.repetitions,
  };
}
