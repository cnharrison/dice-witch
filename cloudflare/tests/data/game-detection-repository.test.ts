import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  RollLifecycleSnapshotV1,
} from "../../packages/discord-contracts/src";
import type { NarrationGameRankingResponseV1 } from "../../packages/roll-domain/src";
import { D1GameDetectionRepository } from "../../workers/data/src/game-detection-repository";
import { D1RollLifecycleRepository } from "../../workers/data/src/roll-lifecycle-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const hour = 60 * 60 * 1_000;
const day = 24 * hour;
const baseTime = 1_767_225_600_000;
const detectionProvenance = {
  modelId: "@cf/zai-org/glm-5.2",
  promptRevision: "dice-witch-game-detection-v3",
} as const;

function snapshot(input: {
  interactionId: string;
  receivedAt: number;
  channelId?: string;
  notation?: readonly string[];
  repetitions?: number;
  outcomeTotal?: number;
  title?: string | null;
  userId?: string;
  guildName?: string | null;
  channelName?: string | null;
  channelType?: number | null;
}): RollLifecycleSnapshotV1 {
  const notation = input.notation ?? ["1d20"];
  const repetitions = input.repetitions ?? 1;
  return {
    version: 1,
    interactionId: input.interactionId,
    revision: 4,
    commandName: "roll",
    scope: "guild",
    receivedAt: input.receivedAt,
    deferredAt: input.receivedAt + 1,
    acceptedAt: input.receivedAt + 2,
    deliveryStartedAt: input.receivedAt + 3,
    terminalAt: input.receivedAt + 4,
    state: "delivered",
    attempts: 1,
    httpStatus: 200,
    failurePhase: null,
    failureCode: null,
    context: {
      version: 1,
      applicationId: "100000000000000001",
      notation: notation.join(" "),
      request: { notation: [...notation], repetitions },
      title: input.title ?? null,
      savedRoll: null,
      userId: input.userId ?? "100000000000000002",
      username: "fixture-player",
      guildId: "100000000000000003",
      channelId: input.channelId ?? "100000000000000004",
      guildName:
        input.guildName === undefined ? "Savage Wednesday" : input.guildName,
      channelName:
        input.channelName === undefined
          ? "deadlands-session"
          : input.channelName,
      channelType: input.channelType === undefined ? 0 : input.channelType,
      outcome: {
        version: 1,
        seed: 1,
        outcomes: notation.map((value) => ({
          notation: value,
          output: `${value}: [6] = 6`,
          total: input.outcomeTotal ?? 6,
        })),
        errors: [],
      },
      rollSeed: 1,
      renderSeed: 2,
      renderVersion: 4,
      rendererRevision: "canvaskit-v4-r8",
      destinationPayload: null,
    },
  };
}

function activeMultiplayerSnapshots(
  input: Parameters<typeof snapshot>[0],
): RollLifecycleSnapshotV1[] {
  const firstId = BigInt(input.interactionId);
  return Array.from({ length: 4 }, (_, index) => snapshot({
    ...input,
    interactionId: String(firstId + BigInt(index)),
    receivedAt: input.receivedAt + index * 60_000,
    title: index === 0 ? (input.title ?? null) : null,
    userId: index < 2
      ? (input.userId ?? "100000000000000002")
      : "100000000000000099",
  }));
}

const savageWorldsResponse = {
  version: 1,
  disposition: "select",
  selectedSystemId: "savage-worlds",
  assessments: {
    "savage-worlds": {
      confidenceTier: "plausible",
      evidenceCitations: [
        {
          claimId: "open-ended-step-die-rolls",
          sourceIds: ["savage-worlds-test-drive-2015"],
        },
      ],
    },
  },
  abstentionReason: null,
} as const satisfies NarrationGameRankingResponseV1;

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
} as const satisfies NarrationGameRankingResponseV1;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM game_detections"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rank_jobs"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_rolls"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_sessions"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_daily_aggregates"),
    dataEnv.DATA.prepare("DELETE FROM game_detection_skipped_receipts"),
    dataEnv.DATA.prepare("DELETE FROM roll_lifecycle_receipts"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare(
      `UPDATE game_detection_control
       SET started_at = 0, active_play_started_at = 0
       WHERE singleton = 1`,
    ),
  ]);
});

