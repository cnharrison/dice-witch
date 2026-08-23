import { validateSnowflake } from "./mutation-receipt";

export type AccountRollInput = {
  interactionId: string;
  guildId: string;
  userId: string;
  username: string;
  receivedAt: number;
  accountedAt: number;
};

export type AccountRollResult = {
  status: "applied" | "existing" | "conflict";
};

type InteractionReceipt = {
  command_name: string;
  guild_id: string | null;
  user_id: string | null;
  received_at: number;
  accounted_at: number | null;
  request_fingerprint: string | null;
};

type FingerprintedInput = AccountRollInput & {
  requestFingerprint: string;
};

const INPUT_KEYS = [
  "interactionId",
  "guildId",
  "userId",
  "username",
  "receivedAt",
  "accountedAt",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function parseAccountRollInput(value: unknown): AccountRollInput {
  if (!isRecord(value)) throw new Error("Roll accounting request is invalid");
  const keys = Object.keys(value).sort();
  const expected = [...INPUT_KEYS].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index]) ||
    typeof value.interactionId !== "string" ||
    typeof value.guildId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.username !== "string" ||
    typeof value.receivedAt !== "number" ||
    typeof value.accountedAt !== "number"
  ) {
    throw new Error("Roll accounting request is invalid");
  }
  const interactionId = validateSnowflake(value.interactionId, "Interaction id");
  const guildId = validateSnowflake(value.guildId, "Guild id");
  const userId = validateSnowflake(value.userId, "User id");
  if (value.username.length === 0 || value.username.length > 32) {
    throw new Error("Roll accounting username is invalid");
  }
  if (
    !validateTimestamp(value.receivedAt) ||
    !validateTimestamp(value.accountedAt) ||
    value.accountedAt < value.receivedAt
  ) {
    throw new Error("Roll accounting timestamps are invalid");
  }
  return {
    interactionId,
    guildId,
    userId,
    username: value.username,
    receivedAt: value.receivedAt,
    accountedAt: value.accountedAt,
  };
}

function parseInteractionReceipt(value: unknown): InteractionReceipt {
  if (
    !isRecord(value) ||
    typeof value.command_name !== "string" ||
    (value.guild_id !== null && typeof value.guild_id !== "string") ||
    (value.user_id !== null && typeof value.user_id !== "string") ||
    typeof value.received_at !== "number" ||
    !validateTimestamp(value.received_at) ||
    (value.accounted_at !== null &&
      (typeof value.accounted_at !== "number" ||
        !validateTimestamp(value.accounted_at) ||
        value.accounted_at < value.received_at)) ||
    (value.request_fingerprint !== null &&
      (typeof value.request_fingerprint !== "string" ||
        !/^[0-9a-f]{64}$/.test(value.request_fingerprint)))
  ) {
    throw new Error("Stored roll accounting receipt is invalid");
  }
  return {
    command_name: value.command_name,
    guild_id: value.guild_id,
    user_id: value.user_id,
    received_at: value.received_at,
    accounted_at: value.accounted_at,
    request_fingerprint: value.request_fingerprint,
  };
}

async function fingerprintRequest(input: AccountRollInput): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(input)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function matchesReceipt(
  receipt: InteractionReceipt,
  input: FingerprintedInput,
): boolean {
  return (
    receipt.command_name === "roll" &&
    receipt.guild_id === input.guildId &&
    receipt.user_id === input.userId &&
    receipt.received_at === input.receivedAt &&
    receipt.accounted_at === input.accountedAt &&
    receipt.request_fingerprint === input.requestFingerprint
  );
}

export class D1RollAccountingRepository {
  constructor(private readonly db: D1Database) {}

  async account(input: AccountRollInput): Promise<AccountRollResult> {
    const fingerprinted: FingerprintedInput = {
      ...input,
      requestFingerprint: await fingerprintRequest(input),
    };
    const existing = await this.readExisting(fingerprinted);
    if (existing !== null) return existing;

    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO guilds (
               id, roll_count, created_at, updated_at, is_active
             ) VALUES (?, 1, ?, ?, 1)
             ON CONFLICT(id) DO UPDATE SET
               roll_count = CASE
                 WHEN guilds.roll_count IS NULL THEN NULL
                 ELSE guilds.roll_count + 1
               END,
               updated_at = excluded.updated_at,
               is_active = 1`,
          )
          .bind(
            fingerprinted.guildId,
            fingerprinted.accountedAt,
            fingerprinted.accountedAt,
          ),
        this.db
          .prepare(
            `INSERT INTO users (
               id, username, roll_count, created_at, updated_at
             ) VALUES (?, ?, 1, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               username = excluded.username,
               roll_count = CASE
                 WHEN users.roll_count IS NULL THEN NULL
                 ELSE users.roll_count + 1
               END,
               updated_at = excluded.updated_at`,
          )
          .bind(
            fingerprinted.userId,
            fingerprinted.username,
            fingerprinted.accountedAt,
            fingerprinted.accountedAt,
          ),
        this.db
          .prepare(
            `INSERT INTO users_guilds (
               user_id, guild_id, is_admin, is_dice_witch_admin,
               created_at, updated_at
             ) VALUES (?, ?, 0, 0, ?, ?)
             ON CONFLICT(user_id, guild_id) DO NOTHING`,
          )
          .bind(
            fingerprinted.userId,
            fingerprinted.guildId,
            fingerprinted.accountedAt,
            fingerprinted.accountedAt,
          ),
        this.db
          .prepare(
            `INSERT INTO interaction_receipts (
               interaction_id, command_name, guild_id, user_id,
               received_at, accounted_at, request_fingerprint
             ) VALUES (?, 'roll', ?, ?, ?, ?, ?)`,
          )
          .bind(
            fingerprinted.interactionId,
            fingerprinted.guildId,
            fingerprinted.userId,
            fingerprinted.receivedAt,
            fingerprinted.accountedAt,
            fingerprinted.requestFingerprint,
          ),
      ]);
      if (
        results.length !== 4 ||
        results[0]?.meta.changes !== 1 ||
        results[1]?.meta.changes !== 1 ||
        (results[2]?.meta.changes !== 0 && results[2]?.meta.changes !== 1) ||
        results[3]?.meta.changes !== 1
      ) {
        throw new Error("Roll accounting mutation was not atomic");
      }
      return { status: "applied" };
    } catch (error) {
      const concurrent = await this.readExisting(fingerprinted);
      if (concurrent !== null) return concurrent;
      throw error;
    }
  }

  private async readExisting(
    input: FingerprintedInput,
  ): Promise<AccountRollResult | null> {
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT command_name, guild_id, user_id, received_at, accounted_at,
                request_fingerprint
         FROM interaction_receipts WHERE interaction_id = ?`,
      )
      .bind(input.interactionId)
      .first<unknown>();
    if (row === null) return null;
    const receipt = parseInteractionReceipt(row);

    return matchesReceipt(receipt, input)
      ? { status: "existing" }
      : { status: "conflict" };
  }
}
