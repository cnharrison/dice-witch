import { describe, expect, it } from "vitest";
import {
  buildRollClatterMessage,
  buildRollErrorMessage,
  buildRollResultMessage,
  DISCORD_COMPONENTS_V2_FLAG,
  rollResultText,
} from "../../packages/discord-contracts/src";
import { executeRoll } from "../../packages/roll-domain/src";

function result(notation: string[]) {
  return executeRoll({ notation, seed: 0 });
}

function clatterText(message: ReturnType<typeof buildRollClatterMessage>): string {
  const component = message.components[0];
  if (component?.type !== 10) throw new Error("Clatter text is missing");
  return component.content;
}

function componentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(componentText).join("\n");
  if (typeof value !== "object" || value === null) return "";
  return Object.values(value).map(componentText).filter(Boolean).join("\n");
}

describe("buildRollClatterMessage", () => {
  it("preserves the legacy singular and plural default phrases as V2 text", () => {
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
      flags: DISCORD_COMPONENTS_V2_FLAG,
      components: [
        { type: 10, content: "_...the die clatters across the table..._" },
      ],
    });
    expect(buildRollClatterMessage(multiple, 1)).toEqual({
      flags: DISCORD_COMPONENTS_V2_FLAG,
      components: [
        { type: 10, content: "_...the dice clatter across the table..._" },
      ],
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
    expect(clatterText(first)).not.toBe(
      "_...the die clatters across the table..._",
    );
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
  it("renders clatter, heading, result, image, and attribution as V2 components", () => {
    const roll = result(["1d20+5", "2d6"]);
    const description = `${roll.outcomes[0]?.output}\n${roll.outcomes[1]?.output} \ngrand total = ${String(
      roll.outcomes.reduce((total, outcome) => total + outcome.total, 0),
    )}`;

    expect(
      buildRollResultMessage(roll, {
        source: "discord",
        title: "Enchanted sword",
        repetitions: 1,
        username: "roller",
        filename: "dice-1400000000000000000.png",
        clatter: "_...the dice clatter across the table..._",
        saveRollCustomId: "save-roll:v1:d:1400000000000000000",
      }),
    ).toEqual({
      flags: DISCORD_COMPONENTS_V2_FLAG,
      components: [
        { type: 10, content: "_...the dice clatter across the table..._" },
        {
          type: 17,
          accent_color: 0x96_6f_33,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: "## Enchanted sword" }],
              accessory: {
                type: 2,
                style: 2,
                label: "Save",
                custom_id: "save-roll:v1:d:1400000000000000000",
              },
            },
            { type: 10, content: description },
            {
              type: 12,
              items: [
                {
                  media: {
                    url: "attachment://dice-1400000000000000000.png",
                  },
                  description: "Rendered dice result",
                },
              ],
            },
            { type: 14, divider: true, spacing: 1 },
            { type: 10, content: "-# sent to roller via discord" },
          ],
        },
      ],
    });
  });

  it("hides titled result text behind the upper-right action and moves Save below", () => {
    const roll = result(["1d20+5", "2d6"]);
    const message = buildRollResultMessage(roll, {
      source: "discord",
      title: "Enchanted sword",
      repetitions: 1,
      username: "roller",
      filename: "dice.png",
      saveRollCustomId: "save-roll:v1:d:1400000000000000000",
      textResultCustomId: "text-result:v1:d:1400000000000000000",
    });
    const container = message.components[0];
    if (container?.type !== 17) throw new Error("Result container is missing");

    expect(container.components[0]).toEqual({
      type: 9,
      components: [{ type: 10, content: "## Enchanted sword" }],
      accessory: {
        type: 2,
        style: 2,
        label: "Text result",
        custom_id: "text-result:v1:d:1400000000000000000",
      },
    });
    expect(container.components[1]).toMatchObject({ type: 12 });
    expect(container.components[2]).toEqual({
      type: 1,
      components: [{
        type: 2,
        style: 2,
        label: "Save",
        custom_id: "save-roll:v1:d:1400000000000000000",
      }],
    });
    expect(componentText(message)).not.toContain(rollResultText(roll));
    expect(componentText(message)).toContain("sent to roller via discord");
  });

  it("uses a top action row without inventing a heading for untitled hidden results", () => {
    const roll = result(["1d20"]);
    const message = buildRollResultMessage(roll, {
      source: "web",
      title: null,
      repetitions: 1,
      username: "roller",
      filename: "dice.png",
      textResultCustomId:
        "text-result:v1:w:1400000000000000004.123e4567-e89b-42d3-a456-426614174000",
    });
    const container = message.components[0];
    if (container?.type !== 17) throw new Error("Result container is missing");

    expect(container.components[0]).toEqual({
      type: 1,
      components: [{
        type: 2,
        style: 2,
        label: "Text result",
        custom_id:
          "text-result:v1:w:1400000000000000004.123e4567-e89b-42d3-a456-426614174000",
      }],
    });
    expect(container.components[1]).toMatchObject({ type: 12 });
    expect(componentText(message)).not.toContain("## Roll");
    expect(componentText(message)).not.toContain(rollResultText(roll));
  });

  it("keeps an untitled library replay untitled with Save and attribution", () => {
    const roll = result(["1d20"]);
    const message = buildRollResultMessage(roll, {
      source: "discord",
      title: null,
      repetitions: 1,
      username: "roller",
      filename: "dice.png",
      savedRoll: { scope: "Mine", name: "Initiative" },
      saveRollCustomId: "save-roll:v1:d:1400000000000000000",
    });
    const container = message.components[0];
    if (container?.type !== 17) throw new Error("Result Container is missing");

    expect(container.components).not.toContainEqual(
      expect.objectContaining({
        type: 9,
        components: [{ type: 10, content: "## Initiative" }],
      }),
    );
    expect(container.components).toContainEqual(
      expect.objectContaining({
        type: 9,
        components: [{ type: 10, content: rollResultText(roll) }],
        accessory: {
          type: 2,
          style: 2,
          label: "Save",
          custom_id: "save-roll:v1:d:1400000000000000000",
        },
      }),
    );
    expect(container.components.at(-1)).toEqual({
      type: 10,
      content:
        "-# sent to roller via discord · from personal library · Initiative",
    });
  });

  it("keeps an untitled fresh result full width without a Save roll action", () => {
    const message = buildRollResultMessage(result(["1d20"]), {
      source: "web",
      title: null,
      repetitions: 1,
      username: "roller",
      filename: "dice.png",
    });
    const container = message.components[0];
    if (container?.type !== 17) throw new Error("Result Container is missing");

    const resultText = container.components[0];
    expect(resultText?.type).toBe(10);
    if (resultText?.type !== 10) throw new Error("Result text is missing");
    expect(resultText.content).toMatch(/^1d20:/);
    expect(container.components.some((component) => component.type === 9)).toBe(
      false,
    );
    expect(container.components.at(-1)).toEqual({
      type: 10,
      content: "-# sent to roller via web",
    });
  });

  it("rejects Save on an untitled single fresh roll", () => {
    expect(() =>
      buildRollResultMessage(result(["1d20"]), {
        source: "discord",
        title: null,
        repetitions: 1,
        username: "roller",
        filename: "dice.png",
        saveRollCustomId: "save-roll:v2:d:1400000000000000000",
      })
    ).toThrow("Roll result message options are invalid");
  });

  it("keeps an untitled repeated roll untitled with Save beside its result", () => {
    const roll = result(["1d20"]);
    const message = buildRollResultMessage(roll, {
      source: "discord",
      title: null,
      repetitions: 3,
      username: "roller",
      filename: "dice.png",
      saveRollCustomId: "save-roll:v2:d:1400000000000000000",
    });
    const container = message.components[0];
    if (container?.type !== 17) throw new Error("Result Container is missing");

    expect(container.components[0]).toEqual({
      type: 9,
      components: [{ type: 10, content: rollResultText(roll) }],
      accessory: {
        type: 2,
        style: 2,
        label: "Save",
        custom_id: "save-roll:v2:d:1400000000000000000",
      },
    });
    expect(container.components.at(-1)).toEqual({
      type: 10,
      content: "-# sent to roller via discord",
    });
  });

  it("escapes user-authored Markdown in headings and attribution", () => {
    const message = buildRollResultMessage(result(["1d20"]), {
      source: "discord",
      title: "# **Attack**",
      repetitions: 1,
      username: "_roller_",
      filename: "dice.png",
      savedRoll: { scope: "Server", name: "[Opening](https://example.com)" },
      saveRollCustomId: "save-roll:v1:d:1400000000000000000",
    });
    const container = message.components[0];
    if (container?.type !== 17) throw new Error("Result Container is missing");

    expect(container.components[0]).toMatchObject({
      type: 9,
      components: [{ type: 10, content: "## \\# \\*\\*Attack\\*\\*" }],
    });
    expect(container.components.at(-1)).toEqual({
      type: 10,
      content:
        "-# sent to \\_roller\\_ via discord · from server library · \\[Opening\\]\\(https://example\\.com\\)",
    });
  });

  it("uses the current limit message for rejected oversized rolls", () => {
    expect(buildRollErrorMessage(result(["51d6"]))).toEqual({
      flags: DISCORD_COMPONENTS_V2_FLAG,
      components: [
        {
          type: 17,
          accent_color: 0xe7_4c_3c,
          components: [
            { type: 10, content: "50 dice max and 999 sides max, sorry 😅" },
          ],
        },
      ],
    });
  });

  it("uses the current invalid-notation message without promising an unavailable DM", () => {
    expect(buildRollErrorMessage(result(["not-dice"]))).toEqual({
      flags: DISCORD_COMPONENTS_V2_FLAG,
      components: [
        {
          type: 17,
          accent_color: 0xe7_4c_3c,
          components: [{ type: 10, content: "🚫🎲 Invalid dice notation!" }],
        },
      ],
    });
  });

  it("keeps the rendered image in an explicit V2 limit response", () => {
    const roll = result(["1d20"]);
    const outcome = roll.outcomes[0];
    if (outcome === undefined) throw new Error("Fixture outcome is missing");
    outcome.output = "x".repeat(4_001);

    const message = buildRollResultMessage(roll, {
      source: "discord",
      title: null,
      repetitions: 1,
      username: "roller",
      filename: "dice.png",
    });
    const container = message.components[0];
    if (container?.type !== 17) throw new Error("Result Container is missing");
    expect(container.components).toContainEqual({
      type: 10,
      content: "Roll result exceeds Discord's 4,000-character message limit.",
    });
    expect(container.components).toContainEqual({
      type: 12,
      items: [
        {
          media: { url: "attachment://dice.png" },
          description: "Rendered dice result",
        },
      ],
    });
  });

  it("rejects outcomes that cannot produce a complete result image", () => {
    expect(() =>
      buildRollResultMessage(result(["not-dice"]), {
        source: "discord",
        title: null,
        repetitions: 1,
        username: "roller",
        filename: "dice.png",
      }),
    ).toThrow("Roll result has no displayable outcomes");
  });
});