async function record(...values: RollLifecycleSnapshotV1[]): Promise<void> {
  const lifecycle = new D1RollLifecycleRepository(dataEnv.DATA);
  for (const value of values) await lifecycle.record(value);
}

describe("D1GameDetectionRepository", () => {
  it("bounds each default ingestion batch below the minute schedule", async () => {
    await record(
      ...Array.from({ length: 26 }, (_, index) => snapshot({
        interactionId: String(100000000000000200n + BigInt(index)),
        receivedAt: baseTime + index,
        channelId: String(100000000000000200n + BigInt(index)),
      })),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);

    await expect(repository.ingestDeliveredRolls(baseTime + 26)).resolves.toEqual({
      ingested: 25,
      skipped: 0,
      backlog: true,
      closedSessions: 0,
    });
  }, 15_000);

  it("ingests large finite roll totals", async () => {
    await record(
      snapshot({
        interactionId: "100000000000000301",
        receivedAt: baseTime,
        notation: ["1d10^1d10+418"],
        outcomeTotal: 1e100,
      }),
      snapshot({
        interactionId: "100000000000000302",
        receivedAt: baseTime + 1,
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);

    await expect(repository.ingestDeliveredRolls(baseTime + 2)).resolves.toEqual({
      ingested: 2,
      skipped: 0,
      backlog: false,
      closedSessions: 0,
    });
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM game_detection_skipped_receipts",
      ).first<{ count: number }>(),
    ).resolves.toEqual({ count: 0 });
  });

  it("ingests fractional outcome totals through rank-job preparation", async () => {
    await record(
      snapshot({
        interactionId: "100000000000000100",
        receivedAt: baseTime,
        notation: ["1d20/2"],
        outcomeTotal: 14.5,
      }),
      snapshot({
        interactionId: "100000000000000101",
        receivedAt: baseTime + 60_000,
      }),
      snapshot({
        interactionId: "100000000000000102",
        receivedAt: baseTime + 120_000,
        userId: "100000000000000099",
      }),
      snapshot({
        interactionId: "100000000000000103",
        receivedAt: baseTime + 180_000,
        userId: "100000000000000099",
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);

    await expect(
      repository.ingestDeliveredRolls(baseTime + 180_000),
    ).resolves.toEqual({
      ingested: 4,
      skipped: 0,
      backlog: false,
      closedSessions: 0,
    });
    await expect(
      dataEnv.DATA.prepare(
        "SELECT active_play_state FROM game_detection_sessions",
      ).first("active_play_state"),
    ).resolves.toBe("active");
  });

  it("does not rank one participant's three-roll staging acceptance sequence", async () => {
    await record(
      snapshot({
        interactionId: "100000000000000101",
        receivedAt: baseTime,
        notation: ["3d20"],
      }),
      snapshot({
        interactionId: "100000000000000102",
        receivedAt: baseTime + 60_000,
        notation: ["6d8"],
      }),
      snapshot({
        interactionId: "100000000000000103",
        receivedAt: baseTime + 90_000,
        notation: ["d10+7"],
        title: "Cyberpunk RED attack",
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);

    await expect(
      repository.ingestDeliveredRolls(baseTime + 90_000),
    ).resolves.toMatchObject({ ingested: 3 });
    await expect(repository.claimRankJob(baseTime + 90_001)).resolves.toBeNull();
    await expect(
      repository.nextPendingChannelContext(baseTime + 90_001),
    ).resolves.toBeNull();
    await expect(
      dataEnv.DATA.prepare(
        `SELECT active_play_state, active_play_path
         FROM game_detection_sessions`,
      ).first(),
    ).resolves.toEqual({ active_play_state: "possible", active_play_path: null });
    const classifications = await dataEnv.DATA.prepare(
      `SELECT classification FROM game_detection_rolls ORDER BY observed_at`,
    ).all<{ classification: string }>();
    expect(classifications.results).toEqual([
      { classification: "unknown" },
      { classification: "unknown" },
      { classification: "unknown" },
    ]);
  });

  it("qualifies four channel-scoped rolls from two participants", async () => {
    await record(
      snapshot({ interactionId: "100000000000000111", receivedAt: baseTime, notation: ["4d6kh3"], repetitions: 2 }),
      snapshot({ interactionId: "100000000000000112", receivedAt: baseTime + 60_000, notation: ["4d6kh3"], repetitions: 2 }),
      snapshot({ interactionId: "100000000000000113", receivedAt: baseTime + 120_000, notation: ["4d6kh3"], repetitions: 2, userId: "100000000000000099" }),
      snapshot({ interactionId: "100000000000000114", receivedAt: baseTime + 180_000, notation: ["4d6kh3"], repetitions: 2, userId: "100000000000000099" }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);

    const job = await repository.claimRankJob(baseTime + 180_001);
    expect(job?.context.rolls.some(({ notation }) => notation === "4d6kh3")).toBe(
      true,
    );
    await expect(
      dataEnv.DATA.prepare(
        `SELECT active_play_state, active_play_path
         FROM game_detection_sessions`,
      ).first(),
    ).resolves.toEqual({
      active_play_state: "active",
      active_play_path: "multiplayer",
    });
  });

  it("blocks an unclaimed rank job at ten minutes of inactivity", async () => {
    await record(
      ...activeMultiplayerSnapshots({
        interactionId: "100000000000000115",
        receivedAt: baseTime,
        notation: ["4d6kh3"],
        repetitions: 2,
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);
    await repository.ingestDeliveredRolls(baseTime + 780_000);

    await expect(repository.claimRankJob(baseTime + 780_001)).resolves.toBeNull();
    await expect(
      dataEnv.DATA.prepare(
        `SELECT active_play_state FROM game_detection_sessions`,
      ).first("active_play_state"),
    ).resolves.toBe("inactive");
    const classifications = await dataEnv.DATA.prepare(
      `SELECT DISTINCT classification FROM game_detection_rolls`,
    ).all<{ classification: string }>();
    expect(classifications.results).toEqual([{ classification: "unknown" }]);
  });

  it("qualifies sustained solo activity without multiplying repetitions", async () => {
    await record(
      ...Array.from({ length: 6 }, (_, index) => snapshot({
        interactionId: `10000000000000012${String(index)}`,
        receivedAt: baseTime + index * 90_000,
        notation: index < 4 ? ["d10+7"] : ["d6"],
        repetitions: index === 0 ? 20 : 1,
        title: index === 0 ? "Cyberpunk RED session" : null,
      })),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 5 * 90_000);

    const job = await repository.claimRankJob(baseTime + 5 * 90_000 + 1);
    expect(job?.context.rolls.some(
      ({ title }) => title === "Cyberpunk RED session",
    )).toBe(true);
    await expect(
      dataEnv.DATA.prepare(
        `SELECT active_play_state, active_play_path
         FROM game_detection_sessions`,
      ).first(),
    ).resolves.toEqual({ active_play_state: "active", active_play_path: "solo" });
  });

  it("does not combine activity across channels", async () => {
    await record(
      snapshot({ interactionId: "100000000000000131", receivedAt: baseTime, channelId: "100000000000000004" }),
      snapshot({ interactionId: "100000000000000132", receivedAt: baseTime + 60_000, channelId: "100000000000000004", userId: "100000000000000099" }),
      snapshot({ interactionId: "100000000000000133", receivedAt: baseTime, channelId: "100000000000000005" }),
      snapshot({ interactionId: "100000000000000134", receivedAt: baseTime + 60_000, channelId: "100000000000000005", userId: "100000000000000099" }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 60_000);

    await expect(repository.claimRankJob(baseTime + 60_001)).resolves.toBeNull();
    const sessions = await dataEnv.DATA.prepare(
      `SELECT active_play_state, roll_count
       FROM game_detection_sessions ORDER BY channel_id`,
    ).all<{ active_play_state: string; roll_count: number }>();
    expect(sessions.results).toEqual([
      { active_play_state: "possible", roll_count: 2 },
      { active_play_state: "possible", roll_count: 2 },
    ]);
  });

  it("groups delivered rolls into channel-scoped three-hour sessions idempotently", async () => {
    await record(
      snapshot({ interactionId: "100000000000000011", receivedAt: baseTime, title: "Attack" }),
      snapshot({
        interactionId: "100000000000000012",
        receivedAt: baseTime + hour,
        title: "Damage",
      }),
      snapshot({
        interactionId: "100000000000000013",
        receivedAt: baseTime + hour,
        channelId: "100000000000000099",
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);

    await expect(repository.ingestDeliveredRolls(baseTime + hour)).resolves.toEqual({
      ingested: 3,
      skipped: 0,
      backlog: false,
      closedSessions: 0,
    });
    await expect(repository.ingestDeliveredRolls(baseTime + hour)).resolves.toEqual({
      ingested: 0,
      skipped: 0,
      backlog: false,
      closedSessions: 0,
    });

    const sessions = await dataEnv.DATA.prepare(
      "SELECT channel_id, roll_count FROM game_detection_sessions ORDER BY channel_id",
    ).all<{ channel_id: string; roll_count: number }>();
    expect(sessions.results).toEqual([
      { channel_id: "100000000000000004", roll_count: 2 },
      { channel_id: "100000000000000099", roll_count: 1 },
    ]);
  });

  it("closes a delayed observation at its event-time boundary without corrupting update time", async () => {
    await record(snapshot({
      interactionId: "100000000000000091",
      receivedAt: baseTime,
      title: "Delayed roll",
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);

    await expect(
      repository.ingestDeliveredRolls(baseTime + 10 * hour),
    ).resolves.toMatchObject({ ingested: 1, closedSessions: 1 });
    const stored = await dataEnv.DATA.prepare(
      `SELECT state, closed_at, created_at, updated_at
       FROM game_detection_sessions`,
    ).first<{
      state: string;
      closed_at: number;
      created_at: number;
      updated_at: number;
    }>();
    expect(stored).toEqual({
      state: "closed",
      closed_at: baseTime + 3 * hour,
      created_at: baseTime + 10 * hour,
      updated_at: baseTime + 10 * hour,
    });
  });

  it("keeps a late receipt outside an unrelated newer channel session", async () => {
    const channelId = "100000000000000077";
    await record(snapshot({
      interactionId: "100000000000000092",
      receivedAt: baseTime + 10 * hour,
      channelId,
      title: "New session",
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 10 * hour);

    await record(snapshot({
      interactionId: "100000000000000093",
      receivedAt: baseTime,
      channelId,
      title: "Delayed old session",
    }));
    await repository.ingestDeliveredRolls(baseTime + 11 * hour);

    const sessions = await dataEnv.DATA.prepare(
      `SELECT state, started_at, last_roll_at, roll_count
       FROM game_detection_sessions ORDER BY started_at`,
    ).all<{
      state: string;
      started_at: number;
      last_roll_at: number;
      roll_count: number;
    }>();
    expect(sessions.results).toEqual([
      {
        state: "closed",
        started_at: baseTime,
        last_roll_at: baseTime,
        roll_count: 1,
      },
      {
        state: "open",
        started_at: baseTime + 10 * hour,
        last_roll_at: baseTime + 10 * hour,
        roll_count: 1,
      },
    ]);
  });

  it("marks a lone expired roll outside-game and unresolved active sessions unknown", async () => {
    await record(
      snapshot({ interactionId: "100000000000000021", receivedAt: baseTime, title: "Loose roll" }),
      snapshot({
        interactionId: "100000000000000022",
        receivedAt: baseTime,
        channelId: "100000000000000088",
        title: "First",
      }),
      snapshot({
        interactionId: "100000000000000023",
        receivedAt: baseTime + hour,
        channelId: "100000000000000088",
        title: "Second",
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + hour);
    await repository.ingestDeliveredRolls(baseTime + 4 * hour);

    const rows = await dataEnv.DATA.prepare(
      `SELECT interaction_id, classification
       FROM game_detection_rolls ORDER BY interaction_id`,
    ).all<{ interaction_id: string; classification: string }>();
    expect(rows.results).toEqual([
      { interaction_id: "100000000000000021", classification: "out-of-game" },
      { interaction_id: "100000000000000022", classification: "unknown" },
      { interaction_id: "100000000000000023", classification: "unknown" },
    ]);
  });

  it("sends names and titles to a bounded background rank job and retroactively associates the session", async () => {
    await record(
      ...activeMultiplayerSnapshots({
        interactionId: "100000000000000031",
        receivedAt: baseTime,
        notation: ["4d6kh3"],
        repetitions: 2,
        title: "Create Strahd character",
        guildName: "Thursday D&D",
        channelName: "curse-of-strahd",
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);

    const job = await repository.claimRankJob(baseTime + 180_010);
    if (job === null) throw new Error("Expected a rank job");
    expect(job.sessionId).toBe("100000000000000031");
    expect(job.context).toMatchObject({
      guildName: "Thursday D&D",
      channelName: "curse-of-strahd",
    });
    expect(job.context.rolls.some(
      ({ title }) => title === "Create Strahd character",
    )).toBe(true);

    await repository.completeRankJob(
      job,
      { status: "accepted", value: dndResponse, ...detectionProvenance },
      baseTime + 180_020,
      10,
    );

    const observed = await dataEnv.DATA.prepare(
      "SELECT classification, game_id FROM game_detection_rolls",
    ).first<{ classification: string; game_id: string | null }>();
    expect(observed).toEqual({
      classification: "in-game",
      game_id: "dungeons-and-dragons-5e-2014",
    });
    const titled = await dataEnv.DATA.prepare(
      `SELECT title, guild_name, channel_name, classification, game_id
       FROM game_detection_titled_rolls_90d`,
    ).first();
    expect(titled).toEqual({
      title: "Create Strahd character",
      guild_name: "Thursday D&D",
      channel_name: "curse-of-strahd",
      classification: "in-game",
      game_id: "dungeons-and-dragons-5e-2014",
    });
    const detection = await dataEnv.DATA.prepare(
      `SELECT game_id, previous_game_id, announcement_state
       FROM game_detections`,
    ).first();
    expect(detection).toEqual({
      game_id: "dungeons-and-dragons-5e-2014",
      previous_game_id: null,
      announcement_state: "pending",
    });
  });

  it("enriches the live null-name receipt shape before ranking and announcements", async () => {
    await dataEnv.DATA.prepare(
      `INSERT INTO guilds (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(
      "100000000000000003",
      "Stored Fixture Guild",
      baseTime,
      baseTime,
    ).run();
    await record(...activeMultiplayerSnapshots({
      interactionId: "100000000000000034",
      receivedAt: baseTime,
      notation: ["4d6kh3"],
      repetitions: 2,
      title: "Create a character",
      guildName: null,
      channelName: null,
      channelType: null,
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);

    await expect(
      repository.ingestDeliveredRolls(baseTime + 180_000),
    ).resolves.toMatchObject({ ingested: 4 });
    await expect(repository.claimRankJob(baseTime + 180_001)).resolves.toBeNull();
    await expect(
      repository.nextPendingChannelContext(baseTime + 180_001),
    ).resolves.toEqual({
      sessionId: "100000000000000034",
      guildId: "100000000000000003",
      channelId: "100000000000000004",
    });

    await repository.completeChannelContext(
      "100000000000000034",
      { channelName: "resolved-rolls", channelType: 0 },
      baseTime + 180_002,
    );
    const job = await repository.claimRankJob(baseTime + 180_003);
    expect(job).toMatchObject({
      context: {
        guildName: "Stored Fixture Guild",
        channelName: "resolved-rolls",
        channelType: 0,
      },
    });
    if (job === null) throw new Error("Expected an enriched rank job");

    await repository.completeRankJob(
      job,
      { status: "accepted", value: dndResponse, ...detectionProvenance },
      baseTime + 180_004,
      1,
    );
    await expect(
      repository.claimAnnouncement(baseTime + 180_005),
    ).resolves.toMatchObject({
      guildName: "Stored Fixture Guild",
      channelName: "resolved-rolls",
    });
    await expect(
      dataEnv.DATA.prepare(
        `SELECT guild_name, channel_name
         FROM game_detection_titled_rolls_90d`,
      ).first(),
    ).resolves.toEqual({
      guild_name: "Stored Fixture Guild",
      channel_name: "resolved-rolls",
    });
  });

  it("records and announces a changed game as a new detection", async () => {
    await record(...activeMultiplayerSnapshots({
      interactionId: "100000000000000081",
      receivedAt: baseTime,
      notation: ["d8!"],
      repetitions: 1,
      title: "Trait roll",
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);
    const savageJob = await repository.claimRankJob(baseTime + 180_001);
    if (savageJob === null) throw new Error("Expected a Savage Worlds rank job");
    await repository.completeRankJob(
      savageJob,
      {
        status: "accepted",
        value: savageWorldsResponse,
        ...detectionProvenance,
      },
      baseTime + 180_002,
      1,
    );

    await record(...activeMultiplayerSnapshots({
      interactionId: "100000000000000091",
      receivedAt: baseTime + hour,
      notation: ["4d6kh3"],
      repetitions: 2,
      title: "New campaign abilities",
    }));
    await repository.ingestDeliveredRolls(baseTime + hour + 180_000);
    const dndJob = await repository.claimRankJob(baseTime + hour + 180_001);
    if (dndJob === null) throw new Error("Expected a D&D rank job");
    expect(dndJob.context.rolls).toHaveLength(4);
    expect(dndJob.context.rolls).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Trait roll" })]),
    );
    await repository.completeRankJob(
      dndJob,
      {
        status: "accepted",
        ...detectionProvenance,
        value: {
          ...dndResponse,
          assessments: {
            ...dndResponse.assessments,
            "savage-worlds": savageWorldsResponse.assessments["savage-worlds"],
          },
        },
      },
      baseTime + hour + 180_002,
      1,
    );

    const detections = await dataEnv.DATA.prepare(
      `SELECT previous_game_id, game_id
       FROM game_detections ORDER BY detected_at`,
    ).all<{ previous_game_id: string | null; game_id: string }>();
    expect(detections.results).toEqual([
      { previous_game_id: null, game_id: "savage-worlds" },
      {
        previous_game_id: "savage-worlds",
        game_id: "dungeons-and-dragons-5e-2014",
      },
    ]);
    const classified = await dataEnv.DATA.prepare(
      `SELECT game_id, COUNT(*) AS count
       FROM game_detection_rolls
       GROUP BY game_id ORDER BY game_id`,
    ).all<{ game_id: string; count: number }>();
    expect(classified.results).toEqual([
      { game_id: "dungeons-and-dragons-5e-2014", count: 4 },
      { game_id: "savage-worlds", count: 4 },
    ]);
  });

  it("retries transient private-channel delivery with the same detection", async () => {
    await record(...activeMultiplayerSnapshots({
      interactionId: "100000000000000071",
      receivedAt: baseTime,
      notation: ["4d6kh3"],
      repetitions: 2,
      title: "Abilities",
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);
    const job = await repository.claimRankJob(baseTime + 180_001);
    if (job === null) throw new Error("Expected a rank job");
    await repository.completeRankJob(
      job,
      { status: "accepted", value: dndResponse, ...detectionProvenance },
      baseTime + 180_002,
      1,
    );

    const first = await repository.claimAnnouncement(baseTime + 180_003);
    if (first === null) throw new Error("Expected an announcement");
    await expect(
      repository.releaseAnnouncement(
        first.detectionId,
        "retryable-429",
        baseTime + 240_000,
      ),
    ).resolves.toBe("retrying");
    await expect(
      repository.claimAnnouncement(baseTime + 239_999),
    ).resolves.toBeNull();
    const second = await repository.claimAnnouncement(baseTime + 240_000);
    expect(second?.detectionId).toBe(first.detectionId);
    if (second === null) throw new Error("Expected the announcement retry");
    await repository.markAnnouncementSent(
      second.detectionId,
      "100000000000000099",
      baseTime + 240_001,
    );

    const stored = await dataEnv.DATA.prepare(
      `SELECT announcement_state, announcement_attempts, discord_message_id
       FROM game_detections`,
    ).first();
    expect(stored).toEqual({
      announcement_state: "sent",
      announcement_attempts: 2,
      discord_message_id: "100000000000000099",
    });
  });

  it("does not rerank or create another detection for repeated mechanics and labels", async () => {
    await record(...activeMultiplayerSnapshots({
      interactionId: "100000000000000041",
      receivedAt: baseTime,
      notation: ["4d6kh3"],
      repetitions: 2,
      title: "Abilities",
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);
    const job = await repository.claimRankJob(baseTime + 180_001);
    if (job === null) throw new Error("Expected a rank job");
    await repository.completeRankJob(
      job,
      { status: "accepted", value: dndResponse, ...detectionProvenance },
      baseTime + 180_002,
      1,
    );

    await record(snapshot({
      interactionId: "100000000000000045",
      receivedAt: baseTime + 240_000,
      notation: ["4d6kh3"],
      repetitions: 1,
      title: "Abilities",
      userId: "100000000000000099",
    }));
    await repository.ingestDeliveredRolls(baseTime + 240_000);

    await expect(repository.claimRankJob(baseTime + 240_001)).resolves.toBeNull();
    const second = await dataEnv.DATA.prepare(
      `SELECT classification, game_id FROM game_detection_rolls
       WHERE interaction_id = '100000000000000045'`,
    ).first();
    expect(second).toEqual({
      classification: "in-game",
      game_id: "dungeons-and-dragons-5e-2014",
    });
    const count = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM game_detections",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("reranks when roll-label context changes within the active episode", async () => {
    await record(...activeMultiplayerSnapshots({
      interactionId: "100000000000000121",
      receivedAt: baseTime,
      notation: ["4d6kh3"],
      repetitions: 2,
      title: "Abilities",
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);
    const first = await repository.claimRankJob(baseTime + 180_001);
    if (first === null) throw new Error("Expected a rank job");
    await repository.completeRankJob(
      first,
      { status: "accepted", value: dndResponse, ...detectionProvenance },
      baseTime + 180_002,
      1,
    );

    await record(snapshot({
      interactionId: "100000000000000125",
      receivedAt: baseTime + 240_000,
      notation: ["4d6kh3"],
      repetitions: 1,
      title: "Evasion",
      userId: "100000000000000099",
    }));
    await repository.ingestDeliveredRolls(baseTime + 240_000);

    const second = await repository.claimRankJob(baseTime + 240_001);
    expect(second).not.toBeNull();
    expect(second?.candidateSignature).not.toBe(first.candidateSignature);
  });

  it("uses the episode identity when identical mechanics resume after inactivity", async () => {
    await record(
      ...activeMultiplayerSnapshots({
        interactionId: "100000000000000141",
        receivedAt: baseTime,
        notation: ["4d6kh3"],
        repetitions: 2,
        title: "Abilities",
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);
    const first = await repository.claimRankJob(baseTime + 180_001);
    if (first === null) throw new Error("Expected the first episode rank job");
    await repository.completeRankJob(
      first,
      { status: "accepted", value: dndResponse, ...detectionProvenance },
      baseTime + 180_002,
      1,
    );

    await record(
      ...activeMultiplayerSnapshots({
        interactionId: "100000000000000151",
        receivedAt: baseTime + hour,
        notation: ["4d6kh3"],
        repetitions: 2,
        title: "Abilities",
      }),
    );
    await repository.ingestDeliveredRolls(baseTime + hour + 180_000);
    const second = await repository.claimRankJob(baseTime + hour + 180_001);

    expect(second?.episodeStartedAt).toBe(baseTime + hour);
    expect(second?.candidateSignature).not.toBe(first.candidateSignature);
  });

  it("fails an interrupted model attempt once and releases pending rolls as unknown", async () => {
    await record(...activeMultiplayerSnapshots({
      interactionId: "100000000000000061",
      receivedAt: baseTime,
      notation: ["4d6kh3"],
      repetitions: 2,
      title: "Abilities",
    }));
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 180_000);
    await expect(
      repository.claimRankJob(baseTime + 180_001),
    ).resolves.not.toBeNull();

    await expect(
      repository.failInterruptedRankJobs(
        baseTime + 180_001 + 10 * 60 * 1_000,
      ),
    ).resolves.toBe(1);
    const roll = await dataEnv.DATA.prepare(
      "SELECT classification FROM game_detection_rolls",
    ).first();
    expect(roll).toEqual({ classification: "unknown" });
    await expect(
      repository.claimRankJob(baseTime + 180_002 + 10 * 60 * 1_000),
    ).resolves.toBeNull();
  });

  it("retains only anonymous titled-roll frequencies after ninety days", async () => {
    await record(
      snapshot({ interactionId: "100000000000000051", receivedAt: baseTime, title: "Attack" }),
      snapshot({
        interactionId: "100000000000000052",
        receivedAt: baseTime + 1,
        title: null,
      }),
    );
    const repository = new D1GameDetectionRepository(dataEnv.DATA);
    await repository.ingestDeliveredRolls(baseTime + 1);
    await repository.ingestDeliveredRolls(baseTime + 4 * hour);

    await expect(
      repository.aggregateAndDeleteExpired(baseTime + 90 * day + 1),
    ).resolves.toBe(2);
    const aggregate = await dataEnv.DATA.prepare(
      `SELECT classification, game_id_key, roll_count, titled_roll_count
       FROM game_detection_daily_aggregates`,
    ).first();
    expect(aggregate).toEqual({
      classification: "unknown",
      game_id_key: "",
      roll_count: 2,
      titled_roll_count: 1,
    });
    await expect(
      dataEnv.DATA.prepare("SELECT * FROM game_detection_sessions").all(),
    ).resolves.toMatchObject({ results: [] });
  });
});
