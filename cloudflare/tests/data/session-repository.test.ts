import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  D1SessionRepository,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../workers/data/src/session-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const createdAt = 1_767_225_600_123;
const expiresAt = createdAt + 30 * 24 * 60 * 60 * 1_000;
const sessionToken = "a".repeat(43);
const stateToken = "b".repeat(43);

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM oauth_states"),
    dataEnv.DATA.prepare("DELETE FROM web_sessions"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM interaction_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare("DELETE FROM stats"),
    dataEnv.DATA.prepare(
      `INSERT INTO users (
         id, username, email, avatar, created_at, updated_at
       ) VALUES (?, 'fixture-user', 'fixture@example.com',
                 'fixture-avatar', ?, ?)`,
    ).bind(userId, createdAt, createdAt),
  ]);
});

describe("D1SessionRepository", () => {
  it("stores only a token hash and returns the joined user profile", async () => {
    const repository = new D1SessionRepository(dataEnv.DATA);

    await expect(
      repository.createSession({
        token: sessionToken,
        userId,
        createdAt,
        expiresAt,
      }),
    ).resolves.toEqual({ status: "created" });
    await expect(repository.getSession(sessionToken, createdAt)).resolves.toEqual({
      status: "found",
      session: {
        user: {
          id: userId,
          username: "fixture-user",
          email: "fixture@example.com",
          avatar: "fixture-avatar",
        },
        createdAt,
        expiresAt,
      },
    });

    const stored = await dataEnv.DATA.prepare(
      "SELECT token_hash FROM web_sessions",
    ).first<{ token_hash: string }>();
    expect(stored?.token_hash).toBe(await hashOpaqueToken(sessionToken));
    expect(stored?.token_hash).not.toContain(sessionToken);
  });

  it("distinguishes expired and revoked sessions", async () => {
    const repository = new D1SessionRepository(dataEnv.DATA);
    await repository.createSession({
      token: sessionToken,
      userId,
      createdAt,
      expiresAt,
    });

    await expect(repository.getSession(sessionToken, expiresAt)).resolves.toEqual({
      status: "expired",
    });
    await expect(
      repository.revokeSession(sessionToken, createdAt + 1),
    ).resolves.toEqual({ status: "revoked" });
    await expect(
      repository.getSession(sessionToken, createdAt + 2),
    ).resolves.toEqual({ status: "revoked" });
    await expect(
      repository.revokeSession(sessionToken, createdAt + 3),
    ).resolves.toEqual({ status: "existing" });
    await expect(
      repository.createSession({
        token: sessionToken,
        userId,
        createdAt,
        expiresAt,
      }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("fails closed on token reuse with different session data", async () => {
    const repository = new D1SessionRepository(dataEnv.DATA);
    await repository.createSession({
      token: sessionToken,
      userId,
      createdAt,
      expiresAt,
    });

    await expect(
      repository.createSession({
        token: sessionToken,
        userId,
        createdAt,
        expiresAt: expiresAt + 1,
      }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("does not create a session for a missing user", async () => {
    await dataEnv.DATA.prepare("DELETE FROM users WHERE id = ?")
      .bind(userId)
      .run();
    const repository = new D1SessionRepository(dataEnv.DATA);

    await expect(
      repository.createSession({
        token: sessionToken,
        userId,
        createdAt,
        expiresAt,
      }),
    ).resolves.toEqual({ status: "missing_user" });
    const sessions = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM web_sessions",
    ).first<{ count: number }>();
    expect(sessions?.count).toBe(0);
  });

  it("consumes OAuth state exactly once under concurrent callbacks", async () => {
    const repository = new D1SessionRepository(dataEnv.DATA);
    await expect(
      repository.createOAuthState({
        token: stateToken,
        createdAt,
        expiresAt: createdAt + 10 * 60 * 1_000,
      }),
    ).resolves.toEqual({ status: "created" });

    const results = await Promise.all([
      new D1SessionRepository(dataEnv.DATA).consumeOAuthState(
        stateToken,
        createdAt + 1,
      ),
      new D1SessionRepository(dataEnv.DATA).consumeOAuthState(
        stateToken,
        createdAt + 1,
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "already_consumed",
      "consumed",
    ]);
  });

  it("rejects expired OAuth state without consuming it", async () => {
    const repository = new D1SessionRepository(dataEnv.DATA);
    await repository.createOAuthState({
      token: stateToken,
      createdAt,
      expiresAt: createdAt + 1,
    });

    await expect(
      repository.consumeOAuthState(stateToken, createdAt + 2),
    ).resolves.toEqual({ status: "expired" });
  });

  it("generates unique 32-byte base64url tokens", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("rejects malformed tokens and timestamps before querying", async () => {
    const repository = new D1SessionRepository(dataEnv.DATA);

    await expect(repository.getSession("invalid", createdAt)).rejects.toThrow(
      "Opaque token is invalid",
    );
    await expect(
      repository.createSession({
        token: sessionToken,
        userId,
        createdAt: expiresAt,
        expiresAt,
      }),
    ).rejects.toThrow("Session timestamps are invalid");
  });
});
