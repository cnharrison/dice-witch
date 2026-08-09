import type {
  AppearanceProfileV3,
  AppearanceProfileV4,
  GuildAppearanceProfileV3,
  GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it, vi } from "vitest";
import {
  BUILTIN_APPEARANCE_STYLES_V3,
  migrateAppearanceProfileV3ToV4,
  migrateGuildAppearanceProfileV3ToV4,
} from "../../packages/dice-appearance/src";
import type {
  AppearanceProfileV1,
  AppearanceProfileV2,
  AppearanceRecipeV2,
  GuildAppearanceProfileV1,
  GuildAppearanceProfileV2,
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
const designId = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";
const idempotencyKey = "5dbb69e6-e748-4b01-9d6f-a19aa5c24a8f";
const buildSha = "abcdef0123456789abcdef0123456789abcdef01";

function personalProfile(): AppearanceProfileV1 {
  return {
    version: 1,
    designs: [
      {
        id: designId,
        name: "My dice",
        recipe: {
          version: 1,
          variation: "curated",
          varyBy: "die",
          colors: {
            mode: "palette",
            colors: ["#123456", "#abcdef"],
          },
          fill: {
            mode: "allowlist",
            values: [{ type: "gradient" }, { type: "solid" }],
          },
          font: {
            mode: "allowlist",
            fontIds: ["liberation-sans", "new-rocker"],
          },
        },
      },
    ],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: {},
    },
  };
}

function guildProfile(): GuildAppearanceProfileV1 {
  return { ...personalProfile(), mode: "enforced" };
}

