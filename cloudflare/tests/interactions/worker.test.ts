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
    rollWork?: { acceptDelivery(value: unknown): Promise<unknown> };
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
        fetch: () =>
          Promise.resolve(
            Response.json({
              totalGuilds: 1,
              totalMembers: 42,
              guildCounts: [1],
            }),
          ),
      } as unknown as Fetcher,
      GATEWAY_STATUS: {
        getStatusSnapshot: () =>
          Promise.resolve({
            phase: "idle",
            shardCount: 1,
            shards: [{ id: 0, state: "ready", ping: 25 }],
          }),
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

  it("durably accepts a roll before returning Discord's defer response", async () => {
    const interactionTimestamp = 1_783_800_000_000;
    const interactionId = String(
      (BigInt(interactionTimestamp) - 1_420_070_400_000n) << 22n,
    );
    const acceptDelivery = vi.fn(() =>
      Promise.resolve({
        status: "created",
        delivery: "pending",
        expiresAt: interactionTimestamp + 15 * 60 * 1_000,
      }),
    );
    const { env, request } = await signedRequest(
      JSON.stringify({
        id: interactionId,
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
            { name: "timestorepeat", type: 3, value: "2" },
          ],
        },
      }),
      { rollWork: { acceptDelivery } },
    );

    const response = await handleInteractionRequest(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 5 });
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
      logging: {
        source: "discord",
        channelId: "100000000000000003",
        notation: "2d20 + 5",
        context: {
          kind: "guild",
          guildId: "100000000000000002",
          guildName: "Fixture Guild",
          channelId: "100000000000000003",
          channelName: "dice-rolls",
          channelType: 0,
        },
      },
    });
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
            fields: [{ name: "Fudge Dice" }, { name: "Reading Results" }],
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
