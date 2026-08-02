import { describe, expect, it } from "vitest";
import {
  buildSavedRollAutocompleteResponse,
  buildSavedRollPickerResponse,
  parseVisibleSavedRollList,
  resolveSavedRollSelection,
} from "../../workers/interactions/src/saved-roll-picker";

const mine = {
  version: 1 as const,
  id: "123e4567-e89b-42d3-a456-426614174000",
  owner: { type: "user" as const, userId: "100000000000000004" },
  displayName: "Attack",
  comparisonKey: "attack",
  notation: "2d20+5",
  title: "Sword",
  repetitions: 2,
  pinned: true,
  manualOrder: 0,
  revision: 3,
  createdByUserId: "100000000000000004",
  updatedByUserId: "100000000000000004",
  createdAt: 100,
  updatedAt: 200,
};
const server = {
  ...mine,
  id: "223e4567-e89b-42d3-a456-426614174000",
  owner: { type: "guild" as const, guildId: "100000000000000002" },
  title: null,
};

describe("saved-roll picker model", () => {
  it("strictly parses owner-scoped Data list responses", () => {
    expect(
      parseVisibleSavedRollList(
        { status: "found", listRevision: 4, savedRolls: [mine] },
        mine.owner,
      ),
    ).toEqual({ listRevision: 4, savedRolls: [mine] });

    expect(() =>
      parseVisibleSavedRollList(
        {
          status: "found",
          listRevision: 4,
          savedRolls: [{ ...mine, unexpected: true }],
        },
        mine.owner,
      ),
    ).toThrow("Saved roll list response is invalid");
  });

  it("returns at most 25 labeled autocomplete choices and resolves ambiguity explicitly", () => {
    const records = Array.from({ length: 30 }, (_, index) => ({
      ...mine,
      id: `${String(index).padStart(8, "0")}-e89b-42d3-a456-426614174000`,
      displayName: `Attack ${String(index)}`,
      comparisonKey: `attack ${String(index)}`,
    }));
    const response = buildSavedRollAutocompleteResponse("attack", records, [server]);
    expect(response.type).toBe(8);
    expect(response.data.choices).toHaveLength(25);
    expect(response.data.choices[0]).toMatchObject({
      name: "Personal · Attack 0",
      value: "mine:00000000-e89b-42d3-a456-426614174000",
    });

    expect(resolveSavedRollSelection("Attack", [mine], [server])).toEqual({
      status: "ambiguous",
    });
    expect(
      resolveSavedRollSelection(
        `server:${server.id}`,
        [mine],
        [server],
      ),
    ).toEqual({ status: "found", scope: "server", savedRoll: server });
  });

  it("builds a private V2 picker whose selection runs immediately", () => {
    const response = buildSavedRollPickerResponse({
      sessionId: "100000000000000020",
      scope: "mine",
      page: 0,
      mine: [mine],
      server: [server],
    });

    expect(response.type).toBe(4);
    expect(response.data.flags).toBe((1 << 15) | 64);
    expect(response.data).not.toHaveProperty("content");
    const serialized = JSON.stringify(response.data.components);
    expect(serialized).toContain("## Personal library\\nPage 1 of 1");
    expect(serialized).toContain(
      '"label":"Personal","custom_id":"saved-roll:v1:100000000000000020:mine"',
    );
    expect(serialized).toContain(
      '"custom_id":"saved-roll:v1:100000000000000020:select"',
    );
    expect(serialized).toContain(
      `"label":"Attack","value":"mine:${mine.id}","description":"2d20+5"`,
    );
  });

  it("links directly to the web Library without empty picker controls", () => {
    const response = buildSavedRollPickerResponse({
      sessionId: "100000000000000020",
      scope: "mine",
      page: 0,
      mine: [],
      server: [],
      libraryUrl: "https://example.com/app/library",
    });

    expect(response.data.flags).toBe((1 << 15) | 64);
    expect(response.data).not.toHaveProperty("content");
    const serialized = JSON.stringify(response.data.components);
    expect(serialized).toContain("Your library is empty");
    expect(serialized).toContain(
      '"label":"Open library","url":"https://example.com/app/library"',
    );
  });

  it("paginates at most 20 saved rolls into one select menu", () => {
    const records = Array.from({ length: 21 }, (_, index) => ({
      ...mine,
      id: `${String(index).padStart(8, "0")}-e89b-42d3-a456-426614174000`,
      displayName: `Attack ${String(index)}`,
      comparisonKey: `attack ${String(index)}`,
    }));
    const firstPage = buildSavedRollPickerResponse({
      sessionId: "100000000000000020",
      scope: "mine",
      page: 0,
      mine: records,
      server: [],
    });
    const secondPage = buildSavedRollPickerResponse({
      sessionId: "100000000000000020",
      scope: "mine",
      page: 1,
      mine: records,
      server: [],
    });

    const firstContainer = firstPage.data.components[0] as {
      components: Array<Record<string, unknown>>;
    };
    const secondContainer = secondPage.data.components[0] as {
      components: Array<Record<string, unknown>>;
    };
    const firstSelectRow = firstContainer.components[2] as {
      components: Array<{ options: unknown[] }>;
    };
    const secondSelectRow = secondContainer.components[2] as {
      components: Array<{ options: unknown[] }>;
    };
    expect(firstSelectRow.components[0]?.options).toHaveLength(20);
    expect(secondSelectRow.components[0]?.options).toHaveLength(1);
    expect(secondContainer.components[0]).toEqual({
      type: 10,
      content: "## Personal library\nPage 2 of 2",
    });
  });
});
