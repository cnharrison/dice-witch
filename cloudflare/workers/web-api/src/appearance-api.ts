import {
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV4,
  validateAppearanceProfileFontsV4,
  type AppearanceProfileV4,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import { z } from "zod";
import {
  APPEARANCE_VALIDATION_CATALOG_V3,
  appearanceCatalogForPolicyV3,
  parseAppearancePreviewRequestV4,
  type AppearanceCatalogPolicyV3,
  type AppearancePreviewRequestV4,
} from "../../../packages/dice-appearance/src";
import {
  safeIntegerSchema,
  snowflakeSchema,
  strictObjectSchema,
  type SchemaInput,
} from "../../../packages/discord-contracts/src/schema-primitives";
import { bytesToBase64, json } from "./responses";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_BODY_BYTES = 96 * 1024;
const jsonValueSchema = z.json();
const expectedRevisionSchema = safeIntegerSchema
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
const positiveRevisionSchema = safeIntegerSchema.positive();
const AppearanceWriteRequestSchema = strictObjectSchema({
  expectedRevision: expectedRevisionSchema,
  profile: jsonValueSchema,
});
const MissingLookupSchema = strictObjectSchema({ status: z.literal("missing") });
const PersonalLookupSchema = strictObjectSchema({
  status: z.literal("found"),
  revision: positiveRevisionSchema,
  profile: jsonValueSchema,
});
const GuildLookupSchema = strictObjectSchema({
  status: z.literal("found"),
  revision: positiveRevisionSchema,
  profile: jsonValueSchema,
  updatedByUserId: snowflakeSchema,
});
const RestoreMissingSchema = strictObjectSchema({
  status: z.literal("restore_missing"),
});
const WriteConflictSchema = z.union([
  strictObjectSchema({ status: z.literal("mutation_conflict") }),
  strictObjectSchema({
    status: z.literal("revision_conflict"),
    revision: expectedRevisionSchema,
  }),
  RestoreMissingSchema,
]);
const PersonalStateLookupSchema = PersonalLookupSchema.extend({
  canRestorePreviousMix: z.boolean(),
});
const GuildStateLookupSchema = GuildLookupSchema.extend({
  canRestorePreviousMix: z.boolean(),
});
const WriteSuccessSchema = strictObjectSchema({
  status: z.enum(["applied", "existing"]),
  revision: positiveRevisionSchema,
  profile: jsonValueSchema,
});
const WriteStateSuccessSchema = WriteSuccessSchema.extend({
  canRestorePreviousMix: z.boolean(),
});
const AppearancePreviewResultSchema = strictObjectSchema({
  version: z.literal(4),
  contentType: z.literal("image/png"),
  width: safeIntegerSchema.min(1).max(4_096),
  height: safeIntegerSchema.min(1).max(4_096),
  diceCount: safeIntegerSchema.min(1).max(10),
  rowCount: safeIntegerSchema.min(1).max(10),
  png: z.instanceof(Uint8Array).refine(
    (png) => png.byteLength >= 8 && png.byteLength <= 8 * 1024 * 1024,
  ),
});

export type AppearanceApiDataService = {
  fetch(request: Request): Promise<Response>;
};

export type AppearancePreviewService = {
  previewV4(value: AppearancePreviewRequestV4): Promise<SchemaInput>;
};

type AppearanceProfileKind = "personal" | "guild";
type AppearanceMutationAction = "put" | "reset" | "restore";
type AppearanceProfile = AppearanceProfileV4 | GuildAppearanceProfileV4;

type AppearanceWriteInput = {
  expectedRevision: number;
  profile: AppearanceProfile;
  idempotencyKey: string;
};

type AppearanceWriteResult =
  | z.output<typeof WriteConflictSchema>
  | {
      status: "applied" | "existing";
      revision: number;
      profile: AppearanceProfile;
      canRestorePreviousMix?: boolean;
    };

type AppearanceLookup = {
  revision: number;
  profile: AppearanceProfile | null;
  canRestorePreviousMix?: boolean;
};
type PersonalAppearanceMutationRequest = {
  userId: string;
  expectedRevision: number;
  profile: AppearanceProfile;
  mutationId: string;
  occurredAt: number;
};
type GuildAppearanceMutationRequest = {
  guildId: string;
  updatedByUserId: string;
  expectedRevision: number;
  profile: AppearanceProfile;
  mutationId: string;
  occurredAt: number;
};
type AppearanceDataRequestByPath = {
  "/internal/appearance/v4/personal/get": { userId: string };
  "/internal/appearance/v4/personal/put": PersonalAppearanceMutationRequest;
  "/internal/appearance/v4/personal/reset": PersonalAppearanceMutationRequest;
  "/internal/appearance/v4/personal/restore": PersonalAppearanceMutationRequest;
  "/internal/appearance/v4/personal/state/get": { userId: string };
  "/internal/appearance/v4/personal/state/put": PersonalAppearanceMutationRequest;
  "/internal/appearance/v4/personal/state/reset": PersonalAppearanceMutationRequest;
  "/internal/appearance/v4/personal/state/restore": PersonalAppearanceMutationRequest;
  "/internal/appearance/v4/guild/get": { guildId: string };
  "/internal/appearance/v4/guild/put": GuildAppearanceMutationRequest;
  "/internal/appearance/v4/guild/reset": GuildAppearanceMutationRequest;
  "/internal/appearance/v4/guild/restore": GuildAppearanceMutationRequest;
  "/internal/appearance/v4/guild/state/get": { guildId: string };
  "/internal/appearance/v4/guild/state/put": GuildAppearanceMutationRequest;
  "/internal/appearance/v4/guild/state/reset": GuildAppearanceMutationRequest;
  "/internal/appearance/v4/guild/state/restore": GuildAppearanceMutationRequest;
};

function parseProfile(
  value: SchemaInput,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
): AppearanceProfile {
  const profile = kind === "personal"
    ? parseAppearanceProfileV4(value, APPEARANCE_VALIDATION_CATALOG_V3)
    : parseGuildAppearanceProfileV4(value, APPEARANCE_VALIDATION_CATALOG_V3);
  validateAppearanceProfileFontsV4(
    profile,
    appearanceCatalogForPolicyV3(policy).fonts.map(({ id }) => id),
  );
  return profile;
}

async function postData<Path extends keyof AppearanceDataRequestByPath>(
  dataService: AppearanceApiDataService,
  path: Path,
  body: AppearanceDataRequestByPath[Path],
): Promise<Response> {
  return dataService.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function readBoundedJson<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  ) {
    throw new Error("Appearance request content type is invalid");
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^(0|[1-9][0-9]*)$/.test(contentLength) ||
      Number(contentLength) > MAX_BODY_BYTES)
  ) {
    throw new Error("Appearance request body is too large");
  }
  const body = request.body;
  if (body === null) {
    throw new Error("Appearance request body is missing");
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk: ReadableStreamReadResult<Uint8Array> = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("Appearance request body is too large");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: SchemaInput = JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  );
  return schema.parse(value);
}

