import { describe, expect, it, vi } from "vitest";
import {
  handleAuthRequest,
  type WebApiBindings,
} from "../../workers/web-api/src/auth";

const now = 1_767_225_600_123;
const userId = "100000000000000003";
const guildId = "100000000000000001";
const recordId = "00000000-0000-4000-8000-000000000001";
const idempotencyKey = "00000000-0000-4000-8000-000000000010";
const frontendOrigin = "https://app.example.com";

function sessionResponse(): Response {
  return Response.json({
    user: {
      id: userId,
      username: "witch",
      email: "witch@example.com",
      avatar: null,
    },
    createdAt: now - 1_000,
    expiresAt: now + 60_000,
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
      preview: vi.fn(),
      previewV2: vi.fn(),
      previewV3: vi.fn(),
    },
    DISCORD_CLIENT_ID: "100000000000000099",
    DISCORD_CLIENT_SECRET: "test-client-secret",
    DISCORD_REDIRECT_URI:
      "https://api.example.com/api/auth/callback/discord",
    FRONTEND_ORIGIN: frontendOrigin,
    BUILD_SHA: "abcdef0123456789abcdef0123456789abcdef01",
  };
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers({
    cookie: `session_id=${"S".repeat(43)}`,
    origin: frontendOrigin,
  });
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  return new Request(`https://api.example.com${path}`, {
    ...init,
    headers,
  });
}

async function body(requestValue: Request): Promise<Record<string, unknown>> {
  return await requestValue.json();
}

