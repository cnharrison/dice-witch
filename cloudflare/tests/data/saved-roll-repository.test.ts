import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1SavedRollRepository } from "../../workers/data/src/saved-roll-repository";

const dataEnv = env as unknown as { DATA: D1Database; TEST_MIGRATIONS: D1Migration[] };
const userId = "100000000000000003";
const guildId = "100000000000000002";
const timestamp = 1_767_225_600_123;
const draft = { version: 1, name: "Fireball", notation: "8d6", title: null, repetitions: 1 } as const;
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

beforeEach(async () => {
  await applyD1Migrations(dataEnv.DATA, dataEnv.TEST_MIGRATIONS);
  await dataEnv.DATA.batch([
    dataEnv.DATA.prepare("DELETE FROM saved_rolls"),
    dataEnv.DATA.prepare("DELETE FROM guild_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM user_saved_roll_lists"),
    dataEnv.DATA.prepare("DELETE FROM mutation_receipts"),
    dataEnv.DATA.prepare("DELETE FROM users_guilds"),
    dataEnv.DATA.prepare("DELETE FROM users"),
    dataEnv.DATA.prepare("DELETE FROM guilds"),
  ]);
  await dataEnv.DATA.prepare(
    `INSERT INTO users (id, username, email, last_web_login, flags, discriminator, roll_count, created_at, updated_at)
     VALUES (?, 'witch', 'witch@example.com', ?, 0, '0', 0, ?, ?)`,
  ).bind(userId, timestamp, timestamp, timestamp).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO guilds (id, name, owner_id, joined_timestamp, created_at, updated_at)
     VALUES (?, 'Guild', ?, ?, ?, ?)`,
  ).bind(guildId, userId, timestamp, timestamp, timestamp).run();
  await dataEnv.DATA.prepare(
    `INSERT INTO users_guilds (
       user_id, guild_id, is_admin, is_dice_witch_admin, created_at, updated_at
     ) VALUES (?, ?, 1, 0, ?, ?)`,
  ).bind(userId, guildId, timestamp, timestamp).run();
});

function repository() {
  return new D1SavedRollRepository(dataEnv.DATA);
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    owner: { type: "user" as const, userId },
    actorUserId: userId,
    authorizationUpdatedAt: null,
    operation: "create" as const,
    id: id(1),
    expectedListRevision: 0,
    draft,
    pinned: false,
    mutationId: "create-1",
    occurredAt: timestamp,
    ...overrides,
  };
}

describe("D1SavedRollRepository user prerequisite", () => {
  it("creates missing users without overwriting an existing OAuth profile", async () => {
    const missingUserId = "100000000000000099";
    await expect(
      repository().ensureUser(missingUserId, "new-user", timestamp + 1),
    ).resolves.toEqual({ status: "applied" });
    await expect(
      repository().ensureUser(userId, "changed-name", timestamp + 1),
    ).resolves.toEqual({ status: "existing" });

    expect(
      await dataEnv.DATA.prepare(
        "SELECT username, email FROM users WHERE id = ?",
      )
        .bind(missingUserId)
        .first(),
    ).toEqual({ username: "new-user", email: null });
    expect(
      await dataEnv.DATA.prepare(
        "SELECT username, email FROM users WHERE id = ?",
      )
        .bind(userId)
        .first(),
    ).toEqual({ username: "witch", email: "witch@example.com" });
  });
});

describe("D1SavedRollRepository create/read", () => {
  it("creates, lists, and gets a personal saved roll", async () => {
    const created = await repository().create(createInput());
    expect(created).toMatchObject({ status: "applied", listRevision: 1 });
    if (created.status !== "applied") throw new Error("expected applied");
    expect(created.savedRoll).toMatchObject({
      id: id(1),
      owner: { type: "user", userId },
      displayName: "Fireball",
      comparisonKey: "fireball",
      manualOrder: 0,
      revision: 1,
    });
    await expect(repository().list({ type: "user", userId })).resolves.toEqual({
      status: "found",
      listRevision: 1,
      savedRolls: [created.savedRoll],
    });
    await expect(repository().get({ type: "user", userId }, id(1))).resolves.toEqual({
      status: "found",
      savedRoll: created.savedRoll,
    });
  });

  it("persists and copies V2 roll-name colors without affecting V1 defaults", async () => {
    const coloredDraft = {
      version: 2 as const,
      name: "Fireball",
      nameColor: "#A1B2C3",
      notation: "8d6",
      title: null,
      repetitions: 1,
    };
    const created = await repository().create(createInput({ draft: coloredDraft }));
    expect(created).toMatchObject({
      status: "applied",
      savedRoll: { version: 1, nameColor: "#A1B2C3" },
    });

    const copied = await repository().create(createInput({
      owner: { type: "guild", guildId },
      authorizationUpdatedAt: timestamp,
      operation: "copy",
      id: id(2),
      draft: { ...coloredDraft, name: "Fireball copy" },
      mutationId: "copy-colored",
    }));
    expect(copied).toMatchObject({
      status: "applied",
      savedRoll: { nameColor: "#A1B2C3" },
    });

    const uncolored = await repository().create(createInput({
      id: id(3),
      expectedListRevision: 1,
      draft: { ...draft, name: "Legacy" },
      mutationId: "create-v1",
    }));
    expect(uncolored).toMatchObject({
      status: "applied",
      savedRoll: { nameColor: null },
    });
  });

  it("keeps personal and guild records query-scoped", async () => {
    await repository().create(createInput());
    const guildCreate = await repository().create(createInput({
      owner: { type: "guild" as const, guildId },
      authorizationUpdatedAt: timestamp,
      id: id(2),
      mutationId: "guild-create",
    }));
    expect(guildCreate.status).toBe("applied");
    await expect(repository().get({ type: "guild", guildId }, id(1))).resolves.toEqual({ status: "missing" });
    await expect(repository().get({ type: "user", userId }, id(2))).resolves.toEqual({ status: "missing" });
  });

  it("binds personal actors and guild authorization proofs", async () => {
    const otherUserId = "100000000000000004";
    await dataEnv.DATA.prepare(
      `INSERT INTO users (
         id, username, email, last_web_login, flags, discriminator,
         roll_count, created_at, updated_at
       ) VALUES (?, 'other', 'other@example.com', ?, 0, '0', 0, ?, ?)`,
    ).bind(otherUserId, timestamp, timestamp, timestamp).run();

    await expect(repository().create(createInput({
      actorUserId: otherUserId,
    }))).rejects.toThrow("Saved roll personal actor is invalid");
    await expect(repository().create(createInput({
      owner: { type: "guild", guildId },
      authorizationUpdatedAt: timestamp + 1,
    }))).resolves.toEqual({ status: "unauthorized" });
  });

  it("replays an identical mutation and rejects mutation reuse", async () => {
    expect((await repository().create(createInput())).status).toBe("applied");
    expect((await repository().create(createInput())).status).toBe("existing");
    expect((await repository().create(createInput({ id: id(2) }))).status).toBe("mutation_conflict");
  });

  it("replays a guild mutation after its authorization proof is refreshed", async () => {
    const input = createInput({
      owner: { type: "guild", guildId },
      authorizationUpdatedAt: timestamp,
      mutationId: "guild-replay",
    });
    expect((await repository().create(input)).status).toBe("applied");
    await dataEnv.DATA.prepare(
      `UPDATE users_guilds SET updated_at = ?
       WHERE user_id = ? AND guild_id = ?`,
    ).bind(timestamp + 1, userId, guildId).run();
    await expect(repository().create({
      ...input,
      authorizationUpdatedAt: timestamp + 1,
    })).resolves.toMatchObject({ status: "existing" });

    await dataEnv.DATA.prepare(
      `UPDATE users_guilds
       SET is_admin = 0, is_dice_witch_admin = 0, updated_at = ?
       WHERE user_id = ? AND guild_id = ?`,
    ).bind(timestamp + 2, userId, guildId).run();
    await expect(repository().create(createInput({
      owner: { type: "guild", guildId },
      authorizationUpdatedAt: timestamp + 1,
      id: id(2),
      expectedListRevision: 1,
      draft: { ...draft, name: "Ice" },
      mutationId: "guild-after-revocation",
    }))).resolves.toEqual({ status: "unauthorized" });
  });

  it("enforces comparison-name uniqueness without consuming a revision", async () => {
    await repository().create(createInput());
    const duplicate = await repository().create(createInput({
      id: id(2),
      expectedListRevision: 1,
      draft: { ...draft, name: "ＦＩＲＥＢＡＬＬ" },
      mutationId: "create-2",
    }));
    expect(duplicate).toEqual({ status: "name_conflict", listRevision: 1 });
  });

  it("discovers non-empty member libraries and searches only authorized owners", async () => {
    await repository().create(createInput());
    await repository().create(
      createInput({
        owner: { type: "guild", guildId },
        authorizationUpdatedAt: timestamp,
        id: id(2),
        draft: { ...draft, name: "Guild Ice", notation: "2d8" },
        mutationId: "guild-create-1",
      }),
    );
    await dataEnv.DATA.prepare(
      `UPDATE users_guilds
       SET is_admin = 0, is_dice_witch_admin = 0
       WHERE user_id = ? AND guild_id = ?`,
    ).bind(userId, guildId).run();

    await expect(repository().listLibraryCandidates(userId)).resolves.toEqual([
      { guildId, guildName: "Guild", guildIcon: null },
    ]);
    await expect(
      repository().search({
        userId,
        guildIds: [guildId],
        query: "guild",
        offset: 0,
        sort: "name",
        direction: "asc",
      }),
    ).resolves.toMatchObject({
      status: "found",
      hasMore: false,
      entries: [
        {
          listRevision: 1,
          guildName: "Guild",
          savedRoll: { id: id(2), owner: { type: "guild", guildId } },
        },
      ],
    });
    await expect(
      repository().search({
        userId,
        guildIds: [],
        query: "guild",
        offset: 0,
        sort: "name",
        direction: "asc",
      }),
    ).resolves.toMatchObject({ entries: [] });
  });

  it("allows only one concurrent writer for an expected list revision", async () => {
    const [left, right] = await Promise.all([
      repository().create(createInput()),
      repository().create(createInput({ id: id(2), draft: { ...draft, name: "Ice" }, mutationId: "create-2" })),
    ]);
    expect([left.status, right.status].sort()).toEqual(["applied", "list_revision_conflict"]);
  });

  it("enforces the personal cap atomically", async () => {
    for (let index = 0; index < 50; index += 1) {
      const result = await repository().create(createInput({
        id: id(index + 1),
        expectedListRevision: index,
        draft: { ...draft, name: `Roll ${index}` },
        mutationId: `create-${index}`,
      }));
      expect(["applied", "existing"]).toContain(result.status);
    }
    await expect(repository().create(createInput({
      id: id(51),
      expectedListRevision: 50,
      draft: { ...draft, name: "One too many" },
      mutationId: "create-51",
    }))).resolves.toEqual({ status: "cap_reached", listRevision: 50, limit: 50 });
  });
});

describe("D1SavedRollRepository mutations", () => {
  async function createTwo() {
    await repository().create(createInput());
    await repository().create(createInput({
      id: id(2),
      expectedListRevision: 1,
      draft: { ...draft, name: "Ice", notation: "2d8" },
      mutationId: "create-2",
    }));
  }

  it("updates content while keeping the retired pin state inert", async () => {
    await createTwo();
    const input = {
      owner: { type: "user" as const, userId },
      actorUserId: userId,
      authorizationUpdatedAt: null,
      id: id(1),
      expectedListRevision: 2,
      expectedRecordRevision: 1,
      draft: { ...draft, name: "Greater Fireball", notation: "10d6" },
      pinned: true,
      mutationId: "update-1",
      occurredAt: timestamp + 1,
    };
    expect(await repository().update(input)).toEqual({
      status: "applied",
      listRevision: 3,
      recordRevision: 2,
    });
    expect(await repository().update(input)).toEqual({
      status: "existing",
      listRevision: 3,
      recordRevision: 2,
    });
    const found = await repository().get({ type: "user", userId }, id(1));
    expect(found).toMatchObject({
      status: "found",
      savedRoll: {
        displayName: "Greater Fireball",
        notation: "10d6",
        pinned: false,
        revision: 2,
      },
    });
  });

  it("rejects stale and duplicate-name updates without changing data", async () => {
    await createTwo();
    const base = {
      owner: { type: "user" as const, userId },
      actorUserId: userId,
      authorizationUpdatedAt: null,
      id: id(1),
      expectedListRevision: 2,
      expectedRecordRevision: 1,
      draft,
      pinned: false,
      mutationId: "update-1",
      occurredAt: timestamp + 1,
    };
    await expect(repository().update({ ...base, expectedListRevision: 1 })).resolves.toEqual({
      status: "list_revision_conflict",
      listRevision: 2,
    });
    await expect(repository().update({
      ...base,
      draft: { ...draft, name: "ICE" },
    })).resolves.toEqual({ status: "name_conflict", listRevision: 2 });
  });

  it("deletes only an owner-scoped record and replays idempotently", async () => {
    await createTwo();
    const input = {
      owner: { type: "user" as const, userId },
      actorUserId: userId,
      authorizationUpdatedAt: null,
      id: id(1),
      expectedListRevision: 2,
      expectedRecordRevision: 1,
      mutationId: "delete-1",
      occurredAt: timestamp + 1,
    };
    expect(await repository().delete(input)).toEqual({
      status: "applied",
      listRevision: 3,
    });
    expect(await repository().delete(input)).toEqual({
      status: "existing",
      listRevision: 3,
    });
    await expect(repository().get({ type: "user", userId }, id(1))).resolves.toEqual({ status: "missing" });
  });

  it("deletes a selected record set atomically and rejects any stale member", async () => {
    await createTwo();
    const base = {
      owner: { type: "user" as const, userId },
      actorUserId: userId,
      authorizationUpdatedAt: null,
      expectedListRevision: 2,
      occurredAt: timestamp + 1,
    };
    await expect(repository().deleteBatch({
      ...base,
      records: [
        { id: id(1), revision: 1 },
        { id: id(2), revision: 2 },
      ],
      mutationId: "delete-batch-stale",
    })).resolves.toEqual({ status: "record_set_conflict", listRevision: 2 });
    const unchanged = await repository().list({ type: "user", userId });
    expect(
      unchanged.status === "found" &&
        unchanged.savedRolls.map((roll) => roll.id),
    ).toEqual([id(1), id(2)]);

    const input = {
      ...base,
      records: [
        { id: id(1), revision: 1 },
        { id: id(2), revision: 1 },
      ],
      mutationId: "delete-batch-1",
    };
    await expect(repository().deleteBatch(input)).resolves.toEqual({
      status: "applied",
      listRevision: 3,
    });
    await expect(repository().deleteBatch(input)).resolves.toEqual({
      status: "existing",
      listRevision: 3,
    });
    await expect(repository().list({ type: "user", userId })).resolves.toEqual({
      status: "found",
      listRevision: 3,
      savedRolls: [],
    });
  });

  it("reorders the complete owner list and rejects stale reorder attempts", async () => {
    await createTwo();
    const input = {
      owner: { type: "user" as const, userId },
      actorUserId: userId,
      authorizationUpdatedAt: null,
      expectedListRevision: 2,
      orderedIds: [id(2), id(1)],
      mutationId: "reorder-1",
      occurredAt: timestamp + 1,
    };
    expect(await repository().reorder(input)).toEqual({
      status: "applied",
      listRevision: 3,
    });
    const listed = await repository().list({ type: "user", userId });
    expect(listed.status === "found" && listed.savedRolls.map((roll) => roll.id)).toEqual([id(2), id(1)]);
    expect(
      listed.status === "found" &&
        listed.savedRolls.map(({ updatedAt }) => updatedAt),
    ).toEqual([timestamp, timestamp]);
    await expect(repository().reorder({
      ...input,
      expectedListRevision: 2,
      mutationId: "reorder-stale",
    })).resolves.toEqual({ status: "list_revision_conflict", listRevision: 3 });
  });

  it("allows an empty owner to establish an explicit list revision", async () => {
    const input = {
      owner: { type: "user" as const, userId },
      actorUserId: userId,
      authorizationUpdatedAt: null,
      expectedListRevision: 0,
      orderedIds: [],
      mutationId: "reorder-empty",
      occurredAt: timestamp + 1,
    };
    await expect(repository().reorder(input)).resolves.toEqual({
      status: "applied",
      listRevision: 1,
    });
    await expect(repository().reorder(input)).resolves.toEqual({
      status: "existing",
      listRevision: 1,
    });
  });

  it("requires reorder to include every record exactly once", async () => {
    await createTwo();
    await expect(repository().reorder({
      owner: { type: "user", userId },
      actorUserId: userId,
      authorizationUpdatedAt: null,
      expectedListRevision: 2,
      orderedIds: [id(1)],
      mutationId: "reorder-incomplete",
      occurredAt: timestamp + 1,
    })).resolves.toEqual({ status: "record_set_conflict", listRevision: 2 });
  });
});
