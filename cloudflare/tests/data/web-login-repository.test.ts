import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { hashOpaqueToken } from "../../workers/data/src/session-repository";
import { D1WebLoginRepository } from "../../workers/data/src/web-login-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const otherUserId = "100000000000000004";
const sessionToken = "A".repeat(43);
const otherToken = "B".repeat(43);
const createdAt = 1_767_225_600_123;
const expiresAt = createdAt + 30 * 24 * 60 * 60 * 1_000;

const input = {
  token: sessionToken,
  userId,
  profile: {
    username: "fixture-user",
    email: "fixture@example.com",
    avatar: "fixture-avatar",
  },
  mutationId: "oauth-login:fixture-state",
  createdAt,
  expiresAt,
};

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM oauth_states"),
    dataEnv.DATA.prepare("DELETE FROM web_sessions"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users"),
  ]);
});

describe("D1WebLoginRepository", () => {
  it("atomically upserts the user, records its receipt, and creates the session", async () => {
    const repository = new D1WebLoginRepository(dataEnv.DATA);

    await expect(repository.complete(input)).resolves.toEqual({
      status: "applied",
      session: { userId, createdAt, expiresAt },
    });

    const user = await dataEnv.DATA.prepare(
      `SELECT username, email, flags, discriminator, avatar,
              last_web_login, created_at, updated_at
       FROM users WHERE id = ?`,
    )
      .bind(userId)
      .first();
    expect(user).toEqual({
      username: "fixture-user",
      email: "fixture@example.com",
      flags: null,
      discriminator: null,
      avatar: "fixture-avatar",
      last_web_login: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    });

    const session = await dataEnv.DATA.prepare(
      `SELECT token_hash, user_id, created_at, expires_at, revoked_at
       FROM web_sessions`,
    ).first();
    expect(session).toEqual({
      token_hash: await hashOpaqueToken(sessionToken),
      user_id: userId,
      created_at: createdAt,
      expires_at: expiresAt,
      revoked_at: null,
    });

    const receipt = await dataEnv.DATA.prepare(
      `SELECT mutation_id, entity_type, entity_key, operation, payload_json,
              occurred_at
       FROM mutation_receipts`,
    ).first();
    expect(receipt).toEqual({
      mutation_id: input.mutationId,
      entity_type: "user",
      entity_key: userId,
      operation: "upsert",
      payload_json: JSON.stringify({
        username: "fixture-user",
        email: "fixture@example.com",
        lastWebLogin: createdAt,
        flags: null,
        discriminator: null,
        avatar: "fixture-avatar",
      }),
      occurred_at: createdAt,
    });
  });

  it("preserves flags and discriminator already held in business data", async () => {
    await dataEnv.DATA.prepare(
      `INSERT INTO users (
         id, username, flags, discriminator, created_at, updated_at
       ) VALUES (?, 'old-name', 128, '1234', ?, ?)`,
    )
      .bind(userId, createdAt - 1, createdAt - 1)
      .run();

    await new D1WebLoginRepository(dataEnv.DATA).complete(input);

    const user = await dataEnv.DATA.prepare(
      "SELECT flags, discriminator FROM users WHERE id = ?",
    )
      .bind(userId)
      .first();
    expect(user).toEqual({ flags: 128, discriminator: "1234" });
    const receipt = await dataEnv.DATA.prepare(
      "SELECT payload_json FROM mutation_receipts",
    ).first<{ payload_json: string }>();
    expect(JSON.parse(receipt?.payload_json ?? "null")).toMatchObject({
      flags: 128,
      discriminator: "1234",
    });
  });

  it("returns existing for an exact service retry", async () => {
    const repository = new D1WebLoginRepository(dataEnv.DATA);

    await expect(repository.complete(input)).resolves.toMatchObject({
      status: "applied",
    });
    await expect(repository.complete(input)).resolves.toEqual({
      status: "existing",
      session: { userId, createdAt, expiresAt },
    });

    const counts = await dataEnv.DATA.batch<{ count: number }>([
      dataEnv.DATA.prepare(
        "SELECT COUNT(*) AS count FROM mutation_receipts",
      ),
      dataEnv.DATA.prepare("SELECT COUNT(*) AS count FROM web_sessions"),
    ]);
    expect(counts.map((result) => result.results[0]?.count)).toEqual([1, 1]);
  });

  it("rejects mutation or session-token reuse with different identities", async () => {
    const repository = new D1WebLoginRepository(dataEnv.DATA);
    await repository.complete(input);

    await expect(
      repository.complete({ ...input, token: otherToken }),
    ).resolves.toEqual({ status: "conflict" });
    await expect(
      repository.complete({
        ...input,
        userId: otherUserId,
        mutationId: "oauth-login:other-state",
      }),
    ).resolves.toEqual({ status: "conflict" });
  });

  it("rejects malformed identifiers, tokens, profiles, and timestamps", async () => {
    const repository = new D1WebLoginRepository(dataEnv.DATA);

    await expect(
      repository.complete({ ...input, userId: "001" }),
    ).rejects.toThrow("User id is invalid");
    await expect(
      repository.complete({ ...input, token: "short" }),
    ).rejects.toThrow("Opaque token is invalid");
    await expect(
      repository.complete({
        ...input,
        profile: { ...input.profile, username: "x".repeat(256) },
      }),
    ).rejects.toThrow("Web login profile is invalid");
    await expect(
      repository.complete({ ...input, expiresAt: createdAt }),
    ).rejects.toThrow("Session expiry must be after creation");
  });
});
