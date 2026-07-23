import {
  parseAppearanceProfileV3,
  parseGuildAppearanceProfileV3,
  type AppearanceProfileV3,
  type AppearanceValidationCatalogV3,
  type GuildAppearanceProfileV3,
} from "@dice-witch/dice-v4-model";
import {
  migrateAppearanceProfileV1,
  migrateGuildAppearanceProfileV1,
  parseAppearanceProfile,
  parseAppearanceProfileV2,
  parseGuildAppearanceProfile,
  parseGuildAppearanceProfileV2,
  type AppearanceCatalog,
  type AppearanceProfileV1,
  type AppearanceProfileV2,
  type GuildAppearanceProfileV1,
  type GuildAppearanceProfileV2,
} from "../../../packages/dice-appearance/src";
import {
  matchesMutationReceipt,
  readMutationReceipt,
  validateMutationMetadata,
  validateSnowflake,
  type MutationReceipt,
  type MutationReceiptRow,
} from "./mutation-receipt";

const MAX_PROFILE_JSON_LENGTH = 65_536;

type AppearanceRepositoryCatalogs = {
  v1V2: AppearanceCatalog;
  v3: AppearanceValidationCatalogV3;
};

type StoredProfileRow = {
  revision: number;
  profile_json: string;
};

type StoredGuildProfileRow = StoredProfileRow & {
  updated_by_user_id: string;
};

export type AppearanceProfileVersionConflict = {
  status: "appearance_profile_version_conflict";
};

export type AppearanceProfileReadResult<Profile> =
  | { status: "found"; revision: number; profile: Profile }
  | { status: "missing" }
  | AppearanceProfileVersionConflict;

export type GuildAppearanceProfileReadResult<Profile> =
  | {
      status: "found";
      revision: number;
      profile: Profile;
      updatedByUserId: string;
    }
  | { status: "missing" }
  | AppearanceProfileVersionConflict;

export type AppearanceProfileWriteResult<Profile> =
  | {
      status: "applied" | "existing";
      revision: number;
      profile: Profile;
    }
  | { status: "missing" | "mutation_conflict" }
  | { status: "revision_conflict"; revision: number }
  | AppearanceProfileVersionConflict;

type PutPersonalAppearanceInput = {
  userId: string;
  expectedRevision: number;
  profile: unknown;
  mutationId: string;
  occurredAt: number;
};

export type PutPersonalAppearanceV1Input = PutPersonalAppearanceInput;
export type PutPersonalAppearanceV2Input = PutPersonalAppearanceInput;
export type PutPersonalAppearanceV3Input = PutPersonalAppearanceInput;

type PutGuildAppearanceInput = {
  guildId: string;
  updatedByUserId: string;
  expectedRevision: number;
  profile: unknown;
  mutationId: string;
  occurredAt: number;
};

export type PutGuildAppearanceV1Input = PutGuildAppearanceInput;
export type PutGuildAppearanceV2Input = PutGuildAppearanceInput;
export type PutGuildAppearanceV3Input = PutGuildAppearanceInput;

type AppearanceProfileVersion = 1 | 2 | 3;

type StoredProfileState =
  | { status: "missing" }
  | {
      status: "found";
      revision: number;
      profileJson: string;
      version: AppearanceProfileVersion;
    };