function appearanceRecipeV2(primary = "#123456"): AppearanceRecipeV2 {
  return {
    version: 2,
    compatibility: "native-v2",
    variation: "curated",
    varyBy: "die",
    colors: { mode: "palette", colors: [primary, "#fedcba"] },
    fill: {
      mode: "allowlist",
      values: [{ type: "gradient" }, { type: "solid" }],
    },
    font: {
      mode: "allowlist",
      fontIds: ["liberation-sans", "new-rocker"],
    },
    gradient: {
      colorSource: "full-palette",
      scope: { mode: "fixed", value: "die-wide" },
      direction: {
        mode: "fixed",
        value: "upper-left-to-lower-right",
      },
    },
    lighting: {
      mode: { mode: "fixed", value: "combined" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

function personalProfileV2(primary = "#123456"): AppearanceProfileV2 {
  return {
    version: 2,
    designs: [
      {
        id: designId,
        name: "My dice",
        recipe: appearanceRecipeV2(primary),
      },
    ],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: {},
    },
  };
}

function guildProfileV2(): GuildAppearanceProfileV2 {
  return { ...personalProfileV2(), mode: "enforced" };
}

function personalProfileV3(primary = "#123456"): AppearanceProfileV3 {
  const style = BUILTIN_APPEARANCE_STYLES_V3[0];
  if (style === undefined) throw new Error("V3 style fixture is missing");
  const recipe = structuredClone(style.recipe);
  recipe.colors = { mode: "palette", colors: [primary, "#fedcba"] };
  return {
    version: 3,
    designs: [{ id: designId, name: "My dice", recipe }],
    assignments: {
      all: { source: "custom", id: designId },
      overrides: {},
    },
  };
}

function guildProfileV3(): GuildAppearanceProfileV3 {
  return { ...personalProfileV3(), mode: "enforced" };
}

function personalProfileV4(primary = "#123456"): AppearanceProfileV4 {
  const profile = migrateAppearanceProfileV3ToV4(personalProfileV3(primary));
  profile.diceView.mode = "clear";
  return profile;
}

function guildProfileV4(): GuildAppearanceProfileV4 {
  const profile = migrateGuildAppearanceProfileV3ToV4(guildProfileV3());
  profile.diceView.mode = "legacy";
  return profile;
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
    BUILD_SHA: buildSha,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserRequest(
  path: string,
  init: RequestInit = {},
): Request {
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

function membershipResponse(authorized = true): Response {
  return Response.json({
    memberships: authorized
      ? [
          {
            guild: { id: guildId, name: "Fixture Guild", icon: null },
            isAdmin: true,
            isDiceWitchAdmin: false,
          },
        ]
      : [],
  });
}

describe("web appearance API", () => {
  it("serves the unchanged 26-style V1 catalog only to the configured frontend", async () => {
    const dataFetch = vi.fn();
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/catalog"),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    expect(value).toMatchObject({
      version: 1,
      defaultStyleId: "chaotic",
    });
    expect((value as { styles: unknown[] }).styles).toHaveLength(26);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );
    expect(dataFetch).not.toHaveBeenCalled();

    const forbidden = await handleAuthRequest(
      new Request(`${apiOrigin}/api/appearance/catalog`, {
        headers: { origin: "https://attacker.example" },
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(forbidden.status).toBe(403);
  });

  it("serves the canonical V2 catalog on the additive browser path", async () => {
    const dataFetch = vi.fn();
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/v2/catalog"),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    const value: unknown = await response.json();
    if (!isRecord(value) || !Array.isArray(value.styles)) {
      throw new Error("Appearance V2 catalog response is invalid");
    }
    expect(value.version).toBe(2);
    expect(value.styles).toHaveLength(29);
    for (const style of value.styles) {
      expect(style).toMatchObject({ recipe: { version: 2 } });
    }
    expect(dataFetch).not.toHaveBeenCalled();
  });

  it("serves the exact-build V3 editor catalog and rejects build drift", async () => {
    const dataFetch = vi.fn();
    const env = bindings(dataFetch);
    const response = await handleAuthRequest(
      browserRequest(`/api/appearance/v3/catalog?build=${buildSha}`),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: 3,
      defaultStyleId: "chaotic",
      bounds: { maximumDesigns: 10, maximumMaterialOptions: 25 },
    });
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(dataFetch).not.toHaveBeenCalled();

    for (const query of [
      "",
      "?build=0000000000000000000000000000000000000000",
      `?build=${buildSha}&extra=true`,
      `?build=${buildSha}&build=${buildSha}`,
    ]) {
      const mismatch = await handleAuthRequest(
        browserRequest(`/api/appearance/v3/catalog${query}`),
        env,
        vi.fn(),
        () => now,
      );
      expect(mismatch.status).toBe(409);
      await expect(mismatch.json()).resolves.toEqual({
        error: "appearance_catalog_build_mismatch",
      });
    }
  });

  it("reads and canonically writes the authenticated user's V2 profile", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const canonical = personalProfileV2("#abcdef");
    const env = bindings(async (request) => {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      requests.push({ path, body });
      if (path === "/internal/sessions/current") return storedSession();
      if (path === "/internal/appearance/v2/personal/get") {
        return Response.json({ status: "found", revision: 3, profile: canonical });
      }
      return Response.json({
        status: "applied",
        revision: 4,
        profile: canonical,
      });
    });

    const read = await handleAuthRequest(
      browserRequest("/api/appearance/v2/me"),
      env,
      vi.fn(),
      () => now,
    );
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({
      revision: 3,
      profile: canonical,
    });

    const write = await handleAuthRequest(
      browserRequest("/api/appearance/v2/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: 3,
          profile: personalProfileV2("#ABCDEF"),
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(write.status).toBe(200);
    await expect(write.json()).resolves.toEqual({
      status: "applied",
      revision: 4,
      profile: canonical,
    });
    expect(requests).toEqual([
      {
        path: "/internal/sessions/current",
        body: { token: sessionToken, now },
      },
      {
        path: "/internal/appearance/v2/personal/get",
        body: { userId },
      },
      {
        path: "/internal/sessions/current",
        body: { token: sessionToken, now },
      },
      {
        path: "/internal/appearance/v2/personal/put",
        body: {
          userId,
          expectedRevision: 3,
          profile: canonical,
          mutationId: `web-appearance-personal:${idempotencyKey}`,
          occurredAt: now,
        },
      },
    ]);
  });

  it("reads and canonically writes the authenticated user's V3 profile", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const canonical = personalProfileV3("#abcdef");
    const env = bindings(async (request) => {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      requests.push({ path, body });
      if (path === "/internal/sessions/current") return storedSession();
      if (path === "/internal/appearance/v3/personal/get") {
        return Response.json({ status: "found", revision: 3, profile: canonical });
      }
      return Response.json({
        status: "applied",
        revision: 4,
        profile: canonical,
      });
    });

    const read = await handleAuthRequest(
      browserRequest("/api/appearance/v3/me"),
      env,
      vi.fn(),
      () => now,
    );
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({ revision: 3, profile: canonical });

    const write = await handleAuthRequest(
      browserRequest("/api/appearance/v3/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: 3,
          profile: personalProfileV3("#ABCDEF"),
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(write.status).toBe(200);
    await expect(write.json()).resolves.toEqual({
      status: "applied",
      revision: 4,
      profile: canonical,
    });
    expect(requests).toEqual([
      {
        path: "/internal/sessions/current",
        body: { token: sessionToken, now },
      },
      {
        path: "/internal/appearance/v3/personal/get",
        body: { userId },
      },
      {
        path: "/internal/sessions/current",
        body: { token: sessionToken, now },
      },
      {
        path: "/internal/appearance/v3/personal/put",
        body: {
          userId,
          expectedRevision: 3,
          profile: canonical,
          mutationId: `web-appearance-personal:${idempotencyKey}`,
          occurredAt: now,
        },
      },
    ]);
  });

  it("reads mixed profiles and strictly writes the authenticated user's V4 profile", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const v3 = personalProfileV3();
    const v4 = personalProfileV4();
    const env = bindings(async (request) => {
      const path = new URL(request.url).pathname;
      const body: unknown = await request.json();
      requests.push({ path, body });
      if (path === "/internal/sessions/current") return storedSession();
      if (path === "/internal/appearance/v4/personal/get") {
        return Response.json({ status: "found", revision: 3, profile: v3 });
      }
      return Response.json({ status: "applied", revision: 4, profile: v4 });
    });

    const read = await handleAuthRequest(
      browserRequest("/api/appearance/v4/me"),
      env,
      vi.fn(),
      () => now,
    );
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({ revision: 3, profile: v3 });

    const write = await handleAuthRequest(
      browserRequest("/api/appearance/v4/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 3, profile: v4 }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(write.status).toBe(200);
    await expect(write.json()).resolves.toEqual({
      status: "applied",
      revision: 4,
      profile: v4,
    });
    expect(requests.at(-1)).toEqual({
      path: "/internal/appearance/v4/personal/put",
      body: {
        userId,
        expectedRevision: 3,
        profile: v4,
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
        body: JSON.stringify({ expectedRevision: 3, profile: v3 }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "appearance_profile_invalid",
    });
  });

  it("preserves guild authorization and attribution on V4 writes", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const profile = guildProfileV4();
    const response = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance/v4`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 0, profile }),
      }),
      bindings(async (request) => {
        const path = new URL(request.url).pathname;
        const body: unknown = await request.json();
        requests.push({ path, body });
        if (path === "/internal/sessions/current") return storedSession();
        if (path === "/internal/memberships/list") return membershipResponse();
        return Response.json({ status: "applied", revision: 1, profile });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(requests[2]).toEqual({
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
  });

  it("preserves guild authorization and attribution on V3 writes", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const profile = guildProfileV3();
    const response = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance/v3`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 0, profile }),
      }),
      bindings(async (request) => {
        const path = new URL(request.url).pathname;
        const body: unknown = await request.json();
        requests.push({ path, body });
        if (path === "/internal/sessions/current") return storedSession();
        if (path === "/internal/memberships/list") return membershipResponse();
        return Response.json({ status: "applied", revision: 1, profile });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(requests[2]).toEqual({
      path: "/internal/appearance/v3/guild/put",
      body: {
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile,
        mutationId: `web-appearance-guild:${idempotencyKey}`,
        occurredAt: now,
      },
    });
  });

  it("returns stable V3 profile error codes without substituting data", async () => {
    const versionConflictEnv = bindings((request) =>
      Promise.resolve(
        new URL(request.url).pathname === "/internal/sessions/current"
          ? storedSession()
          : Response.json(
              { error: "appearance_profile_version_conflict" },
              { status: 409 },
            ),
      ),
    );
    const conflict = await handleAuthRequest(
      browserRequest("/api/appearance/v3/me"),
      versionConflictEnv,
      vi.fn(),
      () => now,
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      error: "appearance_profile_version_conflict",
    });

    const invalid = await handleAuthRequest(
      browserRequest("/api/appearance/v3/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: 0,
          profile: personalProfileV2(),
        }),
      }),
      bindings(() => Promise.resolve(storedSession())),
      vi.fn(),
      () => now,
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "appearance_profile_invalid",
    });

    const malformed = await handleAuthRequest(
      browserRequest("/api/appearance/v3/me"),
      bindings((request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/internal/sessions/current"
            ? storedSession()
            : Response.json({
                status: "found",
                revision: 1,
                profile: personalProfileV2(),
              }),
        ),
      ),
      vi.fn(),
      () => now,
    );
    expect(malformed.status).toBe(502);
    await expect(malformed.json()).resolves.toEqual({
      error: "appearance_profile_response_invalid",
    });

    const unavailable = await handleAuthRequest(
      browserRequest("/api/appearance/v3/me"),
      bindings((request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/internal/sessions/current"
            ? storedSession()
            : Response.json({ error: "temporary" }, { status: 503 }),
        ),
      ),
      vi.fn(),
      () => now,
    );
    expect(unavailable.status).toBe(502);
    await expect(unavailable.json()).resolves.toEqual({
      error: "appearance_data_unavailable",
    });
  });

  it("distinguishes V3 authentication from guild authorization failures", async () => {
    const unauthenticated = await handleAuthRequest(
      new Request(`${apiOrigin}/api/appearance/v3/me`, {
        headers: { origin: frontendOrigin },
      }),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toEqual({
      error: "appearance_authentication_required",
    });

    const forbidden = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance/v3`),
      bindings((request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/internal/sessions/current"
            ? storedSession()
            : membershipResponse(false),
        ),
      ),
      vi.fn(),
      () => now,
    );
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toEqual({
      error: "appearance_guild_forbidden",
    });
  });

  it("preserves guild authorization and attribution on V2 writes", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const profile = guildProfileV2();
    const response = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance/v2`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 0, profile }),
      }),
      bindings(async (request) => {
        const path = new URL(request.url).pathname;
        const body: unknown = await request.json();
        requests.push({ path, body });
        if (path === "/internal/sessions/current") return storedSession();
        if (path === "/internal/memberships/list") return membershipResponse();
        return Response.json({ status: "applied", revision: 1, profile });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(requests[2]).toEqual({
      path: "/internal/appearance/v2/guild/put",
      body: {
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile,
        mutationId: `web-appearance-guild:${idempotencyKey}`,
        occurredAt: now,
      },
    });
  });

  it("delegates V2 previews to the exact renderer V3 path", async () => {
    const env = bindings(() => Promise.resolve(storedSession()));
    const previewV2 = vi.fn(() =>
      Promise.resolve({
        version: 3,
        contentType: "image/png",
        width: 150,
        height: 150,
        diceCount: 1,
        rowCount: 1,
        png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    );
    const legacyPreview = vi.fn();
    env.ROLL_WEB.preview = legacyPreview;
    env.ROLL_WEB.previewV2 = previewV2;
    const input = {
      target: "d20",
      recipe: appearanceRecipeV2(),
      seed: 42,
      state: "critical-success",
    };
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/v2/preview", {
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
      version: 2,
      contentType: "image/png",
      width: 150,
      height: 150,
      base64: "iVBORw0KGgo=",
    });
    expect(previewV2).toHaveBeenCalledWith(input);
    expect(legacyPreview).not.toHaveBeenCalled();
  });

  it("delegates V3 previews to the immutable renderer V4 path", async () => {
    const env = bindings(() => Promise.resolve(storedSession()));
    const previewV3 = vi.fn(() =>
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
    env.ROLL_WEB.previewV3 = previewV3;
    const input = {
      target: "d20",
      recipe: personalProfileV3().designs[0]?.recipe,
      seed: 42,
      state: "critical-success",
    };
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/v3/preview", {
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
      version: 3,
      contentType: "image/png",
      width: 150,
      height: 150,
      base64: "iVBORw0KGgo=",
    });
    expect(previewV3).toHaveBeenCalledWith(input);
  });

  it("delegates V4 camera previews to the r23 renderer path", async () => {
    const env = bindings(() => Promise.resolve(storedSession()));
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
    const input = {
      target: "d20",
      recipe: personalProfileV3().designs[0]?.recipe,
      diceView: personalProfileV4().diceView,
      seed: 42,
      state: "normal",
    };
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

  it("returns stable V3 preview validation and renderer errors", async () => {
    const env = bindings(() => Promise.resolve(storedSession()));
    const previewV3 = vi.fn();
    env.ROLL_WEB.previewV3 = previewV3;
    const invalid = await handleAuthRequest(
      browserRequest("/api/appearance/v3/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "d20",
          recipe: personalProfileV2().designs[0]?.recipe,
          seed: 42,
          state: "normal",
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "appearance_preview_invalid",
    });
    expect(previewV3).not.toHaveBeenCalled();

    previewV3.mockRejectedValueOnce(new Error("injected renderer failure"));
    const failed = await handleAuthRequest(
      browserRequest("/api/appearance/v3/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "d20",
          recipe: personalProfileV3().designs[0]?.recipe,
          seed: 42,
          state: "normal",
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toEqual({
      error: "appearance_renderer_failed",
    });
  });

  it("propagates V2 row conflicts through cached V1 browser routes", async () => {
    const env = bindings((request) =>
      Promise.resolve(
        new URL(request.url).pathname === "/internal/sessions/current"
          ? storedSession()
          : Response.json(
              { error: "appearance_profile_version_conflict" },
              { status: 409 },
            ),
      ),
    );
    const read = await handleAuthRequest(
      browserRequest("/api/appearance/me"),
      env,
      vi.fn(),
      () => now,
    );
    expect(read.status).toBe(409);
    await expect(read.json()).resolves.toEqual({
      error: "appearance_profile_version_conflict",
    });

    const write = await handleAuthRequest(
      browserRequest("/api/appearance/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: 1,
          profile: personalProfile(),
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(write.status).toBe(409);
    await expect(write.json()).resolves.toEqual({
      error: "appearance_profile_version_conflict",
    });
  });

  it("propagates newer-row version conflicts through V2 browser routes", async () => {
    const env = bindings((request) =>
      Promise.resolve(
        new URL(request.url).pathname === "/internal/sessions/current"
          ? storedSession()
          : Response.json(
              { error: "appearance_profile_version_conflict" },
              { status: 409 },
            ),
      ),
    );
    const read = await handleAuthRequest(
      browserRequest("/api/appearance/v2/me"),
      env,
      vi.fn(),
      () => now,
    );
    expect(read.status).toBe(409);
    await expect(read.json()).resolves.toEqual({
      error: "appearance_profile_version_conflict",
    });

    const write = await handleAuthRequest(
      browserRequest("/api/appearance/v2/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: 1,
          profile: personalProfileV2(),
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(write.status).toBe(409);
    await expect(write.json()).resolves.toEqual({
      error: "appearance_profile_version_conflict",
    });
  });

  it("rejects V1 profile data returned through a V2 browser lookup", async () => {
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/v2/me"),
      bindings((request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/internal/sessions/current"
            ? storedSession()
            : Response.json({
                status: "found",
                revision: 1,
                profile: personalProfile(),
              }),
        ),
      ),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Appearance lookup response is invalid",
    });
  });

  it("loads the authenticated user's profile without accepting a user id", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const profile = personalProfile();
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/me"),
      bindings(async (request) => {
        const path = new URL(request.url).pathname;
        requests.push({ path, body: await request.json() });
        return path === "/internal/sessions/current"
          ? storedSession()
          : Response.json({ status: "found", revision: 3, profile });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revision: 3, profile });
    expect(requests).toEqual([
      {
        path: "/internal/sessions/current",
        body: { token: sessionToken, now },
      },
      {
        path: "/internal/appearance/personal/get",
        body: { userId },
      },
    ]);
  });

  it("represents a missing personal row as the Chaotic revision-zero state", async () => {
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/me"),
      bindings((request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/internal/sessions/current"
            ? storedSession()
            : Response.json({ status: "missing" }),
        ),
      ),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      revision: 0,
      profile: null,
    });
  });

  it("writes a canonical personal profile with optimistic revision and idempotency", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const profile = personalProfile();
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 0, profile }),
      }),
      bindings(async (request) => {
        const path = new URL(request.url).pathname;
        const body: unknown = await request.json();
        requests.push({ path, body });
        return path === "/internal/sessions/current"
          ? storedSession()
          : Response.json({
              status: "applied",
              revision: 1,
              profile,
            });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "applied",
      revision: 1,
      profile,
    });
    expect(requests[1]).toEqual({
      path: "/internal/appearance/personal/put",
      body: {
        userId,
        expectedRevision: 0,
        profile,
        mutationId: `web-appearance-personal:${idempotencyKey}`,
        occurredAt: now,
      },
    });
  });

  it("forwards optimistic revision conflicts without changing the profile", async () => {
    const profile = personalProfile();
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 1, profile }),
      }),
      bindings((request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/internal/sessions/current"
            ? storedSession()
            : Response.json(
                { status: "revision_conflict", revision: 2 },
                { status: 409 },
              ),
        ),
      ),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      status: "revision_conflict",
      revision: 2,
    });
  });

  it("rejects invalid and oversized personal documents before persistence", async () => {
    const paths: string[] = [];
    const env = bindings((request) => {
      const path = new URL(request.url).pathname;
      paths.push(path);
      return Promise.resolve(storedSession());
    });
    const invalid = await handleAuthRequest(
      browserRequest("/api/appearance/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: 0,
          profile: { ...personalProfile(), unexpected: true },
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(invalid.status).toBe(400);

    const oversized = await handleAuthRequest(
      browserRequest("/api/appearance/me", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ value: "x".repeat(100_000) }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(oversized.status).toBe(400);
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/sessions/current",
    ]);
  });

  it("does not substitute a profile when the required Data lookup fails", async () => {
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/me"),
      bindings((request) =>
        Promise.resolve(
          new URL(request.url).pathname === "/internal/sessions/current"
            ? storedSession()
            : Response.json({ error: "temporary" }, { status: 503 }),
        ),
      ),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Appearance lookup failed",
    });
  });

  it("authorizes every guild write and attributes it to the session user", async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    const profile = guildProfile();
    const response = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ expectedRevision: 0, profile }),
      }),
      bindings(async (request) => {
        const path = new URL(request.url).pathname;
        const body: unknown = await request.json();
        requests.push({ path, body });
        if (path === "/internal/sessions/current") return storedSession();
        if (path === "/internal/memberships/list") {
          return membershipResponse();
        }
        return Response.json({
          status: "applied",
          revision: 1,
          profile,
        });
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(requests[2]).toEqual({
      path: "/internal/appearance/guild/put",
      body: {
        guildId,
        updatedByUserId: userId,
        expectedRevision: 0,
        profile,
        mutationId: `web-appearance-guild:${idempotencyKey}`,
        occurredAt: now,
      },
    });
  });

  it("does not touch guild appearance data without current admin authorization", async () => {
    const paths: string[] = [];
    const response = await handleAuthRequest(
      browserRequest(`/api/guilds/${guildId}/appearance`),
      bindings((request) => {
        const path = new URL(request.url).pathname;
        paths.push(path);
        return Promise.resolve(
          path === "/internal/sessions/current"
            ? storedSession()
            : membershipResponse(false),
        );
      }),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/memberships/list",
    ]);
  });

  it("returns a bounded exact renderer preview for authenticated editors", async () => {
    const env = bindings(() => Promise.resolve(storedSession()));
    const preview = vi.fn(() =>
      Promise.resolve({
        version: 2,
        contentType: "image/png",
        width: 150,
        height: 150,
        diceCount: 1,
        rowCount: 1,
        png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    );
    env.ROLL_WEB.preview = preview;
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "d20",
          recipe: personalProfile().designs[0]?.recipe,
          seed: 42,
          state: "critical-success",
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      contentType: "image/png",
      width: 150,
      height: 150,
      base64: "iVBORw0KGgo=",
    });
    expect(preview).toHaveBeenCalledWith({
      target: "d20",
      recipe: personalProfile().designs[0]?.recipe,
      seed: 42,
      state: "critical-success",
    });
  });

  it("rejects untrusted preview assets before invoking the renderer", async () => {
    const env = bindings(() => Promise.resolve(storedSession()));
    const preview = vi.fn();
    env.ROLL_WEB.preview = preview;
    const response = await handleAuthRequest(
      browserRequest("/api/appearance/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: "d20",
          recipe: personalProfile().designs[0]?.recipe,
          seed: 42,
          state: "normal",
          imageUrl: "https://example.com/texture.svg",
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(400);
    expect(preview).not.toHaveBeenCalled();
  });

  it("advertises explicit V1 through V4 appearance profile preflight contracts", async () => {
    for (const path of [
      "/api/appearance/me",
      "/api/appearance/v2/me",
      "/api/appearance/v3/me",
      "/api/appearance/v4/me",
      `/api/guilds/${guildId}/appearance/v2`,
      `/api/guilds/${guildId}/appearance/v3`,
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
      expect(response.headers.get("access-control-allow-headers")).toBe(
        "content-type, idempotency-key",
      );
    }

    for (const path of [
      "/api/appearance/v3/preview",
      "/api/appearance/v4/preview",
    ]) {
      const preview = await handleAuthRequest(
      new Request(`${apiOrigin}${path}`, {
        method: "OPTIONS",
        headers: { origin: frontendOrigin },
      }),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
      expect(preview.status).toBe(204);
      expect(preview.headers.get("access-control-allow-methods")).toBe("POST");
      expect(preview.headers.get("access-control-allow-headers")).toBe(
        "content-type",
      );
    }
  });
});
