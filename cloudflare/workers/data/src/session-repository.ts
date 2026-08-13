const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const TOKEN_BYTES = 32;

export type SessionUser = {
  id: string;
  username: string | null;
  email: string | null;
  avatar: string | null;
};

export type WebSession = {
  user: SessionUser;
  createdAt: number;
  expiresAt: number;
};

export type SessionResult =
  | { status: "found"; session: WebSession }
  | { status: "missing" | "expired" | "revoked" };

export type CreateSessionInput = {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
};

export type CreateSessionResult = {
  status: "created" | "existing" | "missing_user" | "conflict";
};

export type RevokeSessionResult = {
  status: "revoked" | "existing" | "missing";
};

export type OAuthStateContext = {
  purpose: "sign_in" | "refresh";
  expectedUserId: string | null;
  returnTo: string;
};

export type CreateOAuthStateInput = OAuthStateContext & {
  token: string;
  createdAt: number;
  expiresAt: number;
};

export type CreateOAuthStateResult = {
  status: "created" | "existing" | "conflict";
};

export type ConsumeOAuthStateResult =
  | { status: "consumed"; context: OAuthStateContext }
  | { status: "already_consumed" | "expired" | "missing" };

type SessionRow = {
  user_id: string;
  username: string | null;
  email: string | null;
  avatar: string | null;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
};

type SessionIdentityRow = {
  user_id: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
};

type OAuthStateRow = {
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
  purpose: string;
  expected_user_id: string | null;
  return_to: string;
};

function validateToken(value: string): string {
  if (!OPAQUE_TOKEN.test(value)) throw new Error("Opaque token is invalid");
  return value;
}

function validateTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Timestamp is invalid");
  }
  return value;
}

function validateRange(createdAt: number, expiresAt: number, name: string): void {
  validateTimestamp(createdAt);
  validateTimestamp(expiresAt);
  if (expiresAt <= createdAt) throw new Error(`${name} timestamps are invalid`);
}

function validateOAuthStateContext(
  input: OAuthStateContext,
): OAuthStateContext {
  const expectedUserId = input.expectedUserId;
  if (
    (input.purpose === "sign_in" && expectedUserId !== null) ||
    (input.purpose === "refresh" &&
      (expectedUserId === null || !SNOWFLAKE.test(expectedUserId))) ||
    typeof input.returnTo !== "string" ||
    input.returnTo.length < 1 ||
    input.returnTo.length > 2_048
  ) {
    throw new Error("OAuth state context is invalid");
  }
  return {
    purpose: input.purpose,
    expectedUserId,
    returnTo: input.returnTo,
  };
}

