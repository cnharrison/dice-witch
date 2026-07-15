import { describe, expect, it } from "vitest";
import { executeWebRoll } from "../../workers/roll/src/web-roll-service";

describe("WebRollService", () => {
  it("executes and renders valid web notation", async () => {
    const result = await executeWebRoll({
      notation: "1d20",
      repetitions: 1,
      username: "fixture-user",
      title: null,
    });

    expect(result.status).toBe("rolled");
    if (result.status !== "rolled") throw new Error("Expected a rolled result");
    expect(result.diceArray).toHaveLength(1);
    expect(result.diceArray[0]).toHaveLength(1);
    expect(result.diceArray[0]?.[0]).toMatchObject({ sides: 20 });
    expect(result.resultArray).toHaveLength(1);
    expect(result.resultArray[0]?.results).toBeGreaterThanOrEqual(1);
    expect(result.resultArray[0]?.results).toBeLessThanOrEqual(20);
    expect(result.discord.filename).toBe("dice-witch-roll.png");
    expect(result.discord.png).toBeInstanceOf(Uint8Array);
    expect(result.discord.png.byteLength).toBeGreaterThan(0);
  });

  it("returns a user-facing error for invalid notation", async () => {
    await expect(
      executeWebRoll({
        notation: "definitely-not-dice",
        repetitions: 1,
        username: "fixture-user",
        title: null,
      }),
    ).resolves.toEqual({
      status: "invalid",
      message: "🚫🎲 Invalid dice notation!",
    });
  });

  it("rejects malformed request shapes", async () => {
    await expect(
      executeWebRoll({
        notation: "1d20",
        repetitions: 1,
        username: "fixture-user",
        title: null,
        channelId: "must-not-cross-roll-boundary",
      }),
    ).rejects.toThrow("Web roll request is invalid");
  });
});
