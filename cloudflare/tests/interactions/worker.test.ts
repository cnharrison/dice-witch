import { describe, expect, it, vi } from "vitest";
import {
  handleInteractionRequest,
  type InteractionEnv,
} from "../../workers/interactions/src";

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signedRequest(
  body: string,
  overrides: {
    path?: string;
    rollWork?: Record<string, (value: unknown) => Promise<unknown>>;
    discordRest?: { sendRollHelper(value: unknown): Promise<unknown> };
    dataFetch?: (request: Request) => Promise<Response>;
    signature?: string;
  } = {},
): Promise<{ env: InteractionEnv; request: Request }> {
  const keys = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const timestamp = "1783800000";
  const bodyBytes = new TextEncoder().encode(body);
  const timestampBytes = new TextEncoder().encode(timestamp);
  const message = new Uint8Array(timestampBytes.length + bodyBytes.length);
  message.set(timestampBytes);
  message.set(bodyBytes, timestampBytes.length);
  const signature = hex(
    await crypto.subtle.sign("Ed25519", keys.privateKey, message),
  );
  return {
    env: {
      DISCORD_APPLICATION_ID: "100000000000000001",
      DISCORD_PUBLIC_KEY: hex(
        (await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer,
      ),
      DISCORD_TEST_GUILD_ID: "100000000000000002",
      INVITE_LINK:
        "https://discord.com/api/oauth2/authorize?client_id=100000000000000001&permissions=0&scope=bot%20applications.commands",
      SUPPORT_SERVER_LINK: "https://discord.gg/example",
      WEB_APP_URL: "https://example.com/app",
      DATA_SERVICE: {
        fetch: overrides.dataFetch ?? (() =>
          Promise.resolve(
            Response.json({
              status: "found",
              snapshot: {
                version: 1,
                capturedAt: Date.now() - 1_000,
                liveGuilds: 1,
                estimatedGuildMemberships: 42,
                knownDiceWitchUsers: 7,
                shardCount: 1,
                guildCountsByShard: [1],
              },
            }),
          )),
      } as unknown as Fetcher,
      GATEWAY_STATUS: {
        getStatusSnapshot: () =>
          Promise.resolve({
            phase: "idle",
            shardCount: 1,
            shards: [{ id: 0, state: "ready", ping: 25 }],
          }),
      },
      DISCORD_REST: overrides.discordRest ?? {
        sendRollHelper: () => Promise.resolve({ status: "delivered" }),
      },
      ROLL_WORK: {
        getByName: () => overrides.rollWork ?? {},
      } as unknown as DurableObjectNamespace,
    },
    request: new Request(
      `https://interactions.test${overrides.path ?? "/interactions"}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature-ed25519": overrides.signature ?? signature,
          "x-signature-timestamp": timestamp,
        },
        body,
      },
    ),
  };
}

function savedRollDataFetch(request: Request): Promise<Response> {
  if (
    new URL(request.url).pathname === "/internal/discord-channel-context"
  ) {
    return Promise.resolve(Response.json({ status: "applied" }));
  }
  const body = request.json<{
    owner: { type: "user" | "guild"; userId?: string; guildId?: string };
  }>();
  return body.then(({ owner }) => {
    const personal = owner.type === "user";
    const ownerId = personal ? owner.userId : owner.guildId;
    const id = personal
      ? "123e4567-e89b-42d3-a456-426614174000"
      : "223e4567-e89b-42d3-a456-426614174000";
    return Response.json({
      status: "found",
      listRevision: 1,
      savedRolls: [
        {
          version: 1,
          id,
          owner: personal
            ? { type: "user", userId: ownerId }
            : { type: "guild", guildId: ownerId },
          displayName: personal ? "Attack" : "Defense",
          comparisonKey: personal ? "attack" : "defense",
          notation: personal ? "2d20+5" : "1d20+2",
          title: null,
          repetitions: 1,
          pinned: false,
          manualOrder: 0,
          revision: 1,
          createdByUserId: "100000000000000004",
          updatedByUserId: "100000000000000004",
          createdAt: 100,
          updatedAt: 100,
        },
      ],
    });
  });
}

describe("Discord HTTP interaction Worker", () => {
  it("acknowledges an authenticated Discord PING", async () => {
    const { env, request } = await signedRequest('{"type":1}');

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({ type: 1 });
  });

  it("rejects invalid signatures before parsing the body", async () => {
    const { env, request } = await signedRequest("not-json", {
      signature: "00".repeat(64),
    });

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects malformed authenticated JSON", async () => {
    const { env, request } = await signedRequest("not-json");

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid interaction",
    });
  });

  it("returns Personal and Server saved-roll autocomplete choices", async () => {
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000010",
        application_id: "100000000000000001",
        type: 4,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        guild: { id: "100000000000000002", name: "Fixture Guild" },
        channel_id: "100000000000000003",
        channel: {
          id: "100000000000000003",
          guild_id: "100000000000000002",
          name: "dice-rolls",
          type: 0,
        },
        member: { user: { id: "100000000000000004", username: "alice" } },
        data: {
          name: "library",
          type: 1,
          options: [{ name: "name", type: 3, value: "", focused: true }],
        },
      }),
      { dataFetch: savedRollDataFetch },
    );

    const response = await handleInteractionRequest(request, env);

    await expect(response.json()).resolves.toMatchObject({
      type: 8,
      data: {
        choices: [
          { name: "Personal · Attack" },
          { name: "Server · Defense" },
        ],
      },
    });
  });

  it("opens an actor-bound private saved-roll picker", async () => {
    const openSavedRollPicker = vi.fn(() =>
      Promise.resolve({
        status: "created",
        scope: "mine",
        page: 0,
        selectedId: null,
        selectedRevision: null,
      }),
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000010",
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        guild: { id: "100000000000000002", name: "Fixture Guild" },
        channel_id: "100000000000000003",
        channel: {
          id: "100000000000000003",
          guild_id: "100000000000000002",
          name: "dice-rolls",
          type: 0,
        },
        member: { user: { id: "100000000000000004", username: "alice" } },
        data: { name: "library", type: 1 },
      }),
      {
        dataFetch: savedRollDataFetch,
        rollWork: { openSavedRollPicker },
      },
    );

    const response = await handleInteractionRequest(request, env);
    const body = await response.json<{
      type: number;
      data: { flags: number; components: Array<{ components: unknown[] }> };
    }>();

    expect(body.type).toBe(4);
    expect(body.data.flags).toBe(64);
    expect(body.data.components).toHaveLength(2);
    expect(body.data.components.flatMap((row) => row.components)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 3 })]),
    );
    expect(openSavedRollPicker).toHaveBeenCalledOnce();
  });

  it("runs a saved roll and deletes its consumed picker", async () => {
    const deletePicker = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const selection = {
      scope: "mine",
      id: "123e4567-e89b-42d3-a456-426614174000",
      revision: 1,
    };
    const updateSavedRollPicker = vi.fn(() =>
      Promise.resolve({
        status: "updated",
        scope: "mine",
        page: 0,
        selectedId: selection.id,
        selectedRevision: selection.revision,
      }),
    );
    const reserveSavedRollRun = vi.fn(() =>
      Promise.resolve({ status: "reserved", selection }),
    );
    const acceptSavedRollDelivery = vi.fn(() =>
      Promise.resolve({ status: "created", delivery: "pending" }),
    );
    const releaseData: Array<() => void> = [];
    const dataFetch = vi.fn(
      (request: Request) =>
        new Promise<Response>((resolve) => {
          releaseData.push(() => {
            void savedRollDataFetch(request).then(resolve);
          });
        }),
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000011",
        application_id: "100000000000000001",
        type: 3,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        guild: { id: "100000000000000002", name: "Fixture Guild" },
        channel_id: "100000000000000003",
        channel: {
          id: "100000000000000003",
          guild_id: "100000000000000002",
          name: "dice-rolls",
          type: 0,
        },
        member: { user: { id: "100000000000000004", username: "alice" } },
        data: {
          custom_id: "saved-roll:v1:100000000000000010:run:mine:123e4567-e89b-42d3-a456-426614174000",
          component_type: 2,
        },
      }),
      {
        dataFetch,
        rollWork: {
          updateSavedRollPicker,
          reserveSavedRollRun,
          acceptSavedRollDelivery,
        },
      },
    );
    let background: Promise<unknown> | undefined;
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        background = promise;
      },
    } as unknown as ExecutionContext;

    const response = await handleInteractionRequest(request, env, ctx);

    await expect(response.json()).resolves.toEqual({ type: 6 });
    expect(updateSavedRollPicker).not.toHaveBeenCalled();
    expect(background).toBeDefined();
    for (const release of releaseData) release();
    await background;
    expect(updateSavedRollPicker).toHaveBeenCalledWith(
      expect.objectContaining({ action: "select", selection }),
    );
    expect(reserveSavedRollRun).toHaveBeenCalledOnce();
    expect(acceptSavedRollDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ selection, responseMode: "followup" }),
    );
    expect(deletePicker).toHaveBeenCalledOnce();
    const deleteRequest = deletePicker.mock.calls[0]?.[0];
    expect(deleteRequest).toBeInstanceOf(Request);
    expect((deleteRequest as Request).method).toBe("DELETE");
    expect((deleteRequest as Request).url).toBe(
      "https://discord.com/api/v10/webhooks/100000000000000001/fixture.interaction.token/messages/@original",
    );
    deletePicker.mockRestore();
  });

  it("reserves an opaque saved roll before publicly deferring its direct delivery", async () => {
    const reserveDirectSavedRoll = vi.fn((value: unknown) => {
      const input = value as { selection: unknown };
      return Promise.resolve({ status: "reserved", selection: input.selection });
    });
    const acceptSavedRollDelivery = vi.fn(() =>
      Promise.resolve({ status: "created", delivery: "pending" }),
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000010",
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        guild: { id: "100000000000000002", name: "Fixture Guild" },
        channel_id: "100000000000000003",
        channel: {
          id: "100000000000000003",
          guild_id: "100000000000000002",
          name: "dice-rolls",
          type: 0,
        },
        member: { user: { id: "100000000000000004", username: "alice" } },
        data: {
          name: "library",
          type: 1,
          options: [
            {
              name: "name",
              type: 3,
              value: "mine:123e4567-e89b-42d3-a456-426614174000",
            },
          ],
        },
      }),
      {
        dataFetch: savedRollDataFetch,
        rollWork: { reserveDirectSavedRoll, acceptSavedRollDelivery },
      },
    );

    const response = await handleInteractionRequest(request, env);

    await expect(response.json()).resolves.toEqual({ type: 5 });
    expect(reserveDirectSavedRoll).toHaveBeenCalledOnce();
    expect(acceptSavedRollDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: "edit-original",
        selection: {
          scope: "mine",
          id: "123e4567-e89b-42d3-a456-426614174000",
          revision: 1,
        },
      }),
    );
  });

  it("returns the public defer before direct guild saved-roll preparation", async () => {
    const releaseData: Array<() => void> = [];
    const dataFetch = vi.fn(
      (request: Request) =>
        new Promise<Response>((resolve) => {
          releaseData.push(() => {
            void savedRollDataFetch(request).then(resolve);
          });
        }),
    );
    const reserveDirectSavedRoll = vi.fn((value: unknown) => {
      const input = value as { selection: unknown };
      return Promise.resolve({ status: "reserved", selection: input.selection });
    });
    const acceptSavedRollDelivery = vi.fn(() =>
      Promise.resolve({ status: "created" }),
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000010",
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        guild: { id: "100000000000000002", name: "Fixture Guild" },
        channel_id: "100000000000000003",
        channel: {
          id: "100000000000000003",
          guild_id: "100000000000000002",
          name: "dice-rolls",
          type: 0,
        },
        member: { user: { id: "100000000000000004", username: "alice" } },
        data: {
          name: "library",
          type: 1,
          options: [
            {
              name: "name",
              type: 3,
              value: "mine:123e4567-e89b-42d3-a456-426614174000",
            },
          ],
        },
      }),
      {
        dataFetch,
        rollWork: { reserveDirectSavedRoll, acceptSavedRollDelivery },
      },
    );
    let background: Promise<unknown> | undefined;
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        background = promise;
      },
    } as unknown as ExecutionContext;

    const response = await handleInteractionRequest(request, env, ctx);
    await expect(response.json()).resolves.toEqual({ type: 5 });
    expect(reserveDirectSavedRoll).not.toHaveBeenCalled();
    expect(background).toBeDefined();

    for (const release of releaseData) release();
    await background;
    expect(reserveDirectSavedRoll).toHaveBeenCalledOnce();
    expect(acceptSavedRollDelivery).toHaveBeenCalledOnce();
  });

  it("opens a prefilled private rename modal for Copy to Personal conflicts", async () => {
    const copySavedRollToMine = vi.fn((value: unknown) => {
      const input = value as { name: string | null };
      return Promise.resolve(
        input.name === null
          ? { status: "name_conflict", name: "Attack" }
          : { status: "copied", name: input.name },
      );
    });
    const base = {
      id: "100000000000000011",
      application_id: "100000000000000001",
      token: "fixture.interaction.token",
      guild_id: "100000000000000002",
      guild: { id: "100000000000000002", name: "Fixture Guild" },
      channel_id: "100000000000000003",
      channel: {
        id: "100000000000000003",
        guild_id: "100000000000000002",
        name: "dice-rolls",
        type: 0,
      },
      member: { user: { id: "100000000000000004", username: "alice" } },
    };
    const sessionId = "100000000000000020";
    const component = await signedRequest(
      JSON.stringify({
        ...base,
        type: 3,
        data: {
          custom_id: `saved-roll:v1:${sessionId}:copy`,
          component_type: 2,
        },
      }),
      { rollWork: { copySavedRollToMine } },
    );

    await expect(
      (await handleInteractionRequest(component.request, component.env)).json(),
    ).resolves.toMatchObject({
      type: 9,
      data: {
        custom_id: `saved-roll:v1:${sessionId}:rename`,
        components: [
          { components: [{ value: "Attack" }] },
        ],
      },
    });

    const modal = await signedRequest(
      JSON.stringify({
        ...base,
        id: "100000000000000012",
        type: 5,
        data: {
          custom_id: `saved-roll:v1:${sessionId}:rename`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 4,
                  custom_id: "saved-roll-name",
                  value: "Attack copy",
                },
              ],
            },
          ],
        },
      }),
      { rollWork: { copySavedRollToMine } },
    );
    await expect(
      (await handleInteractionRequest(modal.request, modal.env)).json(),
    ).resolves.toMatchObject({
      type: 4,
      data: { content: "Copied “Attack copy” to your Personal Library.", flags: 64 },
    });
  });

  it("preflights a valid roll with independently available channel context", async () => {
    const interactionTimestamp = 1_783_800_000_000;
    const interactionId = String(
      (BigInt(interactionTimestamp) - 1_420_070_400_000n) << 22n,
    );
    const acceptDelivery = vi.fn((value: unknown) => {
      void value;
      return Promise.resolve({
        status: "created",
        delivery: "pending",
        expiresAt: interactionTimestamp + 15 * 60 * 1_000,
      });
    });
    const cacheContext = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        "/internal/discord-channel-context",
      );
      const mutation = await request.json<Record<string, unknown>>();
      expect(mutation).toMatchObject({
        version: 1,
        operation: "upsert",
        source: "interaction",
        guildId: "100000000000000002",
        channelId: "100000000000000003",
        channelName: "dice-rolls",
        channelType: 0,
      });
      expect(typeof mutation.observedAt).toBe("number");
      return new Response(null, { status: 503 });
    });
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        channel_id: "100000000000000003",
        channel: {
          id: "100000000000000003",
          guild_id: "100000000000000002",
          name: "dice-rolls",
          type: 0,
        },
        member: {
          user: {
            id: "100000000000000004",
            username: "alice",
          },
        },
        data: {
          id: "100000000000000005",
          name: "roll",
          type: 1,
          options: [
            { name: "notation", type: 3, value: "2d20 + 5" },
            { name: "title", type: 3, value: "Attack" },
            { name: "times", type: 3, value: "2" },
          ],
        },
      }),
      { rollWork: { acceptDelivery }, dataFetch: cacheContext },
    );
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        pending.push(promise);
      },
    } as ExecutionContext;

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(
      () => undefined,
    );
    let response: Response;
    try {
      response = await handleInteractionRequest(request, env, ctx);
      await Promise.all(pending);
      expect(consoleWarn).toHaveBeenCalledWith(JSON.stringify({
        level: "warn",
        message: "Signed roll interaction display context is incomplete",
        scope: "guild",
        reasons: ["guild-object-missing"],
        commandName: "roll",
      }));
      expect(consoleWarn).toHaveBeenCalledWith(JSON.stringify({
        level: "warn",
        message: "Signed roll interaction context cache write failed",
      }));
    } finally {
      consoleWarn.mockRestore();
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 5 });
    expect(cacheContext).toHaveBeenCalledOnce();
    expect(acceptDelivery).toHaveBeenCalledOnce();
    const acceptedRequest: unknown = acceptDelivery.mock.calls[0]?.[0];
    if (
      typeof acceptedRequest !== "object" ||
      acceptedRequest === null ||
      !("deferredAt" in acceptedRequest) ||
      !("rollSeed" in acceptedRequest)
    ) {
      throw new Error("Accepted roll request is missing preflight metadata");
    }
    const deferredAt = acceptedRequest.deferredAt;
    const rollSeed = acceptedRequest.rollSeed;
    expect(typeof deferredAt).toBe("number");
    expect(rollSeed).toEqual(expect.any(Number));
    expect(acceptDelivery).toHaveBeenCalledWith({
      interaction: {
        id: interactionId,
        applicationId: "100000000000000001",
        token: "fixture.interaction.token",
      },
      request: { notation: "2d20 + 5", repetitions: 2 },
      message: { title: "Attack", username: "alice" },
      accounting: {
        guildId: "100000000000000002",
        userId: "100000000000000004",
        receivedAt: interactionTimestamp,
      },
      deferredAt,
      rollSeed,
      logging: {
        source: "discord",
        channelId: "100000000000000003",
        notation: "2d20 + 5",
        context: {
          kind: "guild",
          guildId: "100000000000000002",
          guildName: null,
          channelId: "100000000000000003",
          channelName: "dice-rolls",
          channelType: 0,
        },
      },
    });
  });

  it("responds privately to invalid notation without a preparation step", async () => {
    const interactionTimestamp = 1_783_800_000_001;
    const interactionId = String(
      ((BigInt(interactionTimestamp) - 1_420_070_400_000n) << 22n) | 1n,
    );
    const acceptDelivery = vi.fn((value: unknown) => {
      void value;
      return Promise.resolve({
        status: "created",
        delivery: "pending",
        expiresAt: interactionTimestamp + 15 * 60 * 1_000,
      });
    });
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.invalid.token",
        guild_id: "100000000000000002",
        guild: { id: "100000000000000002", name: "Fixture Guild" },
        channel_id: "100000000000000003",
        channel: {
          id: "100000000000000003",
          guild_id: "100000000000000002",
          name: "dice-rolls",
          type: 0,
        },
        member: {
          user: { id: "100000000000000004", username: "alice" },
        },
        data: {
          id: "100000000000000005",
          name: "roll",
          type: 1,
          options: [{ name: "notation", type: 3, value: "1776" }],
        },
      }),
      { rollWork: { acceptDelivery } },
    );

    const response = await handleInteractionRequest(request, env);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      type: 4,
      data: {
        content: "🚫 Invalid notation",
        flags: 64,
        allowed_mentions: { parse: [] },
      },
    });
    expect(JSON.stringify(body)).not.toContain("Preparing your roll");
    expect(JSON.stringify(body)).toContain("Dice notation guide");
    expect(acceptDelivery).toHaveBeenCalledOnce();
    const acceptedRequest: unknown = acceptDelivery.mock.calls[0]?.[0];
    expect(acceptedRequest).toMatchObject({
      interaction: { id: interactionId },
      request: { notation: "1776", repetitions: 1 },
    });
    if (
      typeof acceptedRequest !== "object" ||
      acceptedRequest === null ||
      !("rollSeed" in acceptedRequest)
    ) {
      throw new Error("Accepted invalid roll is missing its preflight seed");
    }
    expect(typeof acceptedRequest.rollSeed).toBe("number");
  });

  it("durably accepts a bot-DM roll without guild accounting", async () => {
    const interactionTimestamp = 1_783_800_000_000;
    const interactionId = String(
      (BigInt(interactionTimestamp) - 1_420_070_400_000n) << 22n,
    );
    const acceptDelivery = vi.fn((value: unknown) => {
      void value;
      return Promise.resolve({
        status: "created",
        delivery: "pending",
        expiresAt: interactionTimestamp + 15 * 60 * 1_000,
      });
    });
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        channel_id: "100000000000000003",
        channel: { id: "100000000000000003", type: 1 },
        user: { id: "100000000000000004", username: "alice" },
        data: {
          name: "roll",
          type: 1,
          options: [{ name: "notation", type: 3, value: "1d20" }],
        },
      }),
      { rollWork: { acceptDelivery } },
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    expect(acceptDelivery).toHaveBeenCalledOnce();
    const accepted = acceptDelivery.mock.calls[0]?.[0] as {
      accounting: { guildId: string | null };
    };
    expect(accepted.accounting.guildId).toBeNull();
  });

  it("accepts production commands from any valid guild when no guild restriction is configured", async () => {
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000001",
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        data: {
          name: "knowledgebase",
          type: 1,
          options: [{ name: "topic", type: 3, value: "fudge" }],
        },
      }),
    );
    delete env.DISCORD_TEST_GUILD_ID;

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: { embeds: [{ title: "👩‍🎓 Knowledge base" }] },
    });
  });

  it("returns a public knowledgebase article from a signed command", async () => {
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000001",
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        data: {
          name: "knowledgebase",
          type: 1,
          options: [{ name: "topic", type: 3, value: "fudge" }],
        },
      }),
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: {
        embeds: [
          {
            color: 2003199,
            title: "👩‍🎓 Knowledge base",
            fields: [
              { name: "Fate or Fudge dice" },
              { name: "Read the results" },
            ],
          },
        ],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 5, label: "Invite me" },
              {
                type: 2,
                style: 5,
                label: "Questions? Join the support server",
              },
            ],
          },
        ],
      },
    });
  });

  it("returns a public knowledgebase article from a signed DM button", async () => {
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000001",
        application_id: "100000000000000001",
        type: 3,
        token: "fixture.interaction.token",
        channel_id: "100000000000000003",
        user: { id: "100000000000000004", username: "alice" },
        data: {
          custom_id: "knowledgebase-exploding",
          component_type: 2,
        },
      }),
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: {
        embeds: [
          {
            title: "👩‍🎓 Knowledge base",
            fields: [
              { name: "Exploding dice" },
              { name: "Compounding" },
              { name: "Penetrating" },
            ],
          },
        ],
      },
    });
  });

  it("sends knowledge base help by DM only after the private button is pressed", async () => {
    const sendRollHelper = vi.fn(() =>
      Promise.resolve({ status: "delivered" }),
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000011",
        application_id: "100000000000000001",
        type: 3,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        member: {
          user: { id: "100000000000000004", username: "alice" },
        },
        data: {
          custom_id: "roll-help:dm-knowledgebase:100000000000000010",
          component_type: 2,
        },
      }),
      { discordRest: { sendRollHelper } },
    );
    let background: Promise<unknown> | undefined;
    const responseFetch = vi.fn((request: Request) => {
      void request;
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", responseFetch);
    try {
      const response = await handleInteractionRequest(request, env, {
        waitUntil(promise) {
          background = promise;
        },
      } as ExecutionContext);

      await expect(response.json()).resolves.toEqual({ type: 6 });
      await background;
      expect(sendRollHelper).toHaveBeenCalledWith({
        rollId: "100000000000000010",
        userId: "100000000000000004",
      });
      expect(responseFetch).toHaveBeenCalledOnce();
      const edit = responseFetch.mock.calls[0]?.[0];
      if (!(edit instanceof Request)) {
        throw new Error("Knowledge base confirmation request is missing");
      }
      expect(edit.method).toBe("PATCH");
      await expect(edit.json()).resolves.toMatchObject({
        content: "🧠 Knowledge base sent to your DMs",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["web", "Dice Witch Web Interface"],
    ["prefs", "Dice Witch Preferences"],
  ])("returns an ephemeral %s link response", async (command, title) => {
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: "100000000000000001",
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        data: { name: command, type: 1 },
      }),
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: {
        flags: 64,
        embeds: [{ color: 16711935, title }],
      },
    });
  });

  it("returns a public status response from private Gateway and Data services", async () => {
    const interactionTimestamp = 1_783_800_000_000;
    const interactionId = String(
      (BigInt(interactionTimestamp) - 1_420_070_400_000n) << 22n,
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        data: { name: "status", type: 1 },
      }),
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    const body = await response.json<{
      type: number;
      data: { embeds: Array<{ title: string; description: string }> };
    }>();
    expect(body.type).toBe(4);
    expect(body.data.embeds[0]?.title).toBe("Status");
    expect(body.data.embeds[0]?.description).toContain(
      "Shard 0: Online (1 servers, 25ms)",
    );
  });

  it("returns an explicit status response when Gateway state is unavailable", async () => {
    const interactionTimestamp = 1_783_800_000_000;
    const interactionId = String(
      (BigInt(interactionTimestamp) - 1_420_070_400_000n) << 22n,
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        data: { name: "status", type: 1 },
      }),
    );
    env.GATEWAY_STATUS.getStatusSnapshot = () =>
      Promise.reject(new Error("unavailable"));

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: {
        embeds: [
          {
            color: 16711680,
            title: "Error",
            description: "Failed to fetch status information",
          },
        ],
      },
    });
  });

  it("responds explicitly when durable roll acceptance conflicts", async () => {
    const interactionId = String(
      (1_783_800_000_000n - 1_420_070_400_000n) << 22n,
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        channel_id: "100000000000000003",
        member: {
          user: { id: "100000000000000004", username: "alice" },
        },
        data: {
          id: "100000000000000005",
          name: "roll",
          type: 1,
          options: [{ name: "notation", type: 3, value: "1d20" }],
        },
      }),
      {
        rollWork: {
          acceptDelivery: () => Promise.resolve({ status: "conflict" }),
        },
      },
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: { flags: 64 },
    });
  });

  it("responds explicitly when durable acceptance is unavailable", async () => {
    const interactionId = String(
      (1_783_800_000_000n - 1_420_070_400_000n) << 22n,
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
        application_id: "100000000000000001",
        type: 2,
        token: "fixture.interaction.token",
        guild_id: "100000000000000002",
        channel_id: "100000000000000003",
        member: {
          user: { id: "100000000000000004", username: "alice" },
        },
        data: {
          id: "100000000000000005",
          name: "roll",
          type: 1,
          options: [{ name: "notation", type: 3, value: "1d20" }],
        },
      }),
      {
        rollWork: {
          acceptDelivery: () => Promise.reject(new Error("unavailable")),
        },
      },
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      type: 4,
      data: { flags: 64 },
    });
  });

  it("does not expose any other public route", async () => {
    const { env, request } = await signedRequest('{"type":1}', {
      path: "/status",
    });

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
