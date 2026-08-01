import { env, exports } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RollLifecycleSnapshotV1 } from "../../packages/discord-contracts/src";
import { D1DiscordChannelDirectoryRepository } from "../../workers/data/src/discord-channel-directory-repository";
import { D1RollLifecycleRepository } from "../../workers/data/src/roll-lifecycle-repository";
import { processRollLifecycleAlerts } from "../../workers/data/src/roll-lifecycle-service";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const acceptedAt = 1_767_225_600_000;
const interactionId = "100000000000000011";

function snapshot(
  overrides: Partial<RollLifecycleSnapshotV1> = {},
): RollLifecycleSnapshotV1 {
  return {
    version: 1,
    interactionId,
    revision: 1,
    commandName: "roll",
    scope: "dm",
    receivedAt: acceptedAt - 20,
    deferredAt: acceptedAt - 10,
    acceptedAt,
    deliveryStartedAt: null,
    terminalAt: null,
    state: "accepted",
    attempts: 0,
    httpStatus: null,
    failurePhase: null,
    failureCode: null,
    context: {
      version: 1,
      applicationId: "100000000000000012",
      notation: "1d20",
      request: { notation: ["1d20"], repetitions: 1 },
      title: null,
      savedRoll: null,
      userId: "100000000000000013",
      username: "fixture-user",
      guildId: null,
      channelId: "100000000000000014",
      guildName: null,
      channelName: null,
      channelType: 1,
      outcome: { version: 1, outcomes: [], errors: [] },
      rollSeed: 1,
      renderSeed: 2,
      renderVersion: 4,
      rendererRevision: "canvaskit-v4-r8",
      destinationPayload: null,
    },
    ...overrides,
  };
}

function failedGuildSnapshot(
  guildId: string,
  channelId: string,
): RollLifecycleSnapshotV1 {
  const base = snapshot();
  return snapshot({
    scope: "guild",
    state: "failed",
    terminalAt: acceptedAt + 10,
    failurePhase: "record",
    failureCode: "stored-record-invalid",
    context: {
      ...base.context,
      guildId,
      channelId,
      guildName: null,
      channelName: null,
      channelType: null,
    },
  });
}

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM discord_channel_directory"),
    dataEnv.DATA.prepare("DELETE FROM roll_lifecycle_receipts"),
  ]);
});

