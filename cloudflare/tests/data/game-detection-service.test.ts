import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RollLifecycleSnapshotV1 } from "../../packages/discord-contracts/src";
import { processGameDetectionMinute } from "../../workers/data/src/game-detection-service";
import { D1RollLifecycleRepository } from "../../workers/data/src/roll-lifecycle-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const observedAt = 1_767_225_600_000;

function deliveredRoll(interactionId: string): RollLifecycleSnapshotV1 {
  return {
    version: 1,
    interactionId,
    revision: 4,
    commandName: "roll",
    scope: "guild",
    receivedAt: observedAt,
    deferredAt: observedAt + 1,
    acceptedAt: observedAt + 2,
    deliveryStartedAt: observedAt + 3,
    terminalAt: observedAt + 4,
    state: "delivered",
    attempts: 1,
    httpStatus: 200,
    failurePhase: null,
    failureCode: null,
    context: {
      version: 1,
      applicationId: "100000000000000001",
      notation: "4d6kh3",
      request: { notation: ["4d6kh3"], repetitions: 6 },
      title: "Create a Curse of Strahd character",
      savedRoll: null,
      userId: "100000000000000002",
      username: "fixture-player",
      guildId: "100000000000000003",
      channelId: "100000000000000004",
      guildName: "Thursday D&D",
      channelName: "curse-of-strahd",
      channelType: 0,
      outcome: {
        version: 1,
        seed: 99,
        outcomes: [
          { notation: "4d6kh3", output: "4d6kh3: [6,5,4,1] = 15", total: 15 },
        ],
        errors: [],
      },
      rollSeed: 99,
      renderSeed: 100,
      renderVersion: 4,
      rendererRevision: "canvaskit-v4-r8",
      destinationPayload: null,
    },
  };
}

const dndResponse = {
  version: 1,
  disposition: "select",
  selectedSystemId: "dungeons-and-dragons-5e-2014",
  assessments: {
    "dungeons-and-dragons-5e-2014": {
      confidenceTier: "strong",
      evidenceCitations: [
        {
          claimId: "ability-score-generation-workflow",
          sourceIds: ["dnd-5e-2014-basic-rules-ability-scores"],
        },
      ],
    },
  },
  abstentionReason: null,
};

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM game_detections"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rank_jobs"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rolls"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_sessions"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_daily_aggregates"),
    dataEnv.DATA.prepare("DELETE FROM roll_lifecycle_receipts"),
    dataEnv.DATA.prepare(
      "UPDATE game_detection_control SET started_at = 0 WHERE singleton = 1",
    ),
  ]);
});

describe("processGameDetectionMinute", () => {
  it("ranks in the background with all useful context and posts only the validated detection", async () => {
    await new D1RollLifecycleRepository(dataEnv.DATA).record(
      deliveredRoll("100000000000000031"),
    );
    const aiRun = vi.fn(() =>
      Promise.resolve({ response: JSON.stringify(dndResponse) })
    );
    const announce = vi.fn(() => Promise.resolve({
      status: "delivered" as const,
      messageId: "100000000000000099",
      httpStatus: 200,
    }));

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: { run: aiRun } as unknown as Ai,
        DISCORD_REST: { createGameDetectionAnnouncementV1: announce },
      }, observedAt),
    ).resolves.toMatchObject({
      ingested: 1,
      rankJob: "selected",
      announcement: "sent",
    });

    expect(aiRun).toHaveBeenCalledOnce();
    const modelInput = JSON.stringify(aiRun.mock.calls[0]);
    expect(modelInput).toContain("Thursday D&D");
    expect(modelInput).toContain("curse-of-strahd");
    expect(modelInput).toContain("Create a Curse of Strahd character");
    expect(modelInput).toContain("fixture-player");
    expect(modelInput).not.toContain("100000000000000002");
    expect(modelInput).not.toContain("renderSeed");
    expect(modelInput).not.toContain("destinationPayload");

    expect(announce).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "dungeons-and-dragons-5e-2014",
        guildName: "Thursday D&D",
        channelName: "curse-of-strahd",
      }),
    );
  });

  it("ranks a context-named popular system with otherwise generic mechanics", async () => {
    const roll = deliveredRoll("100000000000000035");
    await new D1RollLifecycleRepository(dataEnv.DATA).record({
      ...roll,
      context: {
        ...roll.context,
        notation: "d10+7",
        request: { notation: ["d10+7"], repetitions: 2 },
        title: "Cyberpunk RED initiative",
        guildName: "Night City Stories",
        channelName: "cyberpunk-red",
        outcome: {
          version: 1,
          seed: 99,
          outcomes: [
            { notation: "d10+7", output: "d10+7: [8] + 7 = 15", total: 15 },
          ],
          errors: [],
        },
      },
    });
    const aiRun = vi.fn(() => Promise.resolve({
      response: JSON.stringify({
        version: 1,
        disposition: "select",
        selectedSystemId: "cyberpunk-red",
        assessments: {
          "cyberpunk-red": {
            confidenceTier: "plausible",
            evidenceCitations: [
              {
                claimId: "explicit-system-name-in-session-context",
                sourceIds: ["cyberpunk-red-rules"],
              },
            ],
          },
        },
        abstentionReason: null,
      }),
    }));
    const announce = vi.fn(() => Promise.resolve({
      status: "delivered" as const,
      messageId: "100000000000000098",
      httpStatus: 200,
    }));

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: { run: aiRun } as unknown as Ai,
        DISCORD_REST: { createGameDetectionAnnouncementV1: announce },
      }, observedAt),
    ).resolves.toMatchObject({ rankJob: "selected", announcement: "sent" });

    expect(JSON.stringify(aiRun.mock.calls[0])).toContain("cyberpunk-red");
    expect(announce).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "cyberpunk-red",
        gameName: "Cyberpunk RED",
      }),
    );
  });

  it("records an invalid model response once without posting or retrying", async () => {
    await new D1RollLifecycleRepository(dataEnv.DATA).record(
      deliveredRoll("100000000000000041"),
    );
    const aiRun = vi.fn(() => Promise.resolve({ response: "{}" }));
    const announce = vi.fn();
    const serviceEnv = {
      DATA: dataEnv.DATA,
      AI: { run: aiRun } as unknown as Ai,
      DISCORD_REST: { createGameDetectionAnnouncementV1: announce },
    };

    await expect(
      processGameDetectionMinute(serviceEnv, observedAt),
    ).resolves.toMatchObject({ rankJob: "rejected", announcement: "none" });
    await expect(
      processGameDetectionMinute(serviceEnv, observedAt + 60_000),
    ).resolves.toMatchObject({ rankJob: "none", announcement: "none" });
    await expect(
      processGameDetectionMinute(serviceEnv, observedAt + 3 * 60 * 60 * 1_000),
    ).resolves.toMatchObject({
      rankJob: "none",
      announcement: "none",
      closedSessions: 1,
    });

    expect(aiRun).toHaveBeenCalledOnce();
    expect(announce).not.toHaveBeenCalled();
    const job = await dataEnv.DATA.prepare(
      `SELECT state, attempt_count, result, detail
       FROM game_detection_rank_jobs`,
    ).first();
    expect(job).toEqual({
      state: "completed",
      attempt_count: 1,
      result: "rejected",
      detail: "invalid-schema",
    });
    const roll = await dataEnv.DATA.prepare(
      "SELECT classification FROM game_detection_rolls",
    ).first();
    expect(roll).toEqual({ classification: "out-of-game" });
  });
});
