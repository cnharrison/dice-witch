import { z } from "zod";
import type { DiscordContainerChild } from "../../../packages/discord-contracts/src";
import type { SchemaInput } from "../../../packages/discord-contracts/src/schema-primitives";
import { parseSavedRollNameV1 } from "../../../packages/saved-rolls/src/name";
import type { FetchPort } from "./ports";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAVED_ROLL_SELECTION = /^(mine|server):[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/u;
const AUTOCOMPLETE_CHOICE_LIMIT = 25;
const PICKER_PAGE_SIZE = 20;
const MAX_CHOICE_LABEL_UTF16_LENGTH = 100;

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
  dataService: FetchPort,
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
    throw new Error("Personal library is unavailable");
  }
  if (
    serverResponse !== null &&
    !serverResponse.ok &&
    serverResponse.status !== 404
  ) {
    throw new Error("Server library is unavailable");
  }
  return {
    mine: parseVisibleSavedRollList(await mineResponse.json(), mineOwner),
    server:
      serverOwner === null || serverResponse === null
        ? { listRevision: 0, savedRolls: [] }
        : parseVisibleSavedRollList(await serverResponse.json(), serverOwner),
  };
}

const nonNegativeSafeIntegerSchema = z.number()
  .refine(Number.isSafeInteger)
  .nonnegative();
const positiveSafeIntegerSchema = nonNegativeSafeIntegerSchema.positive();
const SavedRollOwnerSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("user"), userId: z.string().regex(SNOWFLAKE) }),
  z.strictObject({ type: z.literal("guild"), guildId: z.string().regex(SNOWFLAKE) }),
]);
const VisibleSavedRollSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().regex(UUID_V4),
  owner: SavedRollOwnerSchema,
  displayName: z.string().min(1),
  comparisonKey: z.string().min(1),
  notation: z.string().min(1),
  title: z.string().min(1).nullable(),
  repetitions: positiveSafeIntegerSchema,
  pinned: z.boolean(),
  manualOrder: nonNegativeSafeIntegerSchema,
  revision: positiveSafeIntegerSchema,
  createdByUserId: z.string().regex(SNOWFLAKE),
  updatedByUserId: z.string().regex(SNOWFLAKE),
  createdAt: nonNegativeSafeIntegerSchema,
  updatedAt: nonNegativeSafeIntegerSchema,
});
const VisibleSavedRollListResultSchema = z.union([
  z.strictObject({ status: z.literal("missing") }),
  z.strictObject({
    status: z.literal("found"),
    listRevision: nonNegativeSafeIntegerSchema,
    savedRolls: z.array(VisibleSavedRollSchema),
  }),
]);

function sameOwner(left: SavedRollOwnerV1, right: SavedRollOwnerV1): boolean {
  return left.type === right.type &&
    (left.type === "user"
      ? right.type === "user" && left.userId === right.userId
      : right.type === "guild" && left.guildId === right.guildId);
}

export function parseVisibleSavedRollList(
  value: SchemaInput,
  owner: SavedRollOwnerV1,
): VisibleSavedRollList {
  const result = VisibleSavedRollListResultSchema.safeParse(value);
  if (!result.success) throw new Error("Saved roll list response is invalid");
  if (result.data.status === "missing") {
    return { listRevision: 0, savedRolls: [] };
  }
  if (result.data.savedRolls.some((savedRoll) => !sameOwner(savedRoll.owner, owner))) {
    throw new Error("Saved roll list response is invalid");
  }
  return {
    listRevision: result.data.listRevision,
    savedRolls: result.data.savedRolls,
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
  if (SAVED_ROLL_SELECTION.test(selection)) {
    const scope: SavedRollScope = selection.startsWith("mine:")
      ? "mine"
      : "server";
    const id = selection.slice(scope.length + 1);
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
    const parse: string[] = [];
    return {
      type: input.update === true ? 7 : 4,
      data: {
        flags: (1 << 15) | 64,
        allowed_mentions: { parse },
        components: [
          {
            type: 17,
            accent_color: 0x99_99_99,
            components: [
              {
                type: 10,
                content: "## Personal library\nYour library is empty. Log in to Dice Witch to add a saved roll.",
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Open library",
                    url: libraryUrl.href,
                  },
                ],
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
  const containerComponents: DiscordContainerChild[] = [
    {
      type: 10,
      content: `## ${input.scope === "mine" ? "Personal" : "Server"} library\nPage ${String(page + 1)} of ${String(pageCount)}`,
    },
    {
      type: 1,
      components: [
        { type: 2, style: input.scope === "mine" ? 1 : 2, label: "Personal", custom_id: customId(input.sessionId, "mine") },
        { type: 2, style: input.scope === "server" ? 1 : 2, label: "Server", custom_id: customId(input.sessionId, "server"), disabled: input.server.length === 0 },
        { type: 2, style: 2, label: "Previous", custom_id: customId(input.sessionId, "previous"), disabled: page === 0 },
        { type: 2, style: 2, label: "Next", custom_id: customId(input.sessionId, "next"), disabled: page + 1 >= pageCount },
      ],
    },
  ];
  if (visible.length > 0) {
    containerComponents.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: customId(input.sessionId, "select"),
          placeholder: "Choose a roll to run",
          min_values: 1,
          max_values: 1,
          options: visible.map((savedRoll) => ({
            label: boundedDiscordText(
              savedRoll.displayName,
              MAX_CHOICE_LABEL_UTF16_LENGTH,
            ),
            value: selectionValue(input.scope, savedRoll.id),
            description: boundedDiscordText(
              savedRoll.notation,
              MAX_CHOICE_LABEL_UTF16_LENGTH,
            ),
          })),
        },
      ],
    });
  } else {
    containerComponents.push({
      type: 10,
      content: `No ${input.scope === "mine" ? "personal" : "server"} library rolls are available.`,
    });
  }
  const parse: string[] = [];
  return {
    type: input.update === true ? 7 : 4,
    data: {
      flags: (1 << 15) | 64,
      allowed_mentions: { parse },
      components: [
        {
          type: 17,
          accent_color: 0x99_99_99,
          components: containerComponents,
        },
      ],
    },
  };
}