describe("saved-roll Web API", () => {
  it("derives personal ownership from the authenticated session", async () => {
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      expect(path).toBe("/internal/saved-rolls/v1/list");
      expect(await body(dataRequest)).toEqual({
        owner: { type: "user", userId },
      });
      return Response.json({
        status: "found",
        listRevision: 0,
        savedRolls: [],
      });
    });
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v1/me"),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );
    await expect(response.json()).resolves.toMatchObject({ status: "found" });
  });

  it("forwards the V2 color contract without weakening V1 routes", async () => {
    const draft = {
      version: 2,
      name: "Fireball",
      nameColor: "#A1B2C3",
      notation: "8d6",
      title: null,
      repetitions: 1,
    };
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      expect(path).toBe("/internal/saved-rolls/v2/create");
      expect(await body(dataRequest)).toMatchObject({ draft });
      return Response.json({
        status: "applied",
        listRevision: 1,
        savedRoll: { version: 2, id: recordId, nameColor: "#A1B2C3" },
      });
    });
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v2/me", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft,
          pinned: false,
        }),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      savedRoll: { version: 2, nameColor: "#A1B2C3" },
    });
  });

  it.each([
    {
      operation: "copy",
      method: "POST",
      path: "/api/saved-rolls/v1/me/copy",
      value: {
        id: recordId,
        expectedListRevision: 0,
        draft: {
          version: 1,
          name: "Copy",
          notation: "1d20",
          title: null,
          repetitions: 1,
        },
        pinned: false,
      },
    },
    {
      operation: "update",
      method: "PATCH",
      path: `/api/saved-rolls/v1/me/${recordId}`,
      value: {
        expectedListRevision: 1,
        expectedRecordRevision: 1,
        draft: {
          version: 1,
          name: "Updated",
          notation: "2d20",
          title: null,
          repetitions: 1,
        },
        pinned: true,
      },
    },
    {
      operation: "delete",
      method: "DELETE",
      path: `/api/saved-rolls/v1/me/${recordId}`,
      value: { expectedListRevision: 2, expectedRecordRevision: 2 },
    },
    {
      operation: "reorder",
      method: "POST",
      path: "/api/saved-rolls/v1/me/reorder",
      value: { expectedListRevision: 3, orderedIds: [recordId] },
    },
  ])("forwards an exact authenticated $operation mutation", async ({
    operation,
    method,
    path,
    value,
  }) => {
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const dataPath = new URL(dataRequest.url).pathname;
      if (dataPath === "/internal/sessions/current") return sessionResponse();
      expect(dataPath).toBe(`/internal/saved-rolls/v1/${operation}`);
      expect(await body(dataRequest)).toMatchObject({
        owner: { type: "user", userId },
        actorUserId: userId,
        authorizationUpdatedAt: null,
        mutationId: `web-saved-roll:${operation}:${idempotencyKey}`,
        ...(operation === "update" || operation === "delete"
          ? { id: recordId }
          : {}),
      });
      return Response.json({ status: "applied", listRevision: 4 });
    });
    const response = await handleAuthRequest(
      request(path, {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(value),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
  });

  it("forwards an exact authenticated V2 batch delete", async () => {
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      expect(path).toBe("/internal/saved-rolls/v2/delete-batch");
      expect(await body(dataRequest)).toEqual({
        owner: { type: "user", userId },
        actorUserId: userId,
        authorizationUpdatedAt: null,
        expectedListRevision: 4,
        records: [{ id: recordId, revision: 2 }],
        mutationId: `web-saved-roll:delete-batch:${idempotencyKey}`,
        occurredAt: now,
      });
      return Response.json({ status: "applied", listRevision: 5 });
    });
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v2/me/delete-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedListRevision: 4,
          records: [{ id: recordId, revision: 2 }],
        }),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
  });

  it("refreshes guild admin proof before an atomic create", async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      const value = await body(dataRequest);
      requests.push({ path, body: value });
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/memberships/permissions") {
        return Response.json({
          status: "applied",
          permissions: { isAdmin: true, isDiceWitchAdmin: false },
        });
      }
      expect(path).toBe("/internal/saved-rolls/v1/create");
      return Response.json({
        status: "applied",
        listRevision: 1,
        savedRoll: { id: recordId },
      });
    });
    const env = bindings(dataFetch);
    const inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: true,
        isDiceWitchAdmin: false,
      }),
    );
    env.DISCORD_REST.inspectMembership = inspectMembership;
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft: {
            version: 1,
            name: "Fireball",
            notation: "8d6",
            title: null,
            repetitions: 1,
          },
          pinned: false,
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(inspectMembership).toHaveBeenCalledWith(guildId, userId);
    expect(requests[1]?.body).toMatchObject({
      guildId,
      userId,
      isAdmin: true,
      occurredAt: now,
    });
    expect(requests[2]?.body).toMatchObject({
      owner: { type: "guild", guildId },
      actorUserId: userId,
      authorizationUpdatedAt: now,
      mutationId: `web-saved-roll:create:${idempotencyKey}`,
      occurredAt: now,
    });
  });

  it("searches only Server libraries managed by the current user", async () => {
    const memberGuildId = "100000000000000001";
    const adminGuildId = "100000000000000002";
    const diceWitchAdminGuildId = "100000000000000004";
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/saved-rolls/v1/libraries") {
        return Response.json({
          status: "found",
          libraries: [
            { guildId: memberGuildId, guildName: "Member Server", guildIcon: null },
            { guildId: adminGuildId, guildName: "Admin Server", guildIcon: null },
            {
              guildId: diceWitchAdminGuildId,
              guildName: "Dice Witch Admin Server",
              guildIcon: null,
            },
          ],
        });
      }
      if (path === "/internal/memberships/permissions") {
        const proof = await body(dataRequest);
        return Response.json({
          status: "applied",
          permissions: {
            isAdmin: proof.isAdmin,
            isDiceWitchAdmin: proof.isDiceWitchAdmin,
          },
        });
      }
      if (path === "/internal/saved-rolls/v2/search") {
        expect(await body(dataRequest)).toMatchObject({
          userId,
          guildIds: [adminGuildId, diceWitchAdminGuildId],
          query: "fire",
        });
        return Response.json({
          status: "found",
          entries: [],
          hasMore: false,
          total: 0,
        });
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn((candidateGuildId: string) =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: candidateGuildId === adminGuildId,
        isDiceWitchAdmin: candidateGuildId === diceWitchAdminGuildId,
      }),
    );

    const response = await handleAuthRequest(
      request("/api/saved-rolls/v2/search?query=fire&offset=0&sort=name&direction=asc"),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "found",
      entries: [],
      total: 0,
    });
  });

  it("denies a stale admin inspection superseded by newer revoked proof", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn((dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") {
        return Promise.resolve(sessionResponse());
      }
      if (path === "/internal/memberships/permissions") {
        return Promise.resolve(Response.json({
          status: "superseded",
          permissions: { isAdmin: false, isDiceWitchAdmin: false },
        }));
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: true,
        isDiceWitchAdmin: false,
      }),
    );
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft: {
            version: 1,
            name: "Fireball",
            notation: "8d6",
            title: null,
            repetitions: 1,
          },
          pinned: false,
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(403);
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/memberships/permissions",
    ]);
  });

  it("allows a current non-admin member to read a Server library", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn((dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") {
        return Promise.resolve(sessionResponse());
      }
      if (path === "/internal/memberships/permissions") {
        return Promise.resolve(Response.json({
          status: "applied",
          permissions: { isAdmin: false, isDiceWitchAdmin: false },
        }));
      }
      if (path === "/internal/saved-rolls/v1/list") {
        return Promise.resolve(Response.json({
          status: "found",
          listRevision: 1,
          savedRolls: [],
        }));
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: false,
        isDiceWitchAdmin: false,
      }),
    );
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/memberships/permissions",
      "/internal/saved-rolls/v1/list",
    ]);
  });

  it("searches Personal and authorized Server libraries with permission metadata", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/saved-rolls/v1/libraries") {
        return Response.json({
          status: "found",
          libraries: [{ guildId, guildName: "Moonlit Library", guildIcon: null }],
        });
      }
      if (path === "/internal/memberships/permissions") {
        return Response.json({
          status: "applied",
          permissions: { isAdmin: true, isDiceWitchAdmin: false },
        });
      }
      if (path === "/internal/saved-rolls/v1/search") {
        expect(await body(dataRequest)).toEqual({
          userId,
          guildIds: [guildId],
          query: "fire",
          offset: 0,
          sort: "name",
          direction: "asc",
        });
        return Response.json({
          status: "found",
          entries: [{
            savedRoll: {
              id: recordId,
              owner: { type: "guild", guildId },
            },
            listRevision: 4,
            guildName: "Moonlit Library",
            guildIcon: null,
          }],
          hasMore: false,
          total: 1,
        });
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn(() => Promise.resolve({
      status: "found" as const,
      isAdmin: true,
      isDiceWitchAdmin: false,
    }));
    const response = await handleAuthRequest(
      request(
        "/api/saved-rolls/v1/search?query=fire&offset=0&sort=name&direction=asc",
      ),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "found",
      entries: [{
        savedRoll: { id: recordId, owner: { type: "guild", guildId } },
        listRevision: 4,
        source: {
          type: "guild",
          guildId,
          guildName: "Moonlit Library",
          guildIcon: null,
        },
        canManage: true,
      }],
      hasMore: false,
      total: 1,
    });
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/saved-rolls/v1/libraries",
      "/internal/memberships/permissions",
      "/internal/saved-rolls/v1/search",
    ]);
  });

  it("records a missing guild membership and denies access", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/memberships/permissions") {
        expect(await body(dataRequest)).toMatchObject({
          isAdmin: false,
          isDiceWitchAdmin: false,
        });
        return Response.json({
          status: "applied",
          permissions: { isAdmin: false, isDiceWitchAdmin: false },
        });
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(403);
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/memberships/permissions",
    ]);
  });

  it("advertises credentialed saved-roll preflight headers", async () => {
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v1/me", { method: "OPTIONS" }),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, PATCH, DELETE",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type, idempotency-key",
    );
  });

  it("requires exact mutation fields and a UUID idempotency key", async () => {
    const dataFetch = vi.fn((dataRequest: Request) =>
      Promise.resolve(
        new URL(dataRequest.url).pathname === "/internal/sessions/current"
          ? sessionResponse()
          : Response.json({ error: "unexpected" }, { status: 500 }),
      ),
    );
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v1/me", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft: {},
          pinned: false,
          owner: { type: "user", userId: "100000000000000004" },
        }),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Saved roll request is invalid",
    });
    expect(dataFetch).toHaveBeenCalledTimes(1);
  });
});
