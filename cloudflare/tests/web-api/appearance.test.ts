import type {
  AppearanceProfileV3,
  AppearanceProfileV4,
  GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_CATALOG_R34_V3,
  APPEARANCE_CATALOG_V3,
  BUILTIN_APPEARANCE_STYLES_V3,
  migrateAppearanceProfileV3ToV4,
  migrateGuildAppearanceProfileV3ToV4,
} from "../../packages/dice-appearance/src";
import {
  handleAuthRequest,
  type WebApiBindings,
} from "../../workers/web-api/src/auth";

const now = 1_767_225_600_123;
const frontendOrigin = "https://app.example.com";
const apiOrigin = "https://api.example.com";
const sessionToken = "T".repeat(43);
const userId = "100000000000000003";
const guildId = "100000000000000002";
const idempotencyKey = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";
const buildSha = "abcdef0123456789abcdef0123456789abcdef01";

function personalProfileV3(): AppearanceProfileV3 {
  const style = BUILTIN_APPEARANCE_STYLES_V3.find(({ id }) => id === "solid");
  if (style === undefined) throw new Error("Solid style fixture is missing");
  return {
    version: 3,
    designs: [],
    assignments: { all: { source: "builtin", id: style.id }, overrides: {} },
  };
}

function personalProfileV4(): AppearanceProfileV4 {
  const profile = migrateAppearanceProfileV3ToV4(personalProfileV3());
  profile.diceView.mode = "clear";
  return profile;
}

function guildProfileV4(): GuildAppearanceProfileV4 {
  return migrateGuildAppearanceProfileV3ToV4({
    ...personalProfileV3(),
    mode: "enforced",
  });
}

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
      inspectRollerGuild: vi.fn(() =>
        Promise.resolve({ status: "missing" as const }),
      ),
    },
    ROLL_WEB: {
      prepare: vi.fn(),
      execute: vi.fn(),
      previewV4: vi.fn(),
      previewRendererRevisionV4: vi.fn(() => Promise.resolve("canvaskit-v4-r41")),
    },
    DISCORD_CLIENT_ID: "100000000000000001",
    DISCORD_CLIENT_SECRET: "test-client-secret",
    DISCORD_REDIRECT_URI:
      "https://api.example.com/api/auth/callback/discord",
    FRONTEND_ORIGIN: frontendOrigin,
    BUILD_SHA: buildSha,
    APPEARANCE_CATALOG_POLICY: "r37",
    THUMBS: {
      get: vi.fn(),
      put: vi.fn(),
      head: vi.fn(),
      createMultipartUpload: vi.fn(),
      resumeMultipartUpload: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
    APPEARANCE_THUMBS_BAKE_SECRET: "test-bake-secret",
  };
}

function browserRequest(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("origin", frontendOrigin);
  headers.set("cookie", `session_id=${sessionToken}`);
  return new Request(`${apiOrigin}${path}`, { ...init, headers });
}

function storedSession(): Response {
  return Response.json({
    user: {
      id: userId,
      username: "fixture-user",
      email: null,
      avatar: null,
    },
    createdAt: now - 1,
    expiresAt: now + 60_000,
  });
}

function authenticatedData(
  request: Request,
  appearanceResponse: () => Response,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  return Promise.resolve(
    path === "/internal/sessions/current"
      ? storedSession()
      : appearanceResponse(),
  );
}

