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

  it("builds one-click saved-roll buttons with actor-session custom ids", () => {
    const response = buildSavedRollPickerResponse({
      sessionId: "100000000000000020",
      scope: "mine",
      page: 0,
      mine: [mine],
      server: [server],
    });

    const rows = response.data.components as Array<{
      components: Array<Record<string, unknown>>;
    }>;
    expect(response.type).toBe(4);
    expect(response.data.flags).toBe(64);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.components[0]).toMatchObject({ label: "Personal" });
    expect(rows[0]?.components[2]).toMatchObject({
      label: "│",
      disabled: true,
    });
    expect(rows[0]?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          custom_id: "saved-roll:v1:100000000000000020:mine",
        }),
      ]),
    );
    expect(rows[1]?.components).toEqual([
      {
        type: 2,
        style: 2,
        label: "Attack",
        custom_id: `saved-roll:v1:100000000000000020:run:mine:${mine.id}`,
      },
    ]);
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

    expect(response.data.content).toBe(
      "Your Library is empty. Log in to Dice Witch to add a saved roll.",
    );
    expect(response.data.components).toEqual([
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Open Library",
            url: "https://example.com/app/library",
          },
        ],
      },
    ]);
  });

  it("packs at most 20 saved-roll buttons into the five Discord rows", () => {
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

    expect(firstPage.data.components).toHaveLength(5);
    expect(firstPage.data.components.slice(1).flatMap((row) => row.components)).toHaveLength(20);
    expect(secondPage.data.components).toHaveLength(2);
    expect(secondPage.data.content).toBe("Personal · page 2 of 2");
  });
});
