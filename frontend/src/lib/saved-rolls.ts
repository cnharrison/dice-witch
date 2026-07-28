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

export class SavedRollApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function parseSavedRoll(value: unknown): SavedRoll {
  if (
    !isRecord(value) ||
    value.version !== 2 ||
    typeof value.id !== "string" ||
    !UUID_V4.test(value.id) ||
    typeof value.displayName !== "string" ||
    typeof value.comparisonKey !== "string" ||
    typeof value.notation !== "string" ||
    (value.title !== null && typeof value.title !== "string") ||
    typeof value.repetitions !== "number" ||
    !Number.isSafeInteger(value.repetitions) ||
    value.repetitions < 1 ||
    value.repetitions > 50 ||
    (value.nameColor !== null &&
      (typeof value.nameColor !== "string" || !HEX_COLOR.test(value.nameColor))) ||
    typeof value.pinned !== "boolean" ||
    typeof value.manualOrder !== "number" ||
    !Number.isSafeInteger(value.manualOrder) ||
    value.manualOrder < 0 ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    typeof value.updatedAt !== "number" ||
    !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < value.createdAt
  ) {
    throw new SavedRollApiError("Saved roll response is invalid", 502);
  }
  return {
    version: 2,
    id: value.id,
    displayName: value.displayName,
    comparisonKey: value.comparisonKey,
    notation: value.notation,
    title: value.title,
    repetitions: value.repetitions,
    nameColor: value.nameColor,
    pinned: value.pinned,
    manualOrder: value.manualOrder,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

async function responseValue(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new SavedRollApiError("Saved roll response is invalid", 502);
  }
  if (!response.ok) {
    const message =
      isRecord(value) && typeof value.error === "string"
        ? value.error
        : "Saved roll request failed";
    throw new SavedRollApiError(message, response.status);
  }
  return value;
}

export async function listSavedRollLibraries(): Promise<SavedRollLibrary[]> {
  const value = await responseValue(
    await customFetch("/api/saved-rolls/v2/libraries"),
  );
  if (
    !isRecord(value) ||
    value.status !== "found" ||
    !Array.isArray(value.libraries) ||
    value.libraries.length > 200
  ) {
    throw new SavedRollApiError("Saved roll library response is invalid", 502);
  }
  return value.libraries.map((library) => {
    if (
      !isRecord(library) ||
      typeof library.guildId !== "string" ||
      !SNOWFLAKE.test(library.guildId) ||
      typeof library.guildName !== "string" ||
      library.guildName.length < 1 ||
      library.guildName.length > 255 ||
      (library.guildIcon !== null &&
        (typeof library.guildIcon !== "string" ||
          library.guildIcon.length > 255)) ||
      typeof library.isAdmin !== "boolean" ||
      typeof library.isDiceWitchAdmin !== "boolean"
    ) {
      throw new SavedRollApiError("Saved roll library response is invalid", 502);
    }
    return {
      guildId: library.guildId,
      guildName: library.guildName,
      guildIcon: library.guildIcon,
      isAdmin: library.isAdmin,
      isDiceWitchAdmin: library.isDiceWitchAdmin,
    };
  });
}

export async function searchSavedRolls(input: {
  query: string;
  offset: number;
  sort: SavedRollSearchSort;
  direction: "asc" | "desc";
}): Promise<SavedRollSearchPage> {
  const parameters = new URLSearchParams({
    query: input.query,
    offset: String(input.offset),
    sort: input.sort,
    direction: input.direction,
  });
  const value = await responseValue(
    await customFetch(`/api/saved-rolls/v2/search?${parameters.toString()}`),
  );
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
    throw new SavedRollApiError("Saved roll search response is invalid", 502);
  }
  return {
    entries: value.entries.map((entry) => {
      if (
        !isRecord(entry) ||
        !validRevision(entry.listRevision) ||
        !isRecord(entry.source) ||
        typeof entry.canManage !== "boolean"
      ) {
        throw new SavedRollApiError("Saved roll search response is invalid", 502);
      }
      const source = (() => {
        if (entry.source.type === "personal") {
          return { type: "personal" as const };
        }
        if (
          entry.source.type !== "guild" ||
          typeof entry.source.guildId !== "string" ||
          !SNOWFLAKE.test(entry.source.guildId) ||
          typeof entry.source.guildName !== "string" ||
          entry.source.guildName.length < 1 ||
          entry.source.guildName.length > 255 ||
          (entry.source.guildIcon !== null &&
            (typeof entry.source.guildIcon !== "string" ||
              entry.source.guildIcon.length > 255))
        ) {
          throw new SavedRollApiError("Saved roll search response is invalid", 502);
        }
        return {
          type: "guild" as const,
          guildId: entry.source.guildId,
          guildName: entry.source.guildName,
          guildIcon: entry.source.guildIcon,
        };
      })();
      return {
        savedRoll: parseSavedRoll(entry.savedRoll),
        listRevision: entry.listRevision,
        source,
        canManage: entry.canManage,
      };
    }),
    hasMore: value.hasMore,
    total: value.total,
  };
}

