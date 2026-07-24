import { describe, expect, it, vi } from "vitest";
import { DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS } from "../../packages/discord-contracts/src";
import {
  handleAuthRequest,
  type WebApiBindings,
} from "../../workers/web-api/src/auth";

const now = 1_767_225_600_123;
const oauthState = "S".repeat(43);
const clientId = "100000000000000001";
const redirectUri = "https://api.example.com/api/auth/callback/discord";
const frontendOrigin = "https://app.example.com";

function bindings(dataFetch: (request: Request) => Promise<Response>): WebApiBindings {
  return {
    DATA_SERVICE: { fetch: dataFetch } as Fetcher,
    DISCORD_REST: {
      deliverWebRoll: vi.fn(() =>
        Promise.resolve({ status: "delivered" as const }),
      ),
      listTextChannels: vi.fn(() => Promise.resolve([])),
      inspectMembership: vi.fn(() =>
        Promise.resolve({ status: "missing" as const }),
      ),
    },
    ROLL_WEB: {
      prepare: vi.fn(),
      execute: vi.fn(),
      preview: vi.fn(),
      previewV2: vi.fn(),
      previewV3: vi.fn(),
    },
    DISCORD_CLIENT_ID: clientId,
    DISCORD_CLIENT_SECRET: "test-client-secret",
    DISCORD_REDIRECT_URI: redirectUri,
    FRONTEND_ORIGIN: frontendOrigin,
    BUILD_SHA: "abcdef0123456789abcdef0123456789abcdef01",
  };
}

function jsonError(status: number): Response {
  return Response.json({ error: "fixture failure" }, { status });
}

