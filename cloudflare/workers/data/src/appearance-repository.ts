import {
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV4,
  type AppearanceProfileV4,
  type AppearanceValidationCatalogV3,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  matchesMutationReceipt,
  readMutationReceipt,
  validateMutationMetadata,
  validateSnowflake,
  type MutationReceipt,
  type MutationReceiptRow,
} from "./mutation-receipt";

const MAX_PROFILE_JSON_LENGTH = 65_536;

type StoredProfileRow = {
  revision: number;
  profile_json: string;
};

type StoredGuildProfileRow = StoredProfileRow & {
  updated_by_user_id: string;
};

export type AppearanceProfileReadResult<Profile> =
  | { status: "found"; revision: number; profile: Profile }
  | { status: "missing" };

export type GuildAppearanceProfileReadResult<Profile> =
  | {
      status: "found";
      revision: number;
      profile: Profile;
      updatedByUserId: string;
    }
  | { status: "missing" };

export type AppearanceProfileWriteResult<Profile> =
  | {
      status: "applied" | "existing";
      revision: number;
      profile: Profile;
    }
  | { status: "missing" | "mutation_conflict" }
  | { status: "revision_conflict"; revision: number };

export type PutPersonalAppearanceV4Input = {
  userId: string;
  expectedRevision: number;
  profile: unknown;
  mutationId: string;
  occurredAt: number;
};

export type PutGuildAppearanceV4Input = {
  guildId: string;
  updatedByUserId: string;
  expectedRevision: number;
  profile: unknown;
  mutationId: string;
  occurredAt: number;
};

type StoredProfileState =
  | { status: "missing" }
  | {
      status: "found";
      revision: number;
      profileJson: string;
    };

type StoredPersonalProfile =
  | { status: "missing" }
  | {
      status: "found";
      revision: number;
      profileJson: string;
      profile: AppearanceProfileV4;
    };

type StoredGuildProfile =
  | { status: "missing" }
  | {
      status: "found";
      revision: number;
      profileJson: string;
      updatedByUserId: string;
      profile: GuildAppearanceProfileV4;
    };

type PreparedWrite<Profile> = {
  receipt: MutationReceipt;
  mutationId: string;
  expectedRevision: number;
  profile: Profile;
  statements: (
    target: StoredProfileState,
  ) => [D1PreparedStatement, D1PreparedStatement];
  parentExists: () => Promise<boolean>;
  readTarget: () => Promise<StoredProfileState>;
};

type TargetGuard = {
  predicate: string;
  predicateBindings: readonly (number | string)[];
  updatePredicate: string;
  updateBindings: readonly (number | string)[];
};

function validateExpectedRevision(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Appearance profile revision is invalid");
  }
  return value;
}

function serializeProfile(profile: object): string {
  const profileJson = JSON.stringify(profile);
  if (profileJson.length > MAX_PROFILE_JSON_LENGTH) {
    throw new Error("Appearance profile is too large");
  }
  return profileJson;
}

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Stored appearance profile is invalid");
  }
}

function validateStoredRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Stored appearance profile revision is invalid");
  }
  return value;
}

function parseStoredProfile<Profile>(parse: () => Profile): Profile {
  try {
    return parse();
  } catch {
    throw new Error("Stored appearance profile is invalid");
  }
}

function storedProfileState(
  profile: StoredPersonalProfile | StoredGuildProfile,
): StoredProfileState {
  if (profile.status === "missing") return profile;
  return {
    status: "found",
    revision: profile.revision,
    profileJson: profile.profileJson,
  };
}

