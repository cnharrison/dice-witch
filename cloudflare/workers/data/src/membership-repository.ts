import {
  matchesMutationReceipt,
  readMutationReceipt,
  validateMutationMetadata,
  validateSnowflake,
  type MutationReceipt,
  type MutationReceiptRow,
} from "./mutation-receipt";

export type MembershipPermissions = {
  isAdmin: boolean;
  isDiceWitchAdmin: boolean;
};

export type MutualGuild = MembershipPermissions & {
  guild: { id: string; name: string | null; icon: string | null } | null;
};

export type UpsertPermissionsInput = {
  userId: string;
  guildId: string;
  permissions: MembershipPermissions;
  mutationId: string;
  occurredAt: number;
};

export type UpsertPermissionsResult =
  | {
      status: "applied" | "existing";
      permissions: MembershipPermissions;
    }
  | { status: "missing" | "conflict" };

type MutualGuildRow = {
  guild_id: string | null;
  guild_name: string | null;
  guild_icon: string | null;
  is_admin: number;
  is_dice_witch_admin: number;
};

type ValidatedInput = UpsertPermissionsInput & {
  entityKey: string;
  receipt: MutationReceipt;
};

function validateInput(input: UpsertPermissionsInput): ValidatedInput {
  const userId = validateSnowflake(input.userId, "User id");
  const guildId = validateSnowflake(input.guildId, "Guild id");
  if (
    typeof input.permissions.isAdmin !== "boolean" ||
    typeof input.permissions.isDiceWitchAdmin !== "boolean"
  ) {
    throw new Error("Membership permissions are invalid");
  }
  validateMutationMetadata(input.mutationId, input.occurredAt);
  const permissions = {
    isAdmin: input.permissions.isAdmin,
    isDiceWitchAdmin: input.permissions.isDiceWitchAdmin,
  };
  const entityKey = `${userId}:${guildId}`;
  return {
    ...input,
    userId,
    guildId,
    permissions,
    entityKey,
    receipt: {
      entityType: "membership",
      entityKey,
      operation: "upsert",
      payloadJson: JSON.stringify({ guildId, ...permissions, userId }),
      occurredAt: input.occurredAt,
    },
  };
}

function existingResult(
  row: MutationReceiptRow,
  input: ValidatedInput,
): UpsertPermissionsResult {
  if (!matchesMutationReceipt(row, input.receipt)) {
    return { status: "conflict" };
  }
  return { status: "existing", permissions: input.permissions };
}

export class D1MembershipRepository {
  constructor(private readonly db: D1Database) {}

  async listMutualGuilds(userId: string): Promise<MutualGuild[]> {
    const id = validateSnowflake(userId, "User id");
    const result = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT
           guilds.id AS guild_id,
           guilds.name AS guild_name,
           guilds.icon AS guild_icon,
           users_guilds.is_admin,
           users_guilds.is_dice_witch_admin
         FROM users_guilds
         LEFT JOIN guilds ON guilds.id = users_guilds.guild_id
         WHERE users_guilds.user_id = ?
         ORDER BY users_guilds.id`,
      )
      .bind(id)
      .all<MutualGuildRow>();
    return result.results.map((row) => ({
      guild:
        row.guild_id === null
          ? null
          : {
              id: row.guild_id,
              name: row.guild_name,
              icon: row.guild_icon,
            },
      isAdmin: row.is_admin === 1,
      isDiceWitchAdmin: row.is_dice_witch_admin === 1,
    }));
  }

  async upsertPermissions(
    value: UpsertPermissionsInput,
  ): Promise<UpsertPermissionsResult> {
    const input = validateInput(value);
    const existing = await readMutationReceipt(this.db, input.mutationId);
    if (existing !== null) return existingResult(existing, input);

    try {
      const [upsert, receipt] = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO users_guilds (
               user_id, guild_id, is_admin, is_dice_witch_admin,
               created_at, updated_at
             )
             SELECT ?, ?, ?, ?, ?, ?
             WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
               AND EXISTS (SELECT 1 FROM guilds WHERE id = ?)
             ON CONFLICT(user_id, guild_id) DO UPDATE SET
               is_admin = excluded.is_admin,
               is_dice_witch_admin = excluded.is_dice_witch_admin,
               updated_at = excluded.updated_at`,
          )
          .bind(
            input.userId,
            input.guildId,
            input.permissions.isAdmin ? 1 : 0,
            input.permissions.isDiceWitchAdmin ? 1 : 0,
            input.occurredAt,
            input.occurredAt,
            input.userId,
            input.guildId,
          ),
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             )
             SELECT ?, 'membership', ?, 'upsert', ?, ?
             WHERE EXISTS (
               SELECT 1 FROM users_guilds
               WHERE user_id = ? AND guild_id = ?
             )`,
          )
          .bind(
            input.mutationId,
            input.entityKey,
            input.receipt.payloadJson,
            input.occurredAt,
            input.userId,
            input.guildId,
          ),
      ]);
      const upserted = upsert?.meta.changes ?? 0;
      const receiptCreated = receipt?.meta.changes ?? 0;
      if (upserted === 0 && receiptCreated === 0) return { status: "missing" };
      if (upserted !== 1 || receiptCreated !== 1) {
        throw new Error("Membership permission mutation was not atomic");
      }
      return { status: "applied", permissions: input.permissions };
    } catch (error) {
      const concurrent = await readMutationReceipt(this.db, input.mutationId);
      if (concurrent !== null) return existingResult(concurrent, input);
      throw error;
    }
  }
}
