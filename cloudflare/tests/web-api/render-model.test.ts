import { describe, expect, it, vi } from "vitest";
import {
  handleAuthRequest,
  type WebApiBindings,
} from "../../workers/web-api/src/auth";
import rollWorkV4Fixture from "../roll/fixtures/roll-work-v4.json";

const now = 1_767_225_600_123;
const frontendOrigin = "https://app.example.com";
const sessionToken = "T".repeat(43);
const png = new Uint8Array([137, 80, 78, 71]);

function dataFetch(request: Request): Promise<Response> {
  switch (new URL(request.url).pathname) {
    case "/internal/sessions/current":
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
    case "/internal/memberships/list":
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
    case "/internal/guilds/settings":
      return Promise.resolve(
        Response.json({
          status: "found",
          settings: { skipDiceDelay: false },
        }),
      );
    default:
      throw new Error("Unexpected Data Worker route");
  }
}

function rollResult(renderModel: unknown): unknown {
  return {
    status: "rolled",
    message: "Roll processed successfully",
    diceArray: [[{ sides: 20, rolled: 17, value: 17 }]],
    resultArray: [{ output: "1d20: [17] = 17", results: 17 }],
    appearanceIdentities: [["expression:0:repeat:0:definition:20:0:die:0"]],
    rerolledAppearanceIdentities: [],
    renderedImage: {
      contentType: "image/png",
      width: 150,
      height: 150,
      png,
    },
    renderModel,
    discord: {
      payload: { embeds: [] },
      clatter: "_...the die clatters across the table..._",
      filename: "dice-witch-roll.png",
      png,
    },
  };
}

function bindings(
  renderModel: unknown,
  deliveryStatus: "delivered" | "permission_error" = "delivered",
): { env: WebApiBindings; deliverWebRoll: ReturnType<typeof vi.fn> } {
  const deliverWebRoll = vi.fn(() => Promise.resolve({ status: deliveryStatus }));
  return {
    env: {
      DATA_SERVICE: { fetch: dataFetch } as Fetcher,
      DISCORD_REST: {
        deliverWebRoll,
        listTextChannels: vi.fn(() => Promise.resolve([
          { id: "100000000000000010", name: "general", type: 0 as const },
        ])),
        inspectMembership: vi.fn(() =>
          Promise.resolve({ status: "missing" as const }),
        ),
        inspectRollerGuild: vi.fn(() =>
          Promise.resolve({ status: "missing" as const }),
        ),
      },
      ROLL_WEB: {
        prepare: vi.fn(),
        execute: vi.fn(() => Promise.resolve(rollResult(renderModel))),
        preview: vi.fn(),
        previewV2: vi.fn(),
        previewV3: vi.fn(),
        previewV4: vi.fn(),
      },
      DISCORD_CLIENT_ID: "100000000000000001",
      DISCORD_CLIENT_SECRET: "test-client-secret",
      DISCORD_REDIRECT_URI:
        "https://api.example.com/api/auth/callback/discord",
      FRONTEND_ORIGIN: frontendOrigin,
      BUILD_SHA: "abcdef0123456789abcdef0123456789abcdef01",
    },
    deliverWebRoll,
  };
}

function request(): Request {
  return new Request("https://api.example.com/api/dice/roll", {
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
      renderSeed: 123,
      appearanceDigest: "a".repeat(64),
      timesToRepeat: 1,
    }),
  });
}

describe("authenticated web roll render model", () => {
  it("returns an authorized immutable blank-face preparation without Discord delivery", async () => {
    const { env, deliverWebRoll } = bindings(rollWorkV4Fixture.renderRequest);
    const prepare = vi.fn(() =>
      Promise.resolve({
        status: "prepared",
        renderSeed: 321,
        appearanceDigest: "b".repeat(64),
        groupSizes: [1],
        appearanceIdentities: [["expression:0:repeat:0:definition:20:0:die:0"]],
        renderedImage: {
          contentType: "image/png",
          width: 150,
          height: 150,
          png,
        },
        renderModel: rollWorkV4Fixture.renderRequest,
      }),
    );
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      renderSeed: 321,
      appearanceDigest: "b".repeat(64),
      groupSizes: [1],
      appearanceIdentities: [["expression:0:repeat:0:definition:20:0:die:0"]],
      renderedImage: { base64: "iVBORw==" },
      renderModel: rollWorkV4Fixture.renderRequest,
    });
    expect(prepare).toHaveBeenCalledWith({
      guildId: "100000000000000001",
      notation: "1d20",
      repetitions: 1,
      userId: "100000000000000003",
    });
    expect(deliverWebRoll).not.toHaveBeenCalled();
  });

  it("returns the validated V4 model used by the Roll service", async () => {
    const { env, deliverWebRoll } = bindings(rollWorkV4Fixture.renderRequest);

    const response = await handleAuthRequest(request(), env, vi.fn(), () => now);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      renderModel: rollWorkV4Fixture.renderRequest,
    });
    expect(deliverWebRoll).toHaveBeenCalledOnce();
  });

  it("returns a conflict and skips Discord when prepared appearance is stale", async () => {
    const { env, deliverWebRoll } = bindings(rollWorkV4Fixture.renderRequest);
    env.ROLL_WEB.execute = vi.fn(() =>
      Promise.resolve({
        status: "stale" as const,
        message: "Prepared appearance has changed; prepare the roll again",
      }),
    );

    const response = await handleAuthRequest(request(), env, vi.fn(), () => now);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Prepared appearance has changed; prepare the roll again",
    });
    expect(deliverWebRoll).not.toHaveBeenCalled();
  });

  it("preserves the model when Discord reports a permission error", async () => {
    const { env } = bindings(
      rollWorkV4Fixture.renderRequest,
      "permission_error",
    );

    const response = await handleAuthRequest(request(), env, vi.fn(), () => now);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "PERMISSION_ERROR",
      renderModel: rollWorkV4Fixture.renderRequest,
    });
  });

  it("rejects a malformed model before Discord delivery", async () => {
    const { env, deliverWebRoll } = bindings({
      ...rollWorkV4Fixture.renderRequest,
      unexpected: true,
    });

    const response = await handleAuthRequest(request(), env, vi.fn(), () => now);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Roll response is invalid",
    });
    expect(deliverWebRoll).not.toHaveBeenCalled();
  });
});