function parseLookup(
  value: SchemaInput,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
  includeRestoreState: boolean,
): AppearanceLookup {
  const missing = MissingLookupSchema.safeParse(value);
  if (missing.success) {
    return includeRestoreState
      ? { revision: 0, profile: null, canRestorePreviousMix: false }
      : { revision: 0, profile: null };
  }
  if (includeRestoreState) {
    const result = kind === "personal"
      ? PersonalStateLookupSchema.parse(value)
      : GuildStateLookupSchema.parse(value);
    return {
      revision: result.revision,
      profile: parseProfile(result.profile, kind, policy),
      canRestorePreviousMix: z.boolean().parse(result.canRestorePreviousMix),
    };
  }
  const result = kind === "personal"
    ? PersonalLookupSchema.parse(value)
    : GuildLookupSchema.parse(value);
  return {
    revision: result.revision,
    profile: parseProfile(result.profile, kind, policy),
  };
}

function parseWriteResult(
  value: SchemaInput,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
  includeRestoreState: boolean,
): AppearanceWriteResult {
  const conflict = WriteConflictSchema.safeParse(value);
  if (conflict.success) return conflict.data;
  if (includeRestoreState) {
    const result = WriteStateSuccessSchema.parse(value);
    return {
      status: result.status,
      revision: result.revision,
      profile: parseProfile(result.profile, kind, policy),
      canRestorePreviousMix: z.boolean().parse(result.canRestorePreviousMix),
    };
  }
  const result = WriteSuccessSchema.parse(value);
  return {
    status: result.status,
    revision: result.revision,
    profile: parseProfile(result.profile, kind, policy),
  };
}

