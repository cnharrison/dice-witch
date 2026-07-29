import { describe, expect, it } from "vitest";
import {
  buildInvalidRollHelpMessage,
  buildRollHelperMessage,
} from "../../packages/discord-contracts/src";
import type { RollExecutionError } from "../../packages/roll-domain/src";

const rollId = "100000000000000001";

function helpMessage(error: RollExecutionError) {
  return buildInvalidRollHelpMessage(
    {
      version: 1,
      seed: 1,
      outcomes: [],
      errors: [error],
    },
    rollId,
  );
}

describe("invalid-roll helper contract", () => {
  it.each([
    {
      error: { code: "NO_DICE", message: "Roll notation contains no dice" },
      headline: "🚫 Invalid notation",
    },
    {
      error: { code: "INVALID_NOTATION", notation: "2d6+" },
      headline: "🚫 Invalid notation",
    },
    {
      error: { code: "TOO_MANY_DICE", message: "Too many dice" },
      headline: "Too many dice",
    },
    {
      error: { code: "TOO_MANY_SIDES", message: "Too many sides" },
      headline: "Too many sides",
    },
    {
      error: { code: "NON_FINITE_TOTAL", notation: "1e999" },
      headline: "Invalid total",
    },
    {
      error: {
        code: "UNSAFE_EXPLOSION",
        message: "Expected explosion work exceeds the safety limit",
      },
      headline: "🚫 Potentially infinite modifier",
    },
  ] as const)("uses the specific headline: $headline", ({ error, headline }) => {
    expect(helpMessage(error).content).toBe(headline);
  });

  it("always links invalid rolls to the Dice notation guide", () => {
    expect(
      helpMessage({ code: "UNSAFE_EXPLOSION", message: "Unsafe explosion" }),
    ).toMatchObject({
      components: [
        {
          components: [
            {
              type: 2,
              style: 5,
              label: "Dice notation guide",
              url: "https://dicewit.ch/docs/dice-notation",
            },
            {
              type: 2,
              style: 2,
              label: "DM me the knowledge base",
              custom_id: `roll-help:dm-knowledgebase:${rollId}`,
            },
          ],
        },
      ],
    });
  });

  it("sends notation essentials with every knowledge-base topic on request", () => {
    const message = buildRollHelperMessage({
      inviteUrl: "https://discord.com/oauth2/authorize?client_id=100000000000000001",
      supportUrl: "https://discord.gg/fixture",
    });
    expect(message).toMatchObject({
      embeds: [
        {
          color: 255,
          title: "🎲 Dice notation",
        },
      ],
      allowed_mentions: { parse: [] },
    });
    const serialized = JSON.stringify(message);
    expect(serialized).toContain(
      "[Read the complete Dice notation guide](https://dicewit.ch/docs/dice-notation)",
    );
    for (const topic of [
      "exploding",
      "reroll",
      "keepdrop",
      "target",
      "crit",
      "math",
      "sort",
      "repeating",
      "unique",
      "fudge",
    ]) {
      expect(serialized).toContain(`knowledgebase-${topic}`);
    }
    expect(serialized).toContain("`2d6`");
    expect(serialized).toContain("`4d6k3`");
    expect(serialized).toContain("Invite me");
  });
});
