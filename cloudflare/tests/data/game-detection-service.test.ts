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
const activeAt = observedAt + 180_000;

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

function activeMultiplayerRolls(
  first: RollLifecycleSnapshotV1,
): RollLifecycleSnapshotV1[] {
  if (
    first.acceptedAt === null ||
    first.deliveryStartedAt === null ||
    first.terminalAt === null
  ) {
    throw new Error("Active-play fixture must be delivered");
  }
  const firstId = BigInt(first.interactionId);
  const acceptedAt = first.acceptedAt;
  const deliveryStartedAt = first.deliveryStartedAt;
  const terminalAt = first.terminalAt;
  return Array.from({ length: 4 }, (_, index) => {
    const offset = index * 60_000;
    return {
      ...first,
      interactionId: String(firstId + BigInt(index)),
      receivedAt: first.receivedAt + offset,
      deferredAt: first.deferredAt + offset,
      acceptedAt: acceptedAt + offset,
      deliveryStartedAt: deliveryStartedAt + offset,
      terminalAt: terminalAt + offset,
      context: {
        ...first.context,
        title: index === 0 ? first.context.title : null,
        userId: index < 2
          ? first.context.userId
          : "100000000000000099",
      },
    };
  });
}

async function recordActiveMultiplayer(
  first: RollLifecycleSnapshotV1,
): Promise<void> {
  const repository = new D1RollLifecycleRepository(dataEnv.DATA);
  for (const roll of activeMultiplayerRolls(first)) {
    await repository.record(roll);
  }
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
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare(
      `UPDATE game_detection_control
       SET started_at = 0, active_play_started_at = 0
       WHERE singleton = 1`,
    ),
  ]);
});

