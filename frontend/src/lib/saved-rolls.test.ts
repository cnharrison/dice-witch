import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customFetch as productionFetch } from "./api";
import {
  createSavedRollApi,
  savedRollDraft,
  type SavedRollScope,
} from "./saved-rolls";

const customFetch = vi.fn<typeof productionFetch>();
const {
  createSavedRoll,
  deleteSavedRollBatch,
  listSavedRollLibraries,
  listSavedRolls,
  searchSavedRolls,
} = createSavedRollApi(customFetch);

const scope: SavedRollScope = { type: "personal" };
const savedRoll = {
  version: 2,
  id: "00000000-0000-4000-8000-000000000001",
  owner: { type: "user", userId: "100000000000000003" },
  displayName: "Fireball",
  comparisonKey: "fireball",
  notation: "8d6",
  title: null,
  repetitions: 1,
  nameColor: null,
  pinned: false,
  manualOrder: 0,
  revision: 1,
  createdByUserId: "100000000000000003",
  updatedByUserId: "100000000000000003",
  createdAt: 1_767_225_600_123,
  updatedAt: 1_767_225_600_123,
};

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  customFetch.mockReset();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "00000000-0000-4000-8000-000000000010",
  );
});

describe("saved-roll frontend API", () => {
  it("parses an exact personal list", async () => {
    customFetch.mockResolvedValue(Response.json({
      status: "found",
      listRevision: 4,
      savedRolls: [savedRoll],
    }));

    await expect(listSavedRolls(scope)).resolves.toEqual({
      listRevision: 4,
      savedRolls: [expect.objectContaining({
        id: savedRoll.id,
        displayName: "Fireball",
        notation: "8d6",
      })],
    });
    expect(customFetch).toHaveBeenCalledWith("/api/saved-rolls/v2/me");
  });

  it("parses authorized libraries and paginated global search results", async () => {
    customFetch.mockResolvedValueOnce(Response.json({
      status: "found",
      libraries: [{
        guildId: "100000000000000001",
        guildName: "Moonlit Library",
        guildIcon: null,
        isAdmin: false,
        isDiceWitchAdmin: false,
      }],
    }));
    await expect(listSavedRollLibraries()).resolves.toEqual([
      expect.objectContaining({ guildName: "Moonlit Library" }),
    ]);

    customFetch.mockResolvedValueOnce(Response.json({
      status: "found",
      entries: [{
        savedRoll,
        listRevision: 4,
        source: {
          type: "guild",
          guildId: "100000000000000001",
          guildName: "Moonlit Library",
          guildIcon: null,
        },
        canManage: false,
      }],
      hasMore: true,
      total: 1,
    }));
    await expect(searchSavedRolls({
      query: "fire",
      offset: 0,
      sort: "name",
      direction: "asc",
    })).resolves.toMatchObject({
      entries: [{ source: { guildName: "Moonlit Library" }, canManage: false }],
      hasMore: true,
      total: 1,
    });
    expect(customFetch).toHaveBeenLastCalledWith(
      "/api/saved-rolls/v2/search?query=fire&offset=0&sort=name&direction=asc",
    );
  });

  it("rejects out-of-contract list and record revisions", async () => {
    customFetch.mockResolvedValueOnce(Response.json({
      status: "found",
      listRevision: -1,
      savedRolls: [],
    }));
    await expect(listSavedRolls(scope)).rejects.toThrow(
      "Saved roll list response is invalid",
    );

    customFetch.mockResolvedValueOnce(Response.json({
      status: "found",
      listRevision: 1,
      savedRolls: [{ ...savedRoll, revision: 0 }],
    }));
    await expect(listSavedRolls(scope)).rejects.toThrow(
      "Saved roll response is invalid",
    );
  });

  it("creates with independent record and idempotency UUIDs", async () => {
    customFetch.mockResolvedValue(Response.json({
      status: "applied",
      listRevision: 1,
      savedRoll,
    }));
    const result = await createSavedRoll(scope, {
      expectedListRevision: 0,
      draft: {
        version: 2,
        name: "Fireball",
        notation: "8d6",
        title: null,
        repetitions: 1,
        nameColor: null,
      },
    });

    expect(result.status).toBe("applied");
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const [, init] = customFetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "idempotency-key": "00000000-0000-4000-8000-000000000010",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      id: "00000000-0000-4000-8000-000000000010",
      expectedListRevision: 0,
      draft: { name: "Fireball" },
    });
  });

  it("sends one atomic batch-delete mutation with record revisions", async () => {
    customFetch.mockResolvedValue(Response.json({
      status: "applied",
      listRevision: 5,
    }));

    await expect(
      deleteSavedRollBatch(scope, [savedRoll], 4),
    ).resolves.toMatchObject({ status: "applied", listRevision: 5 });

    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const [path, init] = customFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/saved-rolls/v2/me/delete-batch");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      expectedListRevision: 4,
      records: [{ id: savedRoll.id, revision: savedRoll.revision }],
    });
  });

  it("preserves a custom name color when deriving a copy draft", () => {
    expect(savedRollDraft({ ...savedRoll, nameColor: "#A1B2C3" })).toEqual({
      version: 2,
      name: "Fireball",
      nameColor: "#A1B2C3",
      notation: "8d6",
      title: null,
      repetitions: 1,
    });
  });

  it("returns structured optimistic conflicts for the UI", async () => {
    customFetch.mockResolvedValue(Response.json(
      { status: "list_revision_conflict", listRevision: 7 },
      { status: 409 },
    ));
    await expect(createSavedRoll(scope, {
      expectedListRevision: 3,
      draft: {
        version: 2,
        name: "Fireball",
        notation: "8d6",
        title: null,
        repetitions: 1,
        nameColor: null,
      },
    })).resolves.toEqual({
      status: "list_revision_conflict",
      listRevision: 7,
    });
  });
});
