import { describe, expect, it } from "vitest";
import { addRecentRoll, clearRecentRolls, readRecentRolls } from "./recent-rolls";

const USER_ID = "100000000000000003";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("recent rolls", () => {
  it("stores at most three distinct compositions per signed-in user", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 5; index += 1) {
      addRecentRoll(storage, USER_ID, {
        notation: `1d20+${String(index)}`,
        title: index % 2 === 0 ? "Attack" : null,
        repetitions: 1,
      });
    }

    expect(readRecentRolls(storage, USER_ID)).toHaveLength(3);
    expect(readRecentRolls(storage, USER_ID)[0]?.notation).toBe("1d20+4");
    expect(readRecentRolls(storage, "100000000000000004")).toEqual([]);
  });

  it("moves a repeated composition to the front without duplicating it", () => {
    const storage = memoryStorage();
    const attack = { notation: "1d20+5", title: "Attack", repetitions: 2 };
    addRecentRoll(storage, USER_ID, attack);
    addRecentRoll(storage, USER_ID, { notation: "1d8", title: null, repetitions: 1 });
    addRecentRoll(storage, USER_ID, attack);

    expect(readRecentRolls(storage, USER_ID)).toEqual([
      attack,
      { notation: "1d8", title: null, repetitions: 1 },
    ]);
  });

  it("deduplicates saved rolls by source while retaining the latest revision", () => {
    const storage = memoryStorage();
    const first = {
      notation: "1d20+5",
      title: "Attack",
      repetitions: 1,
      libraryRoll: {
        scope: "personal" as const,
        id: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        displayName: "Longsword",
        nameColor: "#B0005A",
      },
    };
    const revised = {
      ...first,
      notation: "1d20+6",
      libraryRoll: { ...first.libraryRoll, revision: 2 },
    };
    addRecentRoll(storage, USER_ID, first);
    addRecentRoll(storage, USER_ID, { notation: "1d8", title: null, repetitions: 1 });
    addRecentRoll(storage, USER_ID, revised);

    expect(readRecentRolls(storage, USER_ID)).toEqual([
      revised,
      { notation: "1d8", title: null, repetitions: 1 },
    ]);
  });

  it("migrates version 2 saved rolls without a stored color", () => {
    const storage = memoryStorage();
    storage.setItem(
      `dice-witch-recent-rolls-v1:${USER_ID}`,
      JSON.stringify({
        version: 2,
        rolls: [
          {
            notation: "1d20+5",
            title: "Attack",
            repetitions: 1,
            libraryRoll: {
              scope: "personal",
              id: "00000000-0000-4000-8000-000000000001",
              revision: 1,
              displayName: "Longsword",
            },
          },
        ],
      }),
    );

    expect(readRecentRolls(storage, USER_ID)[0]?.libraryRoll?.nameColor).toBeNull();
  });

  it("reads and truncates legacy history", () => {
    const storage = memoryStorage();
    storage.setItem(
      `dice-witch-recent-rolls-v1:${USER_ID}`,
      JSON.stringify({
        version: 1,
        rolls: Array.from({ length: 5 }, (_, index) => ({
          notation: `1d20+${String(index)}`,
          title: null,
          repetitions: 1,
        })),
      }),
    );

    expect(readRecentRolls(storage, USER_ID)).toHaveLength(3);
  });

  it("clears only the current user's history", () => {
    const storage = memoryStorage();
    addRecentRoll(storage, USER_ID, { notation: "1d20", title: null, repetitions: 1 });
    clearRecentRolls(storage, USER_ID);

    expect(readRecentRolls(storage, USER_ID)).toEqual([]);
  });
});