describe("processGameDetectionMinute", () => {
  it("keeps the three-roll staging sequence below every inference boundary", async () => {
    const notations = ["3d20", "6d8", "d10+7"];
    const rolls = activeMultiplayerRolls(
      deliveredRoll("100000000000000021"),
    ).slice(0, 3).map((roll, index) => {
      const notation = notations[index];
      if (notation === undefined) throw new Error("Missing staging notation");
      return {
        ...roll,
        context: {
          ...roll.context,
          notation,
          request: { notation: [notation], repetitions: 1 },
          title: index === 2 ? "Cyberpunk RED attack" : null,
          userId: "100000000000000002",
          guildName: null,
          channelName: null,
          channelType: null,
        },
      };
    });
    const lifecycle = new D1RollLifecycleRepository(dataEnv.DATA);
    for (const roll of rolls) await lifecycle.record(roll);
    const aiRun = vi.fn();
    const announce = vi.fn();
    const resolveContext = vi.fn();

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: { run: aiRun } as unknown as Ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveGameDetectionChannelContextV1: resolveContext,
        },
      }, observedAt + 120_000),
    ).resolves.toMatchObject({
      ingested: 3,
      channelContext: "none",
      rankJob: "none",
      announcement: "none",
    });
    expect(aiRun).not.toHaveBeenCalled();
    expect(resolveContext).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("does not rank an incidental mechanic from a heterogeneous active episode", async () => {
    const notations = [
      ...Array.from({ length: 7 }, () => "4d10"),
      ...Array.from({ length: 2 }, () => "8d10"),
      ...Array.from({ length: 2 }, () => "2d10"),
      ...Array.from({ length: 5 }, () => "d10"),
    ];
    const lifecycle = new D1RollLifecycleRepository(dataEnv.DATA);
    const first = deliveredRoll("100000000000000201");
    if (
      first.acceptedAt === null ||
      first.deliveryStartedAt === null ||
      first.terminalAt === null
    ) {
      throw new Error("Heterogeneous episode fixture must be delivered");
    }
    for (const [index, notation] of notations.entries()) {
      const offset = index * 15_000;
      await lifecycle.record({
        ...first,
        interactionId: String(BigInt(first.interactionId) + BigInt(index)),
        receivedAt: first.receivedAt + offset,
        deferredAt: first.deferredAt + offset,
        acceptedAt: first.acceptedAt + offset,
        deliveryStartedAt: first.deliveryStartedAt + offset,
        terminalAt: first.terminalAt + offset,
        context: {
          ...first.context,
          notation,
          request: { notation: [notation], repetitions: 1 },
          title: null,
          userId: index % 2 === 0
            ? "100000000000000002"
            : "100000000000000099",
          guildName: "Friday table",
          channelName: "dice-rolls",
          outcome: {
            version: 1,
            seed: 99 + index,
            outcomes: [{
              notation,
              output: `${notation}: [1] = 1`,
              total: 1,
            }],
            errors: [],
          },
        },
      });
    }
    const aiRun = vi.fn();
    const announce = vi.fn();

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: { run: aiRun } as unknown as Ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveGameDetectionChannelContextV1: vi.fn(),
        },
      }, observedAt + 240_000),
    ).resolves.toMatchObject({
      ingested: 16,
      rankJob: "none",
      announcement: "none",
    });
    expect(aiRun).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM game_detection_rank_jobs",
      ).first(),
    ).resolves.toEqual({ count: 0 });
  });

  it("keeps a diverse DCC dice-chain episode eligible at plausible confidence", async () => {
    const first = deliveredRoll("100000000000000025");
    const notations = ["d14+15", "d30+10", "2d14", "d30"];
    const lifecycle = new D1RollLifecycleRepository(dataEnv.DATA);
    for (const [index, roll] of activeMultiplayerRolls(first).entries()) {
      const notation = notations[index];
      if (notation === undefined) throw new Error("Missing DCC notation");
      await lifecycle.record({
        ...roll,
        context: {
          ...roll.context,
          notation,
          request: { notation: [notation], repetitions: 1 },
          title: null,
          guildName: "Friday table",
          channelName: "dice-rolls",
        },
      });
    }
    const aiRun = vi.fn(() => Promise.resolve({
      response: JSON.stringify({
        version: 1,
        disposition: "select",
        selectedSystemId: "dungeon-crawl-classics",
        assessments: {
          "dungeon-crawl-classics": {
            confidenceTier: "plausible",
            evidenceCitations: [{
              claimId: "repeated-use-of-different-rare-dcc-dice-is-a-dice-chain-pattern",
              sourceIds: ["dungeon-crawl-classics-rules"],
            }],
          },
        },
        abstentionReason: null,
      }),
    }));
    const announce = vi.fn(() => Promise.resolve({
      status: "delivered" as const,
      messageId: "100000000000000097",
      httpStatus: 200,
    }));

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: { run: aiRun } as unknown as Ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveGameDetectionChannelContextV1: vi.fn(),
        },
      }, activeAt),
    ).resolves.toMatchObject({
      ingested: 4,
      rankJob: "selected",
      announcement: "sent",
    });
    expect(aiRun).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith(expect.objectContaining({
      gameId: "dungeon-crawl-classics",
      confidence: "plausible",
    }));
  });

  it("ranks in the background with all useful context and posts only the validated detection", async () => {
    await recordActiveMultiplayer(
      deliveredRoll("100000000000000031"),
    );
    const aiRun = vi.fn(() =>
      Promise.resolve({ response: JSON.stringify(dndResponse) })
    );
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const announce = vi.fn(() => Promise.resolve({
      status: "delivered" as const,
      messageId: "100000000000000099",
      httpStatus: 200,
    }));

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: { run: aiRun } as unknown as Ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveGameDetectionChannelContextV1: vi.fn(),
        },
      }, activeAt),
    ).resolves.toMatchObject({
      ingested: 4,
      rankJob: "selected",
      announcement: "sent",
    });

    expect(aiRun).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(45_000);
    timeout.mockRestore();
    const modelInput = JSON.stringify(aiRun.mock.calls[0]);
    expect(modelInput).toContain("Thursday D&D");
    expect(modelInput).toContain("curse-of-strahd");
    expect(modelInput).toContain("Create a Curse of Strahd character");
    expect(modelInput).toContain("fixture-player");
    expect(modelInput).not.toContain("100000000000000002");
    expect(modelInput).not.toContain("100000000000000099");
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
    await expect(
      dataEnv.DATA.prepare(
        `SELECT model_id, prompt_revision FROM game_detections`,
      ).first(),
    ).resolves.toEqual({
      model_id: "@cf/zai-org/glm-5.2",
      prompt_revision: "dice-witch-game-detection-v3",
    });
  });

  it("ranks a context-named popular system with otherwise generic mechanics", async () => {
    const roll = deliveredRoll("100000000000000035");
    await recordActiveMultiplayer({
      ...roll,
      context: {
        ...roll.context,
        notation: "d10+7",
        request: { notation: ["d10+7"], repetitions: 2 },
        title: "Initiative",
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
                claimId: "explicit-system-name-in-location-context",
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
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveGameDetectionChannelContextV1: vi.fn(),
        },
      }, activeAt),
    ).resolves.toMatchObject({ rankJob: "selected", announcement: "sent" });

    expect(JSON.stringify(aiRun.mock.calls[0])).toContain("cyberpunk-red");
    expect(announce).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: "cyberpunk-red",
        gameName: "Cyberpunk RED",
      }),
    );
  });

  it("looks up missing display context before ranking the live Discord receipt shape", async () => {
    const roll = deliveredRoll("100000000000000039");
    await recordActiveMultiplayer({
      ...roll,
      context: {
        ...roll.context,
        guildName: null,
        channelName: null,
        channelType: null,
      },
    });
    await dataEnv.DATA.prepare(
      `INSERT INTO guilds (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(
      "100000000000000003",
      "Stored Thursday Guild",
      observedAt,
      observedAt,
    ).run();
    const resolveContext = vi.fn(() => Promise.resolve({
      status: "resolved" as const,
      channelName: "resolved-strahd",
      channelType: 0 as const,
    }));
    const aiRun = vi.fn(() =>
      Promise.resolve({ response: JSON.stringify(dndResponse) })
    );
    const announce = vi.fn(() => Promise.resolve({
      status: "delivered" as const,
      messageId: "100000000000000097",
      httpStatus: 200,
    }));

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: { run: aiRun } as unknown as Ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveGameDetectionChannelContextV1: resolveContext,
        },
      }, activeAt),
    ).resolves.toMatchObject({
      ingested: 4,
      channelContext: "resolved",
      rankJob: "selected",
      announcement: "sent",
    });

    expect(resolveContext).toHaveBeenCalledWith({
      version: 1,
      guildId: "100000000000000003",
      channelId: "100000000000000004",
    });
    expect(JSON.stringify(aiRun.mock.calls[0])).toContain("Stored Thursday Guild");
    expect(JSON.stringify(aiRun.mock.calls[0])).toContain("resolved-strahd");
    expect(announce).toHaveBeenCalledWith(expect.objectContaining({
      guildName: "Stored Thursday Guild",
      channelName: "resolved-strahd",
    }));
  });

  it("keeps the unresolved session blocked across retryable and failed lookups", async () => {
    const roll = deliveredRoll("100000000000000040");
    await recordActiveMultiplayer({
      ...roll,
      context: {
        ...roll.context,
        guildName: null,
        channelName: null,
        channelType: null,
      },
    });
    await dataEnv.DATA.prepare(
      `INSERT INTO guilds (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(
      "100000000000000003",
      "Stored Thursday Guild",
      observedAt,
      observedAt,
    ).run();
    const resolveContext = vi.fn()
      .mockResolvedValueOnce({
        status: "retryable" as const,
        httpStatus: 429,
        retryAfterMs: 60_000,
      })
      .mockResolvedValueOnce({
        status: "failed" as const,
        httpStatus: 401,
      });
    const aiRun = vi.fn();
    const announce = vi.fn();
    const serviceEnv = {
      DATA: dataEnv.DATA,
      AI: { run: aiRun } as unknown as Ai,
      DISCORD_REST: {
        createGameDetectionAnnouncementV1: announce,
        resolveGameDetectionChannelContextV1: resolveContext,
      },
    };

    await expect(
      processGameDetectionMinute(serviceEnv, activeAt),
    ).resolves.toMatchObject({
      channelContext: "retrying",
      rankJob: "none",
      announcement: "none",
    });
    await expect(
      processGameDetectionMinute(serviceEnv, activeAt + 59_999),
    ).resolves.toMatchObject({
      channelContext: "none",
      rankJob: "none",
    });

    await expect(
      processGameDetectionMinute(serviceEnv, activeAt + 60_000),
    ).resolves.toMatchObject({
      channelContext: "failed",
      rankJob: "none",
    });

    expect(resolveContext).toHaveBeenCalledTimes(2);
    expect(aiRun).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("records an invalid model response once without posting or retrying", async () => {
    await recordActiveMultiplayer(
      deliveredRoll("100000000000000041"),
    );
    const aiRun = vi.fn(() => Promise.resolve({ response: "{}" }));
    const announce = vi.fn();
    const serviceEnv = {
      DATA: dataEnv.DATA,
      AI: { run: aiRun } as unknown as Ai,
      DISCORD_REST: {
        createGameDetectionAnnouncementV1: announce,
        resolveGameDetectionChannelContextV1: vi.fn(),
      },
    };

    await expect(
      processGameDetectionMinute(serviceEnv, activeAt),
    ).resolves.toMatchObject({ rankJob: "rejected", announcement: "none" });
    await expect(
      processGameDetectionMinute(serviceEnv, activeAt + 60_000),
    ).resolves.toMatchObject({ rankJob: "none", announcement: "none" });
    await expect(
      processGameDetectionMinute(serviceEnv, activeAt + 3 * 60 * 60 * 1_000),
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
    expect(roll).toEqual({ classification: "unknown" });
  });
});
