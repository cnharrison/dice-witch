import { z } from "zod";
import {
  matchesMutationReceipt,
  readMutationReceipt,
  validateMutationMetadata,
  validateSnowflake,
  type MutationReceipt,
  type MutationReceiptRow,
} from "./mutation-receipt";

export type UserProfile = {
  username: string | null;
  email: string | null;
  lastWebLogin: number | null;
  flags: number | null;
  discriminator: string | null;
  avatar: string | null;
};

export type UserProfileResult =
  | { status: "found"; profile: UserProfile }
  | { status: "missing" };

export type UpsertUserProfileInput = {
  userId: string;
  profile: UserProfile;
  mutationId: string;
  occurredAt: number;
};

export type UpsertUserProfileResult =
  | { status: "applied" | "existing"; profile: UserProfile }
  | { status: "conflict" };

type UserRow = {
  username: string | null;
  email: string | null;
  last_web_login: number | null;
  flags: number | null;
  discriminator: string | null;
  avatar: string | null;
};

type ValidatedInput = UpsertUserProfileInput & {
  receipt: MutationReceipt;
};

const nullableProfileStringSchema = z.string().max(255).nullable();
const safeIntegerSchema = z.number().refine(Number.isSafeInteger);
const UserProfileSchema = z.object({
  username: nullableProfileStringSchema,
  email: nullableProfileStringSchema,
  lastWebLogin: safeIntegerSchema.nonnegative().nullable(),
  flags: safeIntegerSchema.nullable(),
  discriminator: nullableProfileStringSchema,
  avatar: nullableProfileStringSchema,
});

function validateProfile(value: UserProfile): UserProfile {
  const result = UserProfileSchema.safeParse(value);
  if (!result.success) throw new Error("User profile is invalid");
  return result.data;
}

function validateInput(input: UpsertUserProfileInput): ValidatedInput {
  const userId = validateSnowflake(input.userId, "User id");
  const profile = validateProfile(input.profile);
  validateMutationMetadata(input.mutationId, input.occurredAt);
  return {
    ...input,
    userId,
    profile,
    receipt: {
      entityType: "user",
      entityKey: userId,
      operation: "upsert",
      payloadJson: JSON.stringify(profile),
      occurredAt: input.occurredAt,
    },
  };
}

function rowProfile(row: UserRow): UserProfile {
  return {
    username: row.username,
    email: row.email,
    lastWebLogin: row.last_web_login,
    flags: row.flags,
    discriminator: row.discriminator,
    avatar: row.avatar,
  };
}

function existingResult(
  row: MutationReceiptRow,
  input: ValidatedInput,
): UpsertUserProfileResult {
  if (!matchesMutationReceipt(row, input.receipt)) {
    return { status: "conflict" };
  }
  return { status: "existing", profile: input.profile };
}

export class D1UserRepository {
  constructor(private readonly db: D1Database) {}

  async getProfile(userId: string): Promise<UserProfileResult> {
    const id = validateSnowflake(userId, "User id");
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT username, email, last_web_login, flags, discriminator, avatar
         FROM users WHERE id = ?`,
      )
      .bind(id)
      .first<UserRow>();
    return row === null
      ? { status: "missing" }
      : { status: "found", profile: rowProfile(row) };
  }

  async upsertProfile(
    value: UpsertUserProfileInput,
  ): Promise<UpsertUserProfileResult> {
    const input = validateInput(value);
    const existing = await readMutationReceipt(this.db, input.mutationId);
    if (existing !== null) return existingResult(existing, input);

    try {
      const [upsert, receipt] = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO users (
               id, username, email, last_web_login, flags, discriminator,
               avatar, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               username = excluded.username,
               email = excluded.email,
               last_web_login = excluded.last_web_login,
               flags = excluded.flags,
               discriminator = excluded.discriminator,
               avatar = excluded.avatar,
               updated_at = excluded.updated_at`,
          )
          .bind(
            input.userId,
            input.profile.username,
            input.profile.email,
            input.profile.lastWebLogin,
            input.profile.flags,
            input.profile.discriminator,
            input.profile.avatar,
            input.occurredAt,
            input.occurredAt,
          ),
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             ) VALUES (?, 'user', ?, 'upsert', ?, ?)`,
          )
          .bind(
            input.mutationId,
            input.userId,
            input.receipt.payloadJson,
            input.occurredAt,
          ),
      ]);
      if (upsert?.meta.changes !== 1 || receipt?.meta.changes !== 1) {
        throw new Error("User profile mutation was not atomic");
      }
      return { status: "applied", profile: input.profile };
    } catch (error) {
      const concurrent = await readMutationReceipt(this.db, input.mutationId);
      if (concurrent !== null) return existingResult(concurrent, input);
      throw error;
    }
  }
}