function oauthStateContext(row: OAuthStateRow): OAuthStateContext {
  return validateOAuthStateContext({
    purpose: row.purpose as OAuthStateContext["purpose"],
    expectedUserId: row.expected_user_id,
    returnTo: row.return_to,
  });
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function generateOpaqueToken(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function hashOpaqueToken(token: string): Promise<string> {
  const validated = validateToken(token);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(validated),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class D1SessionRepository {
  constructor(private readonly db: D1Database) {}

  async createSession(
    input: CreateSessionInput,
  ): Promise<CreateSessionResult> {
    if (!SNOWFLAKE.test(input.userId)) throw new Error("User id is invalid");
    validateRange(input.createdAt, input.expiresAt, "Session");
    const tokenHash = await hashOpaqueToken(input.token);
    const existing = await this.readSessionIdentity(tokenHash);
    if (existing !== null) return this.existingSession(existing, input);

    try {
      const result = await this.db
        .prepare(
          `INSERT INTO web_sessions (
             token_hash, user_id, created_at, expires_at
           )
           SELECT ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`,
        )
        .bind(
          tokenHash,
          input.userId,
          input.createdAt,
          input.expiresAt,
          input.userId,
        )
        .run();
      return result.meta.changes === 1
        ? { status: "created" }
        : { status: "missing_user" };
    } catch (error) {
      const concurrent = await this.readSessionIdentity(tokenHash);
      if (concurrent !== null) return this.existingSession(concurrent, input);
      throw error;
    }
  }

  async getSession(token: string, now: number): Promise<SessionResult> {
    const tokenHash = await hashOpaqueToken(token);
    const timestamp = validateTimestamp(now);
    const row = await this.db
      .withSession("first-primary")
      .prepare(
        `SELECT sessions.user_id, users.username, users.email, users.avatar,
                sessions.created_at, sessions.expires_at, sessions.revoked_at
         FROM web_sessions AS sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ?`,
      )
      .bind(tokenHash)
      .first<SessionRow>();
    if (row === null) return { status: "missing" };
    if (row.revoked_at !== null) return { status: "revoked" };
    if (timestamp >= row.expires_at) return { status: "expired" };
    return {
      status: "found",
      session: {
        user: {
          id: row.user_id,
          username: row.username,
          email: row.email,
          avatar: row.avatar,
        },
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      },
    };
  }

  async revokeSession(token: string, revokedAt: number): Promise<RevokeSessionResult> {
    const tokenHash = await hashOpaqueToken(token);
    const timestamp = validateTimestamp(revokedAt);
    const result = await this.db
      .prepare(
        `UPDATE web_sessions
         SET revoked_at = ?
         WHERE token_hash = ? AND revoked_at IS NULL`,
      )
      .bind(timestamp, tokenHash)
      .run();
    if (result.meta.changes === 1) return { status: "revoked" };
    const existing = await this.readSessionIdentity(tokenHash);
    return existing === null ? { status: "missing" } : { status: "existing" };
  }

  async createOAuthState(
    input: CreateOAuthStateInput,
  ): Promise<CreateOAuthStateResult> {
    validateRange(input.createdAt, input.expiresAt, "OAuth state");
    const context = validateOAuthStateContext(input);
    const stateHash = await hashOpaqueToken(input.token);
    const existing = await this.readOAuthState(stateHash);
    if (existing !== null) return this.existingOAuthState(existing, input);
    try {
      await this.db
        .prepare(
          `INSERT INTO oauth_states (
             state_hash, created_at, expires_at,
             purpose, expected_user_id, return_to
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          stateHash,
          input.createdAt,
          input.expiresAt,
          context.purpose,
          context.expectedUserId,
          context.returnTo,
        )
        .run();
      return { status: "created" };
    } catch (error) {
      const concurrent = await this.readOAuthState(stateHash);
      if (concurrent !== null) return this.existingOAuthState(concurrent, input);
      throw error;
    }
  }

  async consumeOAuthState(
    token: string,
    consumedAt: number,
  ): Promise<ConsumeOAuthStateResult> {
    const stateHash = await hashOpaqueToken(token);
    const timestamp = validateTimestamp(consumedAt);
    const result = await this.db
      .prepare(
        `UPDATE oauth_states
         SET consumed_at = ?
         WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
      )
      .bind(timestamp, stateHash, timestamp)
      .run();
    if (result.meta.changes === 1) {
      const consumed = await this.readOAuthState(stateHash);
      if (consumed === null) throw new Error("Consumed OAuth state is missing");
      return { status: "consumed", context: oauthStateContext(consumed) };
    }
    const existing = await this.readOAuthState(stateHash);
    if (existing === null) return { status: "missing" };
    if (existing.consumed_at !== null) return { status: "already_consumed" };
    return { status: "expired" };
  }

  private async readSessionIdentity(
    tokenHash: string,
  ): Promise<SessionIdentityRow | null> {
    return this.db
      .withSession("first-primary")
      .prepare(
        `SELECT user_id, created_at, expires_at, revoked_at
         FROM web_sessions
         WHERE token_hash = ?`,
      )
      .bind(tokenHash)
      .first<SessionIdentityRow>();
  }

  private existingSession(
    row: SessionIdentityRow,
    input: CreateSessionInput,
  ): CreateSessionResult {
    return row.revoked_at === null &&
      row.user_id === input.userId &&
      row.created_at === input.createdAt &&
      row.expires_at === input.expiresAt
      ? { status: "existing" }
      : { status: "conflict" };
  }

  private async readOAuthState(stateHash: string): Promise<OAuthStateRow | null> {
    return this.db
      .withSession("first-primary")
      .prepare(
        `SELECT created_at, expires_at, consumed_at,
                purpose, expected_user_id, return_to
         FROM oauth_states WHERE state_hash = ?`,
      )
      .bind(stateHash)
      .first<OAuthStateRow>();
  }

  private existingOAuthState(
    row: OAuthStateRow,
    input: CreateOAuthStateInput,
  ): CreateOAuthStateResult {
    const context = validateOAuthStateContext(input);
    return row.created_at === input.createdAt &&
      row.expires_at === input.expiresAt &&
      row.consumed_at === null &&
      row.purpose === context.purpose &&
      row.expected_user_id === context.expectedUserId &&
      row.return_to === context.returnTo
      ? { status: "existing" }
      : { status: "conflict" };
  }
}
