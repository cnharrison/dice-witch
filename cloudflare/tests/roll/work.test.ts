import { env } from "cloudflare:workers";
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_TARGETS,
  BUILTIN_APPEARANCE_RECIPES_V3,
  CHAOTIC_APPEARANCE_STYLE_ID,
} from "../../packages/dice-appearance/src";
import {
  buildRollRenderRequest,
  buildRollRenderRequestV4,
} from "../../packages/roll-render-model/src";
import { executeRoll } from "../../packages/roll-domain/src";
import rollWorkV2Fixture from "./fixtures/roll-work-v2.json";
import rollWorkV3Fixture from "./fixtures/roll-work-v3.json";
import rollWorkV4Fixture from "./fixtures/roll-work-v4.json";
import rollWorker, {
  type RollDeliveryRequest,
} from "../../workers/roll/src";
import {
  parseRecord,
  validateDeliveryRequest,
} from "../../workers/roll/src/contracts";

const rollEnv = env;

function work(name: string) {
  return rollEnv.ROLL_WORK.getByName(name);
}

function logWork(name: string) {
  return rollEnv.LOG_WORK.getByName(name);
}

async function callAlarm(instance: {
  alarm?: () => void | Promise<void>;
}): Promise<void> {
  if (instance.alarm === undefined) {
    throw new Error("RollWork alarm is unavailable");
  }
  await instance.alarm();
}

function controlledSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function interceptEffectiveAppearance(
  userId: string,
  intercept: () => Response | undefined | Promise<Response | undefined>,
): () => void {
  const service = rollEnv.DATA_SERVICE as unknown as {
    fetch: (request: Request) => Promise<Response>;
  };
  const originalFetch = service.fetch;
  service.fetch = vi.fn(async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (
      path === "/internal/appearance/v2/effective" ||
      path === "/internal/appearance/v3/effective"
    ) {
      const body = await request.clone().json<{ userId?: unknown }>();
      if (body.userId === userId) {
        const response = await intercept();
        if (response !== undefined) return response;
      }
    }
    return originalFetch.call(service, request);
  });
  return () => {
    service.fetch = originalFetch;
  };
}

type LifecycleSyncObservation = Readonly<{
  state: unknown;
  rendererRevision: unknown;
  httpStatus: number;
}>;

function observeLifecycleSyncs(interactionId: string): Readonly<{
  observations: LifecycleSyncObservation[];
  restore: () => void;
}> {
  const service = rollEnv.DATA_SERVICE as unknown as {
    fetch: (request: Request) => Promise<Response>;
  };
  const originalFetch = service.fetch;
  const observations: LifecycleSyncObservation[] = [];
  service.fetch = vi.fn(async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const snapshot = path === "/internal/roll-lifecycle"
      ? await request.clone().json<{
          interactionId?: unknown;
          state?: unknown;
          context?: { rendererRevision?: unknown };
        }>()
      : null;
    const response = await originalFetch.call(service, request);
    if (snapshot?.interactionId === interactionId) {
      observations.push({
        state: snapshot.state,
        rendererRevision: snapshot.context?.rendererRevision,
        httpStatus: response.status,
      });
    }
    return response;
  });
  return {
    observations,
    restore: () => {
      service.fetch = originalFetch;
    },
  };
}

function observeInteractionRequests(
  token: string,
  inspect: (request: Request) => void | Promise<void>,
): () => void {
  const fetch = globalThis.fetch.bind(globalThis);
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(
    async (request, init): Promise<Response> => {
      const outbound = request instanceof Request
        ? request
        : new Request(request, init);
      if (new URL(outbound.url).pathname.includes(`/${token}/`)) {
        await inspect(outbound);
      }
      return fetch(request, init);
    },
  );
  return () => {
    spy.mockRestore();
  };
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

function v4Recipes() {
  const builtin =
    BUILTIN_APPEARANCE_RECIPES_V3[CHAOTIC_APPEARANCE_STYLE_ID];
  if (builtin === undefined) throw new Error("Chaotic V3 recipe is missing");
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, builtin.recipe]),
  );
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

function telemetryDeliveryRequest(
  id: string,
  token: string,
): RollDeliveryRequest {
  const input = deliveryRequest(id, token);
  const receivedAt = input.accounting.receivedAt;
  return {
    ...input,
    deferredAt: receivedAt,
    rollSeed: 1,
    telemetry: {
      version: 2,
      handlerStartedAt: receivedAt,
      acknowledgementPreparedAt: receivedAt,
      acknowledgementType: 5,
    },
  };
}

