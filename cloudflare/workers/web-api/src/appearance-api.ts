import {
  parseAppearanceProfileV4,
  parseGuildAppearanceProfileV4,
  validateAppearanceProfileFontsV4,
  type AppearanceProfileV4,
  type GuildAppearanceProfileV4,
} from "@dice-witch/dice-v4-model";
import {
  APPEARANCE_VALIDATION_CATALOG_V3,
  appearanceCatalogForPolicyV3,
  parseAppearancePreviewRequestV4,
  type AppearanceCatalogPolicyV3,
  type AppearancePreviewRequestV4,
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
  previewV4(value: unknown): Promise<unknown>;
};

type AppearanceProfileKind = "personal" | "guild";
type AppearanceProfile =
  | AppearanceProfileV4
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

  const reader = request.body.getReader();
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
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
  ) as unknown;
}

function parseLookup(
  value: unknown,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
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
    profile: parseProfile(value.profile, kind, policy),
  };
}

function parseWriteResult(
  value: unknown,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
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
    profile: parseProfile(value.profile, kind, policy),
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
): Promise<Response> {
  if (!response.ok) {
    return json({ error: "appearance_data_unavailable" }, 502);
  }
  try {
    return json(parseLookup(await response.json(), kind, policy));
  } catch {
    return invalidProfileResponse();
  }
}

async function writeResponse(
  response: Response,
  kind: AppearanceProfileKind,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  if (response.status === 404) {
    return json({ error: "appearance_profile_owner_missing" }, 502);
  }
  if (!response.ok && response.status !== 409) {
    return json({ error: "appearance_data_unavailable" }, 502);
  }
  try {
    const result = parseWriteResult(await response.json(), kind, policy);
    if (
      result.status === "revision_conflict" ||
      result.status === "mutation_conflict"
    ) {
      return response.status === 409
        ? json(result, 409)
        : invalidProfileResponse();
    }
    return response.ok ? json(result) : invalidProfileResponse();
  } catch {
    return invalidProfileResponse();
  }
}

export async function getPersonalAppearanceV4(
  dataService: AppearanceApiDataService,
  userId: string,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v4/personal/get", {
      userId,
    }),
    "personal",
    policy,
  );
}

export async function putPersonalAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "personal", policy);
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
    policy,
  );
}

export async function getGuildAppearanceV4(
  dataService: AppearanceApiDataService,
  guildId: string,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  return lookupResponse(
    await postData(dataService, "/internal/appearance/v4/guild/get", {
      guildId,
    }),
    "guild",
    policy,
  );
}

export async function putGuildAppearanceV4(
  request: Request,
  dataService: AppearanceApiDataService,
  guildId: string,
  userId: string,
  now: number,
  policy: AppearanceCatalogPolicyV3,
): Promise<Response> {
  let input: AppearanceWriteInput;
  try {
    input = await parseWrite(request, "guild", policy);
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
    policy,
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
  let result: unknown;
  try {
    result = await previewService.previewV4(input);
  } catch {
    return json({ error: "appearance_renderer_failed" }, 502);
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
    result.version !== 4 ||
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
    return json({ error: "appearance_preview_response_invalid" }, 502);
  }
  return json({
    version: 4,
    contentType: "image/png",
    width: Number(result.width),
    height: Number(result.height),
    base64: bytesToBase64(result.png),
  });
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
  return previewResponse(input, previewService);
}
