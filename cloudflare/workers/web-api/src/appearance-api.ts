import {
  parseAppearanceProfileV3,
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV3,
  parseGuildAppearanceProfileV4,
  type AppearanceProfileV3,
  type AppearanceProfileV4,
  type GuildAppearanceProfileV3,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_VALIDATION_CATALOG,
  APPEARANCE_VALIDATION_CATALOG_V3,
  parseAppearancePreviewRequest,
  parseAppearancePreviewRequestV2,
  parseAppearancePreviewRequestV3,
  parseAppearancePreviewRequestV4,
  parseAppearanceProfile,
  parseAppearanceProfileV2,
  parseGuildAppearanceProfile,
  parseGuildAppearanceProfileV2,
  type AppearancePreviewRequest,
  type AppearancePreviewRequestV2,
  type AppearancePreviewRequestV3,
  type AppearancePreviewRequestV4,
  type AppearanceProfileV1,
  type AppearanceProfileV2,
  type GuildAppearanceProfileV1,
  type GuildAppearanceProfileV2,
} from "../../../packages/dice-appearance/src";
import { bytesToBase64, json } from "./responses";

const SNOWFLAKE = /^[1-9][0-9]{16,19}$/;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 96 * 1024;

export type AppearanceApiDataService = {
  fetch(request: Request): Promise<Response>;
};

export type AppearancePreviewService = {
  preview(value: unknown): Promise<unknown>;
  previewV2(value: unknown): Promise<unknown>;
  previewV3(value: unknown): Promise<unknown>;
  previewV4(value: unknown): Promise<unknown>;
};

type AppearanceProfileKind = "personal" | "guild";
type AppearanceContractVersion = 1 | 2 | 3 | 4;
type AppearanceProfile =
  | AppearanceProfileV1
  | AppearanceProfileV2
  | AppearanceProfileV3
  | AppearanceProfileV4
  | GuildAppearanceProfileV1
  | GuildAppearanceProfileV2
  | GuildAppearanceProfileV3
  | GuildAppearanceProfileV4;

type AppearanceWriteInput = {
  expectedRevision: number;
  profile: AppearanceProfile;
  idempotencyKey: string;
};