function targetGuard(
  table: "user_appearance_profiles" | "guild_appearance_profiles",
  keyColumn: "user_id" | "guild_id",
  key: string,
  expectedRevision: number,
  target: StoredProfileState,
): TargetGuard {
  if (target.status === "missing") {
    return {
      predicate: `(? = 0 AND NOT EXISTS (
        SELECT 1 FROM ${table} WHERE ${keyColumn} = ?
      ))`,
      predicateBindings: [expectedRevision, key],
      updatePredicate: "0",
      updateBindings: [],
    };
  }
  return {
    predicate: `EXISTS (
      SELECT 1 FROM ${table}
      WHERE ${keyColumn} = ? AND revision = ? AND profile_json = ?
        AND json_extract(profile_json, '$.version') = 4
    )`,
    predicateBindings: [key, expectedRevision, target.profileJson],
    updatePredicate: `${table}.revision = ?
      AND ${table}.profile_json = ?
      AND json_extract(${table}.profile_json, '$.version') = 4`,
    updateBindings: [expectedRevision, target.profileJson],
  };
}

function existingWriteResult<Profile extends object>(
  row: MutationReceiptRow,
  write: PreparedWrite<Profile>,
): AppearanceProfileWriteResult<Profile> {
  return matchesMutationReceipt(row, write.receipt)
    ? {
        status: "existing",
        revision: write.expectedRevision + 1,
        profile: write.profile,
      }
    : { status: "mutation_conflict" };
}

export class D1AppearanceRepository {
  constructor(
    private readonly db: D1Database,
    private readonly catalog: AppearanceValidationCatalogV3,
  ) {}

  async getPersonalV4(
    userIdValue: string,
  ): Promise<AppearanceProfileReadResult<AppearanceProfileV4>> {
    const userId = validateSnowflake(userIdValue, "User id");
    const stored = await this.readPersonalProfile(userId);
    if (stored.status === "missing") return stored;
    return {
      status: "found",
      revision: stored.revision,
      profile: stored.profile,
    };
  }

  async getGuildV4(
    guildIdValue: string,
  ): Promise<GuildAppearanceProfileReadResult<GuildAppearanceProfileV4>> {
    const guildId = validateSnowflake(guildIdValue, "Guild id");
    const stored = await this.readGuildProfile(guildId);
    if (stored.status === "missing") return stored;
    return {
      status: "found",
      revision: stored.revision,
      profile: stored.profile,
      updatedByUserId: stored.updatedByUserId,
    };
  }

  async putPersonalV4(
    input: PutPersonalAppearanceV4Input,
  ): Promise<AppearanceProfileWriteResult<AppearanceProfileV4>> {
    const userId = validateSnowflake(input.userId, "User id");
    const expectedRevision = validateExpectedRevision(input.expectedRevision);
    validateMutationMetadata(input.mutationId, input.occurredAt);
    const profile = parseAppearanceProfileV4(input.profile, this.catalog);
    const profileJson = serializeProfile(profile);
    const payloadJson = JSON.stringify({ expectedRevision, profile });
    const receipt: MutationReceipt = {
      entityType: "user",
      entityKey: userId,
      operation: "upsert",
      payloadJson,
      occurredAt: input.occurredAt,
    };
    return this.applyWrite({
      receipt,
      mutationId: input.mutationId,
      expectedRevision,
      profile,
      statements: (target) =>
        this.personalWriteStatements(
          {
            userId,
            expectedRevision,
            profileJson,
            payloadJson,
            mutationId: input.mutationId,
            occurredAt: input.occurredAt,
          },
          target,
        ),
      parentExists: () => this.userExists(userId),
      readTarget: async () =>
        storedProfileState(await this.readPersonalProfile(userId)),
    });
  }

