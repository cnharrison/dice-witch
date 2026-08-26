import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { RollLifecycleSnapshotV1 } from "../../packages/discord-contracts/src";
import type { SchemaInput } from "../../packages/discord-contracts/src/schema-primitives";
import type { NarrationGameRankingResponseV1 } from "../../packages/roll-domain/src";
import {
  GAME_DETECTION_MODEL_ID,
  processGameDetectionMinute,
  type GameDetectionServiceEnv,
} from "../../workers/data/src/game-detection-service";
import dataWorker, { type DataEnv } from "../../workers/data/src/index";
import { D1RollLifecycleRepository } from "../../workers/data/src/roll-lifecycle-repository";

const TestMigrationsBindingSchema = z.object({
  TEST_MIGRATIONS: z.array(z.strictObject({
    name: z.string(),
    queries: z.array(z.string()),
  })),
});
const dataEnv = {
  DATA: env.DATA,
  ...TestMigrationsBindingSchema.parse(env),
} satisfies { DATA: D1Database; TEST_MIGRATIONS: D1Migration[] };
const observedAt = 1_767_225_600_000;
const activeAt = observedAt + 180_000;
const GameDetectionAiCallSchema = z.tuple([
  z.literal(GAME_DETECTION_MODEL_ID),
  z.strictObject({
    messages: z.array(z.strictObject({
      role: z.enum(["system", "user"]),
      content: z.string(),
    })),
    response_format: z.strictObject({
      type: z.literal("json_schema"),
      json_schema: z.unknown(),
    }),
    max_tokens: z.literal(1_024),
    temperature: z.literal(0),
    top_p: z.literal(1),
    seed: z.number().int().positive(),
    stream: z.literal(false),
  }),
  z.strictObject({
    signal: z.instanceof(AbortSignal),
    tags: z.tuple([
      z.literal("dice-witch:game-detection"),
      z.literal("prompt:v3"),
    ]),
  }),
]);
type AiFallbackOutput = Awaited<ReturnType<Ai["run"]>>;
type AnnouncementHandler =
  GameDetectionServiceEnv["DISCORD_REST"]["createGameDetectionAnnouncementV1"];
type ContextHandler =
  GameDetectionServiceEnv["DISCORD_REST"]["resolveDiscordChannelContextV1"];

class GameDetectionAiFake implements Ai {
  aiGatewayLogId: string | null = null;
  readonly gateway = vi.fn<Ai["gateway"]>();
  readonly aiSearch = vi.fn<Ai["aiSearch"]>();
  readonly autorag = vi.fn<Ai["autorag"]>();
  readonly models = vi.fn<Ai["models"]>();
  readonly runMock = vi.fn<(
    model: string,
    inputs: SchemaInput,
    options?: AiOptions,
  ) => Promise<SchemaInput>>();

  run<Name extends keyof AiModels>(
    model: Name,
    inputs: { requests: AiModels[Name]["inputs"][] },
    options: AiOptions & { queueRequest: true },
  ): Promise<AiAsyncBatchResponse>;
  run<Name extends keyof AiModels>(
    model: Name,
    inputs: AiModels[Name]["inputs"],
    options: AiOptions & (
      | { returnRawResponse: true }
      | { websocket: true }
    ),
  ): Promise<Response>;
  run<Name extends keyof AiModels>(
    model: Name,
    inputs: AiModels[Name]["inputs"] & { stream: true },
    options?: AiOptions,
  ): Promise<ReadableStream>;
  run<Name extends keyof AiModels>(
    model: Name,
    inputs: AiModels[Name]["inputs"],
    options?: AiOptions,
  ): Promise<AiModels[Name]["postProcessedOutputs"]>;
  run<Model extends string>(
    model: Model extends keyof AiModels ? never : Model,
    inputs: AiFallbackOutput,
    options?: AiOptions,
  ): Promise<AiFallbackOutput>;
  run(
    model: string,
    inputs: SchemaInput,
    options?: AiOptions,
  ): Promise<SchemaInput> {
    return this.runMock(model, inputs, options);
  }

  toMarkdown(): ToMarkdownService;
  toMarkdown(
    files: MarkdownDocument[],
    options?: ConversionRequestOptions,
  ): Promise<ConversionResponse[]>;
  toMarkdown(
    files: MarkdownDocument,
    options?: ConversionRequestOptions,
  ): Promise<ConversionResponse>;
  toMarkdown(
    _files?: MarkdownDocument | MarkdownDocument[],
    _options?: ConversionRequestOptions,
  ): never {
    void _files;
    void _options;
    throw new Error("Markdown conversion was not expected");
  }
}

