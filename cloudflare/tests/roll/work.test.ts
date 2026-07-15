import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildRollRenderRequest } from "../../packages/roll-render-model/src";
import rollWorker, {
  type RollDeliveryRequest,
} from "../../workers/roll/src";
import { validateDeliveryRequest } from "../../workers/roll/src/contracts";

const rollEnv = env;

function work(name: string) {
  return rollEnv.ROLL_WORK.getByName(name);
}

async function callAlarm(instance: {
  alarm?: () => void | Promise<void>;
}): Promise<void> {
  if (instance.alarm === undefined) {
    throw new Error("RollWork alarm is unavailable");
  }
  await instance.alarm();
}

function snowflakeAt(timestamp: number, sequence = 0): string {
  return (
    (BigInt(timestamp - 1_420_070_400_000) << 22n) |
    BigInt(sequence)
  ).toString();
}

function interactionExpiresAt(id: string): number {
  return Number((BigInt(id) >> 22n) + 1_420_070_400_000n) + 15 * 60 * 1_000;
}

function deliveryRequest(
  id: string,
  token = "interaction-token-value",
): RollDeliveryRequest {
  return {
    interaction: {
      id,
      applicationId: "100000000000000001",
      token,
    },
    request: { notation: "1d20", repetitions: 1 },
    message: { title: "Initiative", username: "roller" },
    accounting: {
      guildId: "100000000000000003",
      userId: "100000000000000003",
      receivedAt: interactionExpiresAt(id) - 15 * 60 * 1_000,
    },
    logging: {
      source: "discord",
      channelId: "100000000000000010",
      notation: "1d20",
      context: {
        kind: "guild",
        guildId: "100000000000000003",
        guildName: "Fixture Guild",
        channelId: "100000000000000010",
        channelName: "dice-rolls",
        channelType: 0,
      },
    },
  };
}