async function seedPendingV5Delivery(
  stub: ReturnType<typeof work>,
  input: RollDeliveryRequest,
  renderVersion: 3 | 4 = 4,
): Promise<void> {
  await stub.prepare({
    notation: [input.request.notation],
    repetitions: input.request.repetitions,
  });
  await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
    status: "created",
    delivery: "pending",
  });
  await runInDurableObject(stub, (_instance, state) => {
    const workRow = state.storage.sql
      .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
      .one();
    const record = JSON.parse(workRow.record_json) as Record<string, unknown>;
    const pending = parseRecord(
      JSON.stringify({
        ...record,
        version: 5,
        renderVersion,
        renderRequest: null,
      }),
    );
    const lifecycleRow = state.storage.sql
      .exec<{ snapshot_json: string }>(
        "SELECT snapshot_json FROM roll_lifecycle_outbox WHERE singleton = 1",
      )
      .one();
    const lifecycle = JSON.parse(lifecycleRow.snapshot_json) as {
      context: Record<string, unknown>;
    };
    state.storage.sql.exec(
      "UPDATE roll_work SET record_json = ? WHERE singleton = 1",
      JSON.stringify(pending),
    );
    state.storage.sql.exec(
      `UPDATE roll_lifecycle_outbox
       SET snapshot_json = ?
       WHERE singleton = 1`,
      JSON.stringify({
        ...lifecycle,
        context: {
          ...lifecycle.context,
          renderVersion,
          rendererRevision: null,
        },
      }),
    );
  });
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
          "followup_message_id",
          "skip_dice_delay",
          "delay_ms",
          "result_not_before",
          "snapshot_ms",
          "settings_ms",
          "clatter_post_ms",
          "lifecycle_sync_ms",
          "accounting_ms",
          "accounting_state",
          "accounting_occurred_at",
          "accounting_http_status",
          "accounting_attempts",
          "logging_state",
          "logging_http_status",
          "logging_attempts",
          "helper_state",
          "helper_attempts",
          "failure_phase",
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

  it("binds saved-roll picker state to one actor and consumes Run once", async () => {
    const sessionId = snowflakeAt(Date.now(), 35);
    const firstRunId = snowflakeAt(Date.now(), 36);
    const secondRunId = snowflakeAt(Date.now(), 37);
    const stub = work(sessionId);
    const context = {
      version: 1 as const,
      userId: "100000000000000003",
      guildId: "100000000000000002",
      channelId: "100000000000000010",
    };

    await expect(
      stub.openSavedRollPicker({ ...context, interactionId: sessionId }),
    ).resolves.toMatchObject({ status: "created", scope: "mine", page: 0 });
    await expect(
      stub.updateSavedRollPicker({
        ...context,
        interactionId: firstRunId,
        action: "select",
        selection: {
          scope: "server",
          id: "223e4567-e89b-42d3-a456-426614174000",
          revision: 3,
        },
      }),
    ).resolves.toEqual({ status: "invalid_selection" });
    await expect(
      stub.updateSavedRollPicker({
        ...context,
        interactionId: firstRunId,
        action: "server",
        selection: null,
      }),
    ).resolves.toMatchObject({ status: "updated", scope: "server" });
    await expect(
      stub.updateSavedRollPicker({
        ...context,
        interactionId: firstRunId,
        action: "select",
        selection: {
          scope: "server",
          id: "223e4567-e89b-42d3-a456-426614174000",
          revision: 3,
        },
      }),
    ).resolves.toMatchObject({
      status: "updated",
      selectedId: "223e4567-e89b-42d3-a456-426614174000",
      selectedRevision: 3,
    });
    await expect(
      stub.reserveSavedRollRun({ ...context, interactionId: firstRunId }),
    ).resolves.toMatchObject({ status: "reserved" });
    await expect(
      stub.reserveSavedRollRun({ ...context, interactionId: firstRunId }),
    ).resolves.toMatchObject({ status: "existing" });
    await expect(
      stub.reserveSavedRollRun({ ...context, interactionId: secondRunId }),
    ).resolves.toEqual({ status: "consumed" });
    await expect(
      stub.reserveSavedRollRun({
        ...context,
        userId: "100000000000000099",
        interactionId: firstRunId,
      }),
    ).resolves.toEqual({ status: "unauthorized" });
  });

  it("bounds picker navigation to all 20-button Mine and Server pages", async () => {
    const sessionId = snowflakeAt(Date.now(), 38);
    const updateId = snowflakeAt(Date.now(), 39);
    const stub = work(sessionId);
    const context = {
      version: 1 as const,
      interactionId: updateId,
      userId: "100000000000000003",
      guildId: "100000000000000002",
      channelId: "100000000000000010",
    };
    await stub.openSavedRollPicker({ ...context, interactionId: sessionId });

    let state;
    for (let index = 0; index < 3; index += 1) {
      state = await stub.updateSavedRollPicker({
        ...context,
        action: "next",
        selection: null,
      });
    }
    expect(state).toMatchObject({ status: "updated", scope: "mine", page: 2 });

    await stub.updateSavedRollPicker({
      ...context,
      action: "server",
      selection: null,
    });
    for (let index = 0; index < 5; index += 1) {
      state = await stub.updateSavedRollPicker({
        ...context,
        action: "next",
        selection: null,
      });
    }
    expect(state).toMatchObject({ status: "updated", scope: "server", page: 4 });
  });

  it("copies an actor-bound Server snapshot to Personal through a rename conflict", async () => {
    const sessionId = snowflakeAt(Date.now(), 44);
    const selectId = snowflakeAt(Date.now(), 45);
    const copyId = snowflakeAt(Date.now(), 46);
    const renameId = snowflakeAt(Date.now(), 47);
    const stub = work(sessionId);
    const context = {
      version: 1 as const,
      userId: "100000000000000003",
      guildId: "100000000000000002",
      channelId: "100000000000000010",
    };
    await stub.openSavedRollPicker({ ...context, interactionId: sessionId });
    await stub.updateSavedRollPicker({
      ...context,
      interactionId: selectId,
      action: "server",
      selection: null,
    });
    await stub.updateSavedRollPicker({
      ...context,
      interactionId: selectId,
      action: "select",
      selection: {
        scope: "server",
        id: "223e4567-e89b-42d3-a456-426614174000",
        revision: 3,
      },
    });

    await expect(
      stub.copySavedRollToMine({
        ...context,
        interactionId: copyId,
        username: "alice",
        name: null,
      }),
    ).resolves.toEqual({ status: "name_conflict", name: "Attack" });
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM saved_roll_invocation",
          )
          .one().count,
      ).toBe(0);
    });
    const copied = await stub.copySavedRollToMine({
      ...context,
      interactionId: renameId,
      username: "alice",
      name: "Attack copy",
    });
    expect(copied).toMatchObject({ status: "copied", name: "Attack copy" });
    await expect(
      stub.copySavedRollToMine({
        ...context,
        interactionId: renameId,
        username: "alice",
        name: "Attack copy",
      }),
    ).resolves.toEqual(copied);
  });

  it("resolves and persists one immutable saved invocation before delivery", async () => {
    const sessionId = snowflakeAt(Date.now(), 39);
    const runId = snowflakeAt(Date.now(), 40);
    const stub = work(sessionId);
    const context = {
      version: 1 as const,
      userId: "100000000000000003",
      guildId: "100000000000000003",
      channelId: "100000000000000010",
    };
    const selection = {
      scope: "server" as const,
      id: "223e4567-e89b-42d3-a456-426614174000",
      revision: 3,
    };
    await stub.openSavedRollPicker({ ...context, interactionId: sessionId });
    await stub.updateSavedRollPicker({
      ...context,
      interactionId: runId,
      action: "server",
      selection: null,
    });
    await stub.updateSavedRollPicker({
      ...context,
      interactionId: runId,
      action: "select",
      selection,
    });
    await stub.reserveSavedRollRun({ ...context, interactionId: runId });

    const request = {
      version: 1 as const,
      sessionId,
      selection,
      deferredAt: Date.now(),
      interaction: {
        id: runId,
        applicationId: "100000000000000001",
        token: "saved-channel-result",
      },
      actor: {
        ...context,
        username: "roller",
        loggingContext: {
          kind: "guild" as const,
          guildId: "100000000000000003",
          guildName: "Fixture Guild",
          channelId: "100000000000000010",
          channelName: "dice-rolls",
          channelType: 0 as const,
        },
      },
      sourceInteraction: "component" as const,
      responseMode: "channel-message" as const,
    };
    await expect(stub.acceptSavedRollDelivery(request)).resolves.toMatchObject({
      status: "created",
      savedRoll: { name: "Attack", notation: "2d20+5", revision: 3 },
    });
    await expect(stub.acceptSavedRollDelivery(request)).resolves.toMatchObject({
      status: "existing",
      savedRoll: { name: "Attack", notation: "2d20+5", revision: 3 },
    });
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await runDurableObjectAlarm(stub);
    const completed = consoleInfo.mock.calls
      .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
      .find(({ message, rollId }) =>
        message === "Roll destination delivery completed" && rollId === runId
      );
    consoleInfo.mockRestore();
    const destinationPayload = JSON.stringify(completed?.destinationPayload);
    expect(destinationPayload).toContain(`save-roll:v1:d:${sessionId}`);
    expect(destinationPayload).not.toContain(`save-roll:v1:d:${runId}`);
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
      lastHttpStatus: 200,
    });
    await expect(stub.getSaveRollIntent()).resolves.toMatchObject({
      status: "available",
      intent: {
        source: "library",
        notation: "2d20+5",
        title: "Sword",
        repetitions: 2,
        defaultName: "Attack",
        nameColor: "#AABBCC",
      },
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ invocation_json: string }>("SELECT invocation_json FROM saved_roll_invocation")
        .one();
      expect(JSON.parse(row.invocation_json)).toMatchObject({
        version: 1,
        id: selection.id,
        scope: "guild",
        name: "Attack",
        notation: "2d20+5",
        revision: 3,
        nameColor: "#AABBCC",
      });
      const expiredIntent = {
        version: 1,
        source: "library",
        notation: "2d20+5",
        title: "Sword",
        repetitions: 2,
        defaultName: "Attack",
        nameColor: "#AABBCC",
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
    await expect(stub.getSaveRollIntent()).resolves.toEqual({ status: "missing" });
  });

  it("offers Save roll for an untitled repeated Discord result", async () => {
    const interactionId = snowflakeAt(Date.now(), 43);
    const stub = work(interactionId);
    const input = deliveryRequest(interactionId, "delivery-success");
    input.request.repetitions = 3;
    input.message.title = null;

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await expect(stub.getSaveRollIntent()).resolves.toMatchObject({
      status: "available",
      intent: {
        version: 2,
        source: "fresh",
        notation: "1d20",
        title: null,
        repetitions: 3,
        defaultName: null,
      },
    });
  });

  it("creates one standalone saved-roll clatter message and edits it with the result", async () => {
    const runId = snowflakeAt(Date.now(), 44);
    const stub = work(runId);
    const context = {
      version: 1 as const,
      userId: "100000000000000003",
      guildId: "100000000000000002",
      channelId: "100000000000000010",
    };
    const selection = {
      scope: "server" as const,
      id: "223e4567-e89b-42d3-a456-426614174000",
      revision: 3,
    };
    await stub.reserveDirectSavedRoll({
      ...context,
      interactionId: runId,
      selection,
    });
    await expect(stub.acceptSavedRollDelivery({
      version: 1,
      sessionId: runId,
      selection,
      deferredAt: Date.now(),
      interaction: {
        id: runId,
        applicationId: "100000000000000001",
        token: "saved-channel-message",
      },
      actor: {
        ...context,
        username: "roller",
        loggingContext: {
          kind: "guild",
          guildId: context.guildId,
          guildName: "Fixture Guild",
          channelId: context.channelId,
          channelName: "dice-rolls",
          channelType: 0,
        },
      },
      sourceInteraction: "component",
      responseMode: "channel-message",
    })).resolves.toMatchObject({ status: "created" });

    await runInDurableObject(stub, async (instance) => {
      await callAlarm(instance);
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql.exec<{
        followup_message_id: string | null;
      }>(
        "SELECT followup_message_id FROM interaction_delivery WHERE singleton = 1",
      ).one();
      expect(row.followup_message_id).toBe("100000000000000099");
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET result_not_before = 0 WHERE singleton = 1",
      );
    });
    await runDurableObjectAlarm(stub);

    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
      lastHttpStatus: 200,
    });
  });

  it("edits one public original response for a preflighted valid roll", async () => {
    const id = snowflakeAt(Date.now(), 45);
    const stub = work(id);
    const input = {
      ...deliveryRequest(id, "direct-public-roll"),
      rollSeed: 123_456_789,
    };

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
      lastHttpStatus: 200,
    });
    await runInDurableObject(stub, (_instance, state) => {
      const record = JSON.parse(
        state.storage.sql
          .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
          .one().record_json,
      ) as { rollSeed: number };
      expect(record.rollSeed).toBe(input.rollSeed);
    });
  });

  it("accepts pre-rollout component response modes before rejecting a stale selection", async () => {
    const runId = snowflakeAt(Date.now(), 43);
    const sessionId = runId;
    const stub = work(sessionId);
    const context = {
      version: 1 as const,
      userId: "100000000000000003",
      guildId: "100000000000000002",
      channelId: "100000000000000010",
    };
    const selection = {
      scope: "server" as const,
      id: "423e4567-e89b-42d3-a456-426614174000",
      revision: 3,
    };
    await stub.reserveDirectSavedRoll({ ...context, interactionId: runId, selection });
    const request = {
      version: 1 as const,
      sessionId,
      selection,
      deferredAt: Date.now(),
      interaction: {
        id: runId,
        applicationId: "100000000000000001",
        token: "delivery-success",
      },
      actor: {
        ...context,
        username: "roller",
        loggingContext: {
          kind: "guild" as const,
          guildId: "100000000000000002",
          guildName: "Fixture Guild",
          channelId: "100000000000000010",
          channelName: "dice-rolls",
          channelType: 0,
        },
      },
      sourceInteraction: "component" as const,
    };
    for (const responseMode of ["followup", "edit-original"] as const) {
      await expect(
        stub.acceptSavedRollDelivery({ ...request, responseMode }),
      ).resolves.toEqual({ status: "stale" });
    }
  });

  it("stores a fully resolved renderer-v4 snapshot at staging delivery acceptance", async () => {
    const id = snowflakeAt(Date.now(), 40);
    const stub = work(id);

    await expect(
      stub.acceptDelivery(deliveryRequest(id, "delivery-success")),
    ).resolves.toMatchObject({ status: "created" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      const record: unknown = JSON.parse(row.record_json);
      expect(record).toMatchObject({
        version: 4,
        renderRequest: {
          version: 4,
          rendererRevision: "canvaskit-v4-r14",
          groups: [[{ target: "d20" }]],
        },
      });
    });
  });

  it("reuses the exact renderer-v4 snapshot without another profile lookup", async () => {
    const id = snowflakeAt(Date.now(), 41);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.accounting.userId = "100000000000000088";
    const request = { notation: ["1d20"], repetitions: 1 };

    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "created",
    });
    const first = await stub.render(request);
    expect(first).toMatchObject({ status: "rendered", version: 4 });
    let snapshot = "";
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      const record = JSON.parse(row.record_json) as {
        renderRequest: {
          groups: Array<
            Array<{
              appearance: { palette: string[] };
            }>
          >;
        };
      };
      expect(
        record.renderRequest.groups[0]?.[0]?.appearance.palette,
      ).toContain("#aa0000");
      snapshot = JSON.stringify(record.renderRequest);
    });

    await evictDurableObject(stub);
    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "existing",
    });
    const retry = await stub.render(request);
    expect(retry).toEqual(first);
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      const record = JSON.parse(row.record_json) as { renderRequest: unknown };
      expect(JSON.stringify(record.renderRequest)).toBe(snapshot);
    });
  });

  it("continues to render a serialized V2 snapshot after V3 activation", async () => {
    const stub = work("1400000000000000045");
    const serialized = JSON.stringify(rollWorkV2Fixture);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO roll_work (singleton, request_json, record_json)
         VALUES (1, ?, ?)`,
        JSON.stringify(rollWorkV2Fixture.request),
        serialized,
      );
    });

    const first = await stub.render(rollWorkV2Fixture.request);
    expect(first).toMatchObject({
      status: "rendered",
      version: 2,
      diceCount: 1,
    });
    await evictDurableObject(stub);
    const retry = await stub.render(rollWorkV2Fixture.request);
    expect(retry).toEqual(first);
    await runInDurableObject(stub, (_instance, state) => {
      const stored = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(stored.record_json).toBe(serialized);
    });
  });

  it("parses and renders a serialized V3 snapshot as the compatibility floor", async () => {
    const stub = work("1400000000000000043");
    const requestJson = JSON.stringify(rollWorkV3Fixture.request);
    const serialized = JSON.stringify(rollWorkV3Fixture);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO roll_work (singleton, request_json, record_json)
         VALUES (1, ?, ?)`,
        requestJson,
        serialized,
      );
    });
    const dataService = rollEnv.DATA_SERVICE as unknown as {
      fetch: (request: Request) => Promise<Response>;
    };
    const originalFetch = dataService.fetch;
    const dataFetch = vi.fn((): Promise<Response> =>
      Promise.reject(new Error("V3 retries must not query Data")),
    );
    dataService.fetch = dataFetch;

    try {
      const first = await stub.render(rollWorkV3Fixture.request);
      expect(first).toMatchObject({
        status: "rendered",
        version: 3,
        diceCount: 1,
        width: 150,
        height: 150,
      });
      await evictDurableObject(stub);
      const retry = await stub.render(rollWorkV3Fixture.request);
      expect(retry).toEqual(first);
      expect(dataFetch).not.toHaveBeenCalled();
    } finally {
      dataService.fetch = originalFetch;
    }

    await runInDurableObject(stub, (_instance, state) => {
      const stored = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(stored.record_json).toBe(serialized);
    });
  });

  it("parses and renders a serialized V4 snapshot independently of emission", async () => {
    const stub = work("1400000000000000044");
    const requestJson = JSON.stringify(rollWorkV4Fixture.request);
    const serialized = JSON.stringify(rollWorkV4Fixture);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO roll_work (singleton, request_json, record_json)
         VALUES (1, ?, ?)`,
        requestJson,
        serialized,
      );
    });
    const dataService = rollEnv.DATA_SERVICE as unknown as {
      fetch: (request: Request) => Promise<Response>;
    };
    const originalFetch = dataService.fetch;
    const dataFetch = vi.fn((): Promise<Response> =>
      Promise.reject(new Error("V4 retries must not query Data")),
    );
    dataService.fetch = dataFetch;

    try {
      const first = await stub.render(rollWorkV4Fixture.request);
      expect(first).toMatchObject({
        status: "rendered",
        version: 4,
        rendererRevision: "canvaskit-v4-r1",
        diceCount: 1,
        width: 150,
        height: 150,
      });
      if (first.status !== "rendered") {
        throw new Error("V4 fixture unexpectedly conflicted");
      }
      expect(first.png.slice(0, 8)).toEqual(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      await evictDurableObject(stub);
      const retry = await stub.render(rollWorkV4Fixture.request);
      expect(retry).toEqual(first);
      expect(dataFetch).not.toHaveBeenCalled();
    } finally {
      dataService.fetch = originalFetch;
    }

    await runInDurableObject(stub, (_instance, state) => {
      const stored = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(stored.record_json).toBe(serialized);
    });
  });

  it("parses pending and finalized renderer-v5 snapshots", () => {
    const pendingV4 = {
      ...structuredClone(rollWorkV4Fixture),
      version: 5 as const,
      renderVersion: 4 as const,
      renderRequest: null,
    };
    const finalizedV4 = {
      ...pendingV4,
      renderRequest: structuredClone(rollWorkV4Fixture.renderRequest),
    };
    const pendingV3 = {
      ...structuredClone(rollWorkV3Fixture),
      version: 5 as const,
      renderVersion: 3 as const,
      renderRequest: null,
    };
    const finalizedV3 = {
      ...pendingV3,
      renderRequest: structuredClone(rollWorkV3Fixture.renderRequest),
    };

    expect(parseRecord(JSON.stringify(pendingV4))).toEqual(pendingV4);
    expect(parseRecord(JSON.stringify(finalizedV4))).toEqual(finalizedV4);
    expect(parseRecord(JSON.stringify(pendingV3))).toEqual(pendingV3);
    expect(parseRecord(JSON.stringify(finalizedV3))).toEqual(finalizedV3);
    expect(() =>
      parseRecord(JSON.stringify({ ...finalizedV4, renderVersion: 3 })),
    ).toThrow();
  });

  it("rejects direct rendering while a renderer-v5 snapshot is pending", async () => {
    const stub = work("1400000000000000054");
    const pending = {
      ...structuredClone(rollWorkV4Fixture),
      version: 5 as const,
      renderVersion: 4 as const,
      renderRequest: null,
    };
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO roll_work (singleton, request_json, record_json)
         VALUES (1, ?, ?)`,
        JSON.stringify(pending.request),
        JSON.stringify(pending),
      );
    });

    await runInDurableObject(stub, async (instance) => {
      await expect(
        (instance as unknown as {
          render(value: unknown): Promise<unknown>;
        }).render(pending.request),
      ).rejects.toThrow("Roll render snapshot is pending");
    });
  });

  it("renders a finalized renderer-v5 snapshot at its stored V3 version", async () => {
    const stub = work("1400000000000000055");
    const finalized = {
      ...structuredClone(rollWorkV3Fixture),
      version: 5 as const,
      renderVersion: 3 as const,
    };
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO roll_work (singleton, request_json, record_json)
         VALUES (1, ?, ?)`,
        JSON.stringify(finalized.request),
        JSON.stringify(finalized),
      );
    });

    await expect(stub.render(finalized.request)).resolves.toMatchObject({
      status: "rendered",
      version: 3,
      diceCount: 1,
      width: 150,
      height: 150,
    });
  });

  it("renders a persisted maximum 50-die V4 request in the combined Worker", async () => {
    const fixture = structuredClone(rollWorkV4Fixture);
    const outcomeGroup = fixture.outcome.outcomes[0];
    const renderGroup = fixture.renderRequest.groups[0];
    const templateOutcome = outcomeGroup?.dice[0];
    const templateDie = renderGroup?.[0];
    if (
      outcomeGroup === undefined ||
      renderGroup === undefined ||
      templateOutcome === undefined ||
      templateDie === undefined
    ) {
      throw new Error("V4 fixture is incomplete");
    }
    fixture.request.notation = ["50d20"];
    outcomeGroup.notation = "50d20";
    outcomeGroup.output = "50d20 fixture = 475";
    outcomeGroup.total = 475;
    outcomeGroup.dice = Array.from({ length: 50 }, (_, index) => ({
      ...templateOutcome,
      rolled: (index % 20) + 1,
    }));
    fixture.renderRequest.groups[0] = Array.from(
      { length: 50 },
      (_, index) => ({
        ...structuredClone(templateDie),
        result: (index % 20) + 1,
        appearance: {
          ...structuredClone(templateDie.appearance),
          texture: {
            ...templateDie.appearance.texture,
            seed: (fixture.renderSeed + index) >>> 0,
          },
        },
      }),
    );

    const stub = work("1400000000000000046");
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO roll_work (singleton, request_json, record_json)
         VALUES (1, ?, ?)`,
        JSON.stringify(fixture.request),
        JSON.stringify(fixture),
      );
    });

    const first = await stub.render(fixture.request);
    expect(first).toMatchObject({
      status: "rendered",
      version: 4,
      rendererRevision: "canvaskit-v4-r1",
      diceCount: 50,
      rowCount: 5,
      width: 1_500,
      height: 750,
    });
    await expect(stub.render(fixture.request)).resolves.toEqual(first);
    // Two maximum-size CanvasKit renders take about 2.5s alone and longer
    // while the rest of the suite competes for the same machine.
  }, 20_000);

  it("rejects V3 and V4 records with incompatible render data", () => {
    const wrongVersion = structuredClone(rollWorkV3Fixture) as {
      renderRequest: { version: number };
    };
    wrongVersion.renderRequest.version = 2;
    expect(() => parseRecord(JSON.stringify(wrongVersion))).toThrow(
      "Render request version must be 3",
    );

    const groupMismatch = structuredClone(rollWorkV3Fixture) as {
      renderRequest: { groups: unknown[][] };
    };
    const storedGroup = groupMismatch.renderRequest.groups[0];
    if (storedGroup === undefined) throw new Error("V3 fixture group is missing");
    groupMismatch.renderRequest.groups.push(structuredClone(storedGroup));
    expect(() => parseRecord(JSON.stringify(groupMismatch))).toThrow(
      "Stored roll work render snapshot does not match outcome",
    );

    const dieMismatch = structuredClone(rollWorkV3Fixture) as {
      renderRequest: { groups: unknown[][] };
    };
    const firstGroup = dieMismatch.renderRequest.groups[0];
    const storedDie = firstGroup?.[0];
    if (firstGroup === undefined || storedDie === undefined) {
      throw new Error("V3 fixture die is missing");
    }
    firstGroup.push(structuredClone(storedDie));
    expect(() => parseRecord(JSON.stringify(dieMismatch))).toThrow(
      "Stored roll work render snapshot does not match outcome",
    );

    const wrongRevision = structuredClone(rollWorkV4Fixture) as {
      renderRequest: { rendererRevision: string };
    };
    wrongRevision.renderRequest.rendererRevision = "canvaskit-v4-r15";
    expect(() => parseRecord(JSON.stringify(wrongRevision))).toThrow(
      "Render request rendererRevision is not supported",
    );

    const v4GroupMismatch = structuredClone(rollWorkV4Fixture) as {
      renderRequest: { groups: unknown[][] };
    };
    const v4Group = v4GroupMismatch.renderRequest.groups[0];
    if (v4Group === undefined) throw new Error("V4 fixture group is missing");
    v4GroupMismatch.renderRequest.groups.push(structuredClone(v4Group));
    expect(() => parseRecord(JSON.stringify(v4GroupMismatch))).toThrow(
      "Stored roll work render snapshot does not match outcome",
    );

    const v4ResultMismatch = structuredClone(rollWorkV4Fixture);
    const mismatchedDie = v4ResultMismatch.renderRequest.groups[0]?.[0];
    if (mismatchedDie === undefined) throw new Error("V4 fixture die is missing");
    mismatchedDie.result = 20;
    expect(() => parseRecord(JSON.stringify(v4ResultMismatch))).toThrow(
      "Stored roll work render snapshot does not match outcome",
    );

    const v4TargetMismatch = structuredClone(rollWorkV4Fixture) as {
      renderRequest: { groups: Array<Array<{ target: string }>> };
    };
    const targetDie = v4TargetMismatch.renderRequest.groups[0]?.[0];
    if (targetDie === undefined) throw new Error("V4 fixture die is missing");
    targetDie.target = "d12";
    expect(() => parseRecord(JSON.stringify(v4TargetMismatch))).toThrow(
      "Stored roll work render snapshot does not match outcome",
    );

    const v4IconMismatch = structuredClone(rollWorkV4Fixture);
    const iconDie = v4IconMismatch.renderRequest.groups[0]?.[0];
    if (iconDie === undefined) throw new Error("V4 fixture die is missing");
    (iconDie.icons as string[]).push("explosion");
    expect(() => parseRecord(JSON.stringify(v4IconMismatch))).toThrow(
      "Stored roll work render snapshot does not match outcome",
    );

    const invalidV4Request = structuredClone(rollWorkV4Fixture);
    invalidV4Request.request.repetitions = 0;
    expect(() => parseRecord(JSON.stringify(invalidV4Request))).toThrow(
      "Stored roll work is invalid",
    );

    const incompleteV4Outcome = structuredClone(rollWorkV4Fixture);
    incompleteV4Outcome.request.notation.push("1d12");
    expect(() => parseRecord(JSON.stringify(incompleteV4Outcome))).toThrow(
      "Stored roll work is invalid",
    );

    const invalidV4Outcome = structuredClone(rollWorkV4Fixture) as {
      outcome: { outcomes: Array<{ dice: Array<{ modifiers: unknown }> }> };
    };
    const outcomeDie = invalidV4Outcome.outcome.outcomes[0]?.dice[0];
    if (outcomeDie === undefined) throw new Error("V4 outcome die is missing");
    outcomeDie.modifiers = "critical-success";
    expect(() => parseRecord(JSON.stringify(invalidV4Outcome))).toThrow(
      "Stored roll work is invalid",
    );
  });

  it("restores V4 snapshots with valid zero-dice outcomes", () => {
    const request = { notation: ["1d20", "5"], repetitions: 1 };
    const outcome = executeRoll({ ...request, seed: 1 });
    expect(outcome.outcomes.map(({ dice }) => dice.length)).toEqual([1, 0]);
    const record = {
      version: 4 as const,
      request,
      rollSeed: 1,
      renderSeed: 2,
      outcome,
      createdAt: Date.now(),
      renderRequest: buildRollRenderRequestV4(outcome, 2, v4Recipes()),
    };

    expect(parseRecord(JSON.stringify(record))).toEqual(record);
  });

  it("restores V4 percentile snapshots whose ones die rolled zero", () => {
    const request = { notation: ["1d100"], repetitions: 1 };
    const rollSeed = 1_567_612_846;
    const renderSeed = 1_750_463_891;
    const outcome = executeRoll({
      ...request,
      seed: rollSeed,
      stableAppearanceIdentities: true,
    });
    const record = {
      version: 4 as const,
      request,
      rollSeed,
      renderSeed,
      outcome,
      createdAt: 1_785_183_198_972,
      renderRequest: buildRollRenderRequestV4(
        outcome,
        renderSeed,
        v4Recipes(),
      ),
    };

    expect(outcome.outcomes[0]?.dice[1]?.rolled).toBe(0);
    expect(record.renderRequest.groups[0]?.[1]?.result).toBe(10);
    expect(parseRecord(JSON.stringify(record))).toEqual(record);
  });

  it("persists the original physical face for out-of-range V4 results", () => {
    const request = { notation: ["1d2!!"], repetitions: 1 };
    const outcome = executeRoll({
      ...request,
      seed: 1,
      preserveOutOfRangePhysicalFaces: true,
    });
    const die = outcome.outcomes[0]?.dice[0];
    expect(die).toMatchObject({
      sides: 2,
      rolled: 11,
      physicalFace: 2,
      modifiers: ["explode", "compound"],
    });
    const record = {
      version: 4 as const,
      request,
      rollSeed: 1,
      renderSeed: 2,
      outcome,
      createdAt: Date.now(),
      renderRequest: buildRollRenderRequestV4(outcome, 2, v4Recipes()),
    };

    expect(record.renderRequest.groups[0]?.[0]?.result).toBe(2);
    expect(parseRecord(JSON.stringify(record))).toEqual(record);
  });

  it.each([
    ["fails", "100000000000000099", 42],
    ["returns malformed data", "100000000000000098", 43],
  ])(
    "does not persist work when the required appearance lookup %s",
    async (_case, userId, sequence) => {
      const id = snowflakeAt(Date.now(), sequence);
      const stub = work(id);
      const input = deliveryRequest(id, "delivery-success");
      input.accounting.userId = userId;

      await expect(stub.acceptDelivery(input)).resolves.toEqual({
        status: "unavailable",
      });
      await runInDurableObject(stub, async (_instance, state) => {
        expect(
          state.storage.sql
            .exec<{ count: number }>("SELECT COUNT(*) AS count FROM roll_work")
            .one().count,
        ).toBe(0);
        expect(
          state.storage.sql
            .exec<{ count: number }>(
              "SELECT COUNT(*) AS count FROM interaction_delivery",
            )
            .one().count,
        ).toBe(0);
        expect(await state.storage.getAlarm()).toBeNull();
      });
    },
  );

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

  it("renders and delivers 30d2ro=1 through the combined Worker", async () => {
    const id = snowflakeAt(Date.now(), 49);
    const input = deliveryRequest(id, "delivery-success");
    input.request.notation = "30d2ro=1";
    input.logging.notation = "30d2ro=1";
    const stub = work(id);

    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "created",
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(() => parseRecord(row.record_json)).not.toThrow();
    });
    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
  });

  it("renders zero-valued penetrating d2 results from a persisted V4 snapshot", async () => {
    const request = { notation: ["15d2!p"], repetitions: 1 };
    const outcome = executeRoll({ ...request, seed: 0 });
    const record = {
      version: 4 as const,
      request,
      rollSeed: 0,
      renderSeed: 1,
      outcome,
      createdAt: Date.now(),
      renderRequest: buildRollRenderRequestV4(outcome, 1, v4Recipes()),
    };
    const stub = work("1400000000000000047");
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO roll_work (singleton, request_json, record_json)
         VALUES (1, ?, ?)`,
        JSON.stringify(request),
        JSON.stringify(record),
      );
    });

    const result = await stub.render(request);

    expect(result).toMatchObject({
      status: "rendered",
      version: 4,
      diceCount: outcome.outcomes[0]?.dice.length,
    });
    if (result.status !== "rendered") {
      throw new Error("Penetrating roll rendering unexpectedly conflicted");
    }
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
    const token = `delivery-result-temporary-active-${id}`;
    const input = deliveryRequest(id, token);
    const expiresAt = interactionExpiresAt(id);
    const providerStarted = controlledSignal();
    const providerReleased = controlledSignal();
    const fetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (request, init): Promise<Response> => {
        const url = new URL(request instanceof Request ? request.url : request);
        if (url.pathname.includes(`/${token}/`)) {
          providerStarted.resolve();
          await providerReleased.promise;
        }
        return fetch(request, init);
      },
    );

    let accepted: Awaited<ReturnType<typeof stub.acceptDelivery>>;
    try {
      accepted = await stub.acceptDelivery(input);
      if (!("expiresAt" in accepted)) {
        throw new Error("New delivery was not accepted");
      }
      await runInDurableObject(stub, async (instance, state) => {
        const deliveryAlarm = callAlarm(instance);
        await providerStarted.promise;
        state.storage.sql.exec(
          "UPDATE interaction_delivery SET expires_at = 0",
        );
        await callAlarm(instance);
        expect(
          state.storage.sql.exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM interaction_delivery",
          ).one().count,
        ).toBe(1);
        state.storage.sql.exec(
          "UPDATE interaction_delivery SET expires_at = ?",
          expiresAt,
        );
        providerReleased.resolve();
        await deliveryAlarm;
      });
    } finally {
      providerReleased.resolve();
      fetchSpy.mockRestore();
    }
    const status = await stub.deliveryStatus();

    expect(accepted).toEqual({
      status: "created",
      delivery: "pending",
      expiresAt,
    });
    expect(status).toMatchObject({
      state: "pending",
      expiresAt,
      deliveredAt: null,
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
      expect(alarm).toBeLessThanOrEqual(expiresAt);
    });
  });

  it("accepts independently available signed display metadata", () => {
    const id = snowflakeAt(Date.now(), 32);
    const request = deliveryRequest(id, "delivery-partial-context");
    const context = {
      kind: "guild" as const,
      guildId: "100000000000000003",
      guildName: null,
      channelId: "100000000000000010",
      channelName: "dice-rolls",
      channelType: 0,
    };
    const input = {
      ...request,
      logging: { ...request.logging, context },
    };

    expect(validateDeliveryRequest(input).logging?.context).toEqual(context);
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
    const dataService = rollEnv.DATA_SERVICE as unknown as {
      fetch: (request: Request) => Promise<Response>;
    };
    const originalFetch = dataService.fetch;
    const lifecycleSyncStarted = controlledSignal();
    const lifecycleSyncReleased = controlledSignal();
    let firstLifecycleSnapshot: unknown;
    dataService.fetch = vi.fn(async (request: Request): Promise<Response> => {
      if (
        new URL(request.url).pathname === "/internal/roll-lifecycle" &&
        firstLifecycleSnapshot === undefined
      ) {
        const snapshot = await request.clone().json<{ interactionId?: unknown }>();
        if (snapshot.interactionId === id) {
          firstLifecycleSnapshot = snapshot;
          lifecycleSyncStarted.resolve();
          await lifecycleSyncReleased.promise;
          return Response.json({ status: "applied" });
        }
      }
      return originalFetch.call(dataService, request);
    });

    try {
      await runInDurableObject(stub, async (instance, state) => {
        const roll = instance as unknown as {
          acceptDelivery(value: unknown): Promise<unknown>;
        };
        await expect(roll.acceptDelivery(input)).resolves.toMatchObject({
          status: "created",
          delivery: "pending",
        });
        state.storage.sql.exec("DELETE FROM interaction_delivery");

        const alarm = callAlarm(instance);
        await lifecycleSyncStarted.promise;
        await expect(roll.acceptDelivery(input)).resolves.toMatchObject({
          status: "created",
          delivery: "pending",
        });
        lifecycleSyncReleased.resolve();
        await alarm;
        state.storage.sql.exec(
          "UPDATE interaction_delivery SET result_not_before = 0",
        );
        await callAlarm(instance);
      });
    } finally {
      lifecycleSyncReleased.resolve();
      dataService.fetch = originalFetch;
    }

    expect(firstLifecycleSnapshot).toMatchObject({
      interactionId: id,
      revision: 2,
      state: "accepted",
    });
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
      expect(await state.storage.getAlarm()).toBeLessThan(
        interactionExpiresAt(id),
      );
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
      const workRow = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(JSON.parse(workRow.record_json)).toMatchObject({ version: 1 });
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
      expect(await state.storage.getAlarm()).toBeLessThan(
        interactionExpiresAt(id),
      );
    });
  });

  it("persists the disabled delay preference and sends the result directly", async () => {
    const id = snowflakeAt(Date.now(), 26);
    const stub = work(id);
    const input = telemetryDeliveryRequest(id, "delivery-success");
    input.accounting.userId = "100000000000000044";
    const appearanceStarted = controlledSignal();
    const appearanceReleased = controlledSignal();
    const restoreAppearance = interceptEffectiveAppearance(
      input.accounting.userId,
      async () => {
        appearanceStarted.resolve();
        await appearanceReleased.promise;
        return undefined;
      },
    );
    let jsonCalls = 0;
    let multipartCalls = 0;
    const restoreRequests = observeInteractionRequests(
      input.interaction.token,
      (request) => {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.startsWith("application/json")) jsonCalls += 1;
        if (contentType.startsWith("multipart/form-data")) multipartCalls += 1;
      },
    );

    try {
      await runInDurableObject(stub, async (instance) => {
        const roll = instance as unknown as {
          deliver(value: unknown): Promise<unknown>;
        };
        const deliveryPromise = roll.deliver(input);
        try {
          await appearanceStarted.promise;
          expect(jsonCalls).toBe(0);
          expect(multipartCalls).toBe(0);
          appearanceReleased.resolve();
          await expect(deliveryPromise).resolves.toEqual({
            status: "delivered",
          });
        } finally {
          appearanceReleased.resolve();
          await deliveryPromise.catch(() => undefined);
        }
      });
    } finally {
      appearanceReleased.resolve();
      restoreAppearance();
      restoreRequests();
    }

    expect(jsonCalls).toBe(0);
    expect(multipartCalls).toBe(1);
    await runInDurableObject(stub, (_instance, state) => {
      const delivery = state.storage.sql
        .exec<{
          skip_dice_delay: number | null;
          clatter_sent_at: number | null;
          delay_ms: number | null;
          result_not_before: number | null;
        }>(
          `SELECT skip_dice_delay, clatter_sent_at, delay_ms,
                  result_not_before
           FROM interaction_delivery`,
        )
        .one();
      expect(delivery).toEqual({
        skip_dice_delay: 1,
        clatter_sent_at: null,
        delay_ms: null,
        result_not_before: null,
      });
      const workRow = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(JSON.parse(workRow.record_json)).toMatchObject({
        version: 5,
        renderVersion: 4,
        renderRequest: {
          version: 4,
          rendererRevision: "canvaskit-v4-r14",
        },
      });
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM roll_log_outbox",
          )
          .one().count,
      ).toBe(1);
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

  it("reports delivery segments measured in an earlier alarm wake", async () => {
    const id = snowflakeAt(Date.now(), 91);
    const stub = work(id);
    const input = telemetryDeliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    input.accounting.userId = "100000000000000077";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    const consoleInfo = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    try {
      await expect(stub.deliver(input)).resolves.toMatchObject({
        status: "pending",
      });
      const prepared = await runInDurableObject(stub, (_instance, state) =>
        state.storage.sql
          .exec<{
            snapshot_ms: number | null;
            settings_ms: number | null;
            clatter_post_ms: number | null;
          }>(
            `SELECT snapshot_ms, settings_ms, clatter_post_ms
             FROM interaction_delivery`,
          )
          .one(),
      );
      expect(prepared.snapshot_ms).toBeTypeOf("number");
      expect(prepared.settings_ms).toBeTypeOf("number");
      expect(prepared.clatter_post_ms).toBeTypeOf("number");

      // Eviction drops in-memory state, so the completion event can only
      // report these segments if the earlier wake persisted them.
      await evictDurableObject(stub);
      await runInDurableObject(stub, async (instance, state) => {
        state.storage.sql.exec(
          "UPDATE interaction_delivery SET result_not_before = ?",
          Date.now(),
        );
        await callAlarm(instance);
      });
      await expect(stub.deliveryStatus()).resolves.toMatchObject({
        state: "delivered",
      });

      const delivered = consoleInfo.mock.calls
        .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
        .find(
          ({ message, rollId }) =>
            message === "Roll destination delivery completed" && rollId === id,
        );
      expect(delivered).toMatchObject({
        telemetryVersion: 5,
        state: "delivered",
        renderSnapshotPreparationMs: prepared.snapshot_ms,
        guildSettingsMs: prepared.settings_ms,
        clatterPostMs: prepared.clatter_post_ms,
      });
      expect(delivered?.ackToClatterMs).toBeTypeOf("number");
      expect(delivered?.acceptanceToDeliveryStartMs).toBeTypeOf("number");
      expect(delivered?.lifecycleSyncMs).toBeTypeOf("number");
      expect(delivered?.accountingMs).toBeTypeOf("number");
      expect(Number(delivered?.ackToClatterMs)).toBeGreaterThanOrEqual(
        Number(delivered?.guildSettingsMs) + Number(delivered?.clatterPostMs),
      );
      expect(delivered?.resultUploadMs).toBeTypeOf("number");
      expect(delivered?.postDelayMs).toBeTypeOf("number");
      expect(Number(delivered?.imageByteLength)).toBeGreaterThan(0);
      expect(Number(delivered?.postDelayMs)).toBeGreaterThanOrEqual(0);
      expect(Number(delivered?.elapsedMs)).toBeGreaterThanOrEqual(
        Number(delivered?.postDelayMs),
      );
    } finally {
      consoleInfo.mockRestore();
    }
  });

  it("prepares a fresh roll during its persisted clatter delay", async () => {
    const id = snowflakeAt(Date.now(), 49);
    const stub = work(id);
    const input = telemetryDeliveryRequest(id, "delivery-clatter-contract");
    const renderVersionBinding: string = rollEnv.ROLL_RENDER_VERSION;
    const expectedRenderVersion = renderVersionBinding === "3" ? 3 : 4;
    input.accounting.guildId = "100000000000000002";
    input.accounting.userId = "100000000000000077";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    const appearanceStarted = controlledSignal();
    const appearanceReleased = controlledSignal();
    let appearanceCalls = 0;
    const restoreAppearance = interceptEffectiveAppearance(
      input.accounting.userId,
      async () => {
        appearanceCalls += 1;
        appearanceStarted.resolve();
        await appearanceReleased.promise;
        return appearanceCalls > 1
          ? Response.json({ error: "profile changed" }, { status: 503 })
          : undefined;
      },
    );
    let clatterCalls = 0;
    let deliveredImage = new Uint8Array();
    const restoreRequests = observeInteractionRequests(
      input.interaction.token,
      async (request) => {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.startsWith("application/json")) clatterCalls += 1;
        if (contentType.startsWith("multipart/form-data")) {
          const form = await request.clone().formData();
          const image = form.get("files[0]");
          if (image instanceof Blob) {
            deliveredImage = new Uint8Array(await image.arrayBuffer());
          }
        }
      },
    );

    let finalizedRecord = "";
    let sourceImage = new Uint8Array();
    try {
      await runInDurableObject(stub, async (instance, state) => {
        const roll = instance as unknown as {
          deliver(value: unknown): Promise<unknown>;
        };
        const deliveryPromise = roll.deliver(input);
        try {
          await appearanceStarted.promise;
          expect(clatterCalls).toBe(1);
          const delivery = state.storage.sql
            .exec<{
              clatter_sent_at: number;
              delay_ms: number;
              result_not_before: number;
            }>(
              `SELECT clatter_sent_at, delay_ms, result_not_before
               FROM interaction_delivery`,
            )
            .one();
          expect(delivery.result_not_before).toBe(
            delivery.clatter_sent_at + delivery.delay_ms,
          );
          const pendingWork = state.storage.sql
            .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
            .one();
          expect(JSON.parse(pendingWork.record_json)).toMatchObject({
            version: 5,
            renderVersion: expectedRenderVersion,
            renderRequest: null,
          });
          expect(
            state.storage.sql
              .exec<{ count: number }>(
                "SELECT COUNT(*) AS count FROM roll_log_outbox",
              )
              .one().count,
          ).toBe(0);

          appearanceReleased.resolve();
          await expect(deliveryPromise).resolves.toMatchObject({
            status: "pending",
          });
          finalizedRecord = state.storage.sql
            .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
            .one().record_json;
          expect(JSON.parse(finalizedRecord)).toMatchObject({
            version: 5,
            renderVersion: expectedRenderVersion,
            renderRequest:
              expectedRenderVersion === 3
                ? { version: 3 }
                : {
                    version: 4,
                    rendererRevision: "canvaskit-v4-r14",
                  },
          });
          const source = state.storage.sql
            .exec<{ image_bytes: ArrayBuffer }>(
              "SELECT image_bytes FROM roll_log_outbox",
            )
            .one();
          sourceImage = new Uint8Array(source.image_bytes).slice();
          expect(sourceImage.byteLength).toBeGreaterThan(0);
        } finally {
          appearanceReleased.resolve();
          await deliveryPromise.catch(() => undefined);
        }
      });

      await evictDurableObject(stub);
      await runInDurableObject(stub, async (instance, state) => {
        state.storage.sql.exec(
          "UPDATE interaction_delivery SET result_not_before = 0",
        );
        await callAlarm(instance);
      });
    } finally {
      appearanceReleased.resolve();
      restoreAppearance();
      restoreRequests();
    }

    expect(appearanceCalls).toBe(1);
    expect(clatterCalls).toBe(1);
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
    });
    expect(deliveredImage).toEqual(sourceImage);
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
          .one().record_json,
      ).toBe(finalizedRecord);
    });
  });

  it("rechecks the finalization window after snapshot preparation", async () => {
    const id = snowflakeAt(Date.now(), 51);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    input.accounting.userId = "100000000000000055";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    await seedPendingV5Delivery(stub, input);

    const appearanceStarted = controlledSignal();
    const appearanceReleased = controlledSignal();
    const restoreAppearance = interceptEffectiveAppearance(
      input.accounting.userId,
      async () => {
        appearanceStarted.resolve();
        await appearanceReleased.promise;
        return undefined;
      },
    );
    let clatterCalls = 0;
    let resultCalls = 0;
    let terminalCalls = 0;
    const restoreRequests = observeInteractionRequests(
      input.interaction.token,
      async (request) => {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.startsWith("multipart/form-data")) {
          resultCalls += 1;
          return;
        }
        if (contentType.startsWith("application/json")) {
          const payload = JSON.stringify(await request.clone().json<unknown>());
          // Extreme rolls swap in a random clatter variant, so match the
          // shared ellipsis opener instead of one variant's wording.
          if (payload.includes("_...")) clatterCalls += 1;
          if (payload.includes("This roll could not be completed")) {
            terminalCalls += 1;
          }
        }
      },
    );

    try {
      await runInDurableObject(stub, async (instance, state) => {
        state.storage.sql.exec(
          `UPDATE interaction_delivery
           SET expires_at = ?, delay_ms = 1
           WHERE singleton = 1`,
          Date.now() + 120_000,
        );
        const roll = instance as unknown as {
          deliver(value: unknown): Promise<unknown>;
          finalizeIfResultWindowClosed(
            delivery: { expires_at: number },
            target: unknown,
            attempts: number,
          ): Promise<unknown>;
        };
        const finalizeIfResultWindowClosed =
          roll.finalizeIfResultWindowClosed.bind(roll);
        roll.finalizeIfResultWindowClosed = (delivery, target, attempts) =>
          finalizeIfResultWindowClosed(
            { ...delivery, expires_at: Date.now() + 59_999 },
            target,
            attempts,
          );
        const deliveryPromise = roll.deliver(input);
        try {
          await appearanceStarted.promise;
          expect(clatterCalls).toBe(1);
          appearanceReleased.resolve();
          await expect(deliveryPromise).resolves.toEqual({ status: "failed" });
        } finally {
          appearanceReleased.resolve();
          await deliveryPromise.catch(() => undefined);
        }
      });
    } finally {
      appearanceReleased.resolve();
      restoreAppearance();
      restoreRequests();
    }

    expect(clatterCalls).toBe(1);
    expect(resultCalls).toBe(0);
    expect(terminalCalls).toBe(1);
    await runInDurableObject(stub, (instance) => {
      const roll = instance as unknown as {
        deliveryDiagnostics(): unknown;
      };
      expect(roll.deliveryDiagnostics()).toMatchObject({
        state: "failed",
        failurePhase: "deadline",
      });
    });
  });

  it("retries snapshot preparation without repeating persisted clatter", async () => {
    const id = snowflakeAt(Date.now(), 50);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    input.accounting.userId = "100000000000000066";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    await seedPendingV5Delivery(stub, input);
    let appearanceCalls = 0;
    const restoreAppearance = interceptEffectiveAppearance(
      input.accounting.userId,
      () => {
        appearanceCalls += 1;
        return appearanceCalls === 1
          ? Response.json({ error: "temporary" }, { status: 503 })
          : undefined;
      },
    );
    let clatterCalls = 0;
    const restoreRequests = observeInteractionRequests(
      input.interaction.token,
      (request) => {
        if (
          request.headers
            .get("content-type")
            ?.startsWith("application/json")
        ) {
          clatterCalls += 1;
        }
      },
    );

    try {
      // Delivering and inspecting inside one invocation keeps the scheduled
      // retry from finalizing the snapshot before the pending state is read.
      await runInDurableObject(stub, async (instance, state) => {
        const roll = instance as unknown as {
          deliver(value: unknown): Promise<unknown>;
        };
        await expect(roll.deliver(input)).resolves.toMatchObject({
          status: "pending",
        });
        const delivery = state.storage.sql
          .exec<{ clatter_sent_at: number | null }>(
            "SELECT clatter_sent_at FROM interaction_delivery",
          )
          .one();
        expect(delivery.clatter_sent_at).toBeTypeOf("number");
        const workRow = state.storage.sql
          .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
          .one();
        expect(JSON.parse(workRow.record_json)).toMatchObject({
          version: 5,
          renderRequest: null,
        });
        state.storage.sql.exec(
          "UPDATE interaction_delivery SET result_not_before = 0",
        );
      });

      await evictDurableObject(stub);
      await runInDurableObject(stub, async (instance) => {
        await callAlarm(instance);
      });
    } finally {
      restoreAppearance();
      restoreRequests();
    }

    expect(appearanceCalls).toBe(2);
    expect(clatterCalls).toBe(1);
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
    });
    await runInDurableObject(stub, (_instance, state) => {
      const workRow = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(JSON.parse(workRow.record_json)).toMatchObject({
        version: 5,
        renderVersion: 4,
        renderRequest: {
          version: 4,
          rendererRevision: "canvaskit-v4-r14",
        },
      });
    });
  });

  it("keeps pending V5 lifecycle identity stable through renderer finalization", async () => {
    const id = snowflakeAt(Date.now(), 69);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    await stub.prepare({
      notation: [input.request.notation],
      repetitions: input.request.repetitions,
    });
    await runInDurableObject(stub, (_instance, state) => {
      const workRow = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      const record = JSON.parse(workRow.record_json) as Record<string, unknown>;
      const pending = parseRecord(
        JSON.stringify({
          ...record,
          version: 5,
          renderVersion: 4,
          renderRequest: null,
        }),
      );
      state.storage.sql.exec(
        "UPDATE roll_work SET record_json = ? WHERE singleton = 1",
        JSON.stringify(pending),
      );
    });
    const lifecycleSyncs = observeLifecycleSyncs(id);

    try {
      const firstAttempt = await stub.deliver(input);
      if (firstAttempt.status === "pending") {
        await runInDurableObject(stub, async (instance, state) => {
          state.storage.sql.exec(
            "UPDATE interaction_delivery SET result_not_before = 0",
          );
          await callAlarm(instance);
        });
      }
    } finally {
      lifecycleSyncs.restore();
    }

    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
    });
    expect(lifecycleSyncs.observations[0]).toMatchObject({
      state: "accepted",
      rendererRevision: "canvaskit-v4-r14",
      httpStatus: 200,
    });
    expect(
      lifecycleSyncs.observations.map(({ rendererRevision }) => rendererRevision),
    ).toEqual(
      lifecycleSyncs.observations.map(() => "canvaskit-v4-r14"),
    );
    expect(lifecycleSyncs.observations.at(-1)).toMatchObject({
      state: "delivered",
      rendererRevision: "canvaskit-v4-r14",
      httpStatus: 200,
    });
  });

  it("rolls back snapshot finalization when lifecycle renderer metadata conflicts", async () => {
    const id = snowflakeAt(Date.now(), 52);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    await seedPendingV5Delivery(stub, input);
    await runInDurableObject(stub, (_instance, state) => {
      const lifecycleRow = state.storage.sql
        .exec<{ snapshot_json: string }>(
          "SELECT snapshot_json FROM roll_lifecycle_outbox",
        )
        .one();
      const lifecycle = JSON.parse(lifecycleRow.snapshot_json) as {
        context: Record<string, unknown>;
      };
      state.storage.sql.exec(
        "UPDATE roll_lifecycle_outbox SET snapshot_json = ?",
        JSON.stringify({
          ...lifecycle,
          context: {
            ...lifecycle.context,
            rendererRevision: "canvaskit-v4-r13",
          },
        }),
      );
    });

    await expect(stub.deliver(input)).resolves.toEqual({ status: "failed" });
    await runInDurableObject(stub, (_instance, state) => {
      const workRow = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(JSON.parse(workRow.record_json)).toMatchObject({
        version: 5,
        renderVersion: 4,
        renderRequest: null,
      });
      const lifecycleRow = state.storage.sql
        .exec<{ snapshot_json: string }>(
          "SELECT snapshot_json FROM roll_lifecycle_outbox",
        )
        .one();
      expect(
        (JSON.parse(lifecycleRow.snapshot_json) as {
          context: { rendererRevision: string | null };
        }).context.rendererRevision,
      ).toBe("canvaskit-v4-r13");
    });
  });

  it("recovers a pending renderer-v5 snapshot after eviction", async () => {
    const id = snowflakeAt(Date.now(), 48);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }

    await seedPendingV5Delivery(stub, input);
    await runInDurableObject(stub, (_instance, state) => {
      const lifecycle = state.storage.sql
        .exec<{ snapshot_json: string }>(
          "SELECT snapshot_json FROM roll_lifecycle_outbox",
        )
        .one();
      const snapshot = JSON.parse(lifecycle.snapshot_json) as {
        revision: number;
      };
      state.storage.sql.exec(
        "UPDATE roll_lifecycle_outbox SET synced_revision = ?",
        snapshot.revision,
      );
    });

    await evictDurableObject(stub);
    await runInDurableObject(stub, async (instance, state) => {
      await callAlarm(instance);
      const workRow = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      expect(JSON.parse(workRow.record_json)).toMatchObject({
        version: 5,
        renderVersion: 4,
        renderRequest: {
          version: 4,
          rendererRevision: "canvaskit-v4-r14",
        },
      });
      const lifecycle = state.storage.sql
        .exec<{ snapshot_json: string }>(
          "SELECT snapshot_json FROM roll_lifecycle_outbox",
        )
        .one();
      expect(
        (JSON.parse(lifecycle.snapshot_json) as {
          context: { rendererRevision: string | null };
        }).context.rendererRevision,
      ).toBeNull();
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM roll_log_outbox",
          )
          .one().count,
      ).toBe(1);
      const delivery = state.storage.sql
        .exec<{
          clatter_sent_at: number;
          delay_ms: number;
          result_not_before: number;
        }>(
          `SELECT clatter_sent_at, delay_ms, result_not_before
           FROM interaction_delivery`,
        )
        .one();
      expect(delivery.result_not_before).toBe(
        delivery.clatter_sent_at + delivery.delay_ms,
      );
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET result_not_before = 0",
      );
      await callAlarm(instance);
    });

    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
    });
  });

  it("does not rewrite preflighted private invalid-roll help or send an automatic DM", async () => {
    const id = snowflakeAt(Date.now(), 31);
    const stub = work(id);
    const input = {
      ...deliveryRequest(id, "invalid-private-help"),
      rollSeed: 123_456_789,
    };
    const notation = "1776";
    input.request.notation = notation;
    input.logging.notation = notation;
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
      expect(consoleWarn).not.toHaveBeenCalledWith(
        JSON.stringify({
          level: "warn",
          message: "Direct roll private defer cleanup failed",
          rollId: id,
        }),
      );
    } finally {
      consoleWarn.mockRestore();
    }
    await runInDurableObject(stub, (_instance, state) => {
      const delivery = state.storage.sql
        .exec<{
          helper_state: string;
          helper_attempts: number;
          metadata_json: string;
        }>(
          `SELECT helper_state, helper_attempts, metadata_json
           FROM interaction_delivery`,
        )
        .one();
      expect(delivery).toMatchObject({
        helper_state: "not_applicable",
        helper_attempts: 0,
      });
      expect(JSON.parse(delivery.metadata_json)).toMatchObject({
        version: 7,
        preflighted: true,
      });
      const outbox = state.storage.sql
        .exec<{ artifact_json: string; image_bytes: ArrayBuffer }>(
          "SELECT artifact_json, image_bytes FROM roll_log_outbox",
        )
        .one();
      expect(JSON.parse(outbox.artifact_json)).toMatchObject({
        version: 2,
        rollId: id,
        notation,
        presentation: { title: "Initiative", result: null, savedRoll: null },
        payload: {
          flags: 1 << 15,
          components: [
            {
              type: 17,
              components: [
                { type: 10, content: "🚫 Invalid notation" },
                {
                  type: 1,
                  components: [
                    {
                      style: 5,
                      label: "Dice notation guide",
                      url: "https://dicewit.ch/docs/dice-notation",
                    },
                    { custom_id: `roll-help:dm-knowledgebase:${id}` },
                  ],
                },
              ],
            },
          ],
        },
        image: { status: "unavailable", reason: "not-applicable" },
      });
      expect(new Uint8Array(outbox.image_bytes)).toHaveLength(0);
    });

    await runDurableObjectAlarm(stub);
    await expect(logWork(id).artifactStatus()).resolves.toMatchObject({
      state: "pending",
      imageStatus: "unavailable",
      imageBytes: 0,
    });
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      loggingState: "delivered",
      loggingHttpStatus: 200,
      loggingAttempts: 1,
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
    await runDurableObjectAlarm(stub);
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
      const lifecycle = state.storage.sql
        .exec<{ snapshot_json: string; synced_revision: number }>(
          "SELECT snapshot_json, synced_revision FROM roll_lifecycle_outbox",
        )
        .one();
      const snapshot = JSON.parse(lifecycle.snapshot_json) as {
        revision: number;
        state: string;
        httpStatus: number | null;
      };
      expect(snapshot).toMatchObject({ state: "delivered", httpStatus: 200 });
      expect(lifecycle.synced_revision).toBe(snapshot.revision);
      expect(await state.storage.getAlarm()).toBe(interactionExpiresAt(id));
    });
    await expect(stub.deliveryDiagnostics()).resolves.toEqual({
      state: "delivered",
      failurePhase: null,
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

  it("records a terminal lifecycle when durable acceptance fails", async () => {
    const id = snowflakeAt(Date.now(), 67);
    const stub = work(id);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER fail_roll_prepare
        BEFORE INSERT ON roll_work
        BEGIN
          SELECT RAISE(ABORT, 'simulated durable acceptance failure');
        END;
      `);
    });

    await runInDurableObject(stub, async (instance) => {
      await expect(
        (instance as unknown as {
          acceptDelivery(value: unknown): Promise<unknown>;
        }).acceptDelivery(deliveryRequest(id, "delivery-success")),
      ).rejects.toThrow("simulated durable acceptance failure");
    });
    await runInDurableObject(stub, (_instance, state) => {
      const lifecycle = state.storage.sql
        .exec<{ snapshot_json: string; synced_revision: number }>(
          "SELECT snapshot_json, synced_revision FROM roll_lifecycle_outbox",
        )
        .one();
      const snapshot = JSON.parse(lifecycle.snapshot_json) as {
        revision: number;
        state: string;
        acceptedAt: number | null;
        failureCode: string | null;
      };
      expect(snapshot).toMatchObject({
        state: "failed",
        acceptedAt: null,
        failureCode: "acceptance-failed",
      });
      expect(lifecycle.synced_revision).toBe(snapshot.revision);
    });
  });

  it("preserves lifecycle state when an alarm interleaves with acceptance", async () => {
    const id = snowflakeAt(Date.now(), 68);
    const stub = work(id);
    const dataService = rollEnv.DATA_SERVICE as unknown as {
      fetch: (request: Request) => Promise<Response>;
    };
    const originalFetch = dataService.fetch;
    const acceptanceAlarmStarted = controlledSignal();
    const acceptanceAlarmReleased = controlledSignal();
    const lifecycleSyncStarted = controlledSignal();
    const lifecycleSyncReleased = controlledSignal();
    const accountingStarted = controlledSignal();
    const accountingReleased = controlledSignal();
    let acceptanceSettled = false;
    const lifecycleSnapshots: Array<{
      interactionId?: unknown;
      revision?: unknown;
      state?: unknown;
    }> = [];

    dataService.fetch = vi.fn(async (request: Request): Promise<Response> => {
      const path = new URL(request.url).pathname;
      if (path === "/internal/roll-lifecycle") {
        const snapshot = await request.clone().json<{
          interactionId?: unknown;
          revision?: unknown;
          state?: unknown;
        }>();
        if (snapshot.interactionId === id) {
          lifecycleSnapshots.push(snapshot);
          if (acceptanceSettled && lifecycleSnapshots.length === 1) {
            lifecycleSyncStarted.resolve();
            await lifecycleSyncReleased.promise;
          }
          return Response.json({ status: "applied" });
        }
      }
      if (path === "/internal/roll-accounting") {
        const accounting = await request.clone().json<{
          interactionId?: unknown;
        }>();
        if (accounting.interactionId === id) {
          accountingStarted.resolve();
          await accountingReleased.promise;
          return Response.json({ status: "applied" });
        }
      }
      return originalFetch.call(dataService, request);
    });

    try {
      await runInDurableObject(stub, async (instance, state) => {
        const setAlarm = state.storage.setAlarm.bind(state.storage);
        const setAlarmSpy = vi.spyOn(state.storage, "setAlarm");
        setAlarmSpy
          .mockImplementationOnce(setAlarm)
          .mockImplementationOnce(async (scheduledTime) => {
            acceptanceAlarmStarted.resolve();
            await acceptanceAlarmReleased.promise;
            await setAlarm(scheduledTime);
          });
        try {
          const acceptance = (instance as unknown as {
            acceptDelivery(value: unknown): Promise<unknown>;
          }).acceptDelivery(deliveryRequest(id, "delivery-success"));
          await acceptanceAlarmStarted.promise;
          await callAlarm(instance);
          acceptanceAlarmReleased.resolve();
          await expect(acceptance).resolves.toMatchObject({
            status: "created",
            delivery: "pending",
          });
          acceptanceSettled = true;

          expect(lifecycleSnapshots).toEqual([]);
          const rows = state.storage.sql
            .exec<{ snapshot_json: string; synced_revision: number }>(
              "SELECT snapshot_json, synced_revision FROM roll_lifecycle_outbox",
            )
            .toArray();
          expect(rows).toHaveLength(1);
          expect(JSON.parse(rows[0]?.snapshot_json ?? "null")).toMatchObject({
            state: "accepted",
            revision: 2,
          });
          expect(rows[0]?.synced_revision).toBe(0);

          const alarm = callAlarm(instance);
          await Promise.all([
            lifecycleSyncStarted.promise,
            accountingStarted.promise,
          ]);
          const delivery = (): { attempts: number; state: string } =>
            state.storage.sql
              .exec<{ attempts: number; state: string }>(
                "SELECT attempts, state FROM interaction_delivery",
              )
              .one();
          expect(delivery()).toEqual({ attempts: 0, state: "pending" });
          lifecycleSyncReleased.resolve();
          await Promise.resolve();
          expect(delivery()).toEqual({ attempts: 0, state: "pending" });
          accountingReleased.resolve();
          await alarm;
        } finally {
          acceptanceAlarmReleased.resolve();
          accountingReleased.resolve();
          setAlarmSpy.mockRestore();
        }
      });
    } finally {
      acceptanceAlarmReleased.resolve();
      lifecycleSyncReleased.resolve();
      accountingReleased.resolve();
      dataService.fetch = originalFetch;
    }

    expect(lifecycleSnapshots[0]).toMatchObject({
      interactionId: id,
      state: "accepted",
      revision: 2,
    });
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
      lastHttpStatus: 200,
    });
    await runInDurableObject(stub, (_instance, state) => {
      const lifecycle = state.storage.sql
        .exec<{ snapshot_json: string; synced_revision: number }>(
          "SELECT snapshot_json, synced_revision FROM roll_lifecycle_outbox",
        )
        .one();
      const snapshot = JSON.parse(lifecycle.snapshot_json) as {
        state: string;
        revision: number;
      };
      expect(snapshot.state).toBe("delivered");
      expect(lifecycle.synced_revision).toBe(snapshot.revision);
    });
  });

  it("terminates delivery without rereading an invalid stored record", async () => {
    const id = snowflakeAt(Date.now(), 66);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "created",
      delivery: "pending",
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
        .one();
      const record = JSON.parse(row.record_json) as {
        renderRequest: { groups: unknown[][] };
      };
      const renderGroup = record.renderRequest.groups[0];
      if (renderGroup === undefined) throw new Error("V4 render group is missing");
      record.renderRequest.groups.push(structuredClone(renderGroup));
      state.storage.sql.exec(
        "UPDATE roll_work SET record_json = ? WHERE singleton = 1",
        JSON.stringify(record),
      );
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await runInDurableObject(stub, async (instance) => callAlarm(instance));
      await expect(stub.deliveryStatus()).resolves.toMatchObject({
        state: "failed",
        lastHttpStatus: 200,
      });
      await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
        state: "failed",
        failurePhase: "record",
      });
      const terminalFailure = consoleError.mock.calls
        .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
        .find(
          ({ message, rollId }) =>
            message === "Roll delivery encountered a terminal internal failure" &&
            rollId === id,
        );
      expect(terminalFailure).toMatchObject({
        rollId: id,
        interactionId: id,
        phase: "record",
        userImpact: "failed",
      });
      expect(terminalFailure?.request).toBeNull();
      expect(terminalFailure?.outcome).toBeNull();
      expect(JSON.stringify(terminalFailure)).not.toContain(input.interaction.token);
      await runInDurableObject(stub, (_instance, state) => {
        const lifecycle = state.storage.sql
          .exec<{ snapshot_json: string; synced_revision: number }>(
            "SELECT snapshot_json, synced_revision FROM roll_lifecycle_outbox",
          )
          .one();
        const snapshot = JSON.parse(lifecycle.snapshot_json) as {
          revision: number;
          state: string;
          failureCode: string | null;
        };
        expect(snapshot).toMatchObject({
          state: "failed",
          failureCode: "stored-record-invalid",
        });
        expect(lifecycle.synced_revision).toBe(snapshot.revision);
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("emits complete terminal destination telemetry without credentials", async () => {
    const deliveredId = snowflakeAt(Date.now(), 61);
    const failedId = snowflakeAt(Date.now(), 62);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(
        work(deliveredId).deliver(
          deliveryRequest(deliveredId, "delivery-success"),
        ),
      ).resolves.toEqual({ status: "delivered" });
      await expect(
        work(failedId).deliver(
          telemetryDeliveryRequest(failedId, "delivery-terminal-failure"),
        ),
      ).resolves.toEqual({ status: "failed" });
      await runInDurableObject(work(failedId), (_instance, state) => {
        const row = state.storage.sql
          .exec<{ snapshot_json: string }>(
            "SELECT snapshot_json FROM roll_lifecycle_outbox",
          )
          .one();
        const snapshot = JSON.parse(row.snapshot_json) as {
          version: number;
          state: string;
          diagnostics: Record<string, unknown>;
        };
        expect(snapshot).toMatchObject({
          version: 2,
          state: "failed",
          diagnostics: {
            discordErrorCode: 10_015,
            discordOperation: "edit-original-result",
          },
        });
        expect(typeof snapshot.diagnostics.firstProviderAttemptAt).toBe(
          "number",
        );
      });

      const delivered = consoleInfo.mock.calls
        .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
        .find(
          ({ message, rollId }) =>
            message === "Roll destination delivery completed" &&
            rollId === deliveredId,
        );
      expect(delivered).toMatchObject({
        telemetryVersion: 5,
        subsystem: "roll-destination",
        rollId: deliveredId,
        interactionId: deliveredId,
        applicationId: "100000000000000001",
        source: "discord",
        notation: "1d20",
        request: { notation: ["1d20"], repetitions: 1 },
        title: "Initiative",
        userId: "100000000000000003",
        username: "roller",
        guildId: "100000000000000003",
        channelId: "100000000000000010",
        guildName: "Fixture Guild",
        channelName: "dice-rolls",
        channelType: 0,
        state: "delivered",
        userImpact: "none",
        attempts: 1,
        httpStatus: 200,
        failurePhase: null,
        renderVersion: 4,
        rendererRevision: "canvaskit-v4-r14",
      });
      expect(delivered?.outcome).toMatchObject({
        version: 1,
        outcomes: [{ notation: "1d20" }],
        errors: [],
      });
      expect(delivered?.destinationPayload).toMatchObject({ flags: 1 << 15 });
      const destinationPayload = JSON.stringify(delivered?.destinationPayload);
      expect(destinationPayload).toContain("## Initiative");
      expect(destinationPayload).toContain('"label":"Save"');
      expect(destinationPayload).toContain(
        `"custom_id":"save-roll:v1:d:${deliveredId}"`,
      );
      expect(destinationPayload).toContain("-# sent to roller via discord");
      expect(delivered?.rollSeed).toBeTypeOf("number");
      expect(delivered?.renderSeed).toBeTypeOf("number");
      expect(delivered?.elapsedMs).toBeTypeOf("number");
      expect(delivered?.imageSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(delivered?.resultUploadMs).toBeTypeOf("number");
      expect(Number(delivered?.imageByteLength)).toBeGreaterThan(0);

      const failed = consoleError.mock.calls
        .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
        .find(
          ({ message, rollId }) =>
            message === "Roll destination delivery completed" &&
            rollId === failedId,
        );
      expect(failed).toMatchObject({
        telemetryVersion: 5,
        subsystem: "roll-destination",
        rollId: failedId,
        interactionId: failedId,
        source: "discord",
        notation: "1d20",
        username: "roller",
        guildName: "Fixture Guild",
        channelName: "dice-rolls",
        state: "failed",
        userImpact: "failed",
        attempts: 1,
        httpStatus: 404,
        failurePhase: "discord",
        discordErrorCode: 10_015,
        discordOperation: "edit-original-result",
      });
      expect(failed?.outcome).toMatchObject({
        version: 1,
        outcomes: [{ notation: "1d20" }],
      });
      expect(failed?.destinationPayload).toBeDefined();
      expect(JSON.stringify([delivered, failed])).not.toMatch(
        /delivery-success|delivery-terminal-failure|invalid interaction|token_fingerprint|image_bytes/i,
      );
      expect(delivered).not.toHaveProperty("token");
      expect(delivered).not.toHaveProperty("imageBytes");
    } finally {
      consoleInfo.mockRestore();
      consoleError.mockRestore();
    }
  });

  it("normalizes a non-domain Discord error code without breaking lifecycle persistence", async () => {
    const id = snowflakeAt(Date.now(), 68);
    const stub = work(id);

    await expect(
      stub.deliver(telemetryDeliveryRequest(id, "delivery-zero-code")),
    ).resolves.toEqual({ status: "failed" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ snapshot_json: string }>(
          "SELECT snapshot_json FROM roll_lifecycle_outbox",
        )
        .one();
      expect(JSON.parse(row.snapshot_json)).toMatchObject({
        version: 2,
        state: "failed",
        diagnostics: { discordErrorCode: null },
      });
    });
  });

  it("logs only the numeric Discord error code for rejected clatter", async () => {
    const id = snowflakeAt(Date.now(), 69);
    const input = deliveryRequest(id, "delivery-clatter-rejected");
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(work(id).deliver(input)).resolves.toEqual({ status: "failed" });
      const failed = consoleError.mock.calls
        .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
        .find(
          ({ message, rollId }) =>
            message === "Roll destination delivery completed" && rollId === id,
        );
      expect(failed).toMatchObject({
        rollId: id,
        state: "failed",
        httpStatus: 404,
        failurePhase: "clatter",
        discordErrorCode: 10_008,
        discordOperation: "edit-original-clatter",
      });
      expect(JSON.stringify(failed)).not.toMatch(
        /sensitive provider detail|must not be logged/,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("persists V2 timing, Discord failure, and a read-only missing-message probe", async () => {
    const id = snowflakeAt(Date.now(), 70);
    const stub = work(id);
    const input = telemetryDeliveryRequest(
      id,
      "delivery-result-message-missing",
    );
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }

    await expect(stub.deliver(input)).resolves.toMatchObject({
      status: "pending",
    });
    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET result_not_before = 0",
      );
      await callAlarm(instance);
      const row = state.storage.sql
        .exec<{ snapshot_json: string }>(
          "SELECT snapshot_json FROM roll_lifecycle_outbox",
        )
        .one();
      const snapshot = JSON.parse(row.snapshot_json) as Record<string, unknown>;
      expect(snapshot).toMatchObject({
        version: 2,
        state: "failed",
        httpStatus: 404,
        diagnostics: {
          acknowledgementType: 5,
          discordErrorCode: 10_008,
          discordOperation: "edit-original-result",
          originalResponseMessageId: "100000000000000087",
          originalResponseProbe: "missing",
        },
      });
      const diagnostics = snapshot.diagnostics;
      if (
        typeof diagnostics !== "object" ||
        diagnostics === null ||
        !("firstProviderAttemptAt" in diagnostics) ||
        !("clatterSucceededAt" in diagnostics)
      ) {
        throw new Error("Roll lifecycle diagnostics are missing");
      }
      expect(typeof diagnostics.firstProviderAttemptAt).toBe("number");
      expect(typeof diagnostics.clatterSucceededAt).toBe("number");
      expect(JSON.stringify(snapshot)).not.toMatch(
        /delivery-result-message-missing|unknown message|authorization/i,
      );
    });
  });

  it("keeps a maximum-dice diagnostic event below the Workers Logs limit", async () => {
    const id = snowflakeAt(Date.now(), 63);
    const input = deliveryRequest(id, "delivery-success");
    input.request.notation = "50d20";
    input.logging.notation = "50d20";
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      await expect(work(id).deliver(input)).resolves.toEqual({
        status: "delivered",
      });
      const entry = consoleInfo.mock.calls
        .map(([value]) => String(value))
        .find((value) => {
          const event = JSON.parse(value) as Record<string, unknown>;
          return (
            event.message === "Roll destination delivery completed" &&
            event.rollId === id
          );
        });
      expect(entry).toBeDefined();
      if (entry === undefined) throw new Error("Destination telemetry is missing");
      expect(new TextEncoder().encode(entry).byteLength).toBeLessThan(256 * 1_024);

      const event = JSON.parse(entry) as {
        outcome?: { outcomes?: Array<{ dice?: unknown[] }> };
      };
      expect(event.outcome?.outcomes?.[0]?.dice).toHaveLength(50);
    } finally {
      consoleInfo.mockRestore();
    }
  });

  it("reuses one exact durable result artifact after eviction", async () => {
    const id = snowflakeAt(Date.now(), 50);
    const stub = work(id);
    const input = deliveryRequest(
      id,
      `delivery-result-temporary-${id}`,
    );

    await expect(stub.deliver(input)).resolves.toMatchObject({
      status: "pending",
    });
    let sourcePng = new Uint8Array();
    let sourceArtifact: Record<string, unknown> = {};
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{
          artifact_json: string;
          image_bytes: ArrayBuffer;
          destination_delivered_at: number | null;
        }>(
          `SELECT artifact_json, image_bytes, destination_delivered_at
           FROM roll_log_outbox`,
        )
        .one();
      sourcePng = new Uint8Array(row.image_bytes).slice();
      sourceArtifact = JSON.parse(row.artifact_json) as Record<string, unknown>;
      expect(row.destination_delivered_at).toBeNull();
      expect(sourceArtifact).toMatchObject({
        version: 2,
        rollId: id,
        user: { id: input.accounting.userId },
        context: input.logging.context,
        presentation: {
          title: "Initiative",
          savedRoll: null,
        },
        image: {
          status: "available",
          filename: `dice-${id}.png`,
        },
      });
      const presentation = sourceArtifact.presentation as
        | { result?: unknown }
        | undefined;
      expect(presentation?.result).toMatch(/^1d20:/);
      expect(sourcePng.byteLength).toBeGreaterThan(0);
    });

    await evictDurableObject(stub);
    await expect(stub.deliver(input)).resolves.toEqual({
      status: "delivered",
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ destination_delivered_at: number | null }>(
          "SELECT destination_delivered_at FROM roll_log_outbox",
        )
        .one();
      expect(row.destination_delivered_at).toBeTypeOf("number");
    });
    await runDurableObjectAlarm(stub);
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM roll_log_outbox",
          )
          .one().count,
      ).toBe(0);
    });

    const acceptedLog = logWork(id);
    await expect(acceptedLog.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      imageBytes: sourcePng.byteLength,
    });
    await runInDurableObject(acceptedLog, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ artifact_json: string; image_bytes: ArrayBuffer }>(
          "SELECT artifact_json, image_bytes FROM log_artifact",
        )
        .one();
      expect(JSON.parse(row.artifact_json)).toMatchObject(sourceArtifact);
      expect(new Uint8Array(row.image_bytes)).toEqual(sourcePng);
    });
  });

  it("recovers a durable log handoff after destination success and interaction expiry", async () => {
    const id = snowflakeAt(Date.now(), 51);
    const stub = work(id);
    const input = deliveryRequest(
      id,
      `delivery-result-temporary-${id}`,
    );
    await expect(stub.deliver(input)).resolves.toMatchObject({
      status: "pending",
    });

    const deliveredAt = Date.now() - 1_000;
    let sourcePng = new Uint8Array();
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ image_bytes: ArrayBuffer }>(
          "SELECT image_bytes FROM roll_log_outbox",
        )
        .one();
      sourcePng = new Uint8Array(row.image_bytes).slice();
      state.storage.sql.exec(
        `UPDATE interaction_delivery
         SET token = NULL, state = 'delivered', delivered_at = ?, expires_at = ?
         WHERE singleton = 1`,
        deliveredAt,
        deliveredAt,
      );
      state.storage.sql.exec(
        `UPDATE roll_log_outbox
         SET destination_delivered_at = ?, handoff_until = ?
         WHERE singleton = 1`,
        deliveredAt,
        Date.now() + 60_000,
      );
    });

    await evictDurableObject(stub);
    await runDurableObjectAlarm(stub);
    await expect(stub.deliveryStatus()).resolves.toEqual({ state: "missing" });
    await expect(logWork(id).artifactStatus()).resolves.toMatchObject({
      state: "pending",
      imageBytes: sourcePng.byteLength,
    });
  });

  it("atomically replays a LogWork acknowledgement after a source commit failure", async () => {
    const id = snowflakeAt(Date.now(), 52);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(`
        CREATE TRIGGER fail_log_ack
        BEFORE UPDATE OF logging_state ON interaction_delivery
        WHEN NEW.logging_state = 'delivered'
        BEGIN
          SELECT RAISE(ABORT, 'simulated source acknowledgement failure');
        END;
      `);
    });

    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM roll_log_outbox",
          )
          .one().count,
      ).toBe(1);
      expect(
        state.storage.sql
          .exec<{ logging_state: string }>(
            "SELECT logging_state FROM interaction_delivery",
          )
          .one().logging_state,
      ).toBe("pending");
      state.storage.sql.exec("DROP TRIGGER fail_log_ack");
    });
    await expect(logWork(id).artifactStatus()).resolves.toMatchObject({
      state: "pending",
    });

    await runInDurableObject(stub, async (instance) => {
      await callAlarm(instance);
    });
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      loggingState: "delivered",
      loggingAttempts: 2,
    });
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM roll_log_outbox",
          )
          .one().count,
      ).toBe(0);
    });
  });

  it("hands persisted signed context to durable roll logging", async () => {
    const id = snowflakeAt(Date.now(), 32);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "logging-context";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runDurableObjectAlarm(stub);
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      loggingState: "delivered",
      loggingAttempts: 1,
    });
  });

  it("fails closed instead of using legacy logging when the source artifact is missing", async () => {
    const id = snowflakeAt(Date.now(), 34);
    const stub = work(id);

    await expect(
      stub.deliver(deliveryRequest(id, "delivery-success")),
    ).resolves.toEqual({ status: "delivered" });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("DELETE FROM roll_log_outbox");
    });
    await runDurableObjectAlarm(stub);

    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      state: "delivered",
      loggingState: "failed",
      loggingAttempts: 1,
    });
    await expect(logWork(id).artifactStatus()).resolves.toEqual({
      state: "missing",
    });
  });

  it("hands retryable private delivery to LogWork without delaying the result", async () => {
    const id = snowflakeAt(Date.now(), 28);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "log-retry";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      loggingState: "pending",
      loggingHttpStatus: null,
      loggingAttempts: 0,
    });
    await runDurableObjectAlarm(stub);
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      loggingState: "delivered",
      loggingHttpStatus: 200,
      loggingAttempts: 1,
    });

    const acceptedLog = logWork(id);
    await expect(acceptedLog.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      attempts: 0,
    });
    await runDurableObjectAlarm(acceptedLog);
    await expect(acceptedLog.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      attempts: 1,
      lastHttpStatus: 429,
    });
    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "delivered",
    });
  });

  it("keeps destination success authoritative during a private log outage", async () => {
    const id = snowflakeAt(Date.now(), 29);
    const stub = work(id);
    const input = deliveryRequest(id, "delivery-success");
    input.message.username = "log-outage";

    await expect(stub.deliver(input)).resolves.toEqual({ status: "delivered" });
    await runDurableObjectAlarm(stub);
    const acceptedLog = logWork(id);
    await runDurableObjectAlarm(acceptedLog);
    await expect(acceptedLog.artifactStatus()).resolves.toMatchObject({
      state: "pending",
      attempts: 1,
      lastHttpStatus: 503,
    });
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      state: "delivered",
      loggingState: "delivered",
      loggingHttpStatus: 200,
      loggingAttempts: 1,
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

  it("replaces a pending interaction with an explicit error before expiry", async () => {
    const id = snowflakeAt(Date.now(), 42);
    const stub = work(id);
    await stub.acceptDelivery(deliveryRequest(id, "delivery-deadline"));

    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec(
        "UPDATE interaction_delivery SET expires_at = ?",
        Date.now() + 30_000,
      );
      await callAlarm(instance);
    });

    await expect(stub.deliveryStatus()).resolves.toMatchObject({
      state: "failed",
      lastHttpStatus: 200,
      attempts: 1,
    });
    await expect(stub.deliveryDiagnostics()).resolves.toMatchObject({
      state: "failed",
      failurePhase: "deadline",
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

  it("emits one privacy-safe timing event for a new durable acceptance", async () => {
    const id = snowflakeAt(Date.now(), 12);
    const stub = work(id);
    const input = telemetryDeliveryRequest(id, "delivery-clatter-contract");
    input.accounting.guildId = "100000000000000002";
    if (input.logging.context?.kind === "guild") {
      input.logging.context.guildId = "100000000000000002";
    }
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(
      (entry: unknown) => {
        if (
          typeof entry === "object" &&
          entry !== null &&
          !Array.isArray(entry) &&
          (entry as Record<string, unknown>).message ===
            "Roll durable acceptance completed"
        ) {
          throw new Error("acceptance telemetry unavailable");
        }
      },
    );

    try {
      await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
        status: "created",
        delivery: "pending",
      });
      await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
        status: "existing",
      });
      await runInDurableObject(stub, (_instance, state) => {
        const row = state.storage.sql
          .exec<{ record_json: string }>("SELECT record_json FROM roll_work")
          .one();
        expect(JSON.parse(row.record_json)).toMatchObject({
          version: 5,
          renderVersion: 4,
          renderRequest: null,
        });
      });

      const events: Record<string, unknown>[] = [];
      for (const [entry] of consoleInfo.mock.calls) {
        if (
          typeof entry === "object" &&
          entry !== null &&
          !Array.isArray(entry) &&
          (entry as Record<string, unknown>).message ===
            "Roll durable acceptance completed"
        ) {
          events.push(entry as Record<string, unknown>);
        }
      }
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event).toBeDefined();
      if (event === undefined) throw new Error("Acceptance timing is missing");
      expect(Object.keys(event).sort()).toEqual(
        [
          "acceptanceStatus",
          "acknowledgementToHandlerCompleteMs",
          "acknowledgementToHandlerStartMs",
          "acknowledgementType",
          "deliveryAlarmWriteMs",
          "expiryAlarmWriteMs",
          "handlerElapsedMs",
          "level",
          "message",
          "recordPreparationMs",
          "recoveryAlarmWriteMs",
          "renderSnapshotPreparationMs",
          "subsystem",
          "telemetryVersion",
          "timingClock",
        ].sort(),
      );
      expect(event).toMatchObject({
        telemetryVersion: 1,
        level: "info",
        message: "Roll durable acceptance completed",
        subsystem: "roll-acceptance",
        acceptanceStatus: "created",
        acknowledgementType: 5,
        timingClock: "workers-io",
      });
      for (const field of [
        "acknowledgementToHandlerCompleteMs",
        "acknowledgementToHandlerStartMs",
        "deliveryAlarmWriteMs",
        "expiryAlarmWriteMs",
        "handlerElapsedMs",
        "recordPreparationMs",
        "recoveryAlarmWriteMs",
      ] as const) {
        expect(Number.isSafeInteger(event[field])).toBe(true);
        expect(event[field]).toBeGreaterThanOrEqual(0);
      }
      expect(event.renderSnapshotPreparationMs).toBeNull();
      expect(event.handlerElapsedMs).toBeGreaterThanOrEqual(
        event.recordPreparationMs as number,
      );
      const serialized = JSON.stringify(event);
      for (const sensitive of [
        id,
        input.interaction.applicationId,
        input.interaction.token,
        input.accounting.userId,
        input.accounting.guildId,
        input.logging.channelId,
        input.logging.notation,
        input.message.title,
        input.message.username,
      ]) {
        expect(serialized).not.toContain(String(sensitive));
      }
    } finally {
      consoleInfo.mockRestore();
    }
  });

  it("rejects a changed preflight seed for an accepted direct roll", async () => {
    const id = snowflakeAt(Date.now(), 47);
    const stub = work(id);
    const input = { ...deliveryRequest(id), rollSeed: 123_456_789 };

    await expect(stub.acceptDelivery(input)).resolves.toMatchObject({
      status: "created",
    });
    await expect(
      stub.acceptDelivery({ ...input, rollSeed: 987_654_321 }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("rejects private-defer metadata outside direct Discord delivery", () => {
    const id = snowflakeAt(Date.now(), 46);
    const input = {
      ...deliveryRequest(id),
      responseMode: "followup" as const,
    };
    input.logging.source = "web";

    expect(() => validateDeliveryRequest(input)).toThrow(
      "Roll delivery response mode is invalid",
    );
  });

  it("rejects saved-roll metadata that does not match the executed request", () => {
    const id = snowflakeAt(Date.now(), 34);
    const input = {
      ...deliveryRequest(id),
      responseMode: "followup",
      savedRoll: {
        version: 1,
        id: "223e4567-e89b-42d3-a456-426614174000",
        scope: "guild",
        name: "Attack",
        notation: "2d20+5",
        title: "Initiative",
        repetitions: 1,
        revision: 3,
      },
    };

    expect(() => validateDeliveryRequest(input)).toThrow(
      "Saved roll delivery does not match its invocation",
    );
  });

  it.each(["0", false])(
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

  it("deletes sensitive work at expiry without dropping lifecycle recovery", async () => {
    const id = snowflakeAt(Date.now(), 12);
    const stub = work(id);
    const request = deliveryRequest(id, "delivery-temporary");
    request.message.title = null;
    const dataService = rollEnv.DATA_SERVICE as unknown as {
      fetch: (request: Request) => Promise<Response>;
    };
    const originalFetch = dataService.fetch;
    const accountingStarted = controlledSignal();
    const accountingReleased = controlledSignal();
    dataService.fetch = vi.fn(async (dataRequest: Request): Promise<Response> => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/roll-lifecycle") {
        const lifecycle = await dataRequest.clone().json<{
          interactionId?: unknown;
        }>();
        if (lifecycle.interactionId === id) {
          return Response.json({ error: "temporary" }, { status: 503 });
        }
      }
      if (path === "/internal/roll-accounting") {
        const accounting = await dataRequest.clone().json<{
          interactionId?: unknown;
        }>();
        if (accounting.interactionId === id) {
          accountingStarted.resolve();
          await accountingReleased.promise;
          return Response.json({ status: "applied" });
        }
      }
      return originalFetch.call(dataService, dataRequest);
    });

    try {
      await runInDurableObject(stub, async (instance, state) => {
        const roll = instance as unknown as {
          acceptDelivery(value: unknown): Promise<unknown>;
          deliver(value: unknown): Promise<unknown>;
        };
        await expect(roll.acceptDelivery(request)).resolves.toMatchObject({
          status: "created",
          delivery: "pending",
        });
        const delivery = roll.deliver(request);
        await accountingStarted.promise;
        state.storage.sql.exec(
          "UPDATE interaction_delivery SET expires_at = 0",
        );
        accountingReleased.resolve();
        await expect(delivery).resolves.toEqual({ status: "expired" });
      });
    } finally {
      accountingReleased.resolve();
      dataService.fetch = originalFetch;
    }

    await expect(stub.deliveryStatus()).resolves.toEqual({ state: "missing" });
    await runInDurableObject(stub, async (instance, state) => {
      expect(
        state.storage.sql.exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM roll_work",
        ).one().count,
      ).toBe(0);
      const lifecycle = state.storage.sql
        .exec<{
          next_sync_at: number;
          snapshot_json: string;
          synced_revision: number;
        }>(
          `SELECT next_sync_at, snapshot_json, synced_revision
           FROM roll_lifecycle_outbox`,
        )
        .one();
      expect(JSON.parse(lifecycle.snapshot_json)).toMatchObject({
        state: "failed",
        failureCode: "delivery-expired",
      });
      expect(lifecycle.synced_revision).toBe(0);
      expect(await state.storage.getAlarm()).toBe(lifecycle.next_sync_at);

      state.storage.sql.exec(
        "UPDATE roll_lifecycle_outbox SET next_sync_at = 0",
      );
      await callAlarm(instance);
      expect(
        state.storage.sql.exec<{ count: number }>(
          "SELECT COUNT(*) AS count FROM roll_lifecycle_outbox",
        ).one().count,
      ).toBe(0);
      expect(await state.storage.getAlarm()).toBeNull();
    });
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
    const health = rollWorker.fetch(
      new Request("https://roll.test/health"),
      rollEnv,
    );
    const missing = rollWorker.fetch(
      new Request("https://roll.test/roll", { method: "POST" }),
      rollEnv,
    );

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      ok: true,
      service: "dice-witch-roll",
      renderVersion: 4,
    });
    expect(missing.status).toBe(404);
  });
});