type AiRunCall = Parameters<GameDetectionAiFake["runMock"]>;

function modelPrompt(calls: readonly AiRunCall[]): string {
  const call = GameDetectionAiCallSchema.parse(calls[0]);
  return call[1].messages.map(({ content }) => content).join("\n");
}

function mockAiResponse(response: string): GameDetectionAiFake {
  const ai = new GameDetectionAiFake();
  ai.runMock.mockResolvedValue({ response });
  return ai;
}

function rejectUnexpectedAiCall(): GameDetectionAiFake {
  const ai = new GameDetectionAiFake();
  ai.runMock.mockRejectedValue(new Error("AI inference was not expected"));
  return ai;
}

function mockAnnouncement() {
  return vi.fn<AnnouncementHandler>();
}

function mockContextResolution() {
  return vi.fn<ContextHandler>();
}

function scheduledDataEnv(): DataEnv {
  const unexpected = new Error("Discord REST call was not expected");
  return {
    APPEARANCE_CATALOG_POLICY: "r37",
    DATA: env.DATA,
    AI: rejectUnexpectedAiCall(),
    DISCORD_REST: {
      createRollLifecycleAlertV1:
        vi.fn<DataEnv["DISCORD_REST"]["createRollLifecycleAlertV1"]>()
          .mockRejectedValue(unexpected),
      updateRollLifecycleAlertV1:
        vi.fn<DataEnv["DISCORD_REST"]["updateRollLifecycleAlertV1"]>()
          .mockRejectedValue(unexpected),
      createRollLifecycleAlertV2:
        vi.fn<DataEnv["DISCORD_REST"]["createRollLifecycleAlertV2"]>()
          .mockRejectedValue(unexpected),
      updateRollLifecycleAlertV2:
        vi.fn<DataEnv["DISCORD_REST"]["updateRollLifecycleAlertV2"]>()
          .mockRejectedValue(unexpected),
      createGameDetectionAnnouncementV1: mockAnnouncement()
        .mockRejectedValue(unexpected),
      resolveDiscordChannelContextV1: mockContextResolution()
        .mockRejectedValue(unexpected),
    },
  };
}

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
} as const satisfies NarrationGameRankingResponseV1;

