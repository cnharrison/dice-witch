import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { RollLifecycleSnapshotV1 } from "../../packages/discord-contracts/src";
import { D1RollLifecycleRepository } from "../../workers/data/src/roll-lifecycle-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const acceptedAt = 1_767_225_600_123;
const interactionId = "100000000000000001";

function snapshot(
  overrides: Partial<RollLifecycleSnapshotV1> = {},
): RollLifecycleSnapshotV1 {
  return {
    version: 1,
    interactionId,
    revision: 1,
    commandName: "roll",
    scope: "guild",
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
      applicationId: "100000000000000002",
      notation: "1d20",
      request: { notation: ["1d20"], repetitions: 1 },
      title: "Initiative",
      savedRoll: null,
      userId: "100000000000000003",
      username: "fixture-user",
      guildId: "100000000000000004",
      channelId: "100000000000000005",
      guildName: "Fixture Guild",
      channelName: "dice-rolls",
      channelType: 0,
      outcome: {
        version: 1,
        seed: 1,
        outcomes: [{ notation: "1d20", output: "1d20: [20] = 20", total: 20 }],
        errors: [],
      },
      rollSeed: 1,
      renderSeed: 2,
      renderVersion: 4,
      rendererRevision: "canvaskit-v4-r8",
      destinationPayload: null,
    },
    ...overrides,
  };
}

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.prepare("DELETE FROM roll_lifecycle_receipts").run();
});

describe("D1RollLifecycleRepository", () => {
  it("records idempotent monotonic lifecycle snapshots", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    const deferred = snapshot({
      acceptedAt: null,
      state: "deferred",
    });
    const accepted = snapshot({ revision: 2 });
    const started = snapshot({
      revision: 3,
      state: "delivery_started",
      deliveryStartedAt: acceptedAt + 10,
      attempts: 1,
    });
    const delivered = snapshot({
      revision: 4,
      state: "delivered",
      deliveryStartedAt: acceptedAt + 10,
      terminalAt: acceptedAt + 50,
      attempts: 1,
      httpStatus: 200,
    });

    await expect(repository.record(deferred)).resolves.toEqual({ status: "applied" });
    await expect(repository.record(deferred)).resolves.toEqual({ status: "existing" });
    await expect(repository.record(accepted)).resolves.toEqual({ status: "applied" });
    await expect(repository.record(started)).resolves.toEqual({ status: "applied" });
    await expect(repository.record(accepted)).resolves.toEqual({ status: "stale" });
    await expect(repository.record(delivered)).resolves.toEqual({ status: "applied" });
    await expect(
      repository.record(snapshot({
        revision: 5,
        state: "failed",
        terminalAt: acceptedAt + 60,
        failurePhase: "record",
        failureCode: "stored-record-invalid",
      })),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("rejects conflicting immutable context and forbidden credentials", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    await repository.record(snapshot());

    await expect(
      repository.record(snapshot({
        revision: 2,
        context: { ...snapshot().context, notation: "2d20" },
      })),
    ).resolves.toEqual({ status: "conflict" });
    await expect(
      repository.record(snapshot({
        interactionId: "100000000000000006",
        context: {
          ...snapshot().context,
          destinationPayload: { token: "forbidden" },
        },
      })),
    ).rejects.toThrow("Roll lifecycle context is invalid");
  });

  it("claims one delayed alert and resolves it by editing the same message", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    await repository.record(snapshot());

    await expect(
      repository.claimAlerts(acceptedAt + 119_989, 120_000, 60_000, 10),
    ).resolves.toEqual([]);
    const claimed = await repository.claimAlerts(
      acceptedAt + 119_990,
      120_000,
      60_000,
      10,
    );
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ interactionId, alertMessageId: null });
    await expect(
      repository.claimAlerts(acceptedAt + 119_991, 120_000, 60_000, 10),
    ).resolves.toEqual([]);

    await repository.markAlertSent(
      interactionId,
      "100000000000000099",
      1,
      acceptedAt + 120_010,
    );
    await repository.record(snapshot({
      revision: 2,
      state: "delivered",
      deliveryStartedAt: acceptedAt + 30,
      terminalAt: acceptedAt + 121_000,
      attempts: 2,
      httpStatus: 200,
    }));
    const updates = await repository.claimAlertUpdates(
      acceptedAt + 121_001,
      60_000,
      10,
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      interactionId,
      state: "delivered",
      alertMessageId: "100000000000000099",
    });
    await repository.markAlertUpdated(interactionId, 2, acceptedAt + 121_010);

    await expect(
      repository.claimAlertUpdates(acceptedAt + 121_011, 60_000, 10),
    ).resolves.toEqual([]);
  });

  it("does not bypass retry times and updates an alert after a terminal race", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    await repository.record(snapshot());
    const claimed = await repository.claimAlerts(
      acceptedAt + 119_990,
      120_000,
      60_000,
      10,
    );
    expect(claimed).toHaveLength(1);
    await repository.releaseAlert(
      interactionId,
      "send",
      acceptedAt + 180_000,
    );
    await expect(
      repository.claimAlerts(acceptedAt + 179_999, 120_000, 60_000, 10),
    ).resolves.toEqual([]);
    const retried = await repository.claimAlerts(
      acceptedAt + 180_000,
      120_000,
      60_000,
      10,
    );
    expect(retried).toHaveLength(1);

    await repository.record(snapshot({
      revision: 2,
      state: "delivered",
      deliveryStartedAt: acceptedAt + 30,
      terminalAt: acceptedAt + 180_010,
      attempts: 1,
      httpStatus: 200,
    }));
    await repository.markAlertSent(
      interactionId,
      "100000000000000099",
      1,
      acceptedAt + 180_020,
    );
    await expect(
      repository.claimAlertUpdates(acceptedAt + 180_020, 60_000, 10),
    ).resolves.toHaveLength(1);
  });

  it("claims known failures immediately and deletes records after retention", async () => {
    const repository = new D1RollLifecycleRepository(dataEnv.DATA);
    await repository.record(snapshot({
      state: "failed",
      terminalAt: acceptedAt + 20,
      failurePhase: "record",
      failureCode: "stored-record-invalid",
    }));

    await expect(
      repository.claimAlerts(acceptedAt + 21, 120_000, 60_000, 10),
    ).resolves.toHaveLength(1);
    await expect(repository.deleteExpired(acceptedAt - 20)).resolves.toBe(0);
    await expect(repository.deleteExpired(acceptedAt - 19)).resolves.toBe(1);
  });
});
