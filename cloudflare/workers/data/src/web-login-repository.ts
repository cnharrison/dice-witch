import {
  readMutationReceipt,
  validateMutationMetadata,
  validateSnowflake,
  type MutationReceiptRow,
} from "./mutation-receipt";
import { hashOpaqueToken } from "./session-repository";

export type WebLoginProfile = {
  username: string;
  email: string | null;
  avatar: string | null;
};

export type CompleteWebLoginInput = {
  token: string;
  userId: string;
  profile: WebLoginProfile;
  mutationId: string;
  createdAt: number;
  expiresAt: number;
};

export type CompleteWebLoginResult =
  | {
      status: "applied" | "existing";
      session: { userId: string; createdAt: number; expiresAt: number };
    }
  | { status: "conflict" };

type SessionRow = {
  user_id: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
};

type ValidatedInput = CompleteWebLoginInput & {
  tokenHash: string;
};

function validNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 255);
}

function validateProfile(value: WebLoginProfile): WebLoginProfile {
  if (
    typeof value.username !== "string" ||
    value.username.length > 255 ||
    !validNullableString(value.email) ||
    !validNullableString(value.avatar)
  ) {
    throw new Error("Web login profile is invalid");
  }
  return { ...value };
}

async function validateInput(
  input: CompleteWebLoginInput,
): Promise<ValidatedInput> {
  const userId = validateSnowflake(input.userId, "User id");
  const profile = validateProfile(input.profile);
  validateMutationMetadata(input.mutationId, input.createdAt);
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.createdAt) {
    throw new Error("Session expiry must be after creation");
  }
  const tokenHash = await hashOpaqueToken(input.token);
  return { ...input, userId, profile, tokenHash };
}

function sessionResult(
  status: "applied" | "existing",
  input: ValidatedInput,
): CompleteWebLoginResult {
  return {
    status,
    session: {
      userId: input.userId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    },
  };
}

function sameSession(row: SessionRow, input: ValidatedInput): boolean {
  return (
    row.user_id === input.userId &&
    row.created_at === input.createdAt &&
    row.expires_at === input.expiresAt &&
    row.revoked_at === null
  );
}

function sameLoginMutation(
  row: MutationReceiptRow,
  input: ValidatedInput,
): boolean {
  if (
    row.entity_type !== "user" ||
    row.entity_key !== input.userId ||
    row.operation !== "upsert" ||
    row.occurred_at !== input.createdAt
  ) {
    return false;
  }
  try {
    const payload: unknown = JSON.parse(row.payload_json);
    return (
      typeof payload === "object" &&
      payload !== null &&
      "username" in payload &&
      payload.username === input.profile.username &&
      "email" in payload &&
      payload.email === input.profile.email &&
      "lastWebLogin" in payload &&
      payload.lastWebLogin === input.createdAt &&
      "avatar" in payload &&
      payload.avatar === input.profile.avatar
    );
  } catch {
    return false;
  }
}

function existingResult(
  receipt: MutationReceiptRow,
  session: SessionRow | null,
  input: ValidatedInput,
): CompleteWebLoginResult {
  return sameLoginMutation(receipt, input) &&
    session !== null &&
    sameSession(session, input)
    ? sessionResult("existing", input)
    : { status: "conflict" };
}

export class D1WebLoginRepository {
  constructor(private readonly db: D1Database) {}

  async complete(value: CompleteWebLoginInput): Promise<CompleteWebLoginResult> {
    const input = await validateInput(value);
    const [receipt, session] = await Promise.all([
      readMutationReceipt(this.db, input.mutationId),
      this.readSession(input.tokenHash),
    ]);
    if (receipt !== null) return existingResult(receipt, session, input);
    if (session !== null) return { status: "conflict" };

    try {
      const [user, insertedReceipt, insertedSession] = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO users (
               id, username, email, last_web_login, avatar,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               username = excluded.username,
               email = excluded.email,
               last_web_login = excluded.last_web_login,
               avatar = excluded.avatar,
               updated_at = excluded.updated_at`,
          )
          .bind(
            input.userId,
            input.profile.username,
            input.profile.email,
            input.createdAt,
            input.profile.avatar,
            input.createdAt,
            input.createdAt,
          ),
        this.db
          .prepare(
            `INSERT INTO mutation_receipts (
               mutation_id, entity_type, entity_key,
               operation, payload_json, occurred_at
             )
             SELECT ?, 'user', id, 'upsert', json_object(
               'username', username,
               'email', email,
               'lastWebLogin', last_web_login,
               'flags', flags,
               'discriminator', discriminator,
               'avatar', avatar
             ), ?
             FROM users WHERE id = ?`,
          )
          .bind(input.mutationId, input.createdAt, input.userId),
        this.db
          .prepare(
            `INSERT INTO web_sessions (
               token_hash, user_id, created_at, expires_at, revoked_at
             ) VALUES (?, ?, ?, ?, NULL)`,
          )
          .bind(
            input.tokenHash,
            input.userId,
            input.createdAt,
            input.expiresAt,
          ),
      ]);
      if (
        user?.meta.changes !== 1 ||
        insertedReceipt?.meta.changes !== 1 ||
        insertedSession?.meta.changes !== 1
      ) {
        throw new Error("Web login mutation was not atomic");
      }
      return sessionResult("applied", input);
    } catch (error) {
      const [concurrentReceipt, concurrentSession] = await Promise.all([
        readMutationReceipt(this.db, input.mutationId),
        this.readSession(input.tokenHash),
      ]);
      if (concurrentReceipt !== null) {
        return existingResult(concurrentReceipt, concurrentSession, input);
      }
      if (concurrentSession !== null) return { status: "conflict" };
      throw error;
    }
  }

  private async readSession(tokenHash: string): Promise<SessionRow | null> {
    return this.db
      .withSession("first-primary")
      .prepare(
        `SELECT user_id, created_at, expires_at, revoked_at
         FROM web_sessions WHERE token_hash = ?`,
      )
      .bind(tokenHash)
      .first<SessionRow>();
  }
}
