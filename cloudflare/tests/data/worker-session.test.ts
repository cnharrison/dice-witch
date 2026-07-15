import { env, exports } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const createdAt = 1_767_225_600_123;
const expiresAt = createdAt + 30 * 24 * 60 * 60 * 1_000;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM oauth_states"),
    dataEnv.DATA.prepare("DELETE FROM web_sessions"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare(
      `INSERT INTO users (
         id, username, email, avatar, created_at, updated_at
       ) VALUES (?, 'fixture-user', 'fixture@example.com',
                 'fixture-avatar', ?, ?)`,
    ).bind(userId, createdAt, createdAt),
  ]);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responseToken(response: Response): Promise<string> {
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.token !== "string") {
    throw new Error("Session service did not return a token");
  }
  return value.token;
}

function internalRequest(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("Data Worker session service", () => {
  it("creates, resolves, and revokes an opaque session", async () => {
    const created = await internalRequest("/internal/sessions", {
      userId,
      createdAt,
      expiresAt,
    });
    expect(created.status).toBe(201);
    const token = await responseToken(created);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const current = await internalRequest("/internal/sessions/current", {
      token,
      now: createdAt + 1,
    });
    expect(current.status).toBe(200);
    await expect(current.json()).resolves.toEqual({
      user: {
        id: userId,
        username: "fixture-user",
        email: "fixture@example.com",
        avatar: "fixture-avatar",
      },
      createdAt,
      expiresAt,
    });

    const revoked = await internalRequest("/internal/sessions/revoke", {
      token,
      revokedAt: createdAt + 2,
    });
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toEqual({ status: "revoked" });

    const after = await internalRequest("/internal/sessions/current", {
      token,
      now: createdAt + 3,
    });
    expect(after.status).toBe(401);
    await expect(after.json()).resolves.toEqual({ status: "revoked" });
  });

  it("creates and consumes a single-use OAuth state", async () => {
    const created = await internalRequest("/internal/oauth-states", {
      createdAt,
      expiresAt: createdAt + 10 * 60 * 1_000,
    });
    expect(created.status).toBe(201);
    const token = await responseToken(created);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const consumed = await internalRequest("/internal/oauth-states/consume", {
      token,
      consumedAt: createdAt + 1,
    });
    expect(consumed.status).toBe(200);
    await expect(consumed.json()).resolves.toEqual({ status: "consumed" });

    const replay = await internalRequest("/internal/oauth-states/consume", {
      token,
      consumedAt: createdAt + 2,
    });
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toEqual({
      status: "already_consumed",
    });
  });

  it("atomically completes a web login without returning its token", async () => {
    const token = "C".repeat(43);
    const response = await internalRequest("/internal/web-logins", {
      token,
      userId: "100000000000000004",
      profile: {
        username: "login-user",
        email: "login@example.com",
        avatar: "login-avatar",
      },
      mutationId: "oauth-login:fixture-state",
      createdAt,
      expiresAt,
    });

    expect(response.status).toBe(200);
    const result: unknown = await response.json();
    expect(result).toEqual({
      status: "applied",
      session: {
        userId: "100000000000000004",
        createdAt,
        expiresAt,
      },
    });
    expect(JSON.stringify(result)).not.toContain(token);

    const rows = await dataEnv.DATA.batch<{ count: number }>([
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM users WHERE id = '100000000000000004'",
      ),
      dataEnv.DATA.prepare("SELECT COUNT(*) AS count FROM web_sessions"),
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts WHERE mutation_id = 'oauth-login:fixture-state'",
      ),
    ]);
    expect(rows.map((row) => row.results[0]?.count)).toEqual([1, 1, 1]);
  });

  it("rejects access tokens and unexpected session fields", async () => {
    const response = await internalRequest("/internal/web-logins", {
      token: "C".repeat(43),
      userId,
      profile: {
        username: "fixture-user",
        email: "fixture@example.com",
        avatar: null,
      },
      mutationId: "oauth-login:fixture-state",
      createdAt,
      expiresAt,
      accessToken: "must-not-be-stored",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Web login request is invalid",
    });
    const sessions = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM web_sessions",
    ).first<{ count: number }>();
    expect(sessions?.count).toBe(0);
  });

  it("does not return raw session or OAuth tokens from D1", async () => {
    const state = await internalRequest("/internal/oauth-states", {
      createdAt,
      expiresAt: createdAt + 10 * 60 * 1_000,
    });
    const session = await internalRequest("/internal/sessions", {
      userId,
      createdAt,
      expiresAt,
    });
    const stateToken = await responseToken(state);
    const sessionToken = await responseToken(session);

    const rows = await dataEnv.DATA.batch([
      dataEnv.DATA.prepare("SELECT state_hash FROM oauth_states"),
      dataEnv.DATA.prepare("SELECT token_hash FROM web_sessions"),
    ]);
    const serialized = JSON.stringify(rows.map((result) => result.results));
    expect(serialized).not.toContain(stateToken);
    expect(serialized).not.toContain(sessionToken);
  });
});
