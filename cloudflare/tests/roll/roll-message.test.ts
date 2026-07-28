import { describe, expect, it } from "vitest";
import {
  buildRollClatterMessage,
  buildRollErrorMessage,
  buildRollResultMessage,
} from "../../packages/discord-contracts/src";
import { executeRoll } from "../../packages/roll-domain/src";

function result(notation: string[]) {
  return executeRoll({ notation, seed: 0 });
}

describe("buildRollClatterMessage", () => {
  it("preserves the legacy singular and plural default phrases", () => {
    const single = result(["1d20"]);
    const multiple = result(["2d20"]);
    const singleDie = single.outcomes[0]?.dice[0];
    const multipleDice = multiple.outcomes[0]?.dice;
    if (singleDie === undefined || multipleDice === undefined) {
      throw new Error("Clatter fixture dice are missing");
    }
    singleDie.rolled = 10;
    multipleDice.forEach((die) => {
      die.rolled = 10;
    });

    expect(buildRollClatterMessage(single, 1)).toEqual({
      content: "_...the die clatters across the table..._",
    });
    expect(buildRollClatterMessage(multiple, 1)).toEqual({
      content: "_...the dice clatter across the table..._",
    });
  });

  it("replays the same atmospheric variant from the persisted seed", () => {
    const roll = result(["1d20"]);
    const die = roll.outcomes[0]?.dice[0];
    if (die === undefined) throw new Error("Clatter fixture die is missing");
    die.rolled = 20;

    const first = buildRollClatterMessage(roll, 0x1234_abcd);
    const retry = buildRollClatterMessage(roll, 0x1234_abcd);

    expect(retry).toEqual(first);
    expect(first.content).not.toBe("_...the die clatters across the table..._");
  });

  it("accepts persisted seeds with the unsigned high bit set", () => {
    const roll = result(["1d20"]);
    const die = roll.outcomes[0]?.dice[0];
    if (die === undefined) throw new Error("Clatter fixture die is missing");
    die.rolled = 20;

    expect(() => buildRollClatterMessage(roll, 0xffff_ffff)).not.toThrow();
  });
});

describe("buildRollResultMessage", () => {
  it("preserves the production result embed and attachment semantics", () => {
    const roll = result(["1d20+5", "2d6"]);

    expect(
      buildRollResultMessage(roll, {
        source: "discord",
        title: "Enchanted sword",
        username: "roller",
        filename: "dice-1400000000000000000.png",
        clatter: "_...the dice clatter across the table..._",
      }),
    ).toEqual({
      content: "_...the dice clatter across the table..._",
      embeds: [
        {
          title: "Enchanted sword",
          description: `${roll.outcomes[0]?.output}\n${roll.outcomes[1]?.output} \ngrand total = ${String(
            roll.outcomes.reduce((total, outcome) => total + outcome.total, 0),
          )}`,
          color: 0x966f33,
          footer: { text: "sent to roller via discord" },
          image: { url: "attachment://dice-1400000000000000000.png" },
        },
      ],
    });
  });

  it("attributes a saved roll in the footer without replacing its title", () => {
    const message = buildRollResultMessage(result(["1d20"]), {
      source: "discord",
      title: "Initiative",
      username: "roller",
      filename: "dice.png",
      savedRoll: { scope: "Server", name: "Opening attack" },
      copyCustomId: "saved-roll:v1:1400000000000000000:copy",
    });

    expect(message.embeds?.[0]).toMatchObject({
      title: "Initiative",
      footer: {
        text: "sent to roller via discord · from server library · Opening attack",
      },
    });
    expect(
      buildRollResultMessage(result(["1d20"]), {
        source: "discord",
        title: null,
        username: "roller",
        filename: "dice.png",
        savedRoll: { scope: "Mine", name: "Initiative" },
      }).embeds?.[0]?.footer,
    ).toEqual({
      text: "sent to roller via discord · from personal library · Initiative",
    });
    expect(message.components).toEqual([
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            label: "Copy to Personal",
            custom_id: "saved-roll:v1:1400000000000000000:copy",
          },
        ],
      },
    ]);
  });

  it("omits only an absent optional title", () => {
    const message = buildRollResultMessage(result(["1d20"]), {
      source: "web",
      title: null,
      username: "roller",
      filename: "dice.png",
    });

    expect(message.embeds?.[0]).not.toHaveProperty("title");
    expect(message.embeds?.[0]?.description).toMatch(/^1d20:/);
    expect(message.embeds?.[0]?.footer).toEqual({
      text: "sent to roller via web",
    });
  });

  it("uses the current limit message for rejected oversized rolls", () => {
    expect(buildRollErrorMessage(result(["51d6"]))).toEqual({
      content: "50 dice max and 999 sides max, sorry 😅",
    });
  });

  it("uses the current invalid-notation message without promising an unavailable DM", () => {
    expect(buildRollErrorMessage(result(["not-dice"]))).toEqual({
      content: "🚫🎲 Invalid dice notation!",
    });
  });

  it("returns an explicit Discord limit response instead of retrying forever", () => {
    const roll = result(["1d20"]);
    const outcome = roll.outcomes[0];
    if (outcome === undefined) throw new Error("Fixture outcome is missing");
    outcome.output = "x".repeat(4_097);

    expect(
      buildRollResultMessage(roll, {
        source: "discord",
        title: null,
        username: "roller",
        filename: "dice.png",
      }),
    ).toEqual({
      content: "Roll result exceeds Discord's 4,096-character message limit.",
    });
  });

  it("rejects outcomes that cannot produce a complete result image", () => {
    expect(() =>
      buildRollResultMessage(result(["not-dice"]), {
        source: "discord",
        title: null,
        username: "roller",
        filename: "dice.png",
      }),
    ).toThrow("Roll result has no displayable outcomes");
  });
});
