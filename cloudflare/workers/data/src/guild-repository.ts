import { z } from "zod";
import {
  snowflakeSchema,
  timestampSchema,
} from "../../../packages/discord-contracts/src/schema-primitives";

const mutationIdSchema = z.string().min(1).max(255);
const booleanSchema = z.boolean();
const GuildSettingsSchema = z.object({
  skipDiceDelay: booleanSchema,
  hideRollResultText: booleanSchema,
});
const reconciliationRunIdSchema = z.string().min(1).max(234);

export type GuildDisplayProfile = {
  name: string;
  icon: string | null;
};

export type GuildSettings = {
  skipDiceDelay: boolean;
  hideRollResultText: boolean;
};

export type GuildSettingsResult =
  | { status: "found"; settings: GuildSettings }
  | { status: "missing" };

type LegacyGuildSettings = Pick<GuildSettings, "skipDiceDelay">;

export type SetSkipDiceDelayInput = {
  guildId: string;
  skipDiceDelay: boolean;
  mutationId: string;
  occurredAt: number;
};

export type SetSkipDiceDelayResult =
  | { status: "applied" | "existing"; settings: LegacyGuildSettings }
  | { status: "missing" | "conflict" };

export type SetGuildSettingsInput = {
  guildId: string;
  settings: GuildSettings;
  mutationId: string;
  occurredAt: number;
};

export type SetGuildSettingsResult =
  | { status: "applied" | "existing"; settings: GuildSettings }
  | { status: "missing" | "conflict" };

export type SetGuildDisplayProfileInput = {
  guildId: string;
  profile: GuildDisplayProfile;
  mutationId: string;
  occurredAt: number;
};

export type SetGuildDisplayProfileResult =
  | { status: "applied" | "existing"; profile: GuildDisplayProfile }
  | { status: "missing" | "conflict" };

export type GuildLifecycleInput =
  | {
      type: "upsert";
      mutationId: string;
      occurredAt: number;
      guild: {
        id: string;
        name: string;
        icon: string | null;
        ownerId: string;
        memberCount: number;
        approximateMemberCount: number | null;
        preferredLocale: string;
        joinedTimestamp: number;
        isActive: true;
      };
    }
  | {
      type: "deactivate";
      mutationId: string;
      occurredAt: number;
      guildId: string;
    };

export type GuildLifecycleResult = {
  status: "applied" | "existing" | "missing" | "conflict";
};

export type ReconcileActiveGuildsInput = {
  guildIds: string[];
  runId: string;
  occurredAt: number;
};

export type ReconcileActiveGuildsResult = {
  status: "applied";
  activatedCount: number;
  deactivatedCount: number;
};

export type GuildStatusStats = {
  totalGuilds: number;
  totalMembers: number | null;
  guildCounts: number[];
};

type MutationReceiptRow = {
  entity_type: string;
  entity_key: string;
  operation: string;
  payload_json: string;
  occurred_at: number;
};

function validateGuildId(value: string): string {
  if (!snowflakeSchema.safeParse(value).success) {
    throw new Error("Guild id is invalid");
  }
  return value;
}

function validateMutation(input: SetSkipDiceDelayInput) {
  const guildId = validateGuildId(input.guildId);
  if (!mutationIdSchema.safeParse(input.mutationId).success) {
    throw new Error("Mutation id is invalid");
  }
  if (
    !booleanSchema.safeParse(input.skipDiceDelay).success ||
    !timestampSchema.safeParse(input.occurredAt).success
  ) {
    throw new Error("Guild preference mutation is invalid");
  }
  return {
    guildId,
    skipDiceDelay: input.skipDiceDelay,
    mutationId: input.mutationId,
    occurredAt: input.occurredAt,
    payloadJson: JSON.stringify({ skipDiceDelay: input.skipDiceDelay }),
  };
}

function validateSettingsMutation(input: SetGuildSettingsInput) {
  const guildId = validateGuildId(input.guildId);
  if (!mutationIdSchema.safeParse(input.mutationId).success) {
    throw new Error("Mutation id is invalid");
  }
  const settingsResult = GuildSettingsSchema.safeParse(input.settings);
  if (
    !settingsResult.success ||
    !timestampSchema.safeParse(input.occurredAt).success
  ) {
    throw new Error("Guild preference mutation is invalid");
  }
  const settings = settingsResult.data;
  return {
    guildId,
    settings,
    mutationId: input.mutationId,
    occurredAt: input.occurredAt,
    payloadJson: JSON.stringify(settings),
  };
}