type AppearanceWriteResult =
  | { status: "mutation_conflict" }
  | { status: "revision_conflict"; revision: number }
  | {
      status: "applied" | "existing";
      revision: number;
      profile: AppearanceProfile;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

function parseProfile(
  value: unknown,
  kind: AppearanceProfileKind,
  version: AppearanceContractVersion,
): AppearanceProfile {
  if (version === 3 || version === 4) {
    if (kind === "personal") {
      return version === 3
        ? parseAppearanceProfileV3(value, APPEARANCE_VALIDATION_CATALOG_V3)
        : parseAppearanceProfileV4(value, APPEARANCE_VALIDATION_CATALOG_V3);
    }
    return version === 3
      ? parseGuildAppearanceProfileV3(
          value,
          APPEARANCE_VALIDATION_CATALOG_V3,
        )
      : parseGuildAppearanceProfileV4(
          value,
          APPEARANCE_VALIDATION_CATALOG_V3,
        );
  }
  if (kind === "personal") {
    return version === 1
      ? parseAppearanceProfile(value, APPEARANCE_VALIDATION_CATALOG)
      : parseAppearanceProfileV2(value, APPEARANCE_VALIDATION_CATALOG);
  }
  return version === 1
    ? parseGuildAppearanceProfile(value, APPEARANCE_VALIDATION_CATALOG)
    : parseGuildAppearanceProfileV2(value, APPEARANCE_VALIDATION_CATALOG);
}

function appearanceErrorResponse(
  version: AppearanceContractVersion,
  legacy: string,
  v3: string,
  status = 502,
): Response {
  return json({ error: version >= 3 ? v3 : legacy }, status);
}

async function postData(
  dataService: AppearanceApiDataService,
  path: string,
  body: unknown,
): Promise<Response> {
  return dataService.fetch(
    new Request(`https://data.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function readJson(request: Request): Promise<unknown> {
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
  if (request.body === null) {
    throw new Error("Appearance request body is missing");
  }

  const reader = (
    request.body as ReadableStream<Uint8Array>
  ).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
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
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  ) as unknown;
}

function parseLookupProfile(
  value: unknown,
  kind: AppearanceProfileKind,
  version: AppearanceContractVersion,
): AppearanceProfile {
  return version === 4 && isRecord(value) && value.version === 3
    ? parseProfile(value, kind, 3)
    : parseProfile(value, kind, version);
}

function parseLookup(
  value: unknown,
  kind: AppearanceProfileKind,
  version: AppearanceContractVersion,
): { revision: number; profile: AppearanceProfile | null } {
  if (
    isRecord(value) &&
    hasExactKeys(value, ["status"]) &&
    value.status === "missing"
  ) {
    return { revision: 0, profile: null };
  }
  const expectedKeys =
    kind === "personal"
      ? ["profile", "revision", "status"]
      : ["profile", "revision", "status", "updatedByUserId"];
  if (
    !isRecord(value) ||
    !hasExactKeys(value, expectedKeys) ||
    value.status !== "found" ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    (kind === "guild" &&
      (typeof value.updatedByUserId !== "string" ||
        !SNOWFLAKE.test(value.updatedByUserId)))
  ) {
    throw new Error("Appearance lookup response is invalid");
  }
  return {
    revision: Number(value.revision),
    profile: parseLookupProfile(value.profile, kind, version),
  };
}

function parseWriteResult(
  value: unknown,
  kind: AppearanceProfileKind,
  version: AppearanceContractVersion,
): AppearanceWriteResult {
  if (!isRecord(value) || typeof value.status !== "string") {
    throw new Error("Appearance update response is invalid");
  }
  if (
    value.status === "mutation_conflict" &&
    hasExactKeys(value, ["status"])
  ) {
    return { status: "mutation_conflict" };
  }
  if (
    value.status === "revision_conflict" &&
    hasExactKeys(value, ["revision", "status"]) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0
  ) {
    return { status: "revision_conflict", revision: Number(value.revision) };
  }
  if (
    (value.status !== "applied" && value.status !== "existing") ||
    !hasExactKeys(value, ["profile", "revision", "status"]) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1
  ) {
    throw new Error("Appearance update response is invalid");
  }
  return {
    status: value.status,
    revision: Number(value.revision),
    profile: parseProfile(value.profile, kind, version),
  };
}

async function parseWrite(
  request: Request,
  kind: AppearanceProfileKind,
  version: AppearanceContractVersion,
): Promise<AppearanceWriteInput> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey === null || !UUID_V4.test(idempotencyKey)) {
    throw new Error("Appearance idempotency key is invalid");
  }
  const value = await readJson(request);
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["expectedRevision", "profile"]) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0 ||
    Number(value.expectedRevision) >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Appearance update request is invalid");
  }
  return {
    expectedRevision: Number(value.expectedRevision),
    profile: parseProfile(value.profile, kind, version),
    idempotencyKey: idempotencyKey.toLowerCase(),
  };
}

function isVersionConflict(
  value: unknown,
): value is { error: "appearance_profile_version_conflict" } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["error"]) &&
    value.error === "appearance_profile_version_conflict"
  );
}

function invalidProfileResponse(
  version: AppearanceContractVersion,
  operation: "lookup" | "update",
): Response {
  return appearanceErrorResponse(
    version,
    `Appearance ${operation} response is invalid`,
    "appearance_profile_response_invalid",
  );
}

async function lookupResponse(
  response: Response,
  kind: AppearanceProfileKind,
  version: AppearanceContractVersion,
): Promise<Response> {
  if (response.status === 409) {
    try {
      const value: unknown = await response.json();
      return isVersionConflict(value)
        ? json(value, 409)
        : invalidProfileResponse(version, "lookup");
    } catch {
      return invalidProfileResponse(version, "lookup");
    }
  }
  if (!response.ok) {
    return appearanceErrorResponse(
      version,
      "Appearance lookup failed",
      "appearance_data_unavailable",
    );
  }
  try {
    return json(parseLookup(await response.json(), kind, version));
  } catch {
    return invalidProfileResponse(version, "lookup");
  }
}

async function writeResponse(
  response: Response,
  kind: AppearanceProfileKind,
  version: AppearanceContractVersion,
): Promise<Response> {
  if (response.status === 404) {
    return appearanceErrorResponse(
      version,
      "Appearance profile owner is missing",
      "appearance_profile_owner_missing",
    );
  }
  if (!response.ok && response.status !== 409) {
    return appearanceErrorResponse(
      version,
      "Appearance update failed",
      "appearance_data_unavailable",
    );
  }
  try {
    const value: unknown = await response.json();
    if (isVersionConflict(value)) {
      return response.status === 409
        ? json(value, 409)
        : invalidProfileResponse(version, "update");
    }
    const result = parseWriteResult(value, kind, version);
    if (
      result.status === "revision_conflict" ||
      result.status === "mutation_conflict"
    ) {
      return response.status === 409
        ? json(result, 409)
        : invalidProfileResponse(version, "update");
    }
    return response.ok
      ? json(result)
      : invalidProfileResponse(version, "update");
  } catch {
    return invalidProfileResponse(version, "update");
  }
}

export async function getPersonalAppearance(
  dataService: AppearanceApiDataService,
  userId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/personal/get", {
      userId,
    }),
    "personal",
    1,
  );
}

export async function putPersonalAppearance(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "personal", 1);
  } catch {
    return json({ error: "Personal appearance request is invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/personal/put", {
      userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-personal:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "personal",
    1,
  );
}

export async function getGuildAppearance(
  dataService: AppearanceApiDataService,
  guildId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/guild/get", { guildId }),
    "guild",
    1,
  );
}

export async function putGuildAppearance(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "guild", 1);
  } catch {
    return json({ error: "Guild appearance request is invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-guild:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "guild",
    1,
  );
}

export async function getPersonalAppearanceV2(
  dataService: AppearanceApiDataService,
  userId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v2/personal/get", {
      userId,
    }),
    "personal",
    2,
  );
}

export async function putPersonalAppearanceV2(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "personal", 2);
  } catch {
    return json({ error: "Personal appearance request is invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/v2/personal/put", {
      userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-personal:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "personal",
    2,
  );
}

export async function getPersonalAppearanceV3(
  dataService: AppearanceApiDataService,
  userId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v3/personal/get", {
      userId,
    }),
    "personal",
    3,
  );
}

export async function putPersonalAppearanceV3(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "personal", 3);
  } catch {
    return json({ error: "appearance_profile_invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/v3/personal/put", {
      userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-personal:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "personal",
    3,
  );
}

export async function getPersonalAppearanceV4(
  dataService: AppearanceApiDataService,
  userId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v4/personal/get", {
      userId,
    }),
    "personal",
    4,
  );
}

export async function putPersonalAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "personal", 4);
  } catch {
    return json({ error: "appearance_profile_invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/v4/personal/put", {
      userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-personal:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "personal",
    4,
  );
}

export async function getGuildAppearanceV2(
  dataService: AppearanceApiDataService,
  guildId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v2/guild/get", {
      guildId,
    }),
    "guild",
    2,
  );
}

export async function putGuildAppearanceV2(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "guild", 2);
  } catch {
    return json({ error: "Guild appearance request is invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/v2/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-guild:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "guild",
    2,
  );
}

export async function getGuildAppearanceV3(
  dataService: AppearanceApiDataService,
  guildId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v3/guild/get", {
      guildId,
    }),
    "guild",
    3,
  );
}

export async function putGuildAppearanceV3(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "guild", 3);
  } catch {
    return json({ error: "appearance_profile_invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/v3/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-guild:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "guild",
    3,
  );
}

export async function getGuildAppearanceV4(
  dataService: AppearanceApiDataService,
  guildId: string,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v4/guild/get", {
      guildId,
    }),
    "guild",
    4,
  );
}

export async function putGuildAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "guild", 4);
  } catch {
    return json({ error: "appearance_profile_invalid" }, 400);
  }
  return writeResponse(
    await postData(dataService, "/internal/appearance/v4/guild/put", {
      guildId,
      updatedByUserId: userId,
      expectedRevision: input.expectedRevision,
      profile: input.profile,
      mutationId: `web-appearance-guild:${input.idempotencyKey}`,
      occurredAt: now,
    }),
    "guild",
    4,
  );
}

function isPng(value: Uint8Array): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  return signature.every((byte, index) => value[index] === byte);
}

async function previewResponse(
  input:
    | AppearancePreviewRequest
    | AppearancePreviewRequestV2
    | AppearancePreviewRequestV3
    | AppearancePreviewRequestV4,
  render: (input: unknown) => Promise<unknown>,
  rendererVersion: 2 | 3 | 4,
  responseVersion: 1 | 2 | 3 | 4,
): Promise<Response> {
  let result: unknown;
  try {
    result = await render(input);
  } catch {
    return json(
      {
        error:
          responseVersion >= 3
            ? "appearance_renderer_failed"
            : "Appearance preview failed",
      },
      502,
    );
  }
  const resultKeys = [
    "contentType",
    "diceCount",
    "height",
    "png",
    "rowCount",
    "version",
    "width",
  ];
  if (
    !isRecord(result) ||
    !hasExactKeys(result, resultKeys) ||
    result.version !== rendererVersion ||
    result.contentType !== "image/png" ||
    !(result.png instanceof Uint8Array) ||
    result.png.byteLength < 8 ||
    result.png.byteLength > 8 * 1024 * 1024 ||
    !isPng(result.png) ||
    !Number.isSafeInteger(result.width) ||
    Number(result.width) < 1 ||
    Number(result.width) > 4_096 ||
    !Number.isSafeInteger(result.height) ||
    Number(result.height) < 1 ||
    Number(result.height) > 4_096 ||
    !Number.isSafeInteger(result.diceCount) ||
    Number(result.diceCount) < 1 ||
    Number(result.diceCount) > 10 ||
    !Number.isSafeInteger(result.rowCount) ||
    Number(result.rowCount) < 1 ||
    Number(result.rowCount) > 10
  ) {
    return json(
      {
        error:
          responseVersion >= 3
            ? "appearance_preview_response_invalid"
            : "Appearance preview response is invalid",
      },
      502,
    );
  }
  return json({
    version: responseVersion,
    contentType: "image/png",
    width: Number(result.width),
    height: Number(result.height),
    base64: bytesToBase64(result.png),
  });
}

export async function previewAppearance(
  request: Request,
  previewService: AppearancePreviewService,
): Promise<Response> {
  let input: AppearancePreviewRequest;
  try {
    input = parseAppearancePreviewRequest(
      await readJson(request),
      APPEARANCE_VALIDATION_CATALOG,
    );
  } catch {
    return json({ error: "Appearance preview request is invalid" }, 400);
  }
  return previewResponse(
    input,
    (previewInput) => previewService.preview(previewInput),
    2,
    1,
  );
}

export async function previewAppearanceV2(
  request: Request,
  previewService: AppearancePreviewService,
): Promise<Response> {
  let input: AppearancePreviewRequestV2;
  try {
    input = parseAppearancePreviewRequestV2(
      await readJson(request),
      APPEARANCE_VALIDATION_CATALOG,
    );
  } catch {
    return json({ error: "Appearance preview request is invalid" }, 400);
  }
  return previewResponse(
    input,
    (previewInput) => previewService.previewV2(previewInput),
    3,
    2,
  );
}

export async function previewAppearanceV3(
  request: Request,
  previewService: AppearancePreviewService,
): Promise<Response> {
  let input: AppearancePreviewRequestV3;
  try {
    input = parseAppearancePreviewRequestV3(await readJson(request));
  } catch {
    return json({ error: "appearance_preview_invalid" }, 400);
  }
  return previewResponse(
    input,
    (previewInput) => previewService.previewV3(previewInput),
    4,
    3,
  );
}

export async function previewAppearanceV4(
  request: Request,
  previewService: AppearancePreviewService,
): Promise<Response> {
  let input: AppearancePreviewRequestV4;
  try {
    input = parseAppearancePreviewRequestV4(await readJson(request));
  } catch {
    return json({ error: "appearance_preview_invalid" }, 400);
  }
  return previewResponse(
    input,
    (previewInput) => previewService.previewV4(previewInput),
    4,
    4,
  );
}
