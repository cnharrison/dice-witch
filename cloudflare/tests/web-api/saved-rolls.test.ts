import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  handleAuthRequest,
  type WebApiBindings,
} from "../../workers/web-api/src/auth";

const now = 1_767_225_600_123;
const userId = "100000000000000003";
const guildId = "100000000000000001";
const recordId = "00000000-0000-4000-8000-000000000001";
const idempotencyKey = "00000000-0000-4000-8000-000000000010";
const frontendOrigin = "https://app.example.com";

const OwnerSchema = z.union([
  z.strictObject({ type: z.literal("user"), userId: z.string() }),
  z.strictObject({ type: z.literal("guild"), guildId: z.string() }),
]);
const DraftV1Schema = z.strictObject({
  version: z.literal(1),
  name: z.string(),
  notation: z.string(),
  title: z.string().nullable(),
  repetitions: z.number(),
});
const DraftV2Schema = DraftV1Schema.extend({
  version: z.literal(2),
  nameColor: z.string(),
});
const MutationMetadataSchema = {
  owner: OwnerSchema,
  actorUserId: z.string(),
  authorizationUpdatedAt: z.number().nullable(),
  mutationId: z.string(),
  occurredAt: z.number(),
};
const CreateV1DataRequestSchema = z.strictObject({
  ...MutationMetadataSchema,
  id: z.string(),
  expectedListRevision: z.number(),
  draft: DraftV1Schema,
  pinned: z.boolean(),
});
const CreateV2DataRequestSchema = CreateV1DataRequestSchema.extend({
  draft: DraftV2Schema,
});
const UpdateDataRequestSchema = z.strictObject({
  ...MutationMetadataSchema,
  id: z.string(),
  expectedListRevision: z.number(),
  expectedRecordRevision: z.number(),
  draft: DraftV1Schema,
  pinned: z.boolean(),
});
const DeleteDataRequestSchema = z.strictObject({
  ...MutationMetadataSchema,
  id: z.string(),
  expectedListRevision: z.number(),
  expectedRecordRevision: z.number(),
});
const ReorderDataRequestSchema = z.strictObject({
  ...MutationMetadataSchema,
  expectedListRevision: z.number(),
  orderedIds: z.array(z.string()),
});
const MutationDataRequestSchema = z.union([
  CreateV1DataRequestSchema,
  UpdateDataRequestSchema,
  DeleteDataRequestSchema,
  ReorderDataRequestSchema,
]);
const DeleteBatchDataRequestSchema = z.strictObject({
  ...MutationMetadataSchema,
  expectedListRevision: z.number(),
  records: z.array(z.strictObject({ id: z.string(), revision: z.number() })),
});
const SessionDataRequestSchema = z.strictObject({
  token: z.string(),
  now: z.number(),
});
const MembershipProofRequestSchema = z.strictObject({
  guildId: z.string(),
  userId: z.string(),
  isAdmin: z.boolean(),
  isDiceWitchAdmin: z.boolean(),
  mutationId: z.string(),
  occurredAt: z.number(),
});
const GuildCreateFlowRequestSchema = z.union([
  SessionDataRequestSchema,
  MembershipProofRequestSchema,
  CreateV1DataRequestSchema,
]);
const ListDataRequestSchema = z.strictObject({ owner: OwnerSchema });
const SearchDataRequestSchema = z.strictObject({
  userId: z.string(),
  guildIds: z.array(z.string()),
  query: z.string(),
  offset: z.number(),
  sort: z.enum(["name", "roll", "created", "updated"]),
  direction: z.enum(["asc", "desc"]),
});
const ListResponseSchema = z.strictObject({
  status: z.literal("found"),
  listRevision: z.number(),
  savedRolls: z.array(z.never()),
});
const CreateV2ResponseSchema = z.strictObject({
  status: z.literal("applied"),
  listRevision: z.number(),
  savedRoll: z.strictObject({
    version: z.literal(2),
    id: z.string(),
    nameColor: z.string(),
  }),
});
const EmptySearchResponseSchema = z.strictObject({
  status: z.literal("found"),
  entries: z.array(z.never()),
  hasMore: z.boolean(),
  total: z.number(),
});
const SearchResponseSchema = z.strictObject({
  status: z.literal("found"),
  entries: z.array(z.strictObject({
    savedRoll: z.strictObject({
      id: z.string(),
      owner: OwnerSchema,
    }),
    listRevision: z.number(),
    source: z.strictObject({
      type: z.literal("guild"),
      guildId: z.string(),
      guildName: z.string(),
      guildIcon: z.string().nullable(),
    }),
    canManage: z.boolean(),
  })),
  hasMore: z.boolean(),
  total: z.number(),
});
const ErrorResponseSchema = z.strictObject({ error: z.string() });