function validateDisplayProfile(input: SetGuildDisplayProfileInput) {
  const guildId = validateGuildId(input.guildId);
  if (
    input.profile.name.length < 1 ||
    input.profile.name.length > 255 ||
    (input.profile.icon !== null && input.profile.icon.length > 255)
  ) {
    throw new Error("Guild display profile is invalid");
  }
  if (
    input.mutationId.length < 1 ||
    input.mutationId.length > 255 ||
    !Number.isSafeInteger(input.occurredAt) ||
    input.occurredAt < 0
  ) {
    throw new Error("Guild display mutation is invalid");
  }
  const profile = { name: input.profile.name, icon: input.profile.icon };
  return {
    guildId,
    profile,
    mutationId: input.mutationId,
    occurredAt: input.occurredAt,
    payloadJson: JSON.stringify(profile),
  };
}

function existingDisplayResult(
  row: MutationReceiptRow,
  input: ReturnType<typeof validateDisplayProfile>,
): SetGuildDisplayProfileResult {
  return row.entity_type === "guild" &&
    row.entity_key === input.guildId &&
    row.operation === "upsert" &&
    row.payload_json === input.payloadJson &&
    row.occurred_at === input.occurredAt
    ? { status: "existing", profile: input.profile }
    : { status: "conflict" };
}

function existingSettingsMutationResult(
  row: MutationReceiptRow,
  input: ReturnType<typeof validateSettingsMutation>,
): SetGuildSettingsResult {
  return row.entity_type === "guild" &&
      row.entity_key === input.guildId &&
      row.operation === "upsert" &&
      row.payload_json === input.payloadJson
    ? { status: "existing", settings: input.settings }
    : { status: "conflict" };
}

function existingMutationResult(
  row: MutationReceiptRow,
  input: ReturnType<typeof validateMutation>,
): SetSkipDiceDelayResult {
  if (
    row.entity_type !== "guild" ||
    row.entity_key !== input.guildId ||
    row.operation !== "upsert" ||
    row.payload_json !== input.payloadJson
  ) {
    return { status: "conflict" };
  }
  return {
    status: "existing",
    settings: { skipDiceDelay: input.skipDiceDelay },
  };
}

export class D1GuildRepository {
  constructor(private readonly db: D1Database) {}