describe("Data Worker roll lifecycle service", () => {
  it("accepts exact lifecycle snapshots on the internal boundary", async () => {
    const response = await exports.default.fetch(
      new Request("https://data.internal/internal/roll-lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot()),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "applied" });
    const row = await dataEnv.DATA.prepare(
      "SELECT state, scope, guild_id FROM roll_lifecycle_receipts WHERE interaction_id = ?",
    )
      .bind(interactionId)
      .first();
    expect(row).toEqual({ state: "accepted", scope: "dm", guild_id: null });
  });

  it("enriches a guild lifecycle alert from shared cache without changing its stored snapshot", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    const guildId = "100000000000000015";
    const channelId = "100000000000000016";
    await dataEnv.DATA.prepare(
      "INSERT INTO guilds (id, name) VALUES (?, ?)",
    ).bind(guildId, "Stored Fixture Guild").run();
    await repository.record(failedGuildSnapshot(guildId, channelId));
    await new D1DiscordChannelDirectoryRepository(dataEnv.DATA).apply({
      version: 1,
      operation: "upsert",
      source: "interaction",
      guildId,
      channelId,
      channelName: "resolved-rolls",
      channelType: 0,
      observedAt: acceptedAt,
    }, acceptedAt);
    const createRollLifecycleAlertV1 = vi.fn((value: unknown) => {
      void value;
      return Promise.resolve({
        status: "delivered",
        messageId: "100000000000000099",
        httpStatus: 200,
      });
    });
    const resolveDiscordChannelContextV1 = vi.fn();

    await processRollLifecycleAlerts(
      {
        DATA: dataEnv.DATA,
        DISCORD_REST: {
          createRollLifecycleAlertV1,
          updateRollLifecycleAlertV1: vi.fn(),
          resolveDiscordChannelContextV1,
        },
      },
      acceptedAt + 11,
    );

    expect(resolveDiscordChannelContextV1).not.toHaveBeenCalled();
    expect(createRollLifecycleAlertV1.mock.calls[0]?.[0]).toMatchObject({
      context: {
        guildName: "Stored Fixture Guild",
        channelName: "resolved-rolls",
        channelType: 0,
      },
    });
    const stored = await dataEnv.DATA.prepare(
      "SELECT context_json FROM roll_lifecycle_receipts WHERE interaction_id = ?",
    ).bind(interactionId).first<{ context_json: string }>();
    expect(JSON.parse(stored?.context_json ?? "null")).toMatchObject({
      guildName: null,
      channelName: null,
      channelType: null,
    });
  });

  it("does not delay a safe alert when display enrichment is retryable", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    const guildId = "100000000000000017";
    const channelId = "100000000000000018";
    await repository.record(failedGuildSnapshot(guildId, channelId));
    const createRollLifecycleAlertV1 = vi.fn((value: unknown) => {
      void value;
      return Promise.resolve({
        status: "delivered",
        messageId: "100000000000000099",
        httpStatus: 200,
      });
    });

    await processRollLifecycleAlerts(
      {
        DATA: dataEnv.DATA,
        DISCORD_REST: {
          createRollLifecycleAlertV1,
          updateRollLifecycleAlertV1: vi.fn(),
          resolveDiscordChannelContextV1: vi.fn(() => Promise.resolve({
            status: "retryable" as const,
            httpStatus: 429,
            retryAfterMs: 500,
          })),
        },
      },
      acceptedAt + 11,
    );

    expect(createRollLifecycleAlertV1.mock.calls[0]?.[0]).toMatchObject({
      context: {
        guildName: null,
        channelName: null,
        channelType: null,
      },
    });
  });

  it("retries rejected alerts without creating a permanent blind spot", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    await repository.record(snapshot({
      state: "failed",
      terminalAt: acceptedAt + 10,
      failurePhase: "record",
      failureCode: "stored-record-invalid",
    }));
    const createRollLifecycleAlertV1 = vi.fn(() => Promise.resolve({
      status: "failed",
      httpStatus: 403,
    }));
    const serviceEnv = {
      DATA: dataEnv.DATA,
      DISCORD_REST: {
        createRollLifecycleAlertV1,
        updateRollLifecycleAlertV1: vi.fn(),
        createRollLifecycleAlertV2: vi.fn(),
        updateRollLifecycleAlertV2: vi.fn(),
        resolveDiscordChannelContextV1: vi.fn(),
      },
    };

    await processRollLifecycleAlerts(serviceEnv, acceptedAt + 11);
    await processRollLifecycleAlerts(serviceEnv, acceptedAt + 15 * 60_000);
    expect(createRollLifecycleAlertV1).toHaveBeenCalledTimes(1);
    await processRollLifecycleAlerts(serviceEnv, acceptedAt + 15 * 60_000 + 11);
    expect(createRollLifecycleAlertV1).toHaveBeenCalledTimes(2);
  });

  it("creates one delayed alert and edits it after recovery", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    await repository.record(snapshot());
    const createRollLifecycleAlertV1 = vi.fn(() => Promise.resolve({
      status: "delivered",
      messageId: "100000000000000099",
      httpStatus: 200,
    }));
    const updateRollLifecycleAlertV1 = vi.fn(() => Promise.resolve({
      status: "delivered",
      messageId: "100000000000000099",
      httpStatus: 200,
    }));
    const serviceEnv = {
      DATA: dataEnv.DATA,
      DISCORD_REST: {
        createRollLifecycleAlertV1,
        updateRollLifecycleAlertV1,
        createRollLifecycleAlertV2: vi.fn(),
        updateRollLifecycleAlertV2: vi.fn(),
        resolveDiscordChannelContextV1: vi.fn(),
      },
    };

    await processRollLifecycleAlerts(serviceEnv, acceptedAt + 120_000);
    await processRollLifecycleAlerts(serviceEnv, acceptedAt + 120_001);
    expect(createRollLifecycleAlertV1).toHaveBeenCalledTimes(1);
    expect(createRollLifecycleAlertV1).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId,
        alertMessageId: null,
        state: "accepted",
      }),
    );

    await repository.record(snapshot({
      revision: 2,
      state: "delivered",
      deliveryStartedAt: acceptedAt + 10,
      terminalAt: acceptedAt + 121_000,
      attempts: 1,
      httpStatus: 200,
    }));
    await processRollLifecycleAlerts(serviceEnv, acceptedAt + 121_001);
    expect(updateRollLifecycleAlertV1).toHaveBeenCalledTimes(1);
    expect(updateRollLifecycleAlertV1).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId,
        alertMessageId: "100000000000000099",
        state: "delivered",
      }),
    );
  });
});
