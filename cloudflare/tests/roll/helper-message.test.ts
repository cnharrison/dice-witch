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
  it("links invalid notation to the exact notation repair guide", () => {
    expect(
      helpMessage({ code: "INVALID_NOTATION", notation: "2d6+" }),
    ).toEqual({
      content: "That dice notation needs fixing.",
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 5,
              label: "Fix dice notation",
              url: "https://dicewit.ch/docs/dice-notation#fix-an-invalid-roll",
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

  it("links unsafe explosions to the exact modifier guide section", () => {
    const message = helpMessage({
      code: "UNSAFE_EXPLOSION",
      message: "Expected explosion work exceeds the safety limit",
    });

    expect(message.content).toBe("That modifier needs fixing.");
    expect(message.components?.[0]?.components[0]).toEqual({
      type: 2,
      style: 5,
      label: "Fix the modifier",
      url: "https://dicewit.ch/docs/modifiers#exploding-dice",
    });
  });

  it("keeps the knowledge base DM available only on request", () => {
    const message = buildRollHelperMessage({
      inviteUrl: "https://discord.com/oauth2/authorize?client_id=100000000000000001",
      supportUrl: "https://discord.gg/fixture",
    });
    expect(message).toMatchObject({
      embeds: [
        {
          color: 255,
          fields: [
            {
              name: "Need help? 😅",
              value: "Use `/knowledgebase` and choose a topic, or choose one below.",
            },
          ],
        },
      ],
      allowed_mentions: { parse: [] },
    });
    const serialized = JSON.stringify(message);
    expect(serialized).toContain("knowledgebase-exploding");
    expect(serialized).toContain("knowledgebase-math");
    expect(serialized).toContain("Invite me");
  });
});