type PreparedWrite<Profile> = {
  receipt: MutationReceipt;
  mutationId: string;
  expectedRevision: number;
  profile: Profile;
  requestVersion: AppearanceProfileVersion;
  statements: (
    target: StoredProfileState,
  ) => [D1PreparedStatement, D1PreparedStatement];
  parentExists: () => Promise<boolean>;
  readTarget: () => Promise<StoredProfileState>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type StoredPersonalDocument =
  | { version: 1; profile: AppearanceProfileV1 }
  | { version: 2; profile: AppearanceProfileV2 }
  | { version: 3; profile: AppearanceProfileV3 };

type StoredGuildDocument =
  | { version: 1; profile: GuildAppearanceProfileV1 }
  | { version: 2; profile: GuildAppearanceProfileV2 }
  | { version: 3; profile: GuildAppearanceProfileV3 };

type StoredPersonalProfile =
  | { status: "missing" }
  | {
      status: "found";
      revision: number;
      profileJson: string;
      document: StoredPersonalDocument;
    };

type StoredGuildProfile =
  | { status: "missing" }
  | {
      status: "found";
      revision: number;
      profileJson: string;
      updatedByUserId: string;
      document: StoredGuildDocument;
    };

function parseStoredPersonalProfile(
  profileJson: string,
  catalogs: AppearanceRepositoryCatalogs,
): StoredPersonalDocument {
  try {
    const value = parseStoredJson(profileJson);
    if (!isRecord(value)) throw new Error("Stored profile must be an object");
    if (value.version === 1) {
      return {
        version: 1,
        profile: parseAppearanceProfile(value, catalogs.v1V2),
      };
    }
    if (value.version === 2) {
      return {
        version: 2,
        profile: parseAppearanceProfileV2(value, catalogs.v1V2),
      };
    }
    if (value.version === 3) {
      return {
        version: 3,
        profile: parseAppearanceProfileV3(value, catalogs.v3),
      };
    }
    throw new Error("Stored profile version is not supported");
  } catch {
    throw new Error("Stored appearance profile is invalid");
  }
}

function parseStoredGuildProfile(
  profileJson: string,
  catalogs: AppearanceRepositoryCatalogs,
): StoredGuildDocument {
  try {
    const value = parseStoredJson(profileJson);
    if (!isRecord(value)) throw new Error("Stored profile must be an object");
    if (value.version === 1) {
      return {
        version: 1,
        profile: parseGuildAppearanceProfile(value, catalogs.v1V2),
      };
    }
    if (value.version === 2) {
      return {
        version: 2,
        profile: parseGuildAppearanceProfileV2(value, catalogs.v1V2),
      };
    }
    if (value.version === 3) {
      return {
        version: 3,
        profile: parseGuildAppearanceProfileV3(value, catalogs.v3),
      };
    }
    throw new Error("Stored profile version is not supported");
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
    version: profile.document.version,
  };
}

function versionConflict(): AppearanceProfileVersionConflict {
  return { status: "appearance_profile_version_conflict" };
}

type TargetGuard = {
  predicate: string;
  predicateBindings: readonly (number | string)[];
  updatePredicate: string;
  updateBindings: readonly (number | string)[];
};

function compatibleStoredVersions(
  requestVersion: AppearanceProfileVersion,
): readonly AppearanceProfileVersion[] {
  return requestVersion === 2 ? [1, 2] : [requestVersion];
}

function isVersionCompatible(
  requestVersion: AppearanceProfileVersion,
  storedVersion: AppearanceProfileVersion,
): boolean {
  return compatibleStoredVersions(requestVersion).includes(storedVersion);
}

function hasVersionConflict(
  requestVersion: AppearanceProfileVersion,
  target: StoredProfileState,
): boolean {
  return (
    target.status === "found" &&
    !isVersionCompatible(requestVersion, target.version)
  );
}

function targetGuard(
  table: "user_appearance_profiles" | "guild_appearance_profiles",
  keyColumn: "user_id" | "guild_id",
  key: string,
  expectedRevision: number,
  requestVersion: AppearanceProfileVersion,
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
  const compatibleVersions = compatibleStoredVersions(requestVersion);
  const versionPlaceholders = compatibleVersions.map(() => "?").join(", ");
  return {
    predicate: `EXISTS (
      SELECT 1 FROM ${table}
      WHERE ${keyColumn} = ? AND revision = ? AND profile_json = ?
        AND json_extract(profile_json, '$.version') IN (${versionPlaceholders})
    )`,
    predicateBindings: [
      key,
      expectedRevision,
      target.profileJson,
      ...compatibleVersions,
    ],
    updatePredicate: `${table}.revision = ?
      AND ${table}.profile_json = ?
      AND json_extract(${table}.profile_json, '$.version') IN (${versionPlaceholders})`,
    updateBindings: [
      expectedRevision,
      target.profileJson,
      ...compatibleVersions,
    ],
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
    private readonly catalogs: AppearanceRepositoryCatalogs,
  ) {}

  async getPersonalV1(
    userIdValue: string,
  ): Promise<AppearanceProfileReadResult<AppearanceProfileV1>> {
    const userId = validateSnowflake(userIdValue, "User id");
    const stored = await this.readPersonalProfile(userId);
    if (stored.status === "missing") return stored;
    if (stored.document.version !== 1) return versionConflict();
    return {
      status: "found",
      revision: stored.revision,
      profile: stored.document.profile,
    };
  }

  async getPersonalV2(
    userIdValue: string,
  ): Promise<AppearanceProfileReadResult<AppearanceProfileV2>> {
    const userId = validateSnowflake(userIdValue, "User id");
    const stored = await this.readPersonalProfile(userId);
    if (stored.status === "missing") return stored;
    if (stored.document.version === 3) return versionConflict();
    return {
      status: "found",
      revision: stored.revision,
      profile:
        stored.document.version === 1
          ? migrateAppearanceProfileV1(stored.document.profile)
          : stored.document.profile,
    };
  }

  async getPersonalV3(
    userIdValue: string,
  ): Promise<AppearanceProfileReadResult<AppearanceProfileV3>> {
    const userId = validateSnowflake(userIdValue, "User id");
    const stored = await this.readPersonalProfile(userId);
    if (stored.status === "missing") return stored;
    if (stored.document.version !== 3) return versionConflict();
    return {
      status: "found",
      revision: stored.revision,
      profile: stored.document.profile,
    };
  }

  async getGuildV1(
    guildIdValue: string,
  ): Promise<GuildAppearanceProfileReadResult<GuildAppearanceProfileV1>> {
    const guildId = validateSnowflake(guildIdValue, "Guild id");
    const stored = await this.readGuildProfile(guildId);
    if (stored.status === "missing") return stored;
    if (stored.document.version !== 1) return versionConflict();
    return {
      status: "found",
      revision: stored.revision,
      profile: stored.document.profile,
      updatedByUserId: stored.updatedByUserId,
    };
  }

  async getGuildV2(
    guildIdValue: string,
  ): Promise<GuildAppearanceProfileReadResult<GuildAppearanceProfileV2>> {
    const guildId = validateSnowflake(guildIdValue, "Guild id");
    const stored = await this.readGuildProfile(guildId);
    if (stored.status === "missing") return stored;
    if (stored.document.version === 3) return versionConflict();
    return {
      status: "found",
      revision: stored.revision,
      profile:
        stored.document.version === 1
          ? migrateGuildAppearanceProfileV1(stored.document.profile)
          : stored.document.profile,
      updatedByUserId: stored.updatedByUserId,
    };
  }

  async getGuildV3(
    guildIdValue: string,
  ): Promise<GuildAppearanceProfileReadResult<GuildAppearanceProfileV3>> {
    const guildId = validateSnowflake(guildIdValue, "Guild id");
    const stored = await this.readGuildProfile(guildId);
    if (stored.status === "missing") return stored;
    if (stored.document.version !== 3) return versionConflict();
    return {
      status: "found",
      revision: stored.revision,
      profile: stored.document.profile,
      updatedByUserId: stored.updatedByUserId,
    };
  }

  putPersonalV1(
    input: PutPersonalAppearanceV1Input,
  ): Promise<AppearanceProfileWriteResult<AppearanceProfileV1>> {
    return this.putPersonal(input, 1);
  }

  putPersonalV2(
    input: PutPersonalAppearanceV2Input,
  ): Promise<AppearanceProfileWriteResult<AppearanceProfileV2>> {
    return this.putPersonal(input, 2);
  }

  putPersonalV3(
    input: PutPersonalAppearanceV3Input,
  ): Promise<AppearanceProfileWriteResult<AppearanceProfileV3>> {
    return this.putPersonal(input, 3);
  }

  private putPersonal(
    input: PutPersonalAppearanceInput,
    requestVersion: 1,
  ): Promise<AppearanceProfileWriteResult<AppearanceProfileV1>>;
  private putPersonal(
    input: PutPersonalAppearanceInput,
    requestVersion: 2,
  ): Promise<AppearanceProfileWriteResult<AppearanceProfileV2>>;
  private putPersonal(
    input: PutPersonalAppearanceInput,
    requestVersion: 3,
  ): Promise<AppearanceProfileWriteResult<AppearanceProfileV3>>;
  private async putPersonal(
    input: PutPersonalAppearanceInput,
    requestVersion: AppearanceProfileVersion,
  ): Promise<
    AppearanceProfileWriteResult<
      AppearanceProfileV1 | AppearanceProfileV2 | AppearanceProfileV3
    >
  > {
    const userId = validateSnowflake(input.userId, "User id");
    const expectedRevision = validateExpectedRevision(input.expectedRevision);
    validateMutationMetadata(input.mutationId, input.occurredAt);
    let profile:
      | AppearanceProfileV1
      | AppearanceProfileV2
      | AppearanceProfileV3;
    if (requestVersion === 1) {
      profile = parseAppearanceProfile(input.profile, this.catalogs.v1V2);
    } else if (requestVersion === 2) {
      profile = parseAppearanceProfileV2(input.profile, this.catalogs.v1V2);
    } else {
      profile = parseAppearanceProfileV3(input.profile, this.catalogs.v3);
    }
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
      requestVersion,
      statements: (target) =>
        this.personalWriteStatements(
          {
            userId,
            expectedRevision,
            profileJson,
            payloadJson,
            mutationId: input.mutationId,
            occurredAt: input.occurredAt,
            requestVersion,
          },
          target,
        ),
      parentExists: () => this.userExists(userId),
      readTarget: async () =>
        storedProfileState(await this.readPersonalProfile(userId)),
    });
  }

  putGuildV1(
    input: PutGuildAppearanceV1Input,
  ): Promise<AppearanceProfileWriteResult<GuildAppearanceProfileV1>> {
    return this.putGuild(input, 1);
  }

  putGuildV2(
    input: PutGuildAppearanceV2Input,
  ): Promise<AppearanceProfileWriteResult<GuildAppearanceProfileV2>> {
    return this.putGuild(input, 2);
  }

  putGuildV3(
    input: PutGuildAppearanceV3Input,
  ): Promise<AppearanceProfileWriteResult<GuildAppearanceProfileV3>> {
    return this.putGuild(input, 3);
  }

  private putGuild(
    input: PutGuildAppearanceInput,
    requestVersion: 1,
  ): Promise<AppearanceProfileWriteResult<GuildAppearanceProfileV1>>;
  private putGuild(
    input: PutGuildAppearanceInput,
    requestVersion: 2,
  ): Promise<AppearanceProfileWriteResult<GuildAppearanceProfileV2>>;
  private putGuild(
    input: PutGuildAppearanceInput,
    requestVersion: 3,
  ): Promise<AppearanceProfileWriteResult<GuildAppearanceProfileV3>>;
  private async putGuild(
    input: PutGuildAppearanceInput,
    requestVersion: AppearanceProfileVersion,
  ): Promise<
    AppearanceProfileWriteResult<
      | GuildAppearanceProfileV1
      | GuildAppearanceProfileV2
      | GuildAppearanceProfileV3
    >
  > {
    const guildId = validateSnowflake(input.guildId, "Guild id");
    const updatedByUserId = validateSnowflake(
      input.updatedByUserId,
      "Appearance profile author id",
    );
    const expectedRevision = validateExpectedRevision(input.expectedRevision);
    validateMutationMetadata(input.mutationId, input.occurredAt);
    let profile:
      | GuildAppearanceProfileV1
      | GuildAppearanceProfileV2
      | GuildAppearanceProfileV3;
    if (requestVersion === 1) {
      profile = parseGuildAppearanceProfile(
        input.profile,
        this.catalogs.v1V2,
      );
    } else if (requestVersion === 2) {
      profile = parseGuildAppearanceProfileV2(
        input.profile,
        this.catalogs.v1V2,
      );
    } else {
      profile = parseGuildAppearanceProfileV3(input.profile, this.catalogs.v3);
    }
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
      requestVersion,
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
            requestVersion,
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
      requestVersion: AppearanceProfileVersion;
    },
    target: StoredProfileState,
  ): [D1PreparedStatement, D1PreparedStatement] {
    const guard = targetGuard(
      "user_appearance_profiles",
      "user_id",
      input.userId,
      input.expectedRevision,
      input.requestVersion,
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
      requestVersion: AppearanceProfileVersion;
    },
    target: StoredProfileState,
  ): [D1PreparedStatement, D1PreparedStatement] {
    const guard = targetGuard(
      "guild_appearance_profiles",
      "guild_id",
      input.guildId,
      input.expectedRevision,
      input.requestVersion,
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
    if (hasVersionConflict(write.requestVersion, target)) {
      return versionConflict();
    }
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
      if (hasVersionConflict(write.requestVersion, current)) {
        return versionConflict();
      }
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
      document: parseStoredPersonalProfile(row.profile_json, this.catalogs),
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
      document: parseStoredGuildProfile(row.profile_json, this.catalogs),
    };
  }
}
