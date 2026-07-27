import {
  parseSavedRollDraftV1,
  parseSavedRollDraftV2,
  parseSavedRollNameColorV2,
  type SavedRollDraftV1,
  type SavedRollDraftV2,
} from "../../../packages/saved-rolls/src";
import {
  matchesMutationReceipt,
  readMutationReceipt,
  validateMutationMetadata,
  validateSnowflake,
  type MutationReceipt,
  type MutationReceiptRow,
} from "./mutation-receipt";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PERSONAL_LIMIT = 50;
const GUILD_LIMIT = 100;
const MAX_MUTUAL_GUILDS = 200;
const SEARCH_PAGE_SIZE = 50;

export type SavedRollOwner =
  | { type: "user"; userId: string }
  | { type: "guild"; guildId: string };

type SavedRollDraft = SavedRollDraftV1 | SavedRollDraftV2;

export type SavedRollV1 = Omit<SavedRollDraftV1, "version"> & {
  version: 1;
  nameColor: string | null;
  id: string;
  owner: SavedRollOwner;
  pinned: boolean;
  manualOrder: number;
  revision: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateSavedRollInputV1 = {
  owner: SavedRollOwner;
  actorUserId: string;
  authorizationUpdatedAt: number | null;
  operation: "create" | "copy";
  id: string;
  expectedListRevision: number;
  draft: unknown;
  pinned: boolean;
  mutationId: string;
  occurredAt: number;
};

export type CreateSavedRollResultV1 =
  | {
      status: "applied" | "existing";
      listRevision: number;
      savedRoll: SavedRollV1;
    }
  | { status: "missing" | "mutation_conflict" | "unauthorized" }
  | { status: "list_revision_conflict"; listRevision: number }
  | { status: "name_conflict"; listRevision: number }
  | { status: "cap_reached"; listRevision: number; limit: number };

export type UpdateSavedRollInputV1 = {
  owner: SavedRollOwner;
  actorUserId: string;
  authorizationUpdatedAt: number | null;
  id: string;
  expectedListRevision: number;
  expectedRecordRevision: number;
  draft: unknown;
  pinned: boolean;
  mutationId: string;
  occurredAt: number;
};

export type DeleteSavedRollInputV1 = Omit<
  UpdateSavedRollInputV1,
  "draft" | "pinned"
>;

export type DeleteSavedRollBatchInputV2 = Omit<
  DeleteSavedRollInputV1,
  "id" | "expectedRecordRevision"
> & {
  records: readonly { id: string; revision: number }[];
};

export type ReorderSavedRollsInputV1 = {
  owner: SavedRollOwner;
  actorUserId: string;
  authorizationUpdatedAt: number | null;
  expectedListRevision: number;
  orderedIds: readonly string[];
  mutationId: string;
  occurredAt: number;
};

export type UpdateSavedRollResultV1 =
  | {
      status: "applied" | "existing";
      listRevision: number;
      recordRevision: number;
    }
  | { status: "missing" | "mutation_conflict" | "unauthorized" }
  | { status: "list_revision_conflict"; listRevision: number }
  | { status: "record_revision_conflict"; recordRevision: number }
  | { status: "name_conflict"; listRevision: number };

export type ListMutationResultV1 =
  | { status: "applied" | "existing"; listRevision: number }
  | { status: "missing" | "mutation_conflict" | "unauthorized" }
  | { status: "list_revision_conflict"; listRevision: number }
  | { status: "record_revision_conflict"; recordRevision: number }
  | { status: "record_set_conflict"; listRevision: number };

export type SavedRollListResultV1 =
  | { status: "missing" }
  | {
      status: "found";
      listRevision: number;
      savedRolls: SavedRollV1[];
    };

export type SavedRollGetResultV1 =
  | { status: "missing" }
  | { status: "found"; savedRoll: SavedRollV1 };

export type SavedRollLibraryCandidateV1 = {
  guildId: string;
  guildName: string;
  guildIcon: string | null;
};

export type SavedRollSearchSortV1 = "name" | "roll" | "created" | "updated";

export type SearchSavedRollsInputV1 = {
  userId: string;
  guildIds: readonly string[];
  query: string;
  offset: number;
  sort: SavedRollSearchSortV1;
  direction: "asc" | "desc";
};

export type SavedRollSearchEntryV1 = {
  savedRoll: SavedRollV1;
  listRevision: number;
  guildName: string | null;
  guildIcon: string | null;
};

export type SavedRollSearchResultV1 = {
  status: "found";
  entries: SavedRollSearchEntryV1[];
  hasMore: boolean;
  total: number;
};

type OwnerSql = {
  type: "user" | "guild";
  ownerId: string;
  ownerColumn: "user_id" | "guild_id";
  otherOwnerColumn: "guild_id" | "user_id";
  parentTable: "users" | "guilds";
  listTable: "user_saved_roll_lists" | "guild_saved_roll_lists";
  listKey: "user_id" | "guild_id";
  limit: number;
};

type SavedRollRow = {
  id: string;
  user_id: string | null;
  guild_id: string | null;
  display_name: string;
  comparison_key: string;
  notation: string;
  title: string | null;
  repetitions: number;
  name_color: string | null;
  pinned: number;
  manual_order: number;
  revision: number;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: number;
  updated_at: number;
};

type SavedRollLibraryRow = {
  guild_id: string;
  guild_name: string | null;
  guild_icon: string | null;
};

type SavedRollSearchRow = SavedRollRow & {
  list_revision: number;
  guild_name: string | null;
  guild_icon: string | null;
  total_count: number;
};

type OwnerState = {
  exists: boolean;
  listRevision: number;
  count: number;
  maxOrder: number;
  nameExists: boolean;
};

function ownerSql(owner: SavedRollOwner): OwnerSql {
  if (owner.type === "user") {
    return {
      type: "user",
      ownerId: validateSnowflake(owner.userId, "Saved roll user id"),
      ownerColumn: "user_id",
      otherOwnerColumn: "guild_id",
      parentTable: "users",
      listTable: "user_saved_roll_lists",
      listKey: "user_id",
      limit: PERSONAL_LIMIT,
    };
  }
  return {
    type: "guild",
    ownerId: validateSnowflake(owner.guildId, "Saved roll guild id"),
    ownerColumn: "guild_id",
    otherOwnerColumn: "user_id",
    parentTable: "guilds",
    listTable: "guild_saved_roll_lists",
    listKey: "guild_id",
    limit: GUILD_LIMIT,
  };
}

function validateId(value: string): string {
  if (!UUID_V4.test(value)) throw new Error("Saved roll id is invalid");
  return value;
}

function validateRevision(value: number, name: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function validateTimestamp(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} is invalid`);
  return value;
}

type MutationAuthorization = {
  predicate: string;
  bindings: readonly (number | string)[];
  updatedAt: number | null;
};

function mutationAuthorization(
  sql: OwnerSql,
  actorUserId: string,
  authorizationUpdatedAt: number | null,
): MutationAuthorization {
  if (sql.type === "user") {
    if (actorUserId !== sql.ownerId || authorizationUpdatedAt !== null) {
      throw new Error("Saved roll personal actor is invalid");
    }
    return { predicate: "1 = 1", bindings: [], updatedAt: null };
  }
  if (authorizationUpdatedAt === null) {
    throw new Error("Saved roll guild authorization is invalid");
  }
  const updatedAt = validateTimestamp(
    authorizationUpdatedAt,
    "Saved roll guild authorization timestamp",
  );
  return {
    predicate: `EXISTS (
      SELECT 1 FROM users_guilds
      WHERE user_id = ? AND guild_id = ? AND updated_at >= ?
        AND (is_admin = 1 OR is_dice_witch_admin = 1)
    )`,
    bindings: [actorUserId, sql.ownerId, updatedAt],
    updatedAt,
  };
}

function parseDraft(value: unknown): SavedRollDraft {
  if (typeof value === "object" && value !== null && "version" in value) {
    if (value.version === 2) return parseSavedRollDraftV2(value);
  }
  return parseSavedRollDraftV1(value);
}

function draftNameColor(draft: SavedRollDraft): string | null {
  return draft.version === 2 ? draft.nameColor : null;
}

function savedRollFromRow(row: SavedRollRow): SavedRollV1 {
  let owner: SavedRollOwner;
  if (row.user_id !== null && row.guild_id === null) {
    owner = {
      type: "user",
      userId: validateSnowflake(row.user_id, "Stored saved roll user id"),
    };
  } else if (row.guild_id !== null && row.user_id === null) {
    owner = {
      type: "guild",
      guildId: validateSnowflake(row.guild_id, "Stored saved roll guild id"),
    };
  } else {
    throw new Error("Stored saved roll owner is invalid");
  }
  const draft = parseSavedRollDraftV1({
    version: 1,
    name: row.display_name,
    notation: row.notation,
    title: row.title,
    repetitions: row.repetitions,
  });
  const nameColor = parseSavedRollNameColorV2(row.name_color);
  if (draft.comparisonKey !== row.comparison_key) {
    throw new Error("Stored saved roll comparison key is invalid");
  }
  if (row.pinned !== 0 && row.pinned !== 1) {
    throw new Error("Stored saved roll pinned state is invalid");
  }
  return {
    ...draft,
    nameColor,
    id: validateId(row.id),
    owner,
    pinned: row.pinned === 1,
    manualOrder: validateRevision(row.manual_order, "Stored saved roll order", 0),
    revision: validateRevision(row.revision, "Stored saved roll revision", 1),
    createdByUserId: validateSnowflake(row.created_by_user_id, "Stored saved roll creator id"),
    updatedByUserId: validateSnowflake(row.updated_by_user_id, "Stored saved roll editor id"),
    createdAt: validateTimestamp(row.created_at, "Stored saved roll creation timestamp"),
    updatedAt: validateTimestamp(row.updated_at, "Stored saved roll update timestamp"),
  };
}

function createdSavedRoll(
  sql: OwnerSql,
  input: CreateSavedRollInputV1,
  draft: SavedRollDraft,
  manualOrder: number,
): SavedRollV1 {
  return {
    ...draft,
    version: 1,
    nameColor: draftNameColor(draft),
    id: input.id,
    owner: sql.type === "user"
      ? { type: "user", userId: sql.ownerId }
      : { type: "guild", guildId: sql.ownerId },
    pinned: false,
    manualOrder,
    revision: 1,
    createdByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
}

function existingCreateResult(
  row: MutationReceiptRow,
  receipt: MutationReceipt,
  savedRoll: SavedRollV1,
  listRevision: number,
): CreateSavedRollResultV1 {
  return matchesMutationReceipt(row, receipt)
    ? { status: "existing", listRevision, savedRoll }
    : { status: "mutation_conflict" };
}

export class D1SavedRollRepository {
  constructor(private readonly db: D1Database) {}

  async ensureUser(
    userIdValue: string,
    username: string,
    occurredAt: number,
  ): Promise<{ status: "applied" | "existing" }> {
    const userId = validateSnowflake(userIdValue, "User id");
    if (
      username.length < 1 ||
      username.length > 32 ||
      !Number.isSafeInteger(occurredAt) ||
      occurredAt < 0
    ) {
      throw new Error("Saved roll user is invalid");
    }
    const result = await this.db
      .prepare(
        `INSERT OR IGNORE INTO users (
           id, username, created_at, updated_at
         ) VALUES (?, ?, ?, ?)`,
      )
      .bind(userId, username, occurredAt, occurredAt)
      .run();
    return { status: result.meta.changes === 1 ? "applied" : "existing" };
  }

  async listLibraryCandidates(
    userIdValue: string,
  ): Promise<SavedRollLibraryCandidateV1[]> {
    const userId = validateSnowflake(userIdValue, "Saved roll user id");
    const rows = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT g.id AS guild_id, g.name AS guild_name, g.icon AS guild_icon
         FROM users_guilds AS membership
         JOIN guilds AS g ON g.id = membership.guild_id
         WHERE membership.user_id = ?
           AND g.is_active = 1
           AND EXISTS (
             SELECT 1 FROM saved_rolls WHERE guild_id = g.id
           )
         ORDER BY lower(g.name), g.id
         LIMIT ?`,
      )
      .bind(userId, MAX_MUTUAL_GUILDS + 1)
      .all<SavedRollLibraryRow>();
    if (rows.results.length > MAX_MUTUAL_GUILDS) {
      throw new Error("Saved roll library candidate limit exceeded");
    }
    return rows.results.map((row) => {
      if (
        row.guild_name === null ||
        row.guild_name.length < 1 ||
        row.guild_name.length > 255
      ) {
        throw new Error("Stored saved roll guild name is invalid");
      }
      return {
        guildId: validateSnowflake(row.guild_id, "Stored saved roll guild id"),
        guildName: row.guild_name,
        guildIcon: row.guild_icon,
      };
    });
  }

  async search(input: SearchSavedRollsInputV1): Promise<SavedRollSearchResultV1> {
    const userId = validateSnowflake(input.userId, "Saved roll user id");
    if (
      input.guildIds.length > MAX_MUTUAL_GUILDS ||
      new Set(input.guildIds).size !== input.guildIds.length
    ) {
      throw new Error("Saved roll search guild ids are invalid");
    }
    const guildIds = input.guildIds.map((guildId) =>
      validateSnowflake(guildId, "Saved roll search guild id"),
    );
    if (
      input.query.length < 2 ||
      input.query.length > 128 ||
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      input.offset > 20_000
    ) {
      throw new Error("Saved roll search input is invalid");
    }
    const guildPredicate = guildIds.length === 0
      ? "0 = 1"
      : `roll.guild_id IN (${guildIds.map(() => "?").join(", ")})`;
    const orderColumn = {
      name: "roll.comparison_key",
      roll: "roll.notation",
      created: "roll.created_at",
      updated: "roll.updated_at",
    }[input.sort];
    const normalizedQuery = input.query.toLowerCase();
    const rows = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT roll.*,
                COUNT(*) OVER() AS total_count,
                COALESCE(user_list.revision, guild_list.revision, 0) AS list_revision,
                guild.name AS guild_name,
                guild.icon AS guild_icon
         FROM saved_rolls AS roll
         LEFT JOIN guilds AS guild ON guild.id = roll.guild_id
         LEFT JOIN user_saved_roll_lists AS user_list
           ON user_list.user_id = roll.user_id
         LEFT JOIN guild_saved_roll_lists AS guild_list
           ON guild_list.guild_id = roll.guild_id
         WHERE (roll.user_id = ? OR ${guildPredicate})
           AND (
             instr(lower(roll.display_name), ?) > 0
             OR instr(lower(roll.notation), ?) > 0
             OR instr(lower(COALESCE(roll.title, '')), ?) > 0
             OR instr(lower(COALESCE(guild.name, '')), ?) > 0
           )
         ORDER BY ${orderColumn} ${input.direction.toUpperCase()}, roll.id ${input.direction.toUpperCase()}
         LIMIT ? OFFSET ?`,
      )
      .bind(
        userId,
        ...guildIds,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        normalizedQuery,
        SEARCH_PAGE_SIZE + 1,
        input.offset,
      )
      .all<SavedRollSearchRow>();
    return {
      status: "found",
      entries: rows.results.slice(0, SEARCH_PAGE_SIZE).map((row) => ({
        savedRoll: savedRollFromRow(row),
        listRevision: validateRevision(
          row.list_revision,
          "Stored saved roll list revision",
          0,
        ),
        guildName: row.guild_name,
        guildIcon: row.guild_icon,
      })),
      hasMore: rows.results.length > SEARCH_PAGE_SIZE,
      total: validateRevision(
        rows.results[0]?.total_count ?? 0,
        "Stored saved roll search total",
        0,
      ),
    };
  }

  async list(owner: SavedRollOwner): Promise<SavedRollListResultV1> {
    const sql = ownerSql(owner);
    const state = await this.ownerState(sql, "");
    if (!state.exists) return { status: "missing" };
    const rows = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT * FROM saved_rolls
         WHERE ${sql.ownerColumn} = ? AND ${sql.otherOwnerColumn} IS NULL
         ORDER BY manual_order, id`,
      )
      .bind(sql.ownerId)
      .all<SavedRollRow>();
    return {
      status: "found",
      listRevision: state.listRevision,
      savedRolls: rows.results.map(savedRollFromRow),
    };
  }

  async get(owner: SavedRollOwner, idValue: string): Promise<SavedRollGetResultV1> {
    const sql = ownerSql(owner);
    const id = validateId(idValue);
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT * FROM saved_rolls
         WHERE id = ? AND ${sql.ownerColumn} = ? AND ${sql.otherOwnerColumn} IS NULL`,
      )
      .bind(id, sql.ownerId)
      .first<SavedRollRow>();
    return row === null ? { status: "missing" } : { status: "found", savedRoll: savedRollFromRow(row) };
  }

  async create(input: CreateSavedRollInputV1): Promise<CreateSavedRollResultV1> {
    const sql = ownerSql(input.owner);
    const actorUserId = validateSnowflake(input.actorUserId, "Saved roll actor id");
    const authorization = mutationAuthorization(
      sql,
      actorUserId,
      input.authorizationUpdatedAt,
    );
    const id = validateId(input.id);
    const expectedListRevision = validateRevision(
      input.expectedListRevision,
      "Expected saved roll list revision",
      0,
    );
    if (typeof input.pinned !== "boolean") throw new Error("Saved roll pinned state is invalid");
    validateMutationMetadata(input.mutationId, input.occurredAt);
    const draft = parseDraft(input.draft);
    const existing = await readMutationReceipt(this.db, input.mutationId);
    if (existing !== null) {
      let manualOrder: number;
      try {
        const payload = JSON.parse(existing.payload_json) as { manualOrder?: unknown };
        manualOrder = validateRevision(
          payload.manualOrder as number,
          "Stored saved roll mutation order",
          0,
        );
      } catch {
        return { status: "mutation_conflict" };
      }
      const savedRoll = createdSavedRoll(
        sql,
        { ...input, id, actorUserId, expectedListRevision },
        draft,
        manualOrder,
      );
      const receipt: MutationReceipt = {
        entityType: sql.type,
        entityKey: sql.ownerId,
        operation: "upsert",
        payloadJson: JSON.stringify({
          actorUserId,
          draft,
          expectedListRevision,
          id,
          manualOrder,
          operation: input.operation,
          owner: savedRoll.owner,
          pinned: input.pinned,
        }),
        occurredAt: input.occurredAt,
      };
      return existingCreateResult(
        existing,
        receipt,
        savedRoll,
        expectedListRevision + 1,
      );
    }

    const before = await this.ownerState(sql, draft.comparisonKey);
    const manualOrder = before.maxOrder + 1;
    const savedRoll = createdSavedRoll(
      sql,
      { ...input, id, actorUserId, expectedListRevision },
      draft,
      manualOrder,
    );
    const payloadJson = JSON.stringify({
      actorUserId,
      draft,
      expectedListRevision,
      id,
      manualOrder,
      operation: input.operation,
      owner: savedRoll.owner,
      pinned: input.pinned,
    });
    const receipt: MutationReceipt = {
      entityType: sql.type,
      entityKey: sql.ownerId,
      operation: "upsert",
      payloadJson,
      occurredAt: input.occurredAt,
    };

    const receiptStatement = this.db.prepare(
      `INSERT INTO mutation_receipts (
         mutation_id, entity_type, entity_key, operation, payload_json, occurred_at
       )
       SELECT ?, ?, ?, 'upsert', ?, ?
       WHERE EXISTS (SELECT 1 FROM ${sql.parentTable} WHERE id = ?)
         AND EXISTS (SELECT 1 FROM users WHERE id = ?)
         AND ${authorization.predicate}
         AND COALESCE((SELECT revision FROM ${sql.listTable} WHERE ${sql.listKey} = ?), 0) = ?
         AND (SELECT COUNT(*) FROM saved_rolls WHERE ${sql.ownerColumn} = ?) < ?
         AND NOT EXISTS (
           SELECT 1 FROM saved_rolls
           WHERE ${sql.ownerColumn} = ? AND comparison_key = ?
         )`,
    ).bind(
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
      sql.ownerId,
      actorUserId,
      ...authorization.bindings,
      sql.ownerId,
      expectedListRevision,
      sql.ownerId,
      sql.limit,
      sql.ownerId,
      draft.comparisonKey,
    );
    const listStatement = this.db.prepare(
      `INSERT INTO ${sql.listTable} (${sql.listKey}, revision, updated_at)
       SELECT ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM mutation_receipts
         WHERE mutation_id = ? AND entity_type = ? AND entity_key = ?
           AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
       )
       ON CONFLICT(${sql.listKey}) DO UPDATE SET
         revision = excluded.revision,
         updated_at = excluded.updated_at
       WHERE ${sql.listTable}.revision = ?`,
    ).bind(
      sql.ownerId,
      expectedListRevision + 1,
      input.occurredAt,
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
      expectedListRevision,
    );
    const rollStatement = this.db.prepare(
      `INSERT INTO saved_rolls (
         id, user_id, guild_id, display_name, comparison_key, notation, title,
         repetitions, name_color, pinned, manual_order, revision, created_by_user_id,
         updated_by_user_id, created_at, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM mutation_receipts
         WHERE mutation_id = ? AND entity_type = ? AND entity_key = ?
           AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
       )
         AND EXISTS (
           SELECT 1 FROM ${sql.listTable}
           WHERE ${sql.listKey} = ? AND revision = ?
         )`,
    ).bind(
      id,
      sql.type === "user" ? sql.ownerId : null,
      sql.type === "guild" ? sql.ownerId : null,
      draft.displayName,
      draft.comparisonKey,
      draft.notation,
      draft.title,
      draft.repetitions,
      draftNameColor(draft),
      0,
      manualOrder,
      actorUserId,
      actorUserId,
      input.occurredAt,
      input.occurredAt,
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
      sql.ownerId,
      expectedListRevision + 1,
    );

    try {
      const results = await this.db.batch([receiptStatement, listStatement, rollStatement]);
      if (results.every((result) => result.meta.changes === 1)) {
        return { status: "applied", listRevision: expectedListRevision + 1, savedRoll };
      }
      if (results.some((result) => result.meta.changes !== 0)) {
        throw new Error("Saved roll creation was not atomic");
      }
    } catch (error) {
      const concurrent = await readMutationReceipt(this.db, input.mutationId);
      if (concurrent !== null) {
        return existingCreateResult(concurrent, receipt, savedRoll, expectedListRevision + 1);
      }
      throw error;
    }

    const concurrent = await readMutationReceipt(this.db, input.mutationId);
    if (concurrent !== null) {
      return existingCreateResult(concurrent, receipt, savedRoll, expectedListRevision + 1);
    }
    const current = await this.ownerState(sql, draft.comparisonKey);
    if (!current.exists) return { status: "missing" };
    if (!(await this.isMutationAuthorized(sql, actorUserId, authorization))) {
      return { status: "unauthorized" };
    }
    if (current.listRevision !== expectedListRevision) {
      return { status: "list_revision_conflict", listRevision: current.listRevision };
    }
    if (current.nameExists) {
      return { status: "name_conflict", listRevision: current.listRevision };
    }
    if (current.count >= sql.limit) {
      return { status: "cap_reached", listRevision: current.listRevision, limit: sql.limit };
    }
    throw new Error("Saved roll creation failed without a classified conflict");
  }

  async update(input: UpdateSavedRollInputV1): Promise<UpdateSavedRollResultV1> {
    const sql = ownerSql(input.owner);
    const actorUserId = validateSnowflake(input.actorUserId, "Saved roll actor id");
    const authorization = mutationAuthorization(
      sql,
      actorUserId,
      input.authorizationUpdatedAt,
    );
    const id = validateId(input.id);
    const expectedListRevision = validateRevision(
      input.expectedListRevision,
      "Expected saved roll list revision",
      0,
    );
    const expectedRecordRevision = validateRevision(
      input.expectedRecordRevision,
      "Expected saved roll record revision",
      1,
    );
    if (typeof input.pinned !== "boolean") {
      throw new Error("Saved roll pinned state is invalid");
    }
    validateMutationMetadata(input.mutationId, input.occurredAt);
    const draft = parseDraft(input.draft);
    const payloadJson = JSON.stringify({
      actorUserId,
      draft,
      expectedListRevision,
      expectedRecordRevision,
      id,
      operation: "update",
      owner: input.owner,
      pinned: input.pinned,
    });
    const receipt: MutationReceipt = {
      entityType: sql.type,
      entityKey: sql.ownerId,
      operation: "upsert",
      payloadJson,
      occurredAt: input.occurredAt,
    };
    const existing = await readMutationReceipt(this.db, input.mutationId);
    if (existing !== null) {
      return matchesMutationReceipt(existing, receipt)
        ? {
            status: "existing",
            listRevision: expectedListRevision + 1,
            recordRevision: expectedRecordRevision + 1,
          }
        : { status: "mutation_conflict" };
    }

    const receiptStatement = this.db.prepare(
      `INSERT INTO mutation_receipts (
         mutation_id, entity_type, entity_key, operation, payload_json, occurred_at
       )
       SELECT ?, ?, ?, 'upsert', ?, ?
       WHERE EXISTS (SELECT 1 FROM ${sql.parentTable} WHERE id = ?)
         AND EXISTS (SELECT 1 FROM users WHERE id = ?)
         AND ${authorization.predicate}
         AND COALESCE((SELECT revision FROM ${sql.listTable} WHERE ${sql.listKey} = ?), 0) = ?
         AND EXISTS (
           SELECT 1 FROM saved_rolls
           WHERE id = ? AND ${sql.ownerColumn} = ?
             AND ${sql.otherOwnerColumn} IS NULL AND revision = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM saved_rolls
           WHERE ${sql.ownerColumn} = ? AND comparison_key = ? AND id <> ?
         )`,
    ).bind(
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
      sql.ownerId,
      actorUserId,
      ...authorization.bindings,
      sql.ownerId,
      expectedListRevision,
      id,
      sql.ownerId,
      expectedRecordRevision,
      sql.ownerId,
      draft.comparisonKey,
      id,
    );
    const listStatement = this.listRevisionStatement(
      sql,
      receipt,
      input.mutationId,
      expectedListRevision,
      input.occurredAt,
    );
    const updateStatement = this.db.prepare(
      `UPDATE saved_rolls SET
         display_name = ?, comparison_key = ?, notation = ?, title = ?,
         repetitions = ?, name_color = ?, pinned = ?, revision = ?, updated_by_user_id = ?,
         updated_at = ?
       WHERE id = ? AND ${sql.ownerColumn} = ?
         AND ${sql.otherOwnerColumn} IS NULL AND revision = ?
         AND EXISTS (
           SELECT 1 FROM mutation_receipts
           WHERE mutation_id = ? AND entity_type = ? AND entity_key = ?
             AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
         )`,
    ).bind(
      draft.displayName,
      draft.comparisonKey,
      draft.notation,
      draft.title,
      draft.repetitions,
      draftNameColor(draft),
      0,
      expectedRecordRevision + 1,
      actorUserId,
      input.occurredAt,
      id,
      sql.ownerId,
      expectedRecordRevision,
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
    );

    const applied = await this.applyThreeStatementMutation(
      [receiptStatement, listStatement, updateStatement],
      input.mutationId,
      receipt,
    );
    if (applied === "applied" || applied === "existing") {
      return {
        status: applied,
        listRevision: expectedListRevision + 1,
        recordRevision: expectedRecordRevision + 1,
      };
    }
    if (applied === "mutation_conflict") return { status: applied };

    const state = await this.ownerState(sql, draft.comparisonKey);
    if (!state.exists) return { status: "missing" };
    if (!(await this.isMutationAuthorized(sql, actorUserId, authorization))) {
      return { status: "unauthorized" };
    }
    if (state.listRevision !== expectedListRevision) {
      return { status: "list_revision_conflict", listRevision: state.listRevision };
    }
    const current = await this.readOwnedRow(sql, id);
    if (current === null) return { status: "missing" };
    if (current.revision !== expectedRecordRevision) {
      return { status: "record_revision_conflict", recordRevision: current.revision };
    }
    if (await this.comparisonKeyExists(sql, draft.comparisonKey, id)) {
      return { status: "name_conflict", listRevision: state.listRevision };
    }
    throw new Error("Saved roll update failed without a classified conflict");
  }

  async delete(input: DeleteSavedRollInputV1): Promise<ListMutationResultV1> {
    const sql = ownerSql(input.owner);
    const actorUserId = validateSnowflake(input.actorUserId, "Saved roll actor id");
    const authorization = mutationAuthorization(
      sql,
      actorUserId,
      input.authorizationUpdatedAt,
    );
    const id = validateId(input.id);
    const expectedListRevision = validateRevision(
      input.expectedListRevision,
      "Expected saved roll list revision",
      0,
    );
    const expectedRecordRevision = validateRevision(
      input.expectedRecordRevision,
      "Expected saved roll record revision",
      1,
    );
    validateMutationMetadata(input.mutationId, input.occurredAt);
    const payloadJson = JSON.stringify({
      actorUserId,
      expectedListRevision,
      expectedRecordRevision,
      id,
      operation: "delete",
      owner: input.owner,
    });
    const receipt: MutationReceipt = {
      entityType: sql.type,
      entityKey: sql.ownerId,
      operation: "upsert",
      payloadJson,
      occurredAt: input.occurredAt,
    };
    const existing = await readMutationReceipt(this.db, input.mutationId);
    if (existing !== null) {
      return matchesMutationReceipt(existing, receipt)
        ? { status: "existing", listRevision: expectedListRevision + 1 }
        : { status: "mutation_conflict" };
    }

    const receiptStatement = this.db.prepare(
      `INSERT INTO mutation_receipts (
         mutation_id, entity_type, entity_key, operation, payload_json, occurred_at
       )
       SELECT ?, ?, ?, 'upsert', ?, ?
       WHERE EXISTS (SELECT 1 FROM ${sql.parentTable} WHERE id = ?)
         AND EXISTS (SELECT 1 FROM users WHERE id = ?)
         AND ${authorization.predicate}
         AND COALESCE((SELECT revision FROM ${sql.listTable} WHERE ${sql.listKey} = ?), 0) = ?
         AND EXISTS (
           SELECT 1 FROM saved_rolls
           WHERE id = ? AND ${sql.ownerColumn} = ?
             AND ${sql.otherOwnerColumn} IS NULL AND revision = ?
         )`,
    ).bind(
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
      sql.ownerId,
      actorUserId,
      ...authorization.bindings,
      sql.ownerId,
      expectedListRevision,
      id,
      sql.ownerId,
      expectedRecordRevision,
    );
    const listStatement = this.listRevisionStatement(
      sql,
      receipt,
      input.mutationId,
      expectedListRevision,
      input.occurredAt,
    );
    const deleteStatement = this.db.prepare(
      `DELETE FROM saved_rolls
       WHERE id = ? AND ${sql.ownerColumn} = ?
         AND ${sql.otherOwnerColumn} IS NULL AND revision = ?
         AND EXISTS (
           SELECT 1 FROM mutation_receipts
           WHERE mutation_id = ? AND entity_type = ? AND entity_key = ?
             AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
         )`,
    ).bind(
      id,
      sql.ownerId,
      expectedRecordRevision,
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
    );
    const applied = await this.applyThreeStatementMutation(
      [receiptStatement, listStatement, deleteStatement],
      input.mutationId,
      receipt,
    );
    if (applied === "applied" || applied === "existing") {
      return { status: applied, listRevision: expectedListRevision + 1 };
    }
    if (applied === "mutation_conflict") return { status: applied };

    const state = await this.ownerState(sql, "");
    if (!state.exists) return { status: "missing" };
    if (!(await this.isMutationAuthorized(sql, actorUserId, authorization))) {
      return { status: "unauthorized" };
    }
    if (state.listRevision !== expectedListRevision) {
      return { status: "list_revision_conflict", listRevision: state.listRevision };
    }
    const current = await this.readOwnedRow(sql, id);
    if (current === null) return { status: "missing" };
    return {
      status: "record_revision_conflict",
      recordRevision: current.revision,
    };
  }

  async deleteBatch(
    input: DeleteSavedRollBatchInputV2,
  ): Promise<ListMutationResultV1> {
    const sql = ownerSql(input.owner);
    const actorUserId = validateSnowflake(input.actorUserId, "Saved roll actor id");
    const authorization = mutationAuthorization(
      sql,
      actorUserId,
      input.authorizationUpdatedAt,
    );
    const expectedListRevision = validateRevision(
      input.expectedListRevision,
      "Expected saved roll list revision",
      0,
    );
    if (
      !Array.isArray(input.records) ||
      input.records.length < 1 ||
      input.records.length > sql.limit
    ) {
      throw new Error("Saved roll batch delete records are invalid");
    }
    const records = input.records.map(
      (record: { id: string; revision: number }) => ({
        id: validateId(record.id),
        revision: validateRevision(
          record.revision,
          "Expected saved roll record revision",
          1,
        ),
      }),
    );
    if (new Set(records.map(({ id }) => id)).size !== records.length) {
      throw new Error("Saved roll batch delete ids must be unique");
    }
    validateMutationMetadata(input.mutationId, input.occurredAt);
    const payloadJson = JSON.stringify({
      actorUserId,
      expectedListRevision,
      operation: "delete-batch",
      owner: input.owner,
      records,
    });
    const receipt: MutationReceipt = {
      entityType: sql.type,
      entityKey: sql.ownerId,
      operation: "upsert",
      payloadJson,
      occurredAt: input.occurredAt,
    };
    const existing = await readMutationReceipt(this.db, input.mutationId);
    if (existing !== null) {
      return matchesMutationReceipt(existing, receipt)
        ? { status: "existing", listRevision: expectedListRevision + 1 }
        : { status: "mutation_conflict" };
    }

    const recordsJson = JSON.stringify(records);
    const receiptStatement = this.db.prepare(
      `INSERT INTO mutation_receipts (
         mutation_id, entity_type, entity_key, operation, payload_json, occurred_at
       )
       SELECT ?, ?, ?, 'upsert', ?, ?
       WHERE EXISTS (SELECT 1 FROM ${sql.parentTable} WHERE id = ?)
         AND EXISTS (SELECT 1 FROM users WHERE id = ?)
         AND ${authorization.predicate}
         AND COALESCE((SELECT revision FROM ${sql.listTable} WHERE ${sql.listKey} = ?), 0) = ?
         AND (SELECT COUNT(*)
              FROM saved_rolls AS selected_roll
              JOIN json_each(?) AS selected
                ON selected_roll.id = json_extract(selected.value, '$.id')
               AND selected_roll.revision = json_extract(selected.value, '$.revision')
              WHERE selected_roll.${sql.ownerColumn} = ?
                AND selected_roll.${sql.otherOwnerColumn} IS NULL) = ?`,
    ).bind(
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
      sql.ownerId,
      actorUserId,
      ...authorization.bindings,
      sql.ownerId,
      expectedListRevision,
      recordsJson,
      sql.ownerId,
      records.length,
    );
    const listStatement = this.listRevisionStatement(
      sql,
      receipt,
      input.mutationId,
      expectedListRevision,
      input.occurredAt,
    );
    const deleteStatement = this.db.prepare(
      `DELETE FROM saved_rolls
       WHERE ${sql.ownerColumn} = ? AND ${sql.otherOwnerColumn} IS NULL
         AND id IN (
           SELECT json_extract(value, '$.id') FROM json_each(?)
         )
         AND EXISTS (
           SELECT 1 FROM mutation_receipts
           WHERE mutation_id = ? AND entity_type = ? AND entity_key = ?
             AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
         )`,
    ).bind(
      sql.ownerId,
      recordsJson,
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
    );
    const applied = await this.applyThreeStatementMutation(
      [receiptStatement, listStatement, deleteStatement],
      input.mutationId,
      receipt,
      records.length,
    );
    if (applied === "applied" || applied === "existing") {
      return { status: applied, listRevision: expectedListRevision + 1 };
    }
    if (applied === "mutation_conflict") return { status: applied };

    const state = await this.ownerState(sql, "");
    if (!state.exists) return { status: "missing" };
    if (!(await this.isMutationAuthorized(sql, actorUserId, authorization))) {
      return { status: "unauthorized" };
    }
    if (state.listRevision !== expectedListRevision) {
      return { status: "list_revision_conflict", listRevision: state.listRevision };
    }
    return { status: "record_set_conflict", listRevision: state.listRevision };
  }

  async reorder(input: ReorderSavedRollsInputV1): Promise<ListMutationResultV1> {
    const sql = ownerSql(input.owner);
    const actorUserId = validateSnowflake(input.actorUserId, "Saved roll actor id");
    const authorization = mutationAuthorization(
      sql,
      actorUserId,
      input.authorizationUpdatedAt,
    );
    const expectedListRevision = validateRevision(
      input.expectedListRevision,
      "Expected saved roll list revision",
      0,
    );
    if (!Array.isArray(input.orderedIds) || input.orderedIds.length > sql.limit) {
      throw new Error("Saved roll reorder ids are invalid");
    }
    const orderedIds = input.orderedIds.map(validateId);
    if (new Set(orderedIds).size !== orderedIds.length) {
      throw new Error("Saved roll reorder ids must be unique");
    }
    validateMutationMetadata(input.mutationId, input.occurredAt);
    const payloadJson = JSON.stringify({
      actorUserId,
      expectedListRevision,
      operation: "reorder",
      orderedIds,
      owner: input.owner,
    });
    const receipt: MutationReceipt = {
      entityType: sql.type,
      entityKey: sql.ownerId,
      operation: "upsert",
      payloadJson,
      occurredAt: input.occurredAt,
    };
    const existing = await readMutationReceipt(this.db, input.mutationId);
    if (existing !== null) {
      return matchesMutationReceipt(existing, receipt)
        ? { status: "existing", listRevision: expectedListRevision + 1 }
        : { status: "mutation_conflict" };
    }
    const stateBefore = await this.ownerState(sql, "");
    const placeholders = orderedIds.map(() => "?").join(", ");
    const recordSetPredicate = orderedIds.length === 0
      ? `NOT EXISTS (SELECT 1 FROM saved_rolls WHERE ${sql.ownerColumn} = ?)`
      : `(SELECT COUNT(*) FROM saved_rolls WHERE ${sql.ownerColumn} = ?) = ?
         AND (SELECT COUNT(*) FROM saved_rolls
              WHERE ${sql.ownerColumn} = ? AND id IN (${placeholders})) = ?`;
    const recordSetBindings = orderedIds.length === 0
      ? [sql.ownerId]
      : [sql.ownerId, orderedIds.length, sql.ownerId, ...orderedIds, orderedIds.length];
    const receiptStatement = this.db.prepare(
      `INSERT INTO mutation_receipts (
         mutation_id, entity_type, entity_key, operation, payload_json, occurred_at
       )
       SELECT ?, ?, ?, 'upsert', ?, ?
       WHERE EXISTS (SELECT 1 FROM ${sql.parentTable} WHERE id = ?)
         AND EXISTS (SELECT 1 FROM users WHERE id = ?)
         AND ${authorization.predicate}
         AND COALESCE((SELECT revision FROM ${sql.listTable} WHERE ${sql.listKey} = ?), 0) = ?
         AND ${recordSetPredicate}`,
    ).bind(
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
      sql.ownerId,
      actorUserId,
      ...authorization.bindings,
      sql.ownerId,
      expectedListRevision,
      ...recordSetBindings,
    );
    const listStatement = this.listRevisionStatement(
      sql,
      receipt,
      input.mutationId,
      expectedListRevision,
      input.occurredAt,
    );
    const receiptExists = `EXISTS (
      SELECT 1 FROM mutation_receipts
      WHERE mutation_id = ? AND entity_type = ? AND entity_key = ?
        AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
    )`;
    const shiftStatement = this.db.prepare(
      `UPDATE saved_rolls
       SET manual_order = manual_order + ?
       WHERE ${sql.ownerColumn} = ? AND ${receiptExists}`,
    ).bind(
      stateBefore.maxOrder + 1,
      sql.ownerId,
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
    );
    const caseSql = orderedIds.map(() => "WHEN ? THEN ?").join(" ");
    const orderExpression = orderedIds.length === 0
      ? "manual_order"
      : `CASE id ${caseSql} ELSE manual_order END`;
    const caseBindings = orderedIds.flatMap((recordId, order) => [recordId, order]);
    const orderStatement = this.db.prepare(
      `UPDATE saved_rolls
       SET manual_order = ${orderExpression}
       WHERE ${sql.ownerColumn} = ? AND ${receiptExists}`,
    ).bind(
      ...caseBindings,
      sql.ownerId,
      input.mutationId,
      sql.type,
      sql.ownerId,
      payloadJson,
      input.occurredAt,
    );

    try {
      const results = await this.db.batch([
        receiptStatement,
        listStatement,
        shiftStatement,
        orderStatement,
      ]);
      const expectedChanges = [1, 1, orderedIds.length, orderedIds.length];
      if (results.every((result, index) => result.meta.changes === expectedChanges[index])) {
        return { status: "applied", listRevision: expectedListRevision + 1 };
      }
      if (results.some((result) => result.meta.changes !== 0)) {
        throw new Error("Saved roll reorder was not atomic");
      }
    } catch (error) {
      const concurrent = await readMutationReceipt(this.db, input.mutationId);
      if (concurrent !== null) {
        return matchesMutationReceipt(concurrent, receipt)
          ? { status: "existing", listRevision: expectedListRevision + 1 }
          : { status: "mutation_conflict" };
      }
      throw error;
    }
    const concurrent = await readMutationReceipt(this.db, input.mutationId);
    if (concurrent !== null) {
      return matchesMutationReceipt(concurrent, receipt)
        ? { status: "existing", listRevision: expectedListRevision + 1 }
        : { status: "mutation_conflict" };
    }
    const current = await this.ownerState(sql, "");
    if (!current.exists) return { status: "missing" };
    if (!(await this.isMutationAuthorized(sql, actorUserId, authorization))) {
      return { status: "unauthorized" };
    }
    if (current.listRevision !== expectedListRevision) {
      return { status: "list_revision_conflict", listRevision: current.listRevision };
    }
    return { status: "record_set_conflict", listRevision: current.listRevision };
  }

  private listRevisionStatement(
    sql: OwnerSql,
    receipt: MutationReceipt,
    mutationId: string,
    expectedRevision: number,
    occurredAt: number,
  ): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO ${sql.listTable} (${sql.listKey}, revision, updated_at)
       SELECT ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM mutation_receipts
         WHERE mutation_id = ? AND entity_type = ? AND entity_key = ?
           AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
       )
       ON CONFLICT(${sql.listKey}) DO UPDATE SET
         revision = excluded.revision,
         updated_at = excluded.updated_at
       WHERE ${sql.listTable}.revision = ?`,
    ).bind(
      sql.ownerId,
      expectedRevision + 1,
      occurredAt,
      mutationId,
      receipt.entityType,
      receipt.entityKey,
      receipt.payloadJson,
      receipt.occurredAt,
      expectedRevision,
    );
  }

  private async applyThreeStatementMutation(
    statements: [D1PreparedStatement, D1PreparedStatement, D1PreparedStatement],
    mutationId: string,
    receipt: MutationReceipt,
    expectedFinalChanges = 1,
  ): Promise<"applied" | "existing" | "mutation_conflict" | "not_applied"> {
    try {
      const results = await this.db.batch(statements);
      if (
        results[0]?.meta.changes === 1 &&
        results[1]?.meta.changes === 1 &&
        results[2]?.meta.changes === expectedFinalChanges
      ) return "applied";
      if (results.some((result) => result.meta.changes !== 0)) {
        throw new Error("Saved roll mutation was not atomic");
      }
    } catch (error) {
      const concurrent = await readMutationReceipt(this.db, mutationId);
      if (concurrent === null) throw error;
      return matchesMutationReceipt(concurrent, receipt)
        ? "existing"
        : "mutation_conflict";
    }
    const concurrent = await readMutationReceipt(this.db, mutationId);
    if (concurrent === null) return "not_applied";
    return matchesMutationReceipt(concurrent, receipt)
      ? "existing"
      : "mutation_conflict";
  }

  private async isMutationAuthorized(
    sql: OwnerSql,
    actorUserId: string,
    authorization: MutationAuthorization,
  ): Promise<boolean> {
    if (sql.type === "user") return actorUserId === sql.ownerId;
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT 1 AS authorized FROM users_guilds
         WHERE user_id = ? AND guild_id = ? AND updated_at >= ?
           AND (is_admin = 1 OR is_dice_witch_admin = 1)`,
      )
      .bind(actorUserId, sql.ownerId, authorization.updatedAt)
      .first<{ authorized: number }>();
    return row !== null;
  }

  private async readOwnedRow(sql: OwnerSql, id: string): Promise<SavedRollRow | null> {
    return this.db
      .withSession("first-primary")
      .prepare(
        `SELECT * FROM saved_rolls
         WHERE id = ? AND ${sql.ownerColumn} = ? AND ${sql.otherOwnerColumn} IS NULL`,
      )
      .bind(id, sql.ownerId)
      .first<SavedRollRow>();
  }

  private async comparisonKeyExists(
    sql: OwnerSql,
    comparisonKey: string,
    excludedId: string,
  ): Promise<boolean> {
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT 1 AS present FROM saved_rolls
         WHERE ${sql.ownerColumn} = ? AND comparison_key = ? AND id <> ?`,
      )
      .bind(sql.ownerId, comparisonKey, excludedId)
      .first<{ present: number }>();
    return row !== null;
  }

  private async ownerState(sql: OwnerSql, comparisonKey: string): Promise<OwnerState> {
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT
           EXISTS(SELECT 1 FROM ${sql.parentTable} WHERE id = ?) AS owner_exists,
           COALESCE((SELECT revision FROM ${sql.listTable} WHERE ${sql.listKey} = ?), 0) AS list_revision,
           (SELECT COUNT(*) FROM saved_rolls WHERE ${sql.ownerColumn} = ?) AS record_count,
           COALESCE((SELECT MAX(manual_order) FROM saved_rolls WHERE ${sql.ownerColumn} = ?), -1) AS max_order,
           EXISTS(
             SELECT 1 FROM saved_rolls
             WHERE ${sql.ownerColumn} = ? AND comparison_key = ?
           ) AS name_exists`,
      )
      .bind(
        sql.ownerId,
        sql.ownerId,
        sql.ownerId,
        sql.ownerId,
        sql.ownerId,
        comparisonKey,
      )
      .first<{
        owner_exists: number;
        list_revision: number;
        record_count: number;
        max_order: number;
        name_exists: number;
      }>();
    if (row === null) throw new Error("Saved roll owner state is unavailable");
    return {
      exists: row.owner_exists === 1,
      listRevision: validateRevision(row.list_revision, "Stored saved roll list revision", 0),
      count: validateRevision(row.record_count, "Stored saved roll count", 0),
      maxOrder: row.max_order === -1 ? -1 : validateRevision(row.max_order, "Stored saved roll order", 0),
      nameExists: row.name_exists === 1,
    };
  }
}