export async function listSavedRolls(scope: SavedRollScope): Promise<SavedRollList> {
  const value = await responseValue(await customFetch(scopePath(scope)));
  if (
    !isRecord(value) ||
    value.status !== "found" ||
    typeof value.listRevision !== "number" ||
    !Number.isSafeInteger(value.listRevision) ||
    value.listRevision < 0 ||
    !Array.isArray(value.savedRolls)
  ) {
    throw new SavedRollApiError("Saved roll list response is invalid", 502);
  }
  return {
    listRevision: value.listRevision,
    savedRolls: value.savedRolls.map(parseSavedRoll),
  };
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseMutation(value: unknown): SavedRollMutation {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new SavedRollApiError("Saved roll mutation response is invalid", 502);
  }
  if (
    (value.status === "missing" ||
      value.status === "mutation_conflict" ||
      value.status === "unauthorized") &&
    Object.keys(value).length === 1
  ) {
    return { status: value.status };
  }
  if (
    (value.status === "list_revision_conflict" ||
      value.status === "name_conflict" ||
      value.status === "record_set_conflict") &&
    validRevision(value.listRevision)
  ) {
    return { status: value.status, listRevision: value.listRevision };
  }
  if (
    value.status === "record_revision_conflict" &&
    validRevision(value.recordRevision)
  ) {
    return { status: value.status, recordRevision: value.recordRevision };
  }
  if (
    value.status === "cap_reached" &&
    validRevision(value.listRevision) &&
    validRevision(value.limit)
  ) {
    return {
      status: value.status,
      listRevision: value.listRevision,
      limit: value.limit,
    };
  }
  if (
    (value.status === "applied" || value.status === "existing") &&
    validRevision(value.listRevision) &&
    (value.savedRoll === undefined || isRecord(value.savedRoll)) &&
    (value.recordRevision === undefined || validRevision(value.recordRevision))
  ) {
    return {
      status: value.status,
      listRevision: value.listRevision,
      ...(value.savedRoll === undefined
        ? {}
        : { savedRoll: parseSavedRoll(value.savedRoll) }),
      ...(value.recordRevision === undefined
        ? {}
        : { recordRevision: value.recordRevision }),
    };
  }
  throw new SavedRollApiError("Saved roll mutation response is invalid", 502);
}

async function mutate(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
): Promise<SavedRollMutation> {
  const response = await customFetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new SavedRollApiError("Saved roll mutation response is invalid", 502);
  }
  if (
    response.ok ||
    ([403, 404, 409].includes(response.status) &&
      isRecord(value) &&
      typeof value.status === "string")
  ) {
    return parseMutation(value);
  }
  const message =
    isRecord(value) && typeof value.error === "string"
      ? value.error
      : "Saved roll request failed";
  throw new SavedRollApiError(message, response.status);
}

export function createSavedRoll(
  scope: SavedRollScope,
  input: {
    draft: SavedRollDraft;
    expectedListRevision: number;
  },
): Promise<SavedRollMutation> {
  return mutate(scopePath(scope), "POST", {
    id: crypto.randomUUID(),
    ...input,
    pinned: false,
  });
}

export function copySavedRoll(
  scope: SavedRollScope,
  input: {
    draft: SavedRollDraft;
    expectedListRevision: number;
  },
): Promise<SavedRollMutation> {
  return mutate(`${scopePath(scope)}/copy`, "POST", {
    id: crypto.randomUUID(),
    ...input,
    pinned: false,
  });
}

export function updateSavedRoll(
  scope: SavedRollScope,
  savedRoll: SavedRoll,
  input: {
    draft: SavedRollDraft;
    expectedListRevision: number;
  },
): Promise<SavedRollMutation> {
  return mutate(`${scopePath(scope)}/${savedRoll.id}`, "PATCH", {
    ...input,
    expectedRecordRevision: savedRoll.revision,
    pinned: false,
  });
}

export function deleteSavedRoll(
  scope: SavedRollScope,
  savedRoll: SavedRoll,
  expectedListRevision: number,
): Promise<SavedRollMutation> {
  return mutate(`${scopePath(scope)}/${savedRoll.id}`, "DELETE", {
    expectedListRevision,
    expectedRecordRevision: savedRoll.revision,
  });
}

export function deleteSavedRollBatch(
  scope: SavedRollScope,
  savedRolls: readonly SavedRoll[],
  expectedListRevision: number,
): Promise<SavedRollMutation> {
  return mutate(`${scopePath(scope)}/delete-batch`, "POST", {
    expectedListRevision,
    records: savedRolls.map(({ id, revision }) => ({ id, revision })),
  });
}

export function reorderSavedRolls(
  scope: SavedRollScope,
  orderedIds: readonly string[],
  expectedListRevision: number,
): Promise<SavedRollMutation> {
  return mutate(`${scopePath(scope)}/reorder`, "POST", {
    expectedListRevision,
    orderedIds,
  });
}

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