  async applyLifecycle(
    value: GuildLifecycleInput,
  ): Promise<GuildLifecycleResult> {
    if (
      value.mutationId.length < 1 ||
      value.mutationId.length > 255 ||
      !Number.isSafeInteger(value.occurredAt) ||
      value.occurredAt < 0
    ) {
      throw new Error("Guild lifecycle mutation is invalid");
    }
    const guildId = validateGuildId(
      value.type === "upsert" ? value.guild.id : value.guildId,
    );
    const payload =
      value.type === "upsert" ? value.guild : { isActive: false };
    if (
      value.type === "upsert" &&
      (value.guild.name.length < 1 ||
        value.guild.name.length > 255 ||
        (value.guild.icon !== null && value.guild.icon.length > 255) ||
        !snowflakeSchema.safeParse(value.guild.ownerId).success ||
        !Number.isSafeInteger(value.guild.memberCount) ||
        value.guild.memberCount < 0 ||
        (value.guild.approximateMemberCount !== null &&
          (!Number.isSafeInteger(value.guild.approximateMemberCount) ||
            value.guild.approximateMemberCount < 0)) ||
        value.guild.preferredLocale.length < 1 ||
        value.guild.preferredLocale.length > 255 ||
        !Number.isSafeInteger(value.guild.joinedTimestamp) ||
        value.guild.joinedTimestamp < 0)
    ) {
      throw new Error("Guild lifecycle mutation is invalid");
    }
    const payloadJson = JSON.stringify(payload);
    const existing = await this.readMutation(value.mutationId);
    if (existing !== null) {
      return existing.entity_type === "guild" &&
        existing.entity_key === guildId &&
        existing.operation === "upsert" &&
        existing.payload_json === payloadJson
        ? { status: "existing" }
        : { status: "conflict" };
    }

    const receipt = this.db
      .prepare(
        `INSERT INTO mutation_receipts (
           mutation_id, entity_type, entity_key,
           operation, payload_json, occurred_at
         )
         SELECT ?, 'guild', ?, 'upsert', ?, ?
         WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?)`,
      )
      .bind(
        value.mutationId,
        guildId,
        payloadJson,
        value.occurredAt,
        guildId,
      );
    try {
      if (value.type === "upsert") {
        const mutation = this.db
          .prepare(
            `INSERT INTO guilds (
               id, name, icon, owner_id, member_count,
               approximate_member_count, preferred_locale,
               joined_timestamp, created_at, updated_at, is_active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               icon = excluded.icon,
               owner_id = excluded.owner_id,
               member_count = excluded.member_count,
               approximate_member_count = excluded.approximate_member_count,
               preferred_locale = excluded.preferred_locale,
               joined_timestamp = excluded.joined_timestamp,
               updated_at = excluded.updated_at,
               is_active = 1
             WHERE guilds.updated_at <= excluded.updated_at`,
          )
          .bind(
            guildId,
            value.guild.name,
            value.guild.icon,
            value.guild.ownerId,
            value.guild.memberCount,
            value.guild.approximateMemberCount,
            value.guild.preferredLocale,
            value.guild.joinedTimestamp,
            value.occurredAt,
            value.occurredAt,
          );
        const [changed, receiptCreated] = await this.db.batch([
          mutation,
          receipt,
        ]);
        const changedCount = changed?.meta.changes ?? 0;
        const receiptCount = receiptCreated?.meta.changes ?? 0;
        if (receiptCount !== 1 || (changedCount !== 0 && changedCount !== 1)) {
          throw new Error("Guild lifecycle mutation was not atomic");
        }
        return { status: "applied" };
      }

      const receiptMatch = `EXISTS (
        SELECT 1 FROM mutation_receipts
        WHERE mutation_id = ? AND entity_type = 'guild' AND entity_key = ?
          AND operation = 'upsert' AND payload_json = ? AND occurred_at = ?
      )`;
      const deleteRolls = this.db.prepare(
        `DELETE FROM saved_rolls
         WHERE guild_id = ?
           AND EXISTS (
             SELECT 1 FROM guilds WHERE id = ? AND updated_at <= ?
           )
           AND ${receiptMatch}`,
      ).bind(
        guildId,
        guildId,
        value.occurredAt,
        value.mutationId,
        guildId,
        payloadJson,
        value.occurredAt,
      );
      const deleteList = this.db.prepare(
        `DELETE FROM guild_saved_roll_lists
         WHERE guild_id = ?
           AND EXISTS (
             SELECT 1 FROM guilds WHERE id = ? AND updated_at <= ?
           )
           AND ${receiptMatch}`,
      ).bind(
        guildId,
        guildId,
        value.occurredAt,
        value.mutationId,
        guildId,
        payloadJson,
        value.occurredAt,
      );
      const deactivate = this.db.prepare(
        `UPDATE guilds SET is_active = 0, updated_at = ?
         WHERE id = ? AND updated_at <= ? AND ${receiptMatch}`,
      ).bind(
        value.occurredAt,
        guildId,
        value.occurredAt,
        value.mutationId,
        guildId,
        payloadJson,
        value.occurredAt,
      );
      const [receiptCreated, rollsDeleted, listDeleted, changed] =
        await this.db.batch([receipt, deleteRolls, deleteList, deactivate]);
      const receiptCount = receiptCreated?.meta.changes ?? 0;
      const changedCount = changed?.meta.changes ?? 0;
      const rollsDeletedCount = rollsDeleted?.meta.changes ?? 0;
      const listDeletedCount = listDeleted?.meta.changes ?? 0;
      if (receiptCount === 0) return { status: "missing" };
      if (
        receiptCount !== 1 ||
        (changedCount !== 0 && changedCount !== 1) ||
        (changedCount === 0 &&
          (rollsDeletedCount !== 0 || listDeletedCount !== 0))
      ) {
        throw new Error("Guild lifecycle mutation was not atomic");
      }
      return { status: "applied" };
    } catch (error) {
      const concurrent = await this.readMutation(value.mutationId);
      if (concurrent !== null) {
        return concurrent.entity_type === "guild" &&
          concurrent.entity_key === guildId &&
          concurrent.operation === "upsert" &&
          concurrent.payload_json === payloadJson
          ? { status: "existing" }
          : { status: "conflict" };
      }
      throw error;
    }
  }