beforeEach(async () => {
  vi.restoreAllMocks();
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM discord_channel_directory"),
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

describe("Data minute maintenance", () => {
  it("disables platform retries because the next minute is the next attempt", async () => {
    const noRetry = vi.fn();

    await expect(dataWorker.scheduled(
      {
        cron: "* * * * *",
        scheduledTime: observedAt,
        noRetry,
      },
      scheduledDataEnv(),
    )).resolves.toBeUndefined();
    expect(noRetry).toHaveBeenCalledOnce();
  });
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
    const ai = rejectUnexpectedAiCall();
    const announce = mockAnnouncement();
    const resolveContext = mockContextResolution();

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveDiscordChannelContextV1: resolveContext,
        },
      }, observedAt + 120_000),
    ).resolves.toMatchObject({
      ingested: 3,
      channelContext: "none",
      rankJob: "none",
      announcement: "none",
    });
    expect(ai.runMock).not.toHaveBeenCalled();
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
    const ai = rejectUnexpectedAiCall();
    const announce = mockAnnouncement();

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveDiscordChannelContextV1: mockContextResolution(),
        },
      }, observedAt + 240_000),
    ).resolves.toMatchObject({
      ingested: 16,
      rankJob: "none",
      announcement: "none",
    });
    expect(ai.runMock).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    await expect(
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM game_detection_rank_jobs",
      ).first<{ count: number }>(),
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
    const ai = mockAiResponse(JSON.stringify({
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
    } satisfies NarrationGameRankingResponseV1));
    const announce = mockAnnouncement().mockResolvedValue({
      status: "delivered",
      messageId: "100000000000000097",
      httpStatus: 200,
    });

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveDiscordChannelContextV1: mockContextResolution(),
        },
      }, activeAt),
    ).resolves.toMatchObject({
      ingested: 4,
      rankJob: "selected",
      announcement: "sent",
    });
    expect(ai.runMock).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith(expect.objectContaining({
      gameId: "dungeon-crawl-classics",
      confidence: "plausible",
    }));
  });

  it("ranks in the background with all useful context and posts only the validated detection", async () => {
    await recordActiveMultiplayer(
      deliveredRoll("100000000000000031"),
    );
    const ai = mockAiResponse(JSON.stringify(dndResponse));
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const announce = mockAnnouncement().mockResolvedValue({
      status: "delivered",
      messageId: "100000000000000099",
      httpStatus: 200,
    });

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveDiscordChannelContextV1: mockContextResolution(),
        },
      }, activeAt),
    ).resolves.toMatchObject({
      ingested: 4,
      rankJob: "selected",
      announcement: "sent",
    });

    expect(ai.runMock).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(45_000);
    timeout.mockRestore();
    const prompt = modelPrompt(ai.runMock.mock.calls);
    expect(prompt).toContain("Thursday D&D");
    expect(prompt).toContain("curse-of-strahd");
    expect(prompt).toContain("Create a Curse of Strahd character");
    expect(prompt).toContain("fixture-player");
    expect(prompt).not.toContain("100000000000000002");
    expect(prompt).not.toContain("100000000000000099");
    expect(prompt).not.toContain("renderSeed");
    expect(prompt).not.toContain("destinationPayload");

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
      ).first<{ model_id: string; prompt_revision: string }>(),
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
    const ai = mockAiResponse(JSON.stringify({
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
    } satisfies NarrationGameRankingResponseV1));
    const announce = mockAnnouncement().mockResolvedValue({
      status: "delivered",
      messageId: "100000000000000098",
      httpStatus: 200,
    });

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveDiscordChannelContextV1: mockContextResolution(),
        },
      }, activeAt),
    ).resolves.toMatchObject({ rankJob: "selected", announcement: "sent" });

    expect(modelPrompt(ai.runMock.mock.calls)).toContain("cyberpunk-red");
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
    const resolveContext = mockContextResolution().mockResolvedValue({
      status: "resolved",
      channelName: "resolved-strahd",
      channelType: 0,
    });
    const ai = mockAiResponse(JSON.stringify(dndResponse));
    const announce = mockAnnouncement().mockResolvedValue({
      status: "delivered",
      messageId: "100000000000000097",
      httpStatus: 200,
    });

    await expect(
      processGameDetectionMinute({
        DATA: dataEnv.DATA,
        AI: ai,
        DISCORD_REST: {
          createGameDetectionAnnouncementV1: announce,
          resolveDiscordChannelContextV1: resolveContext,
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
    const prompt = modelPrompt(ai.runMock.mock.calls);
    expect(prompt).toContain("Stored Thursday Guild");
    expect(prompt).toContain("resolved-strahd");
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
    const resolveContext = mockContextResolution()
      .mockResolvedValueOnce({
        status: "retryable",
        httpStatus: 429,
        retryAfterMs: 60_000,
      })
      .mockResolvedValueOnce({
        status: "failed",
        httpStatus: 401,
      });
    const ai = rejectUnexpectedAiCall();
    const announce = mockAnnouncement();
    const serviceEnv = {
      DATA: dataEnv.DATA,
      AI: ai,
      DISCORD_REST: {
        createGameDetectionAnnouncementV1: announce,
        resolveDiscordChannelContextV1: resolveContext,
      },
    } satisfies GameDetectionServiceEnv;

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
    expect(ai.runMock).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("records an invalid model response once without posting or retrying", async () => {
    await recordActiveMultiplayer(
      deliveredRoll("100000000000000041"),
    );
    const ai = mockAiResponse("{}");
    const announce = mockAnnouncement();
    const serviceEnv = {
      DATA: dataEnv.DATA,
      AI: ai,
      DISCORD_REST: {
        createGameDetectionAnnouncementV1: announce,
        resolveDiscordChannelContextV1: mockContextResolution(),
      },
    } satisfies GameDetectionServiceEnv;

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

    expect(ai.runMock).toHaveBeenCalledOnce();
    expect(announce).not.toHaveBeenCalled();
    const job = await dataEnv.DATA.prepare(
      `SELECT state, attempt_count, result, detail
       FROM game_detection_rank_jobs`,
    ).first<{
      state: string;
      attempt_count: number;
      result: string;
      detail: string;
    }>();
    expect(job).toEqual({
      state: "completed",
      attempt_count: 1,
      result: "rejected",
      detail: "invalid-schema",
    });
    const roll = await dataEnv.DATA.prepare(
      "SELECT classification FROM game_detection_rolls",
    ).first<{ classification: string }>();
    expect(roll).toEqual({ classification: "unknown" });
  });
});