describe("RollWork Durable Object", () => {
  it("upgrades pre-clatter delivery tables in place", async () => {
    const stub = work("1400000000000000021");
    await stub.deliveryStatus();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(`
        DROP TABLE interaction_delivery;
        CREATE TABLE interaction_delivery (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          metadata_json TEXT NOT NULL,
          token TEXT,
          token_fingerprint TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('pending', 'delivered', 'failed')),
          delivered_at INTEGER,
          last_http_status INTEGER,
          attempts INTEGER NOT NULL DEFAULT 0
        );
      `);
    });
    await evictDurableObject(stub);

    await expect(stub.deliveryStatus()).resolves.toEqual({ state: "missing" });
    await runInDurableObject(stub, (_instance, state) => {
      const columns = state.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(interaction_delivery)")
        .toArray();
      expect(columns.map((column) => column.name)).toEqual(
        expect.arrayContaining([
          "clatter_sent_at",
          "skip_dice_delay",
          "delay_ms",
          "result_not_before",
          "accounting_state",
          "accounting_occurred_at",
          "accounting_http_status",
          "accounting_attempts",
          "logging_state",
          "logging_http_status",
          "logging_attempts",
          "helper_state",
          "helper_attempts",
        ]),
      );
    });
  });

  it("persists one exact seeded outcome for idempotent retries", async () => {
    const stub = work("1400000000000000000");
    const request = { notation: ["4d6k3"], repetitions: 1 };

    const first = await stub.prepare(request);
    const retry = await stub.prepare(request);

    expect(first.status).toBe("created");
    expect(retry.status).toBe("existing");
    if (first.status === "conflict" || retry.status === "conflict") {
      throw new Error("Idempotent roll work unexpectedly conflicted");
    }
    expect(retry.record).toEqual(first.record);
    expect(
      buildRollRenderRequest(retry.record.outcome, retry.record.renderSeed),
    ).toEqual(
      buildRollRenderRequest(first.record.outcome, first.record.renderSeed),
    );
    expect(first.record).toMatchObject({
      version: 1,
      request,
      outcome: {
        version: 1,
        seed: first.record.rollSeed,
        errors: [],
      },
    });
    expect(first.record.renderSeed).toBeGreaterThanOrEqual(0);
    expect(first.record.renderSeed).toBeLessThanOrEqual(0xffff_ffff);
  });

  it("renders byte-identical PNG output from durable seeds across retries", async () => {
    const stub = work("1400000000000000005");
    const request = { notation: ["1d20", "4d6k3"], repetitions: 1 };

    const first = await stub.render(request);
    await evictDurableObject(stub);
    const retry = await stub.render(request);

    expect(first.status).toBe("rendered");
    expect(retry.status).toBe("rendered");
    if (first.status !== "rendered" || retry.status !== "rendered") {
      throw new Error("Idempotent roll rendering unexpectedly conflicted");
    }
    expect(first.png.slice(0, 8)).toEqual(
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(retry).toEqual(first);
    expect(first.diceCount).toBe(5);
  });

  it("renders the maximum 50-dice request in the combined Worker", async () => {
    const result = await work("1400000000000000006").render({
      notation: ["50d20"],
      repetitions: 1,
    });

    expect(result.status).toBe("rendered");
    if (result.status !== "rendered") {
      throw new Error("Maximum roll rendering unexpectedly conflicted");
    }
    expect(result.diceCount).toBe(50);
    expect(result.png.byteLength).toBeGreaterThan(0);
  });

  it("returns the same outcome after Durable Object recreation", async () => {
    const stub = work("1400000000000000001");
    const request = { notation: ["d%", "4dF"], repetitions: 1 };
    const first = await stub.prepare(request);

    await evictDurableObject(stub);
    const restored = await stub.prepare(request);

    expect(restored.status).toBe("existing");
    if (first.status === "conflict" || restored.status === "conflict") {
      throw new Error("Restored roll work unexpectedly conflicted");
    }
    expect(restored.record).toEqual(first.record);
  });

  it("serializes concurrent creation to one durable record", async () => {
    const stub = work("1400000000000000002");
    const request = { notation: ["1d20"], repetitions: 1 };

    const results = await Promise.all([
      stub.prepare(request),
      stub.prepare(request),
      stub.prepare(request),
    ]);

    expect(results.filter((result) => result.status === "created")).toHaveLength(1);
    expect(results.some((result) => result.status === "conflict")).toBe(false);
    expect(
      new Set(
        results.map((result) =>
          JSON.stringify(result.status === "conflict" ? null : result.record),
        ),
      ).size,
    ).toBe(1);
  });

  it("rejects a conflicting payload for the same interaction", async () => {
    const stub = work("1400000000000000003");
    await stub.prepare({ notation: ["1d20"], repetitions: 1 });

    await expect(
      stub.prepare({ notation: ["2d20"], repetitions: 1 }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("retains an interaction token privately until its Snowflake-based expiry", async () => {
    const id = snowflakeAt(Date.now(), 10);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-temporary");

    const accepted = await stub.acceptDelivery(input);
    const status = await stub.deliveryStatus();

    expect(accepted).toEqual({
      status: "created",
      delivery: "pending",
      expiresAt: interactionExpiresAt(id),
    });
    if (!("expiresAt" in accepted)) {
      throw new Error("New delivery was not accepted");
    }
    expect(status).toEqual({
      state: "pending",
      expiresAt: accepted.expiresAt,
      deliveredAt: null,
      lastHttpStatus: null,
      attempts: 0,
    });
    expect(JSON.stringify({ accepted, status })).not.toContain(input.interaction.token);
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{ token: string; metadata_json: string }>(
          "SELECT token, metadata_json FROM interaction_delivery",
        )
        .one();
      expect(row.token).toBe(input.interaction.token);
      expect(JSON.parse(row.metadata_json)).toMatchObject({
        version: 4,
        logging: { context: input.logging.context },
      });
      const alarm = await state.storage.getAlarm();
      expect(alarm).not.toBeNull();
      expect(alarm).toBeLessThanOrEqual(accepted.expiresAt);
    });
  });

  it("upgrades version 3 metadata on a version 4 retry without conflict", async () => {
    const id = snowflakeAt(Date.now(), 31);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    const context = input.logging.context;
    if (context === undefined) throw new Error("Expected logging context");
    delete input.logging.context;

    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "created",
      delivery: "pending",
    });
    input.logging.context = context;
    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "existing",
      delivery: "pending",
    });
    delete input.logging.context;
    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "existing",
      delivery: "pending",
    });

    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ metadata_json: string }>(
          "SELECT metadata_json FROM interaction_delivery",
        )
        .one();
      expect(JSON.parse(row.metadata_json)).toMatchObject({
        version: 4,
        logging: { context },
      });
    });
  });

  it("completes HTTP-accepted work through durable alarms", async () => {
    const id = snowflakeAt(Date.now(), 30);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }

    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "created",
      delivery: "pending",
    });
    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET result_not_before = 0",
      );
    });
    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);

    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ accounting_state: string; logging_state: string }>(
          "SELECT accounting_state, logging_state FROM interaction_delivery",
        )
        .one();
      expect(row).toEqual({
        accounting_state: "accounted",
        logging_state: "delivered",
      });
    });
  });

  it("parses raw Discord notation inside the roll isolate", async () => {
    const id = snowflakeAt(Date.now(), 20);
    const input = deliveryRequest(id, "delivery-success");
    input.request.notation = "1d20 1d10";

    await expect(work(id).deliver(input)).resolves.toEqual({
      status: "delivered",
    });
    await runInDurableObject(work(id), (_instance, state) => {
      const stored = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      const record: unknown = JSON.parse(stored.record_json);
      expect(record).toMatchObject({
        request: { notation: ["1d20", "1d10"], repetitions: 1 },
      });
    });
  });

  it("accounts a guild roll through the internal data service", async () => {
    const id = snowflakeAt(Date.now(), 23);
    const stub = work(id);

    await expect(
      stub.deliver(deliveryRequest(id, "delivery-success")),
    ).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          accounting_state: string;
          accounting_occurred_at: number | null;
          accounting_http_status: number | null;
          accounting_attempts: number;
        }>(
          `SELECT accounting_state, accounting_occurred_at,
                  accounting_http_status, accounting_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(row).toMatchObject({
        accounting_state: "accounted",
        accounting_http_status: 200,
        accounting_attempts: 1,
      });
      expect(row.accounting_occurred_at).toBeTypeOf("number");
      expect(await state.storage.getAlarm()).toBe(interactionExpiresAt(id));
    });
  });

  it("accepts the pre-accounting Gateway payload during rolling deployment", async () => {
    const id = snowflakeAt(Date.now(), 27);
    const stub = work(id);
    const legacy: Partial<ReturnType<typeof deliveryRequest>> =
      deliveryRequest(id, "delivery-success");
    delete legacy.accounting;
    delete legacy.logging;

    await expect(stub.deliver(legacy)).resolves.toMatchObject({
      status: "pending",
    });
    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET result_not_before = 0",
      );
      await callAlarm(instance);
      const row = state.storage.sql
        .exec<{ accounting_state: string; accounting_attempts: number }>(
          `SELECT accounting_state, accounting_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(row).toEqual({
        accounting_state: "not_applicable",
        accounting_attempts: 0,
      });
    });
  });

  it("does not account direct-message rolls, matching legacy behavior", async () => {
    const id = snowflakeAt(Date.now(), 26);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.accounting.guildId = null;
    input.logging.context = {
      kind: "dm",
      channelId: input.logging.channelId,
    };

    await expect(stub.deliver(input)).resolves.toMatchObject({
      status: "pending",
    });
    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET result_not_before = 0",
      );
      await callAlarm(instance);
      const row = state.storage.sql
        .exec<{ accounting_state: string; accounting_attempts: number }>(
          `SELECT accounting_state, accounting_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(row).toEqual({
        accounting_state: "not_applicable",
        accounting_attempts: 0,
      });
    });
  });

  it("retries transient accounting after Discord delivery succeeds", async () => {
    const id = snowflakeAt(Date.now(), 24);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "accounting-temporary";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, async (instance, state) => {
      const pending = state.storage.sql
        .exec<{ accounting_state: string; accounting_attempts: number }>(
          `SELECT accounting_state, accounting_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(pending).toEqual({
        accounting_state: "pending",
        accounting_attempts: 1,
      });
      expect(await state.storage.getAlarm()).toBeLessThan(
        interactionExpiresAt(id),
      );

      await callAlarm(instance);
      const accounted = state.storage.sql
        .exec<{ accounting_state: string; accounting_attempts: number }>(
          `SELECT accounting_state, accounting_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(accounted).toEqual({
        accounting_state: "accounted",
        accounting_attempts: 2,
      });
      expect(await state.storage.getAlarm()).toBe(interactionExpiresAt(id));
    });
  });

  it("fails closed on a terminal accounting conflict without hiding the roll", async () => {
    const id = snowflakeAt(Date.now(), 25);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "accounting-conflict";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          accounting_state: string;
          accounting_http_status: number | null;
          accounting_attempts: number;
        }>(
          `SELECT accounting_state, accounting_http_status,
                  accounting_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(row).toEqual({
        accounting_state: "failed",
        accounting_http_status: 409,
        accounting_attempts: 1,
      });
      expect(await state.storage.getAlarm()).toBe(interactionExpiresAt(id));
    });
  });

  it("persists the guild preference and skips Discord clatter", async () => {
    const id = snowflakeAt(Date.now(), 26);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          skip_dice_delay: number | null;
          clatter_sent_at: number | null;
        }>(
          "SELECT skip_dice_delay, clatter_sent_at FROM interaction_delivery",
        )
        .one();
      expect(row).toEqual({ skip_dice_delay: 1, clatter_sent_at: null });
    });
  });

  it("persists one randomized delay across restart before final delivery", async () => {
    const id = snowflakeAt(Date.now(), 22);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }

    await expect(stub.deliver(input)).resolves.toMatchObject({
      status: "pending",
    });
    let selectedDelay = 0;
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          clatter_sent_at: number;
          delay_ms: number;
          result_not_before: number;
        }>(
          `SELECT clatter_sent_at, delay_ms, result_not_before
           FROM interaction_delivery`,
        )
        .one();
      expect(row.delay_ms).toBeGreaterThanOrEqual(1);
      expect(row.delay_ms).toBeLessThanOrEqual(5_000);
      expect(row.result_not_before).toBe(row.clatter_sent_at + row.delay_ms);
      expect(await state.storage.getAlarm()).toBe(row.result_not_before);
      selectedDelay = row.delay_ms;
    });

    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance, state) => {
      const restored = state.storage.sql
        .exec<{ delay_ms: number }>(
          "SELECT delay_ms FROM interaction_delivery",
        )
        .one();
      expect(restored.delay_ms).toBe(selectedDelay);
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET result_not_before = 0",
      );
      await callAlarm(instance);
    });

    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
      attempts: 2,
    });
  });

  it("delivers the invalid-roll helper once after the public response", async () => {
    const id = snowflakeAt(Date.now(), 31);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.request.notation = "not-dice";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ helper_state: string; helper_attempts: number }>(
          "SELECT helper_state, helper_attempts FROM interaction_delivery",
        )
        .one();
      expect(row).toEqual({ helper_state: "delivered", helper_attempts: 1 });
    });
  });

  it("delivers a PNG and immediately deletes the interaction token", async () => {
    const id = snowflakeAt(Date.now(), 16);
    const stub = work(id);

    const input = deliveryRequest(id, "delivery-success");
    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await expect(
      stub.deliver(deliveryRequest(id, "changed-after-delivery")),
    ).resolves.toEqual({ status: "conflict" });
    const status = await stub.deliveryStatus();
    expect(status).toMatchObject({
      state: "delivered",
      expiresAt: interactionExpiresAt(id),
      lastHttpStatus: 200,
      attempts: 1,
    });
    expect(
      status.state === "missing" ? null : status.deliveredAt,
    ).toBeTypeOf("number");
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          token: string | null;
          clatter_sent_at: number | null;
          logging_state: string;
          logging_attempts: number;
        }>(
          `SELECT token, clatter_sent_at, logging_state, logging_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(row).toMatchObject({
        token: null,
        clatter_sent_at: null,
        logging_state: "delivered",
        logging_attempts: 1,
      });
      expect(await state.storage.getAlarm()).toBe(interactionExpiresAt(id));
    });
    await expect(stub.deliveryDiagnostics()).resolves.toEqual({
      state: "delivered",
      accountingState: "accounted",
      accountingHttpStatus: 200,
      accountingAttempts: 1,
      loggingState: "delivered",
      loggingHttpStatus: 200,
      loggingAttempts: 1,
      helperState: "not_applicable",
      helperAttempts: 0,
    });
  });

  it("forwards persisted signed context to Discord roll logging", async () => {
    const id = snowflakeAt(Date.now(), 32);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "logging-context";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      loggingState: "delivered",
      loggingAttempts: 1,
    });
  });

  it("persists a retryable roll-log response for the next alarm", async () => {
    const id = snowflakeAt(Date.now(), 28);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "logging-temporary";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          logging_state: string;
          logging_http_status: number | null;
          logging_attempts: number;
        }>(
          `SELECT logging_state, logging_http_status, logging_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(row).toEqual({
        logging_state: "pending",
        logging_http_status: 503,
        logging_attempts: 1,
      });
      expect(await state.storage.getAlarm()).toBeLessThan(
        interactionExpiresAt(id),
      );
    });
  });

  it("stops retrying a terminal roll-log response", async () => {
    const id = snowflakeAt(Date.now(), 29);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "logging-forbidden";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, async (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          logging_state: string;
          logging_http_status: number | null;
          logging_attempts: number;
        }>(
          `SELECT logging_state, logging_http_status, logging_attempts
           FROM interaction_delivery`,
        )
        .one();
      expect(row).toEqual({
        logging_state: "failed",
        logging_http_status: 403,
        logging_attempts: 1,
      });
      expect(await state.storage.getAlarm()).toBe(interactionExpiresAt(id));
    });
  });

  it("retries a temporary Discord failure from the durable alarm", async () => {
    const id = snowflakeAt(Date.now(), 17);
    const stub = work(id);

    const first = await stub.deliver(
      deliveryRequest(id, "delivery-temporary"),
    );
    expect(first.status).toBe("pending");
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "pending",
      lastHttpStatus: 503,
      attempts: 1,
    });

    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET token = 'delivery-success'",
      );
      await callAlarm(instance);
    });

    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
      lastHttpStatus: 200,
      attempts: 2,
    });
  });

  it("honors Discord Retry-After without extending token retention", async () => {
    const id = snowflakeAt(Date.now(), 19);
    const before = Date.now();
    const result = await work(id).deliver(
      deliveryRequest(id, "delivery-rate-limited"),
    );
    const after = Date.now();

    expect(result.status).toBe("pending");
    if (result.status !== "pending") {
      throw new Error("Rate-limited delivery did not remain pending");
    }
    expect(result.retryAt).toBeGreaterThanOrEqual(before + 2_000);
    expect(result.retryAt).toBeLessThanOrEqual(after + 2_000);
    expect(result.retryAt).toBeLessThanOrEqual(interactionExpiresAt(id));
  });

  it("deletes the token after a terminal Discord response", async () => {
    const id = snowflakeAt(Date.now(), 18);
    const stub = work(id);

    await expect(
      stub.deliver(deliveryRequest(id, "delivery-terminal-failure")),
    ).resolves.toEqual({ status: "failed" });
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "failed",
      lastHttpStatus: 404,
      attempts: 1,
    });
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ token: string | null }>(
            "SELECT token FROM interaction_delivery",
          )
          .one().token,
      ).toBeNull();
    });
  });

  it("accepts an identical delivery retry but rejects changed credentials", async () => {
    const id = snowflakeAt(Date.now(), 11);
    const stub = work(id);
    const input = deliveryRequest(id);

    const first = await stub.acceptDelivery(input);
    const retry = await stub.acceptDelivery(input);
    const conflict = await stub.acceptDelivery(
      deliveryRequest(id, "different-interaction-token"),
    );

    expect(first.status).toBe("created");
    expect(retry).toEqual({ ...first, status: "existing" });
    expect(conflict).toEqual({ status: "conflict" });
  });

  it.each(["0", null, false])(
    "rejects malformed persisted channel type %j",
    (channelType) => {
      const id = snowflakeAt(Date.now(), 33);
      const input = deliveryRequest(id);
      if (input.logging.context?.kind !== "guild") {
        throw new Error("Expected guild logging context");
      }
      (input.logging.context as { channelType: unknown }).channelType =
        channelType;

      expect(() => validateDeliveryRequest(input)).toThrow(
        "Roll logging context is invalid",
      );
    },
  );

  it("deletes the sensitive token and roll record at expiry", async () => {
    const id = snowflakeAt(Date.now(), 12);
    const stub = work(id);
    await stub.acceptDelivery(deliveryRequest(id));

    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET expires_at = 0",
      );
      await callAlarm(instance);
      expect(
        state.storage.sql.exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM interaction_delivery",
        ).one().count,
      ).toBe(0);
      expect(
        state.storage.sql.exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM roll_work",
        ).one().count,
      ).toBe(0);
      expect(await state.storage.getAlarm()).toBeNull();
    });
    await expect(stub.deliveryStatus()).resolves.toEqual({ state: "missing" });
  });

  it("rejects expired and mismatched interaction identities", async () => {
    const now = Date.now();
    const currentId = snowflakeAt(now, 13);
    const input = deliveryRequest(currentId);
    await expect(
      work(currentId).acceptDelivery({
        ...input,
        interaction: {
          ...input.interaction,
          id: snowflakeAt(now, 14),
        },
      }),
    ).resolves.toEqual({ status: "conflict" });

    const expiredId = snowflakeAt(Date.now() - 15 * 60 * 1_000 - 1, 15);
    await expect(
      work(expiredId).acceptDelivery(deliveryRequest(expiredId)),
    ).resolves.toEqual({ status: "expired" });
  });

  it("persists terminal validation outcomes without sensitive tokens", async () => {
    const stub = work("1400000000000000004");
    const result = await stub.prepare({
      notation: ["not-dice"],
      repetitions: 1,
    });
    expect(result.status).toBe("created");
    if (result.status === "conflict") {
      throw new Error("New roll work unexpectedly conflicted");
    }
    const serialized = JSON.stringify(result.record);

    expect(result.record.outcome.errors).toEqual([
      expect.objectContaining({ code: "NO_DICE" }),
    ]);
    expect(serialized).not.toMatch(/token|interaction-token|session/i);
  });
});

describe("Roll Worker HTTP surface", () => {
  it("exposes health without exposing roll creation", async () => {
    const health = rollWorker.fetch(new Request("https://roll.test/health"));
    const missing = rollWorker.fetch(
      new Request("https://roll.test/roll", { method: "POST" }),
    );

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      ok: true,
      service: "dice-witch-roll",
    });
    expect(missing.status).toBe(404);
  });
});
