import { z } from "zod";
import {
  snowflakeSchema,
  strictObjectSchema,
  timestampSchema,
} from "../../../packages/discord-contracts/src/schema-primitives";
import {
  D1SessionRepository,
  generateOpaqueToken,
} from "./session-repository";
import { D1WebLoginRepository } from "./web-login-repository";

const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const opaqueTokenSchema = z.string().regex(OPAQUE_TOKEN);
const mutationIdSchema = z.string().min(1).max(255);
const nullableProfileFieldSchema = z.nullable(z.string().max(255));
const responseHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const sessionRangeFields = {
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
};

const CreateSessionRequestSchema = strictObjectSchema({
  ...sessionRangeFields,
  userId: snowflakeSchema,
});
const WebLoginProfileSchema = strictObjectSchema({
  avatar: nullableProfileFieldSchema,
  email: nullableProfileFieldSchema,
  username: z.string().max(255),
});
const CompleteWebLoginRequestSchema = strictObjectSchema({
  ...sessionRangeFields,
  mutationId: mutationIdSchema,
  profile: WebLoginProfileSchema,
  token: opaqueTokenSchema,
  userId: snowflakeSchema,
});
const GetSessionRequestSchema = strictObjectSchema({
  now: timestampSchema,
  token: opaqueTokenSchema,
});
const RevokeSessionRequestSchema = strictObjectSchema({
  revokedAt: timestampSchema,
  token: opaqueTokenSchema,
});
const SignInOAuthStateRequestSchema = strictObjectSchema({
  ...sessionRangeFields,
  expectedUserId: z.null(),
  purpose: z.literal("sign_in"),
  returnTo: z.string().min(1).max(2_048),
});
const RefreshOAuthStateRequestSchema = strictObjectSchema({
  ...sessionRangeFields,
  expectedUserId: snowflakeSchema,
  purpose: z.literal("refresh"),
  returnTo: z.string().min(1).max(2_048),
});
const CreateOAuthStateRequestSchema = z.union([
  SignInOAuthStateRequestSchema,
  RefreshOAuthStateRequestSchema,
]);
const ConsumeOAuthStateRequestSchema = strictObjectSchema({
  consumedAt: timestampSchema,
  token: opaqueTokenSchema,
});

type SessionRange = {
  createdAt: number;
  expiresAt: number;
};

async function parseRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  return schema.parse(await request.json());
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: responseHeaders });
}

function requireValidRange(value: SessionRange): void {
  if (value.expiresAt <= value.createdAt) {
    throw new Error("Session timestamp range is invalid");
  }
}

async function createSession(request: Request, db: D1Database): Promise<Response> {
  let input: z.output<typeof CreateSessionRequestSchema>;
  try {
    input = await parseRequest(request, CreateSessionRequestSchema);
    requireValidRange(input);
  } catch {
    return errorResponse("Session request is invalid", 400);
  }

  const token = generateOpaqueToken();
  try {
    const result = await new D1SessionRepository(db).createSession({
      token,
      userId: input.userId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
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
  let input: z.output<typeof CompleteWebLoginRequestSchema>;
  try {
    input = await parseRequest(request, CompleteWebLoginRequestSchema);
    requireValidRange(input);
  } catch {
    return errorResponse("Web login request is invalid", 400);
  }

  try {
    const result = await new D1WebLoginRepository(db).complete(input);
    return Response.json(result, {
      status: result.status === "conflict" ? 409 : 200,
      headers: responseHeaders,
    });
  } catch {
    return errorResponse("Web login completion failed", 500);
  }
}

async function getSession(request: Request, db: D1Database): Promise<Response> {
  let input: z.output<typeof GetSessionRequestSchema>;
  try {
    input = await parseRequest(request, GetSessionRequestSchema);
  } catch {
    return errorResponse("Session lookup is invalid", 400);
  }

  try {
    const result = await new D1SessionRepository(db).getSession(
      input.token,
      input.now,
    );
    return result.status === "found"
      ? Response.json(result.session, { headers: responseHeaders })
      : Response.json(result, { status: 401, headers: responseHeaders });
  } catch {
    return errorResponse("Session lookup failed", 500);
  }
}

async function revokeSession(request: Request, db: D1Database): Promise<Response> {
  let input: z.output<typeof RevokeSessionRequestSchema>;
  try {
    input = await parseRequest(request, RevokeSessionRequestSchema);
  } catch {
    return errorResponse("Session revocation is invalid", 400);
  }

  try {
    const result = await new D1SessionRepository(db).revokeSession(
      input.token,
      input.revokedAt,
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
  let input: z.output<typeof CreateOAuthStateRequestSchema>;
  try {
    input = await parseRequest(request, CreateOAuthStateRequestSchema);
    requireValidRange(input);
  } catch {
    return errorResponse("OAuth state request is invalid", 400);
  }

  const token = generateOpaqueToken();
  try {
    const result = await new D1SessionRepository(db).createOAuthState({
      token,
      ...input,
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
  let input: z.output<typeof ConsumeOAuthStateRequestSchema>;
  try {
    input = await parseRequest(request, ConsumeOAuthStateRequestSchema);
  } catch {
    return errorResponse("OAuth state consumption is invalid", 400);
  }

  try {
    const result = await new D1SessionRepository(db).consumeOAuthState(
      input.token,
      input.consumedAt,
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
