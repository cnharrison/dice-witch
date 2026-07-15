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

type ValidatedInput = AccountRollInput & {
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
  return {
    interactionId: value.interactionId,
    guildId: value.guildId,
    userId: value.userId,
    username: value.username,
    receivedAt: value.receivedAt,
    accountedAt: value.accountedAt,
  };
}

function validateTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateInput(value: unknown): AccountRollInput {
  const input = parseAccountRollInput(value);
  const interactionId = validateSnowflake(
    input.interactionId,
    "Interaction id",
  );
  const guildId = validateSnowflake(input.guildId, "Guild id");
  const userId = validateSnowflake(input.userId, "User id");
  if (
    typeof input.username !== "string" ||
    input.username.length === 0 ||
    input.username.length > 32
  ) {
    throw new Error("Roll accounting username is invalid");
  }
  if (
    !validateTimestamp(input.receivedAt) ||
    !validateTimestamp(input.accountedAt) ||
    input.accountedAt < input.receivedAt
  ) {
    throw new Error("Roll accounting timestamps are invalid");
  }
  return { ...input, interactionId, guildId, userId };
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
  input: ValidatedInput,
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

  async account(value: unknown): Promise<AccountRollResult> {
    const validated = validateInput(value);
    const input: ValidatedInput = {
      ...validated,
      requestFingerprint: await fingerprintRequest(validated),
    };
    const existing = await this.readExisting(input);
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
          .bind(input.guildId, input.accountedAt, input.accountedAt),
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
            input.userId,
            input.username,
            input.accountedAt,
            input.accountedAt,
          ),
        this.db
          .prepare(
            `INSERT INTO interaction_receipts (
               interaction_id, command_name, guild_id, user_id,
               received_at, accounted_at, request_fingerprint
             ) VALUES (?, 'roll', ?, ?, ?, ?, ?)`,
          )
          .bind(
            input.interactionId,
            input.guildId,
            input.userId,
            input.receivedAt,
            input.accountedAt,
            input.requestFingerprint,
          ),
      ]);
      if (
        results.length !== 3 ||
        results.some((result) => result.meta.changes !== 1)
      ) {
        throw new Error("Roll accounting mutation was not atomic");
      }
      return { status: "applied" };
    } catch (error) {
      const concurrent = await this.readExisting(input);
      if (concurrent !== null) return concurrent;
      throw error;
    }
  }

  private async readExisting(
    input: ValidatedInput,
  ): Promise<AccountRollResult | null> {
    const receipt = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT command_name, guild_id, user_id, received_at, accounted_at,
                request_fingerprint
         FROM interaction_receipts WHERE interaction_id = ?`,
      )
      .bind(input.interactionId)
      .first<InteractionReceipt>();
    if (receipt === null) return null;

    return matchesReceipt(receipt, input)
      ? { status: "existing" }
      : { status: "conflict" };
  }
}