function sessionResponse(): Response {
  return Response.json({
    user: {
      id: userId,
      username: "witch",
      email: "witch@example.com",
      avatar: null,
    },
    createdAt: now - 1_000,
    expiresAt: now + 60_000,
  });
}

function unexpectedConnect(): never {
  throw new Error("Unexpected socket connection");
}

function bindings(dataFetch: (request: Request) => Promise<Response>): WebApiBindings {
  return {
    DATA_SERVICE: { fetch: dataFetch, connect: unexpectedConnect },
    DISCORD_REST: {
      deliverWebRoll: vi.fn(() =>
        Promise.resolve({ status: "delivered" as const }),
      ),
      listTextChannels: vi.fn(() => Promise.resolve([])),
      inspectMembership: vi.fn(() =>
        Promise.resolve({ status: "missing" as const }),
      ),
      inspectRollerGuild: vi.fn(() =>
        Promise.resolve({ status: "missing" as const }),
      ),
    },
    ROLL_WEB: {
      prepare: vi.fn(),
      execute: vi.fn(),
      previewV4: vi.fn(),
      previewRendererRevisionV4: vi.fn(() => Promise.resolve("canvaskit-v4-r41")),
    },
    DISCORD_CLIENT_ID: "100000000000000099",
    DISCORD_CLIENT_SECRET: "test-client-secret",
    DISCORD_REDIRECT_URI:
      "https://api.example.com/api/auth/callback/discord",
    FRONTEND_ORIGIN: frontendOrigin,
    BUILD_SHA: "abcdef0123456789abcdef0123456789abcdef01",
    APPEARANCE_CATALOG_POLICY: "r37",
    THUMBS: {
      get: vi.fn(),
      put: vi.fn(),
      head: vi.fn(),
      createMultipartUpload: vi.fn(),
      resumeMultipartUpload: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    },
    APPEARANCE_THUMBS_BAKE_SECRET: "test-bake-secret",
  };
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers({
    cookie: `session_id=${"S".repeat(43)}`,
    origin: frontendOrigin,
  });
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value);
  });
  return new Request(`https://api.example.com${path}`, {
    ...init,
    headers,
  });
}

async function requestBody<Schema extends z.ZodType>(
  requestValue: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  return schema.parse(await requestValue.json());
}

