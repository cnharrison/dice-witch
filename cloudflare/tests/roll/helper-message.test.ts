import { describe, expect, it } from "vitest";
import {
  buildRollHelperMessage,
  ROLL_HELPER_ANNOUNCEMENT,
  ROLL_HELPER_DM_ANNOUNCEMENT,
} from "../../packages/discord-contracts/src";

describe("invalid-roll helper contract", () => {
  it("preserves the legacy announcement and DM button rows", () => {
    expect(ROLL_HELPER_ANNOUNCEMENT).toBe(
      " 🚫🎲 Invalid dice notation! DMing you some help 😉",
    );
    expect(ROLL_HELPER_DM_ANNOUNCEMENT).toBe(
      " 🚫🎲 Invalid dice notation! Here's some help 😉",
    );
    const message = buildRollHelperMessage({
      inviteUrl: "https://discord.com/oauth2/authorize?client_id=100000000000000001",
      supportUrl: "https://discord.gg/fixture",
    });
    expect(message).toMatchObject({
      embeds: [{ color: 255, fields: [{ name: "Need help? 😅" }] }],
      allowed_mentions: { parse: [] },
    });
    const serialized = JSON.stringify(message);
    expect(serialized).toContain("knowledgebase-exploding");
    expect(serialized).toContain("knowledgebase-math");
    expect(serialized).toContain("Invite me");
  });
});