async function parseWrite(
  request: Request,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
): Promise<AppearanceWriteInput> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey === null || !UUID_V4.test(idempotencyKey)) {
    throw new Error("Appearance idempotency key is invalid");
  }
  const value = await readBoundedJson(request, AppearanceWriteRequestSchema);
  return {
    expectedRevision: value.expectedRevision,
    profile: parseProfile(value.profile, kind, policy),
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
}

function invalidProfileResponse(): Response {
  return json({ error: "appearance_profile_response_invalid" }, 502);
}

async function lookupResponse(
  response: Response,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
  includeRestoreState: boolean,
): Promise<Response> {
  if (!response.ok) {
    return json({ error: "appearance_data_unavailable" }, 502);
  }
  try {
    return json(
      parseLookup(await response.json(), kind, policy, includeRestoreState),
    );
  } catch {
    return invalidProfileResponse();
  }
}

async function writeResponse(
  response: Response,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
  includeRestoreState: boolean,
): Promise<Response> {
  let value: z.output<typeof jsonValueSchema>;
  try {
    value = jsonValueSchema.parse(await response.json());
  } catch {
    return invalidProfileResponse();
  }
  if (response.status === 404) {
    if (MissingLookupSchema.safeParse(value).success) {
      return json({ error: "appearance_profile_owner_missing" }, 502);
    }
    return RestoreMissingSchema.safeParse(value).success
      ? json({ error: "appearance_restore_missing" }, 409)
      : invalidProfileResponse();
  }
  if (!response.ok && response.status !== 409) {
    return json({ error: "appearance_data_unavailable" }, 502);
  }
  try {
    const result = parseWriteResult(
      value,
      kind,
      policy,
      includeRestoreState,
    );
    if (
      result.status === "revision_conflict" ||
      result.status === "mutation_conflict"
    ) {
      return response.status === 409
        ? json(result, 409)
        : invalidProfileResponse();
    }
    if (result.status === "restore_missing") return invalidProfileResponse();
    return response.ok ? json(result) : invalidProfileResponse();
  } catch {
    return invalidProfileResponse();
  }
}

async function getPersonalAppearanceResponseV4(
  dataService: AppearanceApiDataService,
  userId: string,
  policy: AppearanceCatalogPolicyV3,
  includeRestoreState: boolean,
): Promise<Response> {
  const statePath = includeRestoreState ? "/state" : "";
  return lookupResponse(
    await postData(
      dataService,
      `/internal/appearance/v4/personal${statePath}/get`,
      { userId },
    ),
    "personal",
    policy,
    includeRestoreState,
  );
}

export function getPersonalAppearanceV4(
  dataService: AppearanceApiDataService,
  userId: string,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return getPersonalAppearanceResponseV4(dataService, userId, policy, false);
}

export function getPersonalAppearanceStateV4(
  dataService: AppearanceApiDataService,
  userId: string,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return getPersonalAppearanceResponseV4(dataService, userId, policy, true);
}

async function mutatePersonalAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
  action: AppearanceMutationAction,
  includeRestoreState: boolean,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "personal", policy);
  } catch {
    return json({ error: "appearance_profile_invalid" }, 400);
  }
  const statePath = includeRestoreState ? "/state" : "";
  const mutationName = includeRestoreState
    ? `web-appearance-personal-state-${action}`
    : "web-appearance-personal";
  return writeResponse(
    await postData(
      dataService,
      `/internal/appearance/v4/personal${statePath}/${action}`,
      {
        userId,
        expectedRevision: input.expectedRevision,
        profile: input.profile,
        mutationId: `${mutationName}:${input.idempotencyKey}`,
        occurredAt: now,
      },
    ),
    "personal",
    policy,
    includeRestoreState,
  );
}

