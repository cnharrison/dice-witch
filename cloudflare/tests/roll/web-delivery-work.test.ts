import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { WebDeliveryExecutionResult } from "../../workers/roll/src";

const APPLICATION_ID = "100000000000000001";
const USER_ID = "100000000000000003";
const GUILD_ID = "100000000000000002";
const CHANNEL_ID = "100000000000000010";

function request(
  deliveryId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    deliveryId,
    applicationId: APPLICATION_ID,
    notation: "1d20",
    repetitions: 1,
    username: "web-user",
    title: "web-result",
    userId: USER_ID,
    guildId: GUILD_ID,
    channelId: CHANNEL_ID,
    skipDelay: true,
    hideRollResultText: false,
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

async function storedIdentity(value: {
  requestJson: string;
  resultJson: string | null;
  imageSha256: string;
  rollId: string;
  renderSeed: number;
  rollSeed: number;
}): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    version: 1,
    ...value,
  }));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    expect(roll.discord.payload).toMatchObject({ flags: 1 << 15 });
    const serializedPayload = JSON.stringify(roll.discord.payload);
    expect(serializedPayload).toContain('"label":"Save"');
    expect(serializedPayload).toContain(
      `"custom_id":"save-roll:v1:w:${USER_ID}.${deliveryId}"`,
    );
    await expect(stub.getSaveRollIntent()).resolves.toMatchObject({
      status: "available",
      intent: {
        source: "fresh",
        notation: "1d20",
        title: "web-result",
        repetitions: 1,
        defaultName: "web-result",
        nameColor: null,
      },
    });
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

  it("retains a hidden web result for its bound Discord message", async () => {
    const deliveryId = "12121212-1212-4212-8212-121212121212";
    const stub = work(deliveryId);
    const result = await executeWork(stub, request(deliveryId, {
      title: null,
      hideRollResultText: true,
    }));

    expect(result).toMatchObject({ status: "delivered", roll: { status: "rolled" } });
    if (!("roll" in result) || result.roll.status !== "rolled") {
      throw new Error("Expected a delivered web roll");
    }
    const payload = JSON.stringify(result.roll.discord.payload);
    expect(payload).toContain('"label":"Text result"');
    expect(payload).not.toContain(result.roll.discord.resultText);
    const binding = {
      applicationId: APPLICATION_ID,
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      messageId: "100000000000000098",
    };
    await expect(stub.getTextResult(binding)).resolves.toEqual({
      status: "available",
      resultText: result.roll.discord.resultText,
    });
    await expect(stub.getTextResult({
      ...binding,
      applicationId: "100000000000000009",
    })).resolves.toEqual({ status: "missing" });
    await expect(stub.getTextResult({
      ...binding,
      channelId: "100000000000000011",
    })).resolves.toEqual({ status: "missing" });
    await expect(stub.getSaveRollIntent()).resolves.toEqual({
      status: "missing",
    });

    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE web_delivery SET expires_at = 0");
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.getTextResult(binding)).resolves.toMatchObject({
      status: "available",
    });
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM web_delivery",
          )
          .one().count,
      ).toBe(0);
      state.storage.sql.exec("UPDATE text_result_intent SET expires_at = 0");
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.getTextResult(binding)).resolves.toEqual({
      status: "missing",
    });
    await runInDurableObject(stub, async (_instance, state) => {
      await expect(state.storage.getAlarm()).resolves.toBeNull();
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
    const input = request(deliveryId, {
      title: "web retry",
      hideRollResultText: true,
    });
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
    expect(JSON.stringify(retry.roll.discord.payload)).toContain("Text result");
    expect(JSON.stringify(retry.roll.discord.payload)).not.toContain(
      retry.roll.discord.resultText,
    );
    await expect(stub.getTextResult({
      applicationId: APPLICATION_ID,
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      messageId: "100000000000000098",
    })).resolves.toEqual({
      status: "available",
      resultText: retry.roll.discord.resultText,
    });
  });

  it("resumes a delivery persisted before complete settings were captured", async () => {
    const deliveryId = "34343434-3434-4434-8434-343434343434";
    const stub = work(deliveryId);
    const input = request(deliveryId, { title: "web retry" });
    await expect(executeWork(stub, input)).resolves.toMatchObject({
      status: "pending",
    });

    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          request_json: string;
          result_json: string | null;
          image_sha256: string;
          roll_id: string;
          render_seed: number;
          roll_seed: number;
        }>(
          `SELECT request_json, result_json, image_sha256, roll_id,
                  render_seed, roll_seed
           FROM web_delivery`,
        )
        .one();
      const legacy = JSON.parse(row.request_json) as Record<string, unknown>;
      delete legacy.applicationId;
      delete legacy.hideRollResultText;
      const requestJson = JSON.stringify(legacy);
      const identitySha256 = await storedIdentity({
        requestJson,
        resultJson: row.result_json,
        imageSha256: row.image_sha256,
        rollId: row.roll_id,
        renderSeed: row.render_seed,
        rollSeed: row.roll_seed,
      });
      state.storage.sql.exec(
        `UPDATE web_delivery
         SET request_json = ?, identity_sha256 = ?
         WHERE singleton = 1`,
        requestJson,
        identitySha256,
      );
    });

    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    await expect(executeWork(stub, input)).resolves.toMatchObject({
      status: "delivered",
      roll: { status: "rolled" },
    });
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
    const input = request(deliveryId, { title: "web permission" });

    const first = await executeWork(stub, input);
    const replay = await executeWork(stub, input);
    expect(first).toMatchObject({ status: "permission_error" });
    expect(replay).toEqual(first);
  });

  it("omits Save roll for untitled fresh results", async () => {
    const deliveryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const stub = work(deliveryId);
    const result = await executeWork(stub, request(deliveryId, { title: null }));

    expect(result).toMatchObject({ status: "delivered" });
    if (!("roll" in result) || result.roll.status !== "rolled") {
      throw new Error("Expected a delivered web roll");
    }
    expect(JSON.stringify(result.roll.discord.payload)).not.toContain('"label":"Save"');
    await expect(stub.getSaveRollIntent()).resolves.toEqual({ status: "missing" });
  });

  it("keeps an untitled repeated result untitled with Save and a blank default name", async () => {
    const deliveryId = "abababab-abab-4bab-8bab-abababababab";
    const stub = work(deliveryId);
    const result = await executeWork(stub, request(deliveryId, {
      title: null,
      repetitions: 3,
    }));

    expect(result).toMatchObject({ status: "delivered" });
    if (!("roll" in result) || result.roll.status !== "rolled") {
      throw new Error("Expected a delivered web roll");
    }
    const payload = JSON.stringify(result.roll.discord.payload);
    expect(payload).not.toContain("Repeated ×3");
    expect(payload).toContain('"label":"Save"');
    await expect(stub.getSaveRollIntent()).resolves.toMatchObject({
      status: "available",
      intent: {
        version: 2,
        source: "fresh",
        notation: "1d20",
        title: null,
        repetitions: 3,
        defaultName: null,
        nameColor: null,
      },
    });
  });

  it("preserves Library color in the authoritative Save roll intent", async () => {
    const deliveryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const stub = work(deliveryId);
    await executeWork(stub, request(deliveryId, {
      title: null,
      savedRoll: {
        scope: "guild",
        name: "Ambush",
        nameColor: "#AABBCC",
      },
    }));

    await expect(stub.getSaveRollIntent()).resolves.toMatchObject({
      status: "available",
      intent: {
        source: "library",
        notation: "1d20",
        title: null,
        repetitions: 1,
        defaultName: "Ambush",
        nameColor: "#AABBCC",
      },
    });
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
      expect(state.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM save_roll_intent")
        .one().count).toBe(1);
    });
    await expect(stub.getSaveRollIntent()).resolves.toMatchObject({
      status: "available",
    });
    await expect(executeWork(stub, request(deliveryId))).resolves.toEqual({
      status: "expired",
    });

    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE web_delivery SET expires_at = 0 WHERE singleton = 1",
      );
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.getSaveRollIntent()).resolves.toMatchObject({
      status: "available",
    });

    await runInDurableObject(stub, (_instance, state) => {
      const expiredIntent = {
        version: 1,
        source: "fresh",
        notation: "1d20",
        title: "web-result",
        repetitions: 1,
        defaultName: "web-result",
        nameColor: null,
        createdAt: 0,
        expiresAt: 90 * 24 * 60 * 60 * 1_000,
      };
      state.storage.sql.exec(
        `UPDATE save_roll_intent
         SET intent_json = ?, expires_at = ?
         WHERE singleton = 1`,
        JSON.stringify(expiredIntent),
        expiredIntent.expiresAt,
      );
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.getSaveRollIntent()).resolves.toEqual({
      status: "missing",
    });
  });
});