describe("web appearance V4 API", () => {
  it("serves the exact-build V4 catalog with the current V3 domain payload", async () => {
    const response = await handleAuthRequest(
      browserRequest(`/api/appearance/v4/catalog?build=${buildSha}`),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(APPEARANCE_CATALOG_V3);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );

    const mismatch = await handleAuthRequest(
      browserRequest("/api/appearance/v4/catalog?build=wrong"),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(mismatch.status).toBe(409);

    const production = await handleAuthRequest(
      browserRequest(`/api/appearance/v4/catalog?build=${buildSha}`),
      { ...bindings(vi.fn()), APPEARANCE_CATALOG_POLICY: "r34" },
      vi.fn(),
      () => now,
    );
    expect(production.status).toBe(200);
    await expect(production.json()).resolves.toEqual(
      APPEARANCE_CATALOG_R34_V3,
    );
  });

  it("reads and writes only the authenticated user's V4 profile", async () => {
    const profile = personalProfileV4();
    const requests: Array<{ path: string; body: unknown }> = [];
    const env = bindings(async (request) => {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      requests.push({ path, body });
      if (path === "/internal/sessions/current") return storedSession();
      if (path.endsWith("/get")) {
        return Response.json({ status: "found", revision: 3, profile });
      }
      return Response.json({ status: "applied", revision: 4, profile });
    });

    const read = await handleAuthRequest(
      browserRequest("/api/appearance/v4/me"),
      env,
      vi.fn(),
      () => now,
    );
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({ revision: 3, profile });

    const write = await handleAuthRequest(
      browserRequest("/api/appearance/v4/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 3, profile }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(write.status).toBe(200);
    expect(requests.at(-1)).toEqual({
      path: "/internal/appearance/v4/personal/put",
      body: {
        userId,
        expectedRevision: 3,
        profile,
        mutationId: `web-appearance-personal:${idempotencyKey}`,
        occurredAt: now,
      },
    });

    const invalid = await handleAuthRequest(
      browserRequest("/api/appearance/v4/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: 3,
          profile: personalProfileV3(),
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(invalid.status).toBe(400);
  });

  it("fails closed when Data returns a non-V4 profile", async () => {
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/v4/me"),
      bindings((request) =>
        authenticatedData(request, () =>
          Response.json({
            status: "found",
            revision: 3,
            profile: personalProfileV3(),
          }))),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "appearance_profile_response_invalid",
    });
  });

  it("preserves Server authorization and write attribution", async () => {
    const profile = guildProfileV4();
    const requests: Array<{ path: string; body: unknown }> = [];
    const env = bindings(async (request) => {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      requests.push({ path, body });
      if (path === "/internal/sessions/current") return storedSession();
      if (path === "/internal/memberships/permissions") {
        return Response.json({
          status: "applied",
          permissions: { isAdmin: true, isDiceWitchAdmin: false },
        });
      }
      return Response.json({ status: "applied", revision: 1, profile });
    });
    env.DISCORD_REST.inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: true,
        isDiceWitchAdmin: false,
      }),
    );
    const response = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance/v4`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 0, profile }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(requests.at(-1)).toEqual({
      path: "/internal/appearance/v4/guild/put",
      body: {
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile,
        mutationId: `web-appearance-guild:${idempotencyKey}`,
        occurredAt: now,
      },
    });

    const deniedEnv = bindings((request) => {
      const path = new URL(request.url).pathname;
      if (path === "/internal/sessions/current") {
        return Promise.resolve(storedSession());
      }
      if (path === "/internal/memberships/permissions") {
        return Promise.resolve(Response.json({
          status: "superseded",
          permissions: { isAdmin: true, isDiceWitchAdmin: false },
        }));
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    deniedEnv.DISCORD_REST.inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: false,
        isDiceWitchAdmin: false,
      }),
    );
    const denied = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance/v4`),
      deniedEnv,
      vi.fn(),
      () => now,
    );
    expect(denied.status).toBe(403);
  });

  it("delegates bounded previews only to renderer V4", async () => {
    const env = bindings(() => Promise.resolve(storedSession()));
    const input = {
      target: "d20",
      recipe: BUILTIN_APPEARANCE_STYLES_V3[0]?.recipe,
      diceView: personalProfileV4().diceView,
      seed: 42,
      state: "normal",
    };
    const previewV4 = vi.fn(() =>
      Promise.resolve({
        version: 4,
        contentType: "image/png",
        width: 150,
        height: 150,
        diceCount: 1,
        rowCount: 1,
        png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    );
    env.ROLL_WEB.previewV4 = previewV4;

    const response = await handleAuthRequest(
      browserRequest("/api/appearance/v4/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: 4,
      contentType: "image/png",
      width: 150,
      height: 150,
      base64: "iVBORw0KGgo=",
    });
    expect(previewV4).toHaveBeenCalledWith(input);
  });

  it("preserves V4 authentication, origin, and CORS behavior", async () => {
    const unauthenticated = await handleAuthRequest(
      browserRequest("/api/appearance/v4/me"),
      bindings(() =>
        Promise.resolve(Response.json({ error: "Unauthorized" }, { status: 401 }))),
      vi.fn(),
      () => now,
    );
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      error: "appearance_authentication_required",
    });
    expect(unauthenticated.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );

    const wrongOrigin = await handleAuthRequest(
      new Request(`${apiOrigin}/api/appearance/v4/preview`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: "{}",
      }),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(wrongOrigin.status).toBe(403);
  });

  it("advertises only V4 appearance preflight contracts", async () => {
    for (const path of [
      "/api/appearance/v4/me",
      `/api/guilds/${guildId}/appearance/v4`,
    ]) {
      const response = await handleAuthRequest(
        new Request(`${apiOrigin}${path}`, {
          method: "OPTIONS",
          headers: { origin: frontendOrigin },
        }),
        bindings(vi.fn()),
        vi.fn(),
        () => now,
      );
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-methods")).toBe(
        "GET, PUT",
      );
    }
    const preview = await handleAuthRequest(
      new Request(`${apiOrigin}/api/appearance/v4/preview`, {
        method: "OPTIONS",
        headers: { origin: frontendOrigin },
      }),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(preview.status).toBe(204);
    expect(preview.headers.get("access-control-allow-methods")).toBe("POST");
  });

  it.each([
    "/api/appearance/catalog",
    "/api/appearance/v2/catalog",
    `/api/appearance/v3/catalog?build=${buildSha}`,
    "/api/appearance/me",
    "/api/appearance/v2/me",
    "/api/appearance/v3/me",
    "/api/appearance/preview",
    "/api/appearance/v2/preview",
    "/api/appearance/v3/preview",
    `/api/guilds/${guildId}/appearance`,
    `/api/guilds/${guildId}/appearance/v2`,
    `/api/guilds/${guildId}/appearance/v3`,
  ])("returns 404 for removed route %s", async (path) => {
    const response = await handleAuthRequest(
      browserRequest(path),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(404);
  });
});
