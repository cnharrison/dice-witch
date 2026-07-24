import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { WebDeliveryExecutionResult } from "../../workers/roll/src";

const USER_ID = "100000000000000003";
const GUILD_ID = "100000000000000002";
const CHANNEL_ID = "100000000000000010";

function request(
  deliveryId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    deliveryId,
    notation: "1d20",
    repetitions: 1,
    username: "web-user",
    title: "web-result",
    userId: USER_ID,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    skipDelay: true,
    ...overrides,
  };
}

function work(deliveryId: string) {
  return env.WEB_DELIVERY_WORK.getByName(`${USER_ID}:${deliveryId}`);
}

async function executeWork(
  stub: ReturnType<typeof work>,
  value: unknown,
): Promise<WebDeliveryExecutionResult> {
  return stub.execute(value);
}

describe("WebDeliveryWork Durable Object", () => {
  it("persists one exact result before destination delivery and hands it to LogWork later", async () => {
    const deliveryId = "11111111-1111-4111-8111-111111111111";
    const stub = work(deliveryId);
    const result = await executeWork(stub, request(deliveryId));

    expect(result).toMatchObject({
      status: "delivered",
      roll: { status: "rolled" },
    });
    if (!("roll" in result) || result.roll.status !== "rolled") {
      throw new Error("Expected a delivered web roll");
    }
    const roll = result.roll;
    expect(roll.renderedImage.png).toEqual(roll.discord.png);
    expect(roll.renderedImage.png.byteLength).toBeGreaterThan(0);

    let rollId = "";
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          image_bytes: ArrayBuffer;
          roll_id: string;
          state: string;
          logging_state: string;
        }>(
          `SELECT image_bytes, roll_id, state, logging_state
           FROM web_delivery`,
        )
        .one();
      rollId = row.roll_id;
      expect(new Uint8Array(row.image_bytes)).toEqual(
        roll.renderedImage.png,
      );
      expect(row).toMatchObject({
        state: "delivered",
        logging_state: "pending",
      });
      await expect(state.storage.getAlarm()).resolves.not.toBeNull();
    });
    await expect(env.LOG_WORK.getByName(rollId).artifactStatus()).resolves.toEqual({
      state: "missing",
    });

    await runDurableObjectAlarm(stub);
    await expect(env.LOG_WORK.getByName(rollId).artifactStatus()).resolves.toMatchObject({
      state: "pending",
      imageBytes: roll.renderedImage.png.byteLength,
    });
  });

  it("serializes concurrent same-ID execution and rejects a conflicting request", async () => {
    const deliveryId = "99999999-9999-4999-8999-999999999999";
    const stub = work(deliveryId);
    const input = request(deliveryId);

    const [first, replay, conflict] = await Promise.all([
      executeWork(stub, input),
      executeWork(stub, input),
      executeWork(stub, request(deliveryId, { notation: "2d20" })),
    ]);

    expect(replay).toEqual(first);
    expect(conflict).toEqual({ status: "conflict" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ count: number; attempts: number }>(
          "SELECT COUNT(*) AS count, attempts FROM web_delivery",
        )
        .one();
      expect(row).toEqual({ count: 1, attempts: 1 });
    });
  });

  it("returns the immutable stored result for an idempotent replay", async () => {
    const deliveryId = "22222222-2222-4222-8222-222222222222";
    const stub = work(deliveryId);
    const first = await executeWork(stub, request(deliveryId));
    await evictDurableObject(stub);
    const replay = await executeWork(stub, request(deliveryId));

    expect(replay).toEqual(first);
    await expect(
      executeWork(stub, request(deliveryId, { notation: "2d20" })),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("reuses the exact stored result when a retryable destination recovers", async () => {
    const deliveryId = "33333333-3333-4333-8333-333333333333";
    const stub = work(deliveryId);
    const input = request(deliveryId, { title: "web-retry" });
    const first = await executeWork(stub, input);
    expect(first).toMatchObject({ status: "pending", roll: { status: "rolled" } });
    if (!("roll" in first) || first.roll.status !== "rolled") {
      throw new Error("Expected a pending web roll");
    }
    const png = first.roll.renderedImage.png.slice();

    await evictDurableObject(stub);
    const retry = await executeWork(stub, input);
    expect(retry).toMatchObject({ status: "delivered", roll: { status: "rolled" } });
    if (!("roll" in retry) || retry.roll.status !== "rolled") {
      throw new Error("Expected a delivered retry");
    }
    expect(retry.roll.renderedImage.png).toEqual(png);
    expect(retry.roll.resultArray).toEqual(first.roll.resultArray);
  });

  it("recovers from seeds persisted before an interrupted render commit", async () => {
    const deliveryId = "66666666-6666-4666-8666-666666666666";
    const stub = work(deliveryId);
    const input = request(deliveryId);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER fail_result_commit
        BEFORE UPDATE OF result_json ON web_delivery
        BEGIN
          SELECT RAISE(ABORT, 'simulated result commit failure');
        END;
      `);
    });

    await runInDurableObject(stub, async (instance) => {
      const workInstance = instance as unknown as {
        execute(value: unknown): Promise<unknown>;
      };
      await expect(workInstance.execute(input)).rejects.toThrow(
        "simulated result commit failure",
      );
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          state: string;
          render_seed: number;
          roll_seed: number;
        }>("SELECT state, render_seed, roll_seed FROM web_delivery")
        .one();
      expect(row.state).toBe("preparing");
      expect(row.render_seed).toBeGreaterThanOrEqual(0);
      expect(row.roll_seed).toBeGreaterThanOrEqual(0);
      state.storage.sql.exec("DROP TRIGGER fail_result_commit");
    });

    await evictDurableObject(stub);
    await expect(executeWork(stub, input)).resolves.toMatchObject({
      status: "delivered",
      roll: { status: "rolled" },
    });
  });

  it("rejects corrupted stored bytes without deleting a pending log outbox", async () => {
    const deliveryId = "77777777-7777-4777-8777-777777777777";
    const stub = work(deliveryId);
    const result = await executeWork(stub, request(deliveryId));
    expect(result).toMatchObject({ status: "delivered" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ image_bytes: ArrayBuffer }>(
          "SELECT image_bytes FROM web_delivery",
        )
        .one();
      const corrupted = new Uint8Array(row.image_bytes).slice();
      corrupted[0] = (corrupted[0] ?? 0) ^ 1;
      state.storage.sql.exec(
        `UPDATE web_delivery
         SET image_bytes = ?, artifact_cleanup_at = 0
         WHERE singleton = 1`,
        corrupted,
      );
    });

    await expect(runDurableObjectAlarm(stub)).rejects.toThrow(
      "Stored web delivery PNG hash is invalid",
    );
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ image_bytes: ArrayBuffer | null; logging_state: string }>(
          "SELECT image_bytes, logging_state FROM web_delivery",
        )
        .one();
      expect(row.image_bytes).not.toBeNull();
      expect(row.logging_state).toBe("pending");
    });
  });

  it("rejects corrupted stored result metadata before Discord reuse", async () => {
    const deliveryId = "88888888-8888-4888-8888-888888888888";
    const stub = work(deliveryId);
    await executeWork(stub, request(deliveryId));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE web_delivery SET result_json = '{}' WHERE singleton = 1",
      );
    });

    await expect(runDurableObjectAlarm(stub)).rejects.toThrow(
      "Stored web delivery identity is invalid",
    );
  });

  it("keeps permission failure terminal without rerolling", async () => {
    const deliveryId = "44444444-4444-4444-8444-444444444444";
    const stub = work(deliveryId);
    const input = request(deliveryId, { title: "web-permission" });

    const first = await executeWork(stub, input);
    const replay = await executeWork(stub, input);
    expect(first).toMatchObject({ status: "permission_error" });
    expect(replay).toEqual(first);
  });

  it("removes result bytes after bounded replay retention", async () => {
    const deliveryId = "55555555-5555-4555-8555-555555555555";
    const stub = work(deliveryId);
    await executeWork(stub, request(deliveryId));
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE web_delivery SET artifact_cleanup_at = 0 WHERE singleton = 1",
      );
    });

    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ image_bytes: ArrayBuffer | null; result_json: string | null }>(
          "SELECT image_bytes, result_json FROM web_delivery",
        )
        .one();
      expect(row).toEqual({ image_bytes: null, result_json: null });
    });
    await expect(executeWork(stub, request(deliveryId))).resolves.toEqual({
      status: "expired",
    });
  });
});