  async putGuildV4(
    input: PutGuildAppearanceV4Input,
  ): Promise<AppearanceProfileWriteResult<GuildAppearanceProfileV4>> {
    const guildId = validateSnowflake(input.guildId, "Guild id");
    const updatedByUserId = validateSnowflake(
      input.updatedByUserId,
      "Appearance profile author id",
    );
    const expectedRevision = validateExpectedRevision(input.expectedRevision);
    validateMutationMetadata(input.mutationId, input.occurredAt);
    const profile = parseGuildAppearanceProfileV4(input.profile, this.catalog);
    const profileJson = serializeProfile(profile);
    const payloadJson = JSON.stringify({
      expectedRevision,
      updatedByUserId,
      profile,
    });
    const receipt: MutationReceipt = {
      entityType: "guild",
      entityKey: guildId,
      operation: "upsert",
      payloadJson,
      occurredAt: input.occurredAt,
    };
    return this.applyWrite({
      receipt,
      mutationId: input.mutationId,
      expectedRevision,
      profile,
      statements: (target) =>
        this.guildWriteStatements(
          {
            guildId,
            updatedByUserId,
            expectedRevision,
            profileJson,
            payloadJson,
            mutationId: input.mutationId,
            occurredAt: input.occurredAt,
          },
          target,
        ),
      parentExists: () => this.guildAndUserExist(guildId, updatedByUserId),
      readTarget: async () =>
        storedProfileState(await this.readGuildProfile(guildId)),
    });
  }

  private personalWriteStatements(
    input: {
      userId: string;
      expectedRevision: number;
      profileJson: string;
      payloadJson: string;
      mutationId: string;
      occurredAt: number;
    },
    target: StoredProfileState,
  ): [D1PreparedStatement, D1PreparedStatement] {
    const guard = targetGuard(
      "user_appearance_profiles",
      "user_id",
      input.userId,
      input.expectedRevision,
      target,
    );
    const receiptStatement = this.db
      .prepare(
        `INSERT INTO mutation_receipts (
           mutation_id, entity_type, entity_key,
           operation, payload_json, occurred_at
         )
         SELECT ?, 'user', ?, 'upsert', ?, ?
         WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
           AND ${guard.predicate}`,
      )
      .bind(
        input.mutationId,
        input.userId,
        input.payloadJson,
        input.occurredAt,
        input.userId,
        ...guard.predicateBindings,
      );
    const profileStatement = this.db
      .prepare(
        `INSERT INTO user_appearance_profiles (
           user_id, revision, profile_json, updated_at
         )
         SELECT ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM mutation_receipts
           WHERE mutation_id = ? AND entity_type = 'user'
             AND entity_key = ? AND operation = 'upsert'
             AND payload_json = ? AND occurred_at = ?
         )
           AND ${guard.predicate}
         ON CONFLICT(user_id) DO UPDATE SET
           revision = excluded.revision,
           profile_json = excluded.profile_json,
           updated_at = excluded.updated_at
         WHERE ${guard.updatePredicate}`,
      )
      .bind(
        input.userId,
        input.expectedRevision + 1,
        input.profileJson,
        input.occurredAt,
        input.mutationId,
        input.userId,
        input.payloadJson,
        input.occurredAt,
        ...guard.predicateBindings,
        ...guard.updateBindings,
      );
    return [receiptStatement, profileStatement];
  }

  private guildWriteStatements(
    input: {
      guildId: string;
      updatedByUserId: string;
      expectedRevision: number;
      profileJson: string;
      payloadJson: string;
      mutationId: string;
      occurredAt: number;
    },
    target: StoredProfileState,
  ): [D1PreparedStatement, D1PreparedStatement] {
    const guard = targetGuard(
      "guild_appearance_profiles",
      "guild_id",
      input.guildId,
      input.expectedRevision,
      target,
    );
    const receiptStatement = this.db
      .prepare(
        `INSERT INTO mutation_receipts (
           mutation_id, entity_type, entity_key,
           operation, payload_json, occurred_at
         )
         SELECT ?, 'guild', ?, 'upsert', ?, ?
         WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?)
           AND EXISTS (SELECT 1 FROM users WHERE id = ?)
           AND ${guard.predicate}`,
      )
      .bind(
        input.mutationId,
        input.guildId,
        input.payloadJson,
        input.occurredAt,
        input.guildId,
        input.updatedByUserId,
        ...guard.predicateBindings,
      );
    const profileStatement = this.db
      .prepare(
        `INSERT INTO guild_appearance_profiles (
           guild_id, revision, profile_json, updated_by_user_id, updated_at
         )
         SELECT ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM mutation_receipts
           WHERE mutation_id = ? AND entity_type = 'guild'
             AND entity_key = ? AND operation = 'upsert'
             AND payload_json = ? AND occurred_at = ?
         )
           AND ${guard.predicate}
         ON CONFLICT(guild_id) DO UPDATE SET
           revision = excluded.revision,
           profile_json = excluded.profile_json,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_at = excluded.updated_at
         WHERE ${guard.updatePredicate}`,
      )
      .bind(
        input.guildId,
        input.expectedRevision + 1,
        input.profileJson,
        input.updatedByUserId,
        input.occurredAt,
        input.mutationId,
        input.guildId,
        input.payloadJson,
        input.occurredAt,
        ...guard.predicateBindings,
        ...guard.updateBindings,
      );
    return [receiptStatement, profileStatement];
  }