  async reconcileActiveGuilds(
    input: ReconcileActiveGuildsInput,
  ): Promise<ReconcileActiveGuildsResult> {
    if (
      !Array.isArray(input.guildIds) ||
      !input.guildIds.every(
        (guildId) => snowflakeSchema.safeParse(guildId).success,
      ) ||
      new Set(input.guildIds).size !== input.guildIds.length ||
      !reconciliationRunIdSchema.safeParse(input.runId).success ||
      !timestampSchema.safeParse(input.occurredAt).success
    ) {
      throw new Error("Guild reconciliation input is invalid");
    }
    const guildIdsJson = JSON.stringify(input.guildIds);
    const inactivePayloadJson = JSON.stringify({ isActive: false });
    const activePayloadJson = JSON.stringify({ isActive: true });
    const currentGuildIds = "SELECT value FROM json_each(?)";
    const absentActiveGuilds =
      `is_active = 1 AND id NOT IN (${currentGuildIds}) AND updated_at < ?`;
    const presentInactiveGuilds =
      `is_active = 0 AND id IN (${currentGuildIds}) AND updated_at < ?`;
    const [deactivationReceipts, deactivated, activationReceipts, activated] =
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             )
             SELECT ? || ':' || id, 'guild', id, 'upsert', ?, ?
             FROM guilds
             WHERE ${absentActiveGuilds}`,
          )
          .bind(
            input.runId,
            inactivePayloadJson,
            input.occurredAt,
            guildIdsJson,
            input.occurredAt,
          ),
        this.db
          .prepare(
            `UPDATE guilds
             SET is_active = 0, updated_at = ?
             WHERE ${absentActiveGuilds}`,
          )
          .bind(input.occurredAt, guildIdsJson, input.occurredAt),
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             )
             SELECT ? || ':' || id, 'guild', id, 'upsert', ?, ?
             FROM guilds
             WHERE ${presentInactiveGuilds}`,
          )
          .bind(
            input.runId,
            activePayloadJson,
            input.occurredAt,
            guildIdsJson,
            input.occurredAt,
          ),
        this.db
          .prepare(
            `UPDATE guilds
             SET is_active = 1, updated_at = ?
             WHERE ${presentInactiveGuilds}`,
          )
          .bind(input.occurredAt, guildIdsJson, input.occurredAt),
      ]);
    const deactivationReceiptCount = deactivationReceipts?.meta.changes ?? 0;
    const deactivatedCount = deactivated?.meta.changes ?? 0;
    const activationReceiptCount = activationReceipts?.meta.changes ?? 0;
    const activatedCount = activated?.meta.changes ?? 0;
    if (
      deactivationReceiptCount !== deactivatedCount ||
      activationReceiptCount !== activatedCount
    ) {
      throw new Error("Guild reconciliation was not atomic");
    }
    return { status: "applied", activatedCount, deactivatedCount };
  }

  async getStatusStats(shardCount: number): Promise<GuildStatusStats> {
    if (!Number.isSafeInteger(shardCount) || shardCount < 1) {
      throw new Error("Status shard count is invalid");
    }
    const result = await this.db
      .prepare("SELECT id, member_count FROM guilds WHERE is_active = 1")
      .all<{ id: string; member_count: number | null }>();
    const guildCounts = Array.from({ length: shardCount }, () => 0);
    let totalMembers = 0;
    let memberCountsComplete = true;
    for (const guild of result.results) {
      const shardId = Number((BigInt(guild.id) >> 22n) % BigInt(shardCount));
      const currentCount = guildCounts[shardId];
      if (currentCount === undefined) {
        throw new Error("Status shard calculation failed");
      }
      guildCounts[shardId] = currentCount + 1;
      if (guild.member_count === null) {
        memberCountsComplete = false;
      } else {
        totalMembers += guild.member_count;
        if (!Number.isSafeInteger(totalMembers)) {
          throw new Error("Status member total is invalid");
        }
      }
    }
    return {
      totalGuilds: result.results.length,
      totalMembers: memberCountsComplete ? totalMembers : null,
      guildCounts,
    };
  }

  async setDisplayProfile(
    value: SetGuildDisplayProfileInput,
  ): Promise<SetGuildDisplayProfileResult> {
    const input = validateDisplayProfile(value);
    const existing = await this.readMutation(input.mutationId);
    if (existing !== null) return existingDisplayResult(existing, input);

    try {
      const [update, receipt] = await this.db.batch([
        this.db
          .prepare(
            `UPDATE guilds
             SET name = ?, icon = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            input.profile.name,
            input.profile.icon,
            input.occurredAt,
            input.guildId,
          ),
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             )
             SELECT ?, 'guild', ?, 'upsert', ?, ?
             WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?)`,
          )
          .bind(
            input.mutationId,
            input.guildId,
            input.payloadJson,
            input.occurredAt,
            input.guildId,
          ),
      ]);
      const updated = update?.meta.changes ?? 0;
      const receiptCreated = receipt?.meta.changes ?? 0;
      if (updated === 0 && receiptCreated === 0) return { status: "missing" };
      if (updated !== 1 || receiptCreated !== 1) {
        throw new Error("Guild display mutation was not atomic");
      }
      return { status: "applied", profile: input.profile };
    } catch (error) {
      const concurrent = await this.readMutation(input.mutationId);
      if (concurrent !== null) return existingDisplayResult(concurrent, input);
      throw error;
    }
  }

  async getDisplayProfile(guildId: string): Promise<GuildDisplayProfile | null> {
    const id = validateGuildId(guildId);
    return this.db
      .withSession("first-primary")
      .prepare("SELECT name, icon FROM guilds WHERE id = ?")
      .bind(id)
      .first<GuildDisplayProfile>();
  }

  async getSettings(guildId: string): Promise<GuildSettingsResult> {
    const id = validateGuildId(guildId);
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT skip_dice_delay, hide_roll_result_text
         FROM guilds WHERE id = ?`,
      )
      .bind(id)
      .first<{ skip_dice_delay: number; hide_roll_result_text: number }>();
    if (row === null) return { status: "missing" };
    return {
      status: "found",
      settings: {
        skipDiceDelay: row.skip_dice_delay === 1,
        hideRollResultText: row.hide_roll_result_text === 1,
      },
    };
  }

  async setSettings(
    value: SetGuildSettingsInput,
  ): Promise<SetGuildSettingsResult> {
    const input = validateSettingsMutation(value);
    const existing = await this.readMutation(input.mutationId);
    if (existing !== null) {
      return existingSettingsMutationResult(existing, input);
    }

    try {
      const [update, receipt] = await this.db.batch([
        this.db
          .prepare(
            `UPDATE guilds
             SET skip_dice_delay = ?, hide_roll_result_text = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            input.settings.skipDiceDelay ? 1 : 0,
            input.settings.hideRollResultText ? 1 : 0,
            input.occurredAt,
            input.guildId,
          ),
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             )
             SELECT ?, 'guild', ?, 'upsert', ?, ?
             WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?)`,
          )
          .bind(
            input.mutationId,
            input.guildId,
            input.payloadJson,
            input.occurredAt,
            input.guildId,
          ),
      ]);
      if (update === undefined || receipt === undefined) {
        throw new Error("Guild preference batch result is incomplete");
      }
      const updated = update.meta.changes;
      const receiptCreated = receipt.meta.changes;
      if (updated === 0 && receiptCreated === 0) return { status: "missing" };
      if (updated !== 1 || receiptCreated !== 1) {
        throw new Error("Guild preference mutation was not atomic");
      }
      return { status: "applied", settings: input.settings };
    } catch (error) {
      const concurrent = await this.readMutation(input.mutationId);
      if (concurrent !== null) {
        return existingSettingsMutationResult(concurrent, input);
      }
      throw error;
    }
  }

  async setSkipDiceDelay(
    value: SetSkipDiceDelayInput,
  ): Promise<SetSkipDiceDelayResult> {
    const input = validateMutation(value);
    const existing = await this.readMutation(input.mutationId);
    if (existing !== null) return existingMutationResult(existing, input);

    try {
      const [update, receipt] = await this.db.batch([
        this.db
          .prepare(
            `UPDATE guilds
             SET skip_dice_delay = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(
            input.skipDiceDelay ? 1 : 0,
            input.occurredAt,
            input.guildId,
          ),
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             )
             SELECT ?, 'guild', ?, 'upsert', ?, ?
             WHERE EXISTS (SELECT 1 FROM guilds WHERE id = ?)`,
          )
          .bind(
            input.mutationId,
            input.guildId,
            input.payloadJson,
            input.occurredAt,
            input.guildId,
          ),
      ]);
      if (update === undefined || receipt === undefined) {
        throw new Error("Guild preference batch result is incomplete");
      }
      const updated = update.meta.changes;
      const receiptCreated = receipt.meta.changes;
      if (updated === 0 && receiptCreated === 0) return { status: "missing" };
      if (updated !== 1 || receiptCreated !== 1) {
        throw new Error("Guild preference mutation was not atomic");
      }
      return {
        status: "applied",
        settings: { skipDiceDelay: input.skipDiceDelay },
      };
    } catch (error) {
      const concurrent = await this.readMutation(input.mutationId);
      if (concurrent !== null) {
        return existingMutationResult(concurrent, input);
      }
      throw error;
    }
  }

  private async readMutation(
    mutationId: string,
  ): Promise<MutationReceiptRow | null> {
    return this.db
      .withSession("first-primary")
      .prepare(
        `SELECT entity_type, entity_key, operation, payload_json, occurred_at
         FROM mutation_receipts
         WHERE mutation_id = ?`,
      )
      .bind(mutationId)
      .first<MutationReceiptRow>();
  }
}
