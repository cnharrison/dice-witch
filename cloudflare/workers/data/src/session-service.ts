import {
  D1SessionRepository,
  generateOpaqueToken,
} from "./session-repository";
import {
  D1WebLoginRepository,
  type WebLoginProfile,
} from "./web-login-repository";

const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

async function parseBody(
  request: Request,
  keys: readonly string[],
): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error("Internal session request is invalid");
  }
  return value;
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: responseHeaders });
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validRange(createdAt: unknown, expiresAt: unknown): boolean {
  return (
    validTimestamp(createdAt) &&
    validTimestamp(expiresAt) &&
    expiresAt > createdAt
  );
}

function validNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 255);
}

function validWebLoginProfile(value: unknown): value is WebLoginProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["avatar", "email", "username"]) &&
    typeof value.username === "string" &&
    value.username.length <= 255 &&
    validNullableString(value.email) &&
    validNullableString(value.avatar)
  );
}

async function createSession(request: Request, db: D1Database): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, ["createdAt", "expiresAt", "userId"]);
    if (
      typeof value.userId !== "string" ||
      !SNOWFLAKE.test(value.userId) ||
      !validRange(value.createdAt, value.expiresAt)
    ) {
      throw new Error("Session request is invalid");
    }
  } catch {
    return errorResponse("Session request is invalid", 400);
  }

  const token = generateOpaqueToken();
  try {
    const result = await new D1SessionRepository(db).createSession({
      token,
      userId: value.userId,
      createdAt: value.createdAt as number,
      expiresAt: value.expiresAt as number,
    });
    if (result.status === "created") {
      return Response.json({ token }, { status: 201, headers: responseHeaders });
    }
    if (result.status === "missing_user") {
      return errorResponse("Session user is missing", 404);
    }
    return errorResponse("Session token conflict", 500);
  } catch {
    return errorResponse("Session creation failed", 500);
  }
}

async function completeWebLogin(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, [
      "createdAt",
      "expiresAt",
      "mutationId",
      "profile",
      "token",
      "userId",
    ]);
    if (
      typeof value.token !== "string" ||
      !OPAQUE_TOKEN.test(value.token) ||
      typeof value.userId !== "string" ||
      !SNOWFLAKE.test(value.userId) ||
      typeof value.mutationId !== "string" ||
      value.mutationId.length < 1 ||
      value.mutationId.length > 255 ||
      !validWebLoginProfile(value.profile) ||
      !validRange(value.createdAt, value.expiresAt)
    ) {
      throw new Error("Web login request is invalid");
    }
  } catch {
    return errorResponse("Web login request is invalid", 400);
  }

  try {
    const result = await new D1WebLoginRepository(db).complete({
      token: value.token,
      userId: value.userId,
      profile: value.profile,
      mutationId: value.mutationId,
      createdAt: value.createdAt as number,
      expiresAt: value.expiresAt as number,
    });
    return Response.json(result, {
      status: result.status === "conflict" ? 409 : 200,
      headers: responseHeaders,
    });
  } catch {
    return errorResponse("Web login completion failed", 500);
  }
}

async function getSession(request: Request, db: D1Database): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, ["now", "token"]);
    if (
      typeof value.token !== "string" ||
      !OPAQUE_TOKEN.test(value.token) ||
      !validTimestamp(value.now)
    ) {
      throw new Error("Session lookup is invalid");
    }
  } catch {
    return errorResponse("Session lookup is invalid", 400);
  }

  try {
    const result = await new D1SessionRepository(db).getSession(
      value.token,
      value.now,
    );
    return result.status === "found"
      ? Response.json(result.session, { headers: responseHeaders })
      : Response.json(result, { status: 401, headers: responseHeaders });
  } catch {
    return errorResponse("Session lookup failed", 500);
  }
}

async function revokeSession(request: Request, db: D1Database): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, ["revokedAt", "token"]);
    if (
      typeof value.token !== "string" ||
      !OPAQUE_TOKEN.test(value.token) ||
      !validTimestamp(value.revokedAt)
    ) {
      throw new Error("Session revocation is invalid");
    }
  } catch {
    return errorResponse("Session revocation is invalid", 400);
  }

  try {
    const result = await new D1SessionRepository(db).revokeSession(
      value.token,
      value.revokedAt,
    );
    return Response.json(result, { headers: responseHeaders });
  } catch {
    return errorResponse("Session revocation failed", 500);
  }
}

async function createOAuthState(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, ["createdAt", "expiresAt"]);
    if (!validRange(value.createdAt, value.expiresAt)) {
      throw new Error("OAuth state request is invalid");
    }
  } catch {
    return errorResponse("OAuth state request is invalid", 400);
  }

  const token = generateOpaqueToken();
  try {
    const result = await new D1SessionRepository(db).createOAuthState({
      token,
      createdAt: value.createdAt as number,
      expiresAt: value.expiresAt as number,
    });
    return result.status === "created"
      ? Response.json({ token }, { status: 201, headers: responseHeaders })
      : errorResponse("OAuth state token conflict", 500);
  } catch {
    return errorResponse("OAuth state creation failed", 500);
  }
}

async function consumeOAuthState(
  request: Request,
  db: D1Database,
): Promise<Response> {
  let value: Record<string, unknown>;
  try {
    value = await parseBody(request, ["consumedAt", "token"]);
    if (
      typeof value.token !== "string" ||
      !OPAQUE_TOKEN.test(value.token) ||
      !validTimestamp(value.consumedAt)
    ) {
      throw new Error("OAuth state consumption is invalid");
    }
  } catch {
    return errorResponse("OAuth state consumption is invalid", 400);
  }

  try {
    const result = await new D1SessionRepository(db).consumeOAuthState(
      value.token,
      value.consumedAt,
    );
    const statuses = {
      consumed: 200,
      already_consumed: 409,
      expired: 410,
      missing: 404,
    } as const;
    return Response.json(result, {
      status: statuses[result.status],
      headers: responseHeaders,
    });
  } catch {
    return errorResponse("OAuth state consumption failed", 500);
  }
}

export function handleSessionRequest(
  request: Request,
  db: D1Database,
): Promise<Response> | null {
  if (request.method !== "POST") return null;
  switch (new URL(request.url).pathname) {
    case "/internal/sessions":
      return createSession(request, db);
    case "/internal/sessions/current":
      return getSession(request, db);
    case "/internal/web-logins":
      return completeWebLogin(request, db);
    case "/internal/sessions/revoke":
      return revokeSession(request, db);
    case "/internal/oauth-states":
      return createOAuthState(request, db);
    case "/internal/oauth-states/consume":
      return consumeOAuthState(request, db);
    default:
      return null;
  }
}
