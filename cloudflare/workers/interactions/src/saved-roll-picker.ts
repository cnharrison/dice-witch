import { parseSavedRollNameV1 } from "../../../packages/saved-rolls/src/name";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const AUTOCOMPLETE_CHOICE_LIMIT = 25;
const PICKER_PAGE_SIZE = 20;
const MAX_CHOICE_LABEL_UTF16_LENGTH = 100;
const MAX_BUTTON_LABEL_UTF16_LENGTH = 80;

export type SavedRollOwnerV1 =
  | { type: "user"; userId: string }
  | { type: "guild"; guildId: string };

export type VisibleSavedRollV1 = {
  version: 1;
  id: string;
  owner: SavedRollOwnerV1;
  displayName: string;
  comparisonKey: string;
  notation: string;
  title: string | null;
  repetitions: number;
  pinned: boolean;
  manualOrder: number;
  revision: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: number;
  updatedAt: number;
};

export type VisibleSavedRollList = {
  listRevision: number;
  savedRolls: VisibleSavedRollV1[];
};

export type SavedRollScope = "mine" | "server";

export async function fetchVisibleSavedRolls(
  dataService: Fetcher,
  userId: string,
  guildId: string | null,
): Promise<{ mine: VisibleSavedRollList; server: VisibleSavedRollList }> {
  const mineOwner: SavedRollOwnerV1 = { type: "user", userId };
  const serverOwner: SavedRollOwnerV1 | null =
    guildId === null ? null : { type: "guild", guildId };
  const request = (owner: SavedRollOwnerV1) =>
    dataService.fetch(
      new Request("https://data.internal/internal/saved-rolls/v1/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner }),
      }),
    );
  const [mineResponse, serverResponse] = await Promise.all([
    request(mineOwner),
    serverOwner === null ? null : request(serverOwner),
  ]);
  if (!mineResponse.ok && mineResponse.status !== 404) {
    throw new Error("Personal Library is unavailable");
  }
  if (
    serverResponse !== null &&
    !serverResponse.ok &&
    serverResponse.status !== 404
  ) {
    throw new Error("Server Library is unavailable");
  }
  return {
    mine: parseVisibleSavedRollList(await mineResponse.json(), mineOwner),
    server:
      serverOwner === null || serverResponse === null
        ? { listRevision: 0, savedRolls: [] }
        : parseVisibleSavedRollList(await serverResponse.json(), serverOwner),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseOwner(value: unknown): SavedRollOwnerV1 {
  if (!isRecord(value)) throw new Error("Saved roll list response is invalid");
  if (
    exactKeys(value, ["type", "userId"]) &&
    value.type === "user" &&
    typeof value.userId === "string" &&
    SNOWFLAKE.test(value.userId)
  ) {
    return { type: "user", userId: value.userId };
  }
  if (
    exactKeys(value, ["guildId", "type"]) &&
    value.type === "guild" &&
    typeof value.guildId === "string" &&
    SNOWFLAKE.test(value.guildId)
  ) {
    return { type: "guild", guildId: value.guildId };
  }
  throw new Error("Saved roll list response is invalid");
}

function sameOwner(left: SavedRollOwnerV1, right: SavedRollOwnerV1): boolean {
  return left.type === right.type &&
    (left.type === "user"
      ? right.type === "user" && left.userId === right.userId
      : right.type === "guild" && left.guildId === right.guildId);
}

function parseSavedRoll(value: unknown, expectedOwner: SavedRollOwnerV1): VisibleSavedRollV1 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "comparisonKey",
      "createdAt",
      "createdByUserId",
      "displayName",
      "id",
      "manualOrder",
      "notation",
      "owner",
      "pinned",
      "repetitions",
      "revision",
      "title",
      "updatedAt",
      "updatedByUserId",
      "version",
    ]) ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !UUID_V4.test(value.id) ||
    typeof value.displayName !== "string" ||
    value.displayName.length < 1 ||
    typeof value.comparisonKey !== "string" ||
    value.comparisonKey.length < 1 ||
    typeof value.notation !== "string" ||
    value.notation.length < 1 ||
    (value.title !== null && (typeof value.title !== "string" || value.title.length < 1)) ||
    !nonNegativeSafeInteger(value.repetitions) ||
    value.repetitions < 1 ||
    typeof value.pinned !== "boolean" ||
    !nonNegativeSafeInteger(value.manualOrder) ||
    !nonNegativeSafeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.createdByUserId !== "string" ||
    !SNOWFLAKE.test(value.createdByUserId) ||
    typeof value.updatedByUserId !== "string" ||
    !SNOWFLAKE.test(value.updatedByUserId) ||
    !nonNegativeSafeInteger(value.createdAt) ||
    !nonNegativeSafeInteger(value.updatedAt)
  ) {
    throw new Error("Saved roll list response is invalid");
  }
  const owner = parseOwner(value.owner);
  if (!sameOwner(owner, expectedOwner)) {
    throw new Error("Saved roll list response is invalid");
  }
  return {
    version: 1,
    id: value.id,
    owner,
    displayName: value.displayName,
    comparisonKey: value.comparisonKey,
    notation: value.notation,
    title: value.title,
    repetitions: value.repetitions,
    pinned: value.pinned,
    manualOrder: value.manualOrder,
    revision: value.revision,
    createdByUserId: value.createdByUserId,
    updatedByUserId: value.updatedByUserId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function parseVisibleSavedRollList(
  value: unknown,
  owner: SavedRollOwnerV1,
): VisibleSavedRollList {
  if (isRecord(value) && exactKeys(value, ["status"]) && value.status === "missing") {
    return { listRevision: 0, savedRolls: [] };
  }
  if (
    !isRecord(value) ||
    !exactKeys(value, ["listRevision", "savedRolls", "status"]) ||
    value.status !== "found" ||
    !nonNegativeSafeInteger(value.listRevision) ||
    !Array.isArray(value.savedRolls)
  ) {
    throw new Error("Saved roll list response is invalid");
  }
  return {
    listRevision: value.listRevision,
    savedRolls: value.savedRolls.map((record) => parseSavedRoll(record, owner)),
  };
}

function selectionValue(scope: SavedRollScope, id: string): string {
  return `${scope}:${id}`;
}

function boundedDiscordText(value: string, maximumUtf16Length: number): string {
  let result = "";
  for (const codePoint of value) {
    if (result.length + codePoint.length > maximumUtf16Length) break;
    result += codePoint;
  }
  return result;
}

function boundedLabel(scope: SavedRollScope, displayName: string): string {
  const prefix = scope === "mine" ? "Personal · " : "Server · ";
  return boundedDiscordText(
    `${prefix}${displayName}`,
    MAX_CHOICE_LABEL_UTF16_LENGTH,
  );
}

function matchingRecords(query: string, records: readonly VisibleSavedRollV1[]): VisibleSavedRollV1[] {
  if (query.length === 0) return [...records];
  try {
    const key = parseSavedRollNameV1(query).comparisonKey;
    return records.filter((record) => record.comparisonKey.includes(key));
  } catch {
    return [];
  }
}

export function buildSavedRollAutocompleteResponse(
  query: string,
  mine: readonly VisibleSavedRollV1[],
  server: readonly VisibleSavedRollV1[],
) {
  const choices = [
    ...matchingRecords(query, mine).map((savedRoll) => ({ scope: "mine" as const, savedRoll })),
    ...matchingRecords(query, server).map((savedRoll) => ({ scope: "server" as const, savedRoll })),
  ].slice(0, AUTOCOMPLETE_CHOICE_LIMIT).map(({ scope, savedRoll }) => ({
    name: boundedLabel(scope, savedRoll.displayName),
    value: selectionValue(scope, savedRoll.id),
  }));
  return { type: 8, data: { choices } } as const;
}

export type SavedRollSelectionResult =
  | { status: "found"; scope: SavedRollScope; savedRoll: VisibleSavedRollV1 }
  | { status: "missing" | "ambiguous" };

export function resolveSavedRollSelection(
  selection: string,
  mine: readonly VisibleSavedRollV1[],
  server: readonly VisibleSavedRollV1[],
): SavedRollSelectionResult {
  const opaque = /^(mine|server):(.+)$/.exec(selection);
  if (opaque !== null) {
    const scope = opaque[1] as SavedRollScope;
    const id = opaque[2];
    if (id === undefined || !UUID_V4.test(id)) return { status: "missing" };
    const savedRoll = (scope === "mine" ? mine : server).find((record) => record.id === id);
    return savedRoll === undefined ? { status: "missing" } : { status: "found", scope, savedRoll };
  }
  let comparisonKey: string;
  try {
    comparisonKey = parseSavedRollNameV1(selection).comparisonKey;
  } catch {
    return { status: "missing" };
  }
  const matches = [
    ...mine.map((savedRoll) => ({ scope: "mine" as const, savedRoll })),
    ...server.map((savedRoll) => ({ scope: "server" as const, savedRoll })),
  ].filter(({ savedRoll }) => savedRoll.comparisonKey === comparisonKey);
  if (matches.length === 0) return { status: "missing" };
  if (matches.length > 1) return { status: "ambiguous" };
  const match = matches[0];
  return match === undefined ? { status: "missing" } : { status: "found", ...match };
}

function customId(sessionId: string, action: string): string {
  return `saved-roll:v1:${sessionId}:${action}`;
}

export function buildSavedRollPickerResponse(input: {
  sessionId: string;
  scope: SavedRollScope;
  page: number;
  mine: readonly VisibleSavedRollV1[];
  server: readonly VisibleSavedRollV1[];
  libraryUrl?: string;
  update?: boolean;
}) {
  if (input.mine.length === 0 && input.server.length === 0) {
    if (input.libraryUrl === undefined) {
      throw new Error("Library URL is missing");
    }
    const libraryUrl = new URL(input.libraryUrl);
    if (
      libraryUrl.protocol !== "https:" ||
      libraryUrl.username !== "" ||
      libraryUrl.password !== "" ||
      libraryUrl.hash !== ""
    ) {
      throw new Error("Library URL is invalid");
    }
    return {
      type: input.update === true ? 7 : 4,
      data: {
        ...(input.update === true ? {} : { flags: 64 }),
        content: "Your Library is empty. Log in to Dice Witch to add a saved roll.",
        allowed_mentions: { parse: [] as string[] },
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "Open Library",
                url: libraryUrl.href,
              },
            ],
          },
        ],
      },
    } as const;
  }

  const records = input.scope === "mine" ? input.mine : input.server;
  const pageCount = Math.max(1, Math.ceil(records.length / PICKER_PAGE_SIZE));
  const page = Math.min(Math.max(input.page, 0), pageCount - 1);
  const visible = records.slice(
    page * PICKER_PAGE_SIZE,
    (page + 1) * PICKER_PAGE_SIZE,
  );
  const components: Array<Record<string, unknown>> = [
    {
      type: 1,
      components: [
        { type: 2, style: input.scope === "mine" ? 1 : 2, label: "Personal", custom_id: customId(input.sessionId, "mine") },
        { type: 2, style: input.scope === "server" ? 1 : 2, label: "Server", custom_id: customId(input.sessionId, "server"), disabled: input.server.length === 0 },
        { type: 2, style: 2, label: "│", custom_id: customId(input.sessionId, "separator"), disabled: true },
        { type: 2, style: 2, label: "Previous", custom_id: customId(input.sessionId, "previous"), disabled: page === 0 },
        { type: 2, style: 2, label: "Next", custom_id: customId(input.sessionId, "next"), disabled: page + 1 >= pageCount },
      ],
    },
  ];
  for (let offset = 0; offset < visible.length; offset += 5) {
    components.push({
      type: 1,
      components: visible.slice(offset, offset + 5).map((savedRoll) => ({
        type: 2,
        style: 2,
        label: boundedDiscordText(
          savedRoll.displayName,
          MAX_BUTTON_LABEL_UTF16_LENGTH,
        ),
        custom_id: customId(
          input.sessionId,
          `run:${selectionValue(input.scope, savedRoll.id)}`,
        ),
      })),
    });
  }
  return {
    type: input.update === true ? 7 : 4,
    data: {
      ...(input.update === true ? {} : { flags: 64 }),
      content: records.length === 0
        ? `No ${input.scope === "mine" ? "Personal" : "Server"} Library rolls are available.`
        : `${input.scope === "mine" ? "Personal" : "Server"} · page ${String(page + 1)} of ${String(pageCount)}`,
      allowed_mentions: { parse: [] as string[] },
      components,
    },
  };
}