export function putPersonalAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutatePersonalAppearanceV4(
    request,
    dataService,
    userId,
    now,
    policy,
    "put",
    false,
  );
}

export function putPersonalAppearanceStateV4(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutatePersonalAppearanceV4(
    request,
    dataService,
    userId,
    now,
    policy,
    "put",
    true,
  );
}

export function resetPersonalAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutatePersonalAppearanceV4(
    request,
    dataService,
    userId,
    now,
    policy,
    "reset",
    true,
  );
}

export function restorePersonalAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutatePersonalAppearanceV4(
    request,
    dataService,
    userId,
    now,
    policy,
    "restore",
    true,
  );
}

async function getGuildAppearanceResponseV4(
  dataService: AppearanceApiDataService,
  guildId: string,
  policy: AppearanceCatalogPolicyV3,
  includeRestoreState: boolean,
): Promise<Response> {
  const statePath = includeRestoreState ? "/state" : "";
  return lookupResponse(
    await postData(
      dataService,
      `/internal/appearance/v4/guild${statePath}/get`,
      { guildId },
    ),
    "guild",
    policy,
    includeRestoreState,
  );
}

export function getGuildAppearanceV4(
  dataService: AppearanceApiDataService,
  guildId: string,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return getGuildAppearanceResponseV4(dataService, guildId, policy, false);
}

export function getGuildAppearanceStateV4(
  dataService: AppearanceApiDataService,
  guildId: string,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return getGuildAppearanceResponseV4(dataService, guildId, policy, true);
}

async function mutateGuildAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
  action: AppearanceMutationAction,
  includeRestoreState: boolean,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "guild", policy);
  } catch {
    return json({ error: "appearance_profile_invalid" }, 400);
  }
  const statePath = includeRestoreState ? "/state" : "";
  const mutationName = includeRestoreState
    ? `web-appearance-guild-state-${action}`
    : "web-appearance-guild";
  return writeResponse(
    await postData(
      dataService,
      `/internal/appearance/v4/guild${statePath}/${action}`,
      {
        guildId,
        updatedByUserId: userId,
        expectedRevision: input.expectedRevision,
        profile: input.profile,
        mutationId: `${mutationName}:${input.idempotencyKey}`,
        occurredAt: now,
      },
    ),
    "guild",
    policy,
    includeRestoreState,
  );
}

export function putGuildAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutateGuildAppearanceV4(
    request,
    dataService,
    guildId,
    userId,
    now,
    policy,
    "put",
    false,
  );
}

export function putGuildAppearanceStateV4(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutateGuildAppearanceV4(
    request,
    dataService,
    guildId,
    userId,
    now,
    policy,
    "put",
    true,
  );
}

export function resetGuildAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutateGuildAppearanceV4(
    request,
    dataService,
    guildId,
    userId,
    now,
    policy,
    "reset",
    true,
  );
}

export function restoreGuildAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return mutateGuildAppearanceV4(
    request,
    dataService,
    guildId,
    userId,
    now,
    policy,
    "restore",
    true,
  );
}

export function isPng(value: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((byte, index) => value[index] === byte);
}

async function previewResponse(
  input: AppearancePreviewRequestV4,
  previewService: AppearancePreviewService,
): Promise<Response> {
  let rpcResult: SchemaInput;
  try {
    rpcResult = await previewService.previewV4(input);
  } catch {
    return json({ error: "appearance_renderer_failed" }, 502);
  }
  const parsed = AppearancePreviewResultSchema.safeParse(rpcResult);
  if (!parsed.success || !isPng(parsed.data.png)) {
    return json({ error: "appearance_preview_response_invalid" }, 502);
  }
  return json({
    version: 4,
    contentType: "image/png",
    width: parsed.data.width,
    height: parsed.data.height,
    base64: bytesToBase64(parsed.data.png),
  });
}

export async function previewAppearanceV4(
  request: Request,
  previewService: AppearancePreviewService,
): Promise<Response> {
  let input: AppearancePreviewRequestV4;
  try {
    input = parseAppearancePreviewRequestV4(
      await readBoundedJson(request, jsonValueSchema),
    );
  } catch {
    return json({ error: "appearance_preview_invalid" }, 400);
  }
  return previewResponse(input, previewService);
}
