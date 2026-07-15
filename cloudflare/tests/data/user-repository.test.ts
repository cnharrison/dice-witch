import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1UserRepository } from "../../workers/data/src/user-repository";

const dataEnv = env as unknown as {
  DATA: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};
const userId = "100000000000000003";
const occurredAt = 1_767_225_600_123;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM interaction_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
    dataEnv.DATA.prepare("DELETE FROM stats"),
  ]);
});

const profile = {
  username: "fixture-user",
  email: "fixture@example.com",
  lastWebLogin: occurredAt,
  flags: 64,
  discriminator: "0",
  avatar: "fixture-avatar",
};

describe("D1UserRepository", () => {
  it("distinguishes a missing user from a stored profile", async () => {
    const repository = new D1UserRepository(dataEnv.DATA);

    await expect(repository.getProfile(userId)).resolves.toEqual({
      status: "missing",
    });
    await dataEnv.DATA.prepare(
      `INSERT INTO users (
         id, username, email, last_web_login, flags, discriminator, avatar,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        userId,
        profile.username,
        profile.email,
        profile.lastWebLogin,
        profile.flags,
        profile.discriminator,
        profile.avatar,
        occurredAt,
        occurredAt,
      )
      .run();

    await expect(repository.getProfile(userId)).resolves.toEqual({
      status: "found",
      profile,
    });
  });

  it("upserts a profile and records its receipt atomically", async () => {
    const repository = new D1UserRepository(dataEnv.DATA);

    await expect(
      repository.upsertProfile({
        userId,
        profile,
        mutationId: "user-profile-100000000000000020",
        occurredAt,
      }),
    ).resolves.toEqual({ status: "applied", profile });
    await expect(repository.getProfile(userId)).resolves.toEqual({
      status: "found",
      profile,
    });

    const receipt = await dataEnv.DATA.prepare(
      `SELECT entity_type, entity_key, operation, payload_json, occurred_at
       FROM mutation_receipts`,
    ).first();
    expect(receipt).toEqual({
      entity_type: "user",
      entity_key: userId,
      operation: "upsert",
      payload_json: JSON.stringify(profile),
      occurred_at: occurredAt,
    });
  });

  it("deduplicates identical retries and rejects mutation-id conflicts", async () => {
    const repository = new D1UserRepository(dataEnv.DATA);
    const input = {
      userId,
      profile,
      mutationId: "user-profile-100000000000000021",
      occurredAt,
    };

    await expect(repository.upsertProfile(input)).resolves.toEqual({
      status: "applied",
      profile,
    });
    await expect(repository.upsertProfile(input)).resolves.toEqual({
      status: "existing",
      profile,
    });
    await expect(
      repository.upsertProfile({
        ...input,
        profile: { ...profile, username: "changed" },
      }),
    ).resolves.toEqual({ status: "conflict" });

    const count = await dataEnv.DATA.prepare(
      "SELECT COUNT(*) AS count FROM mutation_receipts",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("rejects malformed profile input", async () => {
    const repository = new D1UserRepository(dataEnv.DATA);

    await expect(repository.getProfile("not-a-snowflake")).rejects.toThrow(
      "User id is invalid",
    );
    await expect(
      repository.upsertProfile({
        userId,
        profile: { ...profile, username: "x".repeat(256) },
        mutationId: "user-profile-100000000000000022",
        occurredAt,
      }),
    ).rejects.toThrow("User profile is invalid");
  });
});