  private async applyWrite<Profile extends object>(
    write: PreparedWrite<Profile>,
  ): Promise<AppearanceProfileWriteResult<Profile>> {
    const existing = await readMutationReceipt(this.db, write.mutationId);
    if (existing !== null) return existingWriteResult(existing, write);

    const target = await write.readTarget();
    const statements = write.statements(target);
    try {
      const [receiptResult, profileResult] = await this.db.batch(statements);
      const receiptChanges = receiptResult?.meta.changes ?? 0;
      const profileChanges = profileResult?.meta.changes ?? 0;
      if (receiptChanges === 1 && profileChanges === 1) {
        return {
          status: "applied",
          revision: write.expectedRevision + 1,
          profile: write.profile,
        };
      }
      if (receiptChanges !== 0 || profileChanges !== 0) {
        throw new Error("Appearance profile mutation was not atomic");
      }
      const concurrent = await readMutationReceipt(this.db, write.mutationId);
      if (concurrent !== null) return existingWriteResult(concurrent, write);
      if (!(await write.parentExists())) return { status: "missing" };
      const current = await write.readTarget();
      return {
        status: "revision_conflict",
        revision: current.status === "found" ? current.revision : 0,
      };
    } catch (error) {
      const concurrent = await readMutationReceipt(this.db, write.mutationId);
      if (concurrent === null) throw error;
      return existingWriteResult(concurrent, write);
    }
  }

  private async userExists(userId: string): Promise<boolean> {
    const row = await this.db
      .withSession("first-primary")
      .prepare("SELECT 1 AS present FROM users WHERE id = ?")
      .bind(userId)
      .first<{ present: number }>();
    return row !== null;
  }

  private async guildAndUserExist(
    guildId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT 1 AS present
         WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?)
           AND EXISTS (SELECT 1 FROM users WHERE id = ?)`,
      )
      .bind(guildId, userId)
      .first<{ present: number }>();
    return row !== null;
  }

  private async readPersonalProfile(
    userId: string,
  ): Promise<StoredPersonalProfile> {
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT revision, profile_json
         FROM user_appearance_profiles
         WHERE user_id = ?`,
      )
      .bind(userId)
      .first<StoredProfileRow>();
    if (row === null) return { status: "missing" };
    return {
      status: "found",
      revision: validateStoredRevision(row.revision),
      profileJson: row.profile_json,
      profile: parseStoredProfile(() =>
        parseAppearanceProfileV4(parseStoredJson(row.profile_json), this.catalog)),
    };
  }

  private async readGuildProfile(guildId: string): Promise<StoredGuildProfile> {
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT revision, profile_json, updated_by_user_id
         FROM guild_appearance_profiles
         WHERE guild_id = ?`,
      )
      .bind(guildId)
      .first<StoredGuildProfileRow>();
    if (row === null) return { status: "missing" };
    return {
      status: "found",
      revision: validateStoredRevision(row.revision),
      profileJson: row.profile_json,
      updatedByUserId: validateSnowflake(
        row.updated_by_user_id,
        "Stored appearance profile author id",
      ),
      profile: parseStoredProfile(() =>
        parseGuildAppearanceProfileV4(
          parseStoredJson(row.profile_json),
          this.catalog,
        )),
    };
  }
}