function cookieValue(response: Response, name: string): string {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`));
  if (cookie === undefined) throw new Error(`${name} cookie is missing`);
  return cookie;
}

describe("web API Discord OAuth", () => {
  it("starts authorization with D1-backed state and a secure state cookie", async () => {
    const dataRequests: Array<{ path: string; body: unknown }> = [];
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/signin/discord"),
      bindings(async (request) => {
        dataRequests.push({
          path: new URL(request.url).pathname,
          body: await request.json(),
        });
        return Response.json({ token: oauthState }, { status: 201 });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(`${location.origin}${location.pathname}`).toBe(
      "https://discord.com/oauth2/authorize",
    );
    expect(Object.fromEntries(location.searchParams)).toEqual({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify email guilds",
      state: oauthState,
    });
    expect(dataRequests).toEqual([
      {
        path: "/internal/oauth-states",
        body: { createdAt: now, expiresAt: now + 10 * 60 * 1_000 },
      },
    ]);
    expect(cookieValue(response, "auth_state")).toBe(
      `auth_state=${oauthState}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("exchanges a valid callback and stores no Discord access token", async () => {
    const dataRequests: Array<{ path: string; body: unknown }> = [];
    const dataFetch = async (request: Request): Promise<Response> => {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      dataRequests.push({ path, body });
      if (path.endsWith("/consume")) {
        return Response.json({ status: "consumed" });
      }
      if (path === "/internal/web-logins") {
        return Response.json({
          status: "applied",
          session: {
            userId: "100000000000000003",
            createdAt: now,
            expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
          },
        });
      }
      if (path === "/internal/guilds/filter") {
        return Response.json({ guildIds: ["100000000000000001"] });
      }
      if (path === "/internal/memberships") {
        return Response.json({
          status: "applied",
          permissions: { isAdmin: true, isDiceWitchAdmin: true },
        });
      }
      throw new Error(`Unexpected Data Worker route ${path}`);
    };
    const discordFetch = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/api/oauth2/token") {
        expect(request.method).toBe("POST");
        expect(request.headers.get("content-type")).toBe(
          "application/x-www-form-urlencoded;charset=UTF-8",
        );
        expect(Object.fromEntries(new URLSearchParams(await request.text()))).toEqual({
          client_id: clientId,
          client_secret: "test-client-secret",
          code: "callback-code",
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        });
        return Response.json({
          access_token: "ephemeral-access-token",
          token_type: "Bearer",
          expires_in: 604800,
          scope: "identify email guilds",
        });
      }
      expect(request.headers.get("authorization")).toBe(
        "Bearer ephemeral-access-token",
      );
      if (path === "/api/v10/users/@me") {
        return Response.json({
          id: "100000000000000003",
          username: "fixture-user",
          email: "fixture@example.com",
          flags: 64,
          discriminator: "0",
          avatar: "fixture-avatar",
        });
      }
      expect(path).toBe("/api/v10/users/@me/guilds");
      return Response.json([
        {
          id: "100000000000000001",
          name: "Fixture guild",
          icon: null,
          permissions: "8",
        },
      ]);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn(() =>
      Promise.resolve({ status: "found" as const, isDiceWitchAdmin: true }),
    );

    const response = await handleAuthRequest(
      new Request(
        `https://api.example.com/api/auth/callback/discord?code=callback-code&state=${oauthState}`,
        { headers: { cookie: `auth_state=${oauthState}` } },
      ),
      env,
      discordFetch,
      () => now,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${frontendOrigin}/app`);
    const sessionCookie = cookieValue(response, "session_id");
    expect(sessionCookie).toMatch(
      /^session_id=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(cookieValue(response, "auth_state")).toBe(
      "auth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );
    expect(dataRequests.map(({ path }) => path)).toEqual([
      "/internal/oauth-states/consume",
      "/internal/web-logins",
      "/internal/guilds/filter",
      "/internal/memberships",
    ]);
    const serialized = JSON.stringify(dataRequests);
    expect(serialized).not.toContain("ephemeral-access-token");
    expect(serialized).not.toContain("test-client-secret");
    expect(serialized).toContain('"mutationId":"oauth-login:');
    expect(serialized).toContain('"guildName":"Fixture guild"');
    expect(serialized).toContain('"isAdmin":true');
    expect(serialized).toContain('"isDiceWitchAdmin":true');
    expect(serialized).toContain('"mutationId":"oauth-membership:');
  });

  it("rejects state mismatches before calling Discord or the Data Worker", async () => {
    const dataFetch = vi.fn();
    const discordFetch = vi.fn();
    const response = await handleAuthRequest(
      new Request(
        `https://api.example.com/api/auth/callback/discord?code=code&state=${oauthState}`,
        { headers: { cookie: `auth_state=${"X".repeat(43)}` } },
      ),
      bindings(dataFetch),
      discordFetch,
      () => now,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid OAuth state" });
    expect(dataFetch).not.toHaveBeenCalled();
    expect(discordFetch).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable state service from an invalid state", async () => {
    const discordFetch = vi.fn();
    const response = await handleAuthRequest(
      new Request(
        `https://api.example.com/api/auth/callback/discord?code=code&state=${oauthState}`,
        { headers: { cookie: `auth_state=${oauthState}` } },
      ),
      bindings(() => Promise.resolve(jsonError(500))),
      discordFetch,
      () => now,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "OAuth state validation failed",
    });
    expect(discordFetch).not.toHaveBeenCalled();
    expect(cookieValue(response, "auth_state")).toContain("Max-Age=0");
  });

  it("rejects requests served through an unconfigured public origin", async () => {
    const dataFetch = vi.fn();
    const response = await handleAuthRequest(
      new Request("https://alternate.example/api/auth/signin/discord"),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request origin is invalid",
    });
    expect(dataFetch).not.toHaveBeenCalled();
  });

  it("returns the cacheable versioned Discord audience snapshot", async () => {
    const snapshot = {
      version: 1,
      capturedAt: now - 1_000,
      liveGuilds: 1,
      estimatedGuildMemberships: 42,
      knownDiceWitchUsers: 7,
      shardCount: 1,
      guildCountsByShard: [1],
    };
    const dataFetch = vi.fn((request: Request) => {
      expect(new URL(request.url).pathname).toBe(
        "/internal/audience-snapshot",
      );
      expect(request.method).toBe("GET");
      return Promise.resolve(Response.json({ status: "found", snapshot }));
    });
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/stats/public"),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=3600",
    );
    await expect(response.json()).resolves.toEqual(snapshot);
  });

  it("rejects a stale public audience snapshot", async () => {
    const dataFetch = vi.fn(() =>
      Promise.resolve(
        Response.json({
          status: "found",
          snapshot: {
            version: 1,
            capturedAt: now - DISCORD_AUDIENCE_SNAPSHOT_MAX_AGE_MS - 1,
            liveGuilds: 1,
            estimatedGuildMemberships: 42,
            knownDiceWitchUsers: 7,
            shardCount: 1,
            guildCountsByShard: [1],
          },
        }),
      ),
    );
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/stats/public"),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Public stats are stale",
    });
  });

  it("returns a session without an OAuth access token", async () => {
    const sessionToken = "T".repeat(43);
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/session", {
        headers: {
          cookie: `session_id=${sessionToken}`,
          origin: frontendOrigin,
        },
      }),
      bindings(async (request) => {
        await expect(request.json()).resolves.toEqual({ token: sessionToken, now });
        return Response.json({
          user: {
            id: "100000000000000003",
            username: "fixture-user",
            email: "fixture@example.com",
            avatar: "fixture-avatar",
          },
          createdAt: now - 1,
          expiresAt: now + 1,
        });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "100000000000000003",
        name: "fixture-user",
        email: "fixture@example.com",
        image:
          "https://cdn.discordapp.com/avatars/100000000000000003/fixture-avatar.png",
        discordId: "100000000000000003",
      },
      expires: new Date(now + 1).toISOString(),
    });
  });

  it("returns legacy-compatible mutual guilds for the active session", async () => {
    const sessionToken = "T".repeat(43);
    const dataFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/internal/sessions/current") {
        return Promise.resolve(Response.json({
          user: {
            id: "100000000000000003",
            username: "fixture-user",
            email: null,
            avatar: null,
          },
          createdAt: now - 1,
          expiresAt: now + 1,
        }));
      }
      expect(path).toBe("/internal/memberships/list");
      return Promise.resolve(Response.json({
        memberships: [
          {
            guild: {
              id: "100000000000000001",
              name: "Fixture guild",
              icon: null,
            },
            isAdmin: true,
            isDiceWitchAdmin: false,
          },
        ],
      }));
    });
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/guilds/mutual", {
        headers: {
          cookie: `session_id=${sessionToken}`,
          origin: frontendOrigin,
        },
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      guilds: [
        {
          guilds: {
            id: "100000000000000001",
            name: "Fixture guild",
            icon: null,
          },
          isAdmin: true,
          isDiceWitchAdmin: false,
        },
      ],
    });
  });

  it("reads and updates authorized guild preferences idempotently", async () => {
    const sessionToken = "T".repeat(43);
    const dataRequests: Array<{ path: string; body: unknown }> = [];
    const dataFetch = vi.fn(async (request: Request) => {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      dataRequests.push({ path, body });
      if (path === "/internal/sessions/current") {
        return Response.json({
          user: {
            id: "100000000000000003",
            username: "fixture-user",
            email: null,
            avatar: null,
          },
          createdAt: now - 1,
          expiresAt: now + 1,
        });
      }
      if (path === "/internal/memberships/list") {
        return Response.json({
          memberships: [
            {
              guild: {
                id: "100000000000000001",
                name: "Fixture guild",
                icon: null,
              },
              isAdmin: true,
              isDiceWitchAdmin: false,
            },
          ],
        });
      }
      if (path === "/internal/guilds/settings") {
        return Response.json({
          status: "found",
          settings: { skipDiceDelay: false },
        });
      }
      expect(path).toBe("/internal/guilds/settings/update");
      return Response.json({
        status: "applied",
        settings: { skipDiceDelay: true },
      });
    });
    const env = bindings(dataFetch);
    const url =
      "https://api.example.com/api/guilds/100000000000000001/preferences";
    const headers = {
      cookie: `session_id=${sessionToken}`,
      origin: frontendOrigin,
    };

    const read = await handleAuthRequest(
      new Request(url, { headers }),
      env,
      vi.fn(),
      () => now,
    );
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({
      preferences: { skipDiceDelay: false },
    });

    const updated = await handleAuthRequest(
      new Request(url, {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
          "idempotency-key": "123e4567-e89b-42d3-a456-426614174000",
        },
        body: JSON.stringify({ skipDiceDelay: true }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toEqual({ success: true });
    expect(dataRequests.at(-1)).toEqual({
      path: "/internal/guilds/settings/update",
      body: {
        guildId: "100000000000000001",
        skipDiceDelay: true,
        mutationId:
          "web-preference:123e4567-e89b-42d3-a456-426614174000",
        occurredAt: now,
      },
    });
  });

  it("returns channels only for an authorized mutual guild", async () => {
    const sessionToken = "T".repeat(43);
    const dataFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      return Promise.resolve(
        path === "/internal/sessions/current"
          ? Response.json({
              user: {
                id: "100000000000000003",
                username: "fixture-user",
                email: null,
                avatar: null,
              },
              createdAt: now - 1,
              expiresAt: now + 1,
            })
          : Response.json({
              memberships: [
                {
                  guild: {
                    id: "100000000000000001",
                    name: "Fixture guild",
                    icon: null,
                  },
                  isAdmin: true,
                  isDiceWitchAdmin: false,
                },
              ],
            }),
      );
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.listTextChannels = vi.fn(() =>
      Promise.resolve([
        { id: "100000000000000010", name: "general", type: 0 as const },
      ]),
    );
    const response = await handleAuthRequest(
      new Request(
        "https://api.example.com/api/guilds/100000000000000001/channels",
        {
          headers: {
            cookie: `session_id=${sessionToken}`,
            origin: frontendOrigin,
          },
        },
      ),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      channels: [{ id: "100000000000000010", name: "general", type: 0 }],
    });
  });

  it("executes and delivers an authorized web roll", async () => {
    const sessionToken = "T".repeat(43);
    const dataFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/internal/sessions/current") {
        return Promise.resolve(
          Response.json({
            user: {
              id: "100000000000000003",
              username: "fixture-user",
              email: null,
              avatar: null,
            },
            createdAt: now - 1,
            expiresAt: now + 1,
          }),
        );
      }
      if (path === "/internal/memberships/list") {
        return Promise.resolve(
          Response.json({
            memberships: [
              {
                guild: {
                  id: "100000000000000001",
                  name: "Fixture guild",
                  icon: null,
                },
                isAdmin: true,
                isDiceWitchAdmin: false,
              },
            ],
          }),
        );
      }
      expect(path).toBe("/internal/guilds/settings");
      return Promise.resolve(
        Response.json({
          status: "found",
          settings: { skipDiceDelay: false },
        }),
      );
    });
    const env = bindings(dataFetch);
    const deliverWebRoll = vi.fn(() =>
      Promise.resolve({ status: "delivered" as const }),
    );
    env.DISCORD_REST.deliverWebRoll = deliverWebRoll;
    const png = new Uint8Array([137, 80, 78, 71]);
    const deliveryId = "11111111-1111-4111-8111-111111111111";
    const executeWebRoll = vi.fn((input: { deliveryId?: string }) =>
      Promise.resolve({
        status: "rolled",
        message: "Roll processed successfully",
        diceArray: [[{ sides: 20, rolled: 17, value: 17 }]],
        resultArray: [{ output: "1d20: [17] = 17", results: 17 }],
        appearanceIdentities: [["expression:0:repeat:0:definition:20:0:die:0"]],
        rerolledAppearanceIdentities: [],
        ...(input.deliveryId === deliveryId
          ? { deliveryStatus: "delivered" }
          : {}),
        renderedImage: {
          contentType: "image/png",
          width: 150,
          height: 150,
          png,
        },
        discord: {
          payload: { embeds: [] },
          clatter: "_...the die clatters across the table..._",
          filename: "dice-witch-roll.png",
          png,
        },
      }),
    );
    env.ROLL_WEB.execute = executeWebRoll;
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/dice/roll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `session_id=${sessionToken}`,
          origin: frontendOrigin,
        },
        body: JSON.stringify({
          deliveryId,
          guildId: "100000000000000001",
          channelId: "100000000000000010",
          notation: "1d20",
          renderSeed: 123,
          appearanceDigest: "a".repeat(64),
          timesToRepeat: 1,
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    const responseBody: unknown = await response.json();
    expect(responseBody).toMatchObject({
      message: "Message sent to Discord channel",
      resultArray: [{ results: 17 }],
      renderedImage: {
        contentType: "image/png",
        width: 150,
        height: 150,
        base64: "iVBORw==",
      },
    });
    expect(responseBody).not.toHaveProperty("renderModel");
    expect(executeWebRoll).toHaveBeenCalledWith({
      notation: "1d20",
      repetitions: 1,
      username: "fixture-user",
      title: null,
      userId: "100000000000000003",
      guildId: "100000000000000001",
      deliveryId,
      channelId: "100000000000000010",
      skipDelay: false,
      renderSeed: 123,
      appearanceDigest: "a".repeat(64),
    });
    expect(deliverWebRoll).not.toHaveBeenCalled();

    executeWebRoll.mockClear();
    const legacyResponse = await handleAuthRequest(
      new Request("https://api.example.com/api/dice/roll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `session_id=${sessionToken}`,
          origin: frontendOrigin,
        },
        body: JSON.stringify({
          guildId: "100000000000000001",
          channelId: "100000000000000010",
          notation: "1d20",
          timesToRepeat: 1,
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );

    expect(legacyResponse.status).toBe(200);
    expect(executeWebRoll).toHaveBeenCalledWith({
      notation: "1d20",
      repetitions: 1,
      username: "fixture-user",
      title: null,
      userId: "100000000000000003",
      guildId: "100000000000000001",
    });
    expect(deliverWebRoll).toHaveBeenCalledOnce();
  });

  it("keeps web preparation restricted to guild administrators", async () => {
    const sessionToken = "T".repeat(43);
    const dataFetch = vi.fn((request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/internal/sessions/current") {
        return Promise.resolve(
          Response.json({
            user: {
              id: "100000000000000003",
              username: "fixture-user",
              email: null,
              avatar: null,
            },
            createdAt: now - 1,
            expiresAt: now + 1,
          }),
        );
      }
      if (path === "/internal/memberships/list") {
        return Promise.resolve(
          Response.json({
            memberships: [
              {
                guild: {
                  id: "100000000000000001",
                  name: "Fixture guild",
                  icon: null,
                },
                isAdmin: false,
                isDiceWitchAdmin: false,
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Data Worker route ${path}`);
    });
    const env = bindings(dataFetch);
    const prepare = vi.fn();
    env.ROLL_WEB.prepare = prepare;

    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/dice/prepare", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `session_id=${sessionToken}`,
          origin: frontendOrigin,
        },
        body: JSON.stringify({
          guildId: "100000000000000001",
          notation: "1d20",
          timesToRepeat: 1,
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("accepts same-origin session reads when browsers omit Origin on GET", async () => {
    const dataFetch = vi.fn();
    const env = bindings(dataFetch);
    env.FRONTEND_ORIGIN = "https://api.example.com";
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/session"),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ user: null });
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(dataFetch).not.toHaveBeenCalled();
  });

  it("revokes signout sessions only for the configured frontend origin", async () => {
    const sessionToken = "T".repeat(43);
    const dataFetch = vi.fn(() =>
      Promise.resolve(Response.json({ status: "revoked" })),
    );
    const rejected = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/signout", {
        method: "POST",
        headers: {
          cookie: `session_id=${sessionToken}`,
          origin: "https://attacker.example",
        },
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(rejected.status).toBe(403);
    expect(dataFetch).not.toHaveBeenCalled();

    const accepted = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/signout", {
        method: "POST",
        headers: {
          cookie: `session_id=${sessionToken}`,
          origin: frontendOrigin,
        },
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ success: true });
    expect(dataFetch).toHaveBeenCalledTimes(1);
    expect(cookieValue(accepted, "session_id")).toBe(
      "session_id=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );
    expect(accepted.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );
  });

  it("answers credentialed preflights only for the configured frontend", async () => {
    const env = bindings(vi.fn());
    const accepted = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/signout", {
        method: "OPTIONS",
        headers: { origin: frontendOrigin },
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );
    expect(accepted.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(accepted.headers.get("access-control-allow-methods")).toBe("POST");

    const rejected = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/signout", {
        method: "OPTIONS",
        headers: { origin: "https://attacker.example" },
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("allows frontend preflights for preparation, roll, and preference mutations", async () => {
    const env = bindings(vi.fn());
    const [prepare, roll, preferences] = await Promise.all([
      handleAuthRequest(
        new Request("https://api.example.com/api/dice/prepare", {
          method: "OPTIONS",
          headers: { origin: frontendOrigin },
        }),
        env,
      ),
      handleAuthRequest(
        new Request("https://api.example.com/api/dice/roll", {
          method: "OPTIONS",
          headers: { origin: frontendOrigin },
        }),
        env,
      ),
      handleAuthRequest(
        new Request(
          "https://api.example.com/api/guilds/100000000000000002/preferences",
          { method: "OPTIONS", headers: { origin: frontendOrigin } },
        ),
        env,
      ),
    ]);

    expect(prepare.status).toBe(204);
    expect(prepare.headers.get("access-control-allow-methods")).toBe("POST");
    expect(prepare.headers.get("access-control-allow-headers")).toBe(
      "content-type",
    );
    expect(roll.status).toBe(204);
    expect(roll.headers.get("access-control-allow-methods")).toBe("POST");
    expect(roll.headers.get("access-control-allow-headers")).toBe(
      "content-type",
    );
    expect(preferences.status).toBe(204);
    expect(preferences.headers.get("access-control-allow-methods")).toBe(
      "PATCH",
    );
    expect(preferences.headers.get("access-control-allow-headers")).toBe(
      "content-type, idempotency-key",
    );
  });

  it("fails closed when required OAuth configuration is missing", async () => {
    const env = bindings(vi.fn());
    env.DISCORD_REDIRECT_URI = "";
    const response = await handleAuthRequest(
      new Request("https://api.example.com/api/auth/signin/discord"),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Web API configuration is invalid",
    });
  });
});