describe("saved-roll Web API", () => {
  it("derives personal ownership from the authenticated session", async () => {
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      expect(path).toBe("/internal/saved-rolls/v1/list");
      expect(await requestBody(dataRequest, ListDataRequestSchema)).toEqual({
        owner: { type: "user", userId },
      });
      return Response.json({
        status: "found",
        listRevision: 0,
        savedRolls: [],
      });
    });
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v1/me"),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      frontendOrigin,
    );
    expect(ListResponseSchema.parse(await response.json())).toMatchObject({
      status: "found",
    });
  });

  it("forwards the V2 color contract without weakening V1 routes", async () => {
    const draft = {
      version: 2,
      name: "Fireball",
      nameColor: "#A1B2C3",
      notation: "8d6",
      title: null,
      repetitions: 1,
    };
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      expect(path).toBe("/internal/saved-rolls/v2/create");
      expect(
        await requestBody(dataRequest, CreateV2DataRequestSchema),
      ).toMatchObject({ draft });
      return Response.json({
        status: "applied",
        listRevision: 1,
        savedRoll: { version: 2, id: recordId, nameColor: "#A1B2C3" },
      });
    });
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v2/me", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft,
          pinned: false,
        }),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(CreateV2ResponseSchema.parse(await response.json())).toMatchObject({
      savedRoll: { version: 2, nameColor: "#A1B2C3" },
    });
  });

  it.each([
    {
      operation: "copy",
      method: "POST",
      path: "/api/saved-rolls/v1/me/copy",
      value: {
        id: recordId,
        expectedListRevision: 0,
        draft: {
          version: 1,
          name: "Copy",
          notation: "1d20",
          title: null,
          repetitions: 1,
        },
        pinned: false,
      },
    },
    {
      operation: "update",
      method: "PATCH",
      path: `/api/saved-rolls/v1/me/${recordId}`,
      value: {
        expectedListRevision: 1,
        expectedRecordRevision: 1,
        draft: {
          version: 1,
          name: "Updated",
          notation: "2d20",
          title: null,
          repetitions: 1,
        },
        pinned: true,
      },
    },
    {
      operation: "delete",
      method: "DELETE",
      path: `/api/saved-rolls/v1/me/${recordId}`,
      value: { expectedListRevision: 2, expectedRecordRevision: 2 },
    },
    {
      operation: "reorder",
      method: "POST",
      path: "/api/saved-rolls/v1/me/reorder",
      value: { expectedListRevision: 3, orderedIds: [recordId] },
    },
  ])("forwards an exact authenticated $operation mutation", async ({
    operation,
    method,
    path,
    value,
  }) => {
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const dataPath = new URL(dataRequest.url).pathname;
      if (dataPath === "/internal/sessions/current") return sessionResponse();
      expect(dataPath).toBe(`/internal/saved-rolls/v1/${operation}`);
      const forwarded = await requestBody(
        dataRequest,
        MutationDataRequestSchema,
      );
      expect(forwarded).toMatchObject({
        owner: { type: "user", userId },
        actorUserId: userId,
        authorizationUpdatedAt: null,
        mutationId: `web-saved-roll:${operation}:${idempotencyKey}`,
      });
      if (operation === "update" || operation === "delete") {
        expect(forwarded).toMatchObject({ id: recordId });
      }
      return Response.json({ status: "applied", listRevision: 4 });
    });
    const response = await handleAuthRequest(
      request(path, {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(value),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
  });

  it("forwards an exact authenticated V2 batch delete", async () => {
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      expect(path).toBe("/internal/saved-rolls/v2/delete-batch");
      expect(
        await requestBody(dataRequest, DeleteBatchDataRequestSchema),
      ).toEqual({
        owner: { type: "user", userId },
        actorUserId: userId,
        authorizationUpdatedAt: null,
        expectedListRevision: 4,
        records: [{ id: recordId, revision: 2 }],
        mutationId: `web-saved-roll:delete-batch:${idempotencyKey}`,
        occurredAt: now,
      });
      return Response.json({ status: "applied", listRevision: 5 });
    });
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v2/me/delete-batch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          expectedListRevision: 4,
          records: [{ id: recordId, revision: 2 }],
        }),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
  });

  it("refreshes guild admin proof before an atomic create", async () => {
    const requests: Array<{
      path: string;
      body: z.output<typeof GuildCreateFlowRequestSchema>;
    }> = [];
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      const body = await requestBody(dataRequest, GuildCreateFlowRequestSchema);
      requests.push({ path, body });
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/memberships/permissions") {
        return Response.json({
          status: "applied",
          permissions: { isAdmin: true, isDiceWitchAdmin: false },
        });
      }
      expect(path).toBe("/internal/saved-rolls/v1/create");
      return Response.json({
        status: "applied",
        listRevision: 1,
        savedRoll: { id: recordId },
      });
    });
    const env = bindings(dataFetch);
    const inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: true,
        isDiceWitchAdmin: false,
      }),
    );
    env.DISCORD_REST.inspectMembership = inspectMembership;
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft: {
            version: 1,
            name: "Fireball",
            notation: "8d6",
            title: null,
            repetitions: 1,
          },
          pinned: false,
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(inspectMembership).toHaveBeenCalledWith(guildId, userId);
    expect(requests[1]?.body).toMatchObject({
      guildId,
      userId,
      isAdmin: true,
      occurredAt: now,
    });
    expect(requests[2]?.body).toMatchObject({
      owner: { type: "guild", guildId },
      actorUserId: userId,
      authorizationUpdatedAt: now,
      mutationId: `web-saved-roll:create:${idempotencyKey}`,
      occurredAt: now,
    });
  });

  it("searches only Server libraries managed by the current user", async () => {
    const memberGuildId = "100000000000000001";
    const adminGuildId = "100000000000000002";
    const diceWitchAdminGuildId = "100000000000000004";
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/saved-rolls/v1/libraries") {
        return Response.json({
          status: "found",
          libraries: [
            { guildId: memberGuildId, guildName: "Member Server", guildIcon: null },
            { guildId: adminGuildId, guildName: "Admin Server", guildIcon: null },
            {
              guildId: diceWitchAdminGuildId,
              guildName: "Dice Witch Admin Server",
              guildIcon: null,
            },
          ],
        });
      }
      if (path === "/internal/memberships/permissions") {
        const proof = await requestBody(
          dataRequest,
          MembershipProofRequestSchema,
        );
        return Response.json({
          status: "applied",
          permissions: {
            isAdmin: proof.isAdmin,
            isDiceWitchAdmin: proof.isDiceWitchAdmin,
          },
        });
      }
      if (path === "/internal/saved-rolls/v2/search") {
        expect(
          await requestBody(dataRequest, SearchDataRequestSchema),
        ).toMatchObject({
          userId,
          guildIds: [adminGuildId, diceWitchAdminGuildId],
          query: "fire",
        });
        return Response.json({
          status: "found",
          entries: [],
          hasMore: false,
          total: 0,
        });
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn((candidateGuildId: string) =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: candidateGuildId === adminGuildId,
        isDiceWitchAdmin: candidateGuildId === diceWitchAdminGuildId,
      }),
    );

    const response = await handleAuthRequest(
      request("/api/saved-rolls/v2/search?query=fire&offset=0&sort=name&direction=asc"),
      env,
      vi.fn(),
      () => now,
    );

    expect(response.status).toBe(200);
    expect(EmptySearchResponseSchema.parse(await response.json())).toMatchObject({
      status: "found",
      entries: [],
      total: 0,
    });
  });

  it("denies a stale admin inspection superseded by newer revoked proof", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn((dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") {
        return Promise.resolve(sessionResponse());
      }
      if (path === "/internal/memberships/permissions") {
        return Promise.resolve(Response.json({
          status: "superseded",
          permissions: { isAdmin: false, isDiceWitchAdmin: false },
        }));
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: true,
        isDiceWitchAdmin: false,
      }),
    );
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft: {
            version: 1,
            name: "Fireball",
            notation: "8d6",
            title: null,
            repetitions: 1,
          },
          pinned: false,
        }),
      }),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(403);
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/memberships/permissions",
    ]);
  });

  it("allows a current non-admin member to read a Server library", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn((dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") {
        return Promise.resolve(sessionResponse());
      }
      if (path === "/internal/memberships/permissions") {
        return Promise.resolve(Response.json({
          status: "applied",
          permissions: { isAdmin: false, isDiceWitchAdmin: false },
        }));
      }
      if (path === "/internal/saved-rolls/v1/list") {
        return Promise.resolve(Response.json({
          status: "found",
          listRevision: 1,
          savedRolls: [],
        }));
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn(() =>
      Promise.resolve({
        status: "found" as const,
        isAdmin: false,
        isDiceWitchAdmin: false,
      }),
    );
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/memberships/permissions",
      "/internal/saved-rolls/v1/list",
    ]);
  });

  it("searches Personal and authorized Server libraries with permission metadata", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/saved-rolls/v1/libraries") {
        return Response.json({
          status: "found",
          libraries: [{ guildId, guildName: "Moonlit Library", guildIcon: null }],
        });
      }
      if (path === "/internal/memberships/permissions") {
        return Response.json({
          status: "applied",
          permissions: { isAdmin: true, isDiceWitchAdmin: false },
        });
      }
      if (path === "/internal/saved-rolls/v1/search") {
        expect(
          await requestBody(dataRequest, SearchDataRequestSchema),
        ).toEqual({
          userId,
          guildIds: [guildId],
          query: "fire",
          offset: 0,
          sort: "name",
          direction: "asc",
        });
        return Response.json({
          status: "found",
          entries: [{
            savedRoll: {
              id: recordId,
              owner: { type: "guild", guildId },
            },
            listRevision: 4,
            guildName: "Moonlit Library",
            guildIcon: null,
          }],
          hasMore: false,
          total: 1,
        });
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const env = bindings(dataFetch);
    env.DISCORD_REST.inspectMembership = vi.fn(() => Promise.resolve({
      status: "found" as const,
      isAdmin: true,
      isDiceWitchAdmin: false,
    }));
    const response = await handleAuthRequest(
      request(
        "/api/saved-rolls/v1/search?query=fire&offset=0&sort=name&direction=asc",
      ),
      env,
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(200);
    expect(SearchResponseSchema.parse(await response.json())).toEqual({
      status: "found",
      entries: [{
        savedRoll: { id: recordId, owner: { type: "guild", guildId } },
        listRevision: 4,
        source: {
          type: "guild",
          guildId,
          guildName: "Moonlit Library",
          guildIcon: null,
        },
        canManage: true,
      }],
      hasMore: false,
      total: 1,
    });
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/saved-rolls/v1/libraries",
      "/internal/memberships/permissions",
      "/internal/saved-rolls/v1/search",
    ]);
  });

  it("records a missing guild membership and denies access", async () => {
    const paths: string[] = [];
    const dataFetch = vi.fn(async (dataRequest: Request) => {
      const path = new URL(dataRequest.url).pathname;
      paths.push(path);
      if (path === "/internal/sessions/current") return sessionResponse();
      if (path === "/internal/memberships/permissions") {
        expect(
          await requestBody(dataRequest, MembershipProofRequestSchema),
        ).toMatchObject({
          isAdmin: false,
          isDiceWitchAdmin: false,
        });
        return Response.json({
          status: "applied",
          permissions: { isAdmin: false, isDiceWitchAdmin: false },
        });
      }
      throw new Error(`Unexpected Data route ${path}`);
    });
    const response = await handleAuthRequest(
      request(`/api/guilds/${guildId}/saved-rolls/v1`),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(403);
    expect(paths).toEqual([
      "/internal/sessions/current",
      "/internal/memberships/permissions",
    ]);
  });

  it("advertises credentialed saved-roll preflight headers", async () => {
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v1/me", { method: "OPTIONS" }),
      bindings(vi.fn()),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, PATCH, DELETE",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type, idempotency-key",
    );
  });

  it("requires exact mutation fields and a UUID idempotency key", async () => {
    const dataFetch = vi.fn((dataRequest: Request) =>
      Promise.resolve(
        new URL(dataRequest.url).pathname === "/internal/sessions/current"
          ? sessionResponse()
          : Response.json({ error: "unexpected" }, { status: 500 }),
      ),
    );
    const response = await handleAuthRequest(
      request("/api/saved-rolls/v1/me", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          id: recordId,
          expectedListRevision: 0,
          draft: {},
          pinned: false,
          owner: { type: "user", userId: "100000000000000004" },
        }),
      }),
      bindings(dataFetch),
      vi.fn(),
      () => now,
    );
    expect(response.status).toBe(400);
    expect(ErrorResponseSchema.parse(await response.json())).toEqual({
      error: "Saved roll request is invalid",
    });
    expect(dataFetch).toHaveBeenCalledTimes(1);
  });
});
