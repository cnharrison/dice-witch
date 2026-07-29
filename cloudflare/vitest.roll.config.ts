import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import {
  BUILTIN_APPEARANCE_RECIPES_V2,
  BUILTIN_APPEARANCE_RECIPES_V3,
  CHAOTIC_APPEARANCE_STYLE_ID,
} from "./packages/dice-appearance/src/catalog";
import { APPEARANCE_TARGETS } from "./packages/dice-appearance/src/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const accountingAttempts = new Map<string, number>();
const appearanceAttempts = new Map<string, number>();
const resultDeliveryAttempts = new Map<string, number>();

function effectiveRecipesV2(primary: string | null): Record<string, unknown> {
  const recipe =
    primary === null
      ? BUILTIN_APPEARANCE_RECIPES_V2[CHAOTIC_APPEARANCE_STYLE_ID]
      : {
          version: 2,
          compatibility: "native-v2",
          variation: "fixed",
          varyBy: "roll",
          colors: { mode: "tonal", primary },
          fill: { mode: "fixed", value: { type: "gradient" } },
          font: { mode: "fixed", fontId: "liberation-sans" },
          gradient: {
            colorSource: "full-palette",
            scope: { mode: "fixed", value: "die-wide" },
            direction: {
              mode: "fixed",
              value: "upper-left-to-lower-right",
            },
          },
          lighting: {
            mode: { mode: "fixed", value: "combined" },
            strength: { mode: "fixed", value: "subtle" },
            direction: { mode: "fixed", value: "upper-left" },
          },
        };
  if (recipe === undefined) throw new Error("Chaotic test recipe is missing");
  return Object.fromEntries(APPEARANCE_TARGETS.map((target) => [target, recipe]));
}

function effectiveRecipesV3(primary: string | null): Record<string, unknown> {
  const builtin = BUILTIN_APPEARANCE_RECIPES_V3[CHAOTIC_APPEARANCE_STYLE_ID];
  if (builtin === undefined) throw new Error("Chaotic V3 test recipe is missing");
  const recipe = structuredClone(builtin.recipe);
  if (primary !== null) {
    delete recipe.randomization;
    recipe.colors = { mode: "palette", colors: [primary, "#550000"] };
  }
  return Object.fromEntries(
    APPEARANCE_TARGETS.map((target) => [target, recipe]),
  );
}

async function dataTestResponse(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const value: unknown = await request.json();
  if (
    path === "/internal/appearance/v2/effective" ||
    path === "/internal/appearance/v3/effective"
  ) {
    if (
      !isRecord(value) ||
      typeof value.userId !== "string" ||
      (value.guildId !== null && typeof value.guildId !== "string")
    ) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const attempts = (appearanceAttempts.get(value.userId) ?? 0) + 1;
    appearanceAttempts.set(value.userId, attempts);
    if (value.userId === "100000000000000099") {
      return Response.json({ error: "temporary" }, { status: 503 });
    }
    if (value.userId === "100000000000000098") {
      return Response.json({
        version: path.includes("/v3/") ? 3 : 2,
        recipes: {},
      });
    }
    if (value.userId === "100000000000000088" && attempts > 1) {
      return Response.json({ error: "changed" }, { status: 503 });
    }
    const version = path.includes("/v3/") ? 3 : 2;
    const primary = value.userId === "100000000000000088" ? "#aa0000" : null;
    return Response.json({
      version,
      recipes:
        version === 3
          ? effectiveRecipesV3(primary)
          : effectiveRecipesV2(primary),
    });
  }
  if (path === "/internal/saved-rolls/v1/ensure-user") {
    return Response.json({ status: "existing" });
  }
  if (path === "/internal/saved-rolls/v1/list") {
    return Response.json({ status: "found", listRevision: 0, savedRolls: [] });
  }
  if (
    path === "/internal/saved-rolls/v1/copy" ||
    path === "/internal/saved-rolls/v2/copy"
  ) {
    if (
      !isRecord(value) ||
      !isRecord(value.draft) ||
      (path.includes("/v2/") &&
        (value.draft.version !== 2 || value.draft.nameColor !== "#AABBCC"))
    ) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    if (value.draft.name === "Attack") {
      return Response.json(
        { status: "name_conflict", listRevision: 0 },
        { status: 409 },
      );
    }
    return Response.json({
      status: "applied",
      listRevision: 1,
      savedRoll: { id: value.id },
    });
  }
  if (
    path === "/internal/saved-rolls/v1/get" ||
    path === "/internal/saved-rolls/v2/get"
  ) {
    if (
      !isRecord(value) ||
      !isRecord(value.owner) ||
      typeof value.id !== "string"
    ) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    if (value.id === "323e4567-e89b-42d3-a456-426614174000") {
      return Response.json({ status: "missing" }, { status: 404 });
    }
    const owner = value.owner;
    const ownerId = owner.type === "user" ? owner.userId : owner.guildId;
    if (
      (owner.type !== "user" && owner.type !== "guild") ||
      typeof ownerId !== "string"
    ) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const version = path.includes("/v2/") ? 2 : 1;
    return Response.json({
      status: "found",
      savedRoll: {
        version,
        id: value.id,
        owner,
        displayName: "Attack",
        comparisonKey: "attack",
        notation: "2d20+5",
        title: "Sword",
        repetitions: 2,
        ...(version === 2 ? { nameColor: "#AABBCC" } : {}),
        pinned: true,
        manualOrder: 0,
        revision:
          value.id === "423e4567-e89b-42d3-a456-426614174000" ? 4 : 3,
        createdByUserId: "100000000000000003",
        updatedByUserId: "100000000000000003",
        createdAt: 100,
        updatedAt: 200,
      },
    });
  }
  if (path === "/internal/guilds/settings") {
    if (!isRecord(value) || typeof value.guildId !== "string") {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    return Response.json({
      status: "found",
      settings: {
        skipDiceDelay: value.guildId === "100000000000000003",
      },
    });
  }
  if (path === "/internal/roll-lifecycle") {
    return Response.json({ status: "applied" });
  }
  if (path !== "/internal/roll-accounting") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (
    !isRecord(value) ||
    typeof value.interactionId !== "string" ||
    typeof value.username !== "string"
  ) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const attempts = (accountingAttempts.get(value.interactionId) ?? 0) + 1;
  accountingAttempts.set(value.interactionId, attempts);
  if (value.username === "accounting-temporary" && attempts === 1) {
    return Response.json({ error: "temporary" }, { status: 503 });
  }
  if (value.username === "accounting-conflict") {
    return Response.json({ status: "conflict" }, { status: 409 });
  }
  return Response.json({ status: "applied" });
}

async function discordTestResponse(request: Request): Promise<Response> {
  const token = new URL(request.url).pathname.split("/")[5] ?? "";
  if (token === "delivery-clatter-contract") {
    const contentType = request.headers.get("content-type") ?? "";
    let payload: unknown;
    if (contentType.startsWith("application/json")) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      const value = form.get("payload_json");
      payload = typeof value === "string" ? JSON.parse(value) : null;
    }
    if (
      !isRecord(payload) ||
      typeof payload.content !== "string" ||
      !payload.content.startsWith("_...") ||
      !payload.content.endsWith("..._")
    ) {
      return Response.json({ message: "clatter missing" }, { status: 400 });
    }
    return Response.json({ id: "development-message" });
  }
  if (token === "delivery-success") {
    return Response.json({ id: "development-message" });
  }
  if (token === "invalid-private-help") {
    const url = new URL(request.url);
    if (
      request.method === "DELETE" &&
      url.pathname.endsWith("/messages/@original")
    ) {
      return Response.json(
        { message: "Private invalid-roll help must be retained" },
        { status: 400 },
      );
    }
    const payload: unknown = await request.json();
    if (
      request.method !== "PATCH" ||
      !url.pathname.endsWith("/messages/@original") ||
      !isRecord(payload) ||
      payload.content !== "Invalid notation" ||
      !Array.isArray(payload.components) ||
      JSON.stringify(payload).includes("DMing you")
    ) {
      return Response.json({ message: "private help is invalid" }, { status: 400 });
    }
    return Response.json({ id: "development-message" });
  }
  if (token === "direct-public-roll") {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    const url = new URL(request.url);
    if (attempts === 1) {
      const payload: unknown = await request.json();
      if (
        request.method !== "PATCH" ||
        !url.pathname.endsWith("/messages/@original") ||
        !isRecord(payload) ||
        payload.content !== "Preparing your roll."
      ) {
        return Response.json({ message: "private defer was not resolved" }, { status: 400 });
      }
      return Response.json({ id: "development-message" });
    }
    if (attempts === 2) {
      if (
        request.method !== "POST" ||
        url.searchParams.get("wait") !== "true" ||
        !request.headers.get("content-type")?.startsWith("multipart/form-data")
      ) {
        return Response.json({ message: "public result is invalid" }, { status: 400 });
      }
      return Response.json({ id: "100000000000000099" });
    }
    if (
      attempts !== 3 ||
      request.method !== "DELETE" ||
      !url.pathname.endsWith("/messages/@original")
    ) {
      return Response.json({ message: "private defer was not deleted" }, { status: 400 });
    }
    return new Response(null, { status: 204 });
  }
  if (token === "saved-public-clatter") {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    const url = new URL(request.url);
    if (attempts === 1) {
      const payload: unknown = await request.json();
      if (
        request.method !== "POST" ||
        url.searchParams.get("wait") !== "true" ||
        !isRecord(payload) ||
        typeof payload.content !== "string" ||
        !payload.content.startsWith("_...") ||
        typeof payload.nonce !== "string" ||
        !/^c[1-9][0-9]{16,19}$/u.test(payload.nonce) ||
        payload.enforce_nonce !== true
      ) {
        return Response.json({ message: "public clatter is invalid" }, { status: 400 });
      }
      return Response.json({ id: "100000000000000099" });
    }
    if (attempts === 2) {
      if (
        request.method !== "PATCH" ||
        !url.pathname.endsWith("/messages/100000000000000099")
      ) {
        return Response.json({ message: "public result edit is invalid" }, { status: 400 });
      }
      const form = await request.formData();
      const rawPayload = form.get("payload_json");
      const payload = typeof rawPayload === "string"
        ? JSON.parse(rawPayload) as unknown
        : null;
      if (!isRecord(payload) || !Array.isArray(payload.components)) {
        return Response.json({ message: "saved result is invalid" }, { status: 400 });
      }
      return Response.json({ id: "100000000000000099" });
    }
    if (
      attempts !== 3 ||
      request.method !== "PATCH" ||
      !url.pathname.endsWith("/messages/@original")
    ) {
      return Response.json({ message: "private confirmation is invalid" }, { status: 400 });
    }
    return Response.json({ id: "100000000000000098" });
  }
  if (token === "saved-followup") {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    const pathname = new URL(request.url).pathname;
    if (
      (attempts === 1 &&
        (request.method !== "POST" || pathname.endsWith("/messages/@original"))) ||
      (attempts === 2 &&
        (request.method !== "PATCH" || !pathname.endsWith("/messages/@original")))
    ) {
      return Response.json({ message: "invalid saved-roll delivery mode" }, { status: 400 });
    }
    if (attempts === 1) {
      const form = await request.formData();
      const rawPayload = form.get("payload_json");
      const payload =
        typeof rawPayload === "string" ? JSON.parse(rawPayload) as unknown : null;
      if (
        new URL(request.url).searchParams.get("wait") !== "true" ||
        !isRecord(payload) ||
        payload.nonce === undefined ||
        payload.enforce_nonce !== true ||
        !Array.isArray(payload.components)
      ) {
        return Response.json(
          { message: "saved-roll followup is not replay-safe" },
          { status: 400 },
        );
      }
    }
    return Response.json({ id: "development-message" });
  }
  if (token.startsWith("delivery-result-temporary-")) {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    if (attempts === 1) {
      return Response.json({ message: "temporary" }, { status: 503 });
    }
    return Response.json({ id: "development-message" });
  }
  if (token === "delivery-temporary") {
    return Response.json({ message: "temporary" }, { status: 503 });
  }
  if (token === "delivery-deadline") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.startsWith("application/json")) {
      const payload: unknown = await request.json();
      if (
        isRecord(payload) &&
        payload.content === "This roll could not be completed. Please try again."
      ) {
        return Response.json({ id: "development-message" });
      }
    }
    return Response.json({ message: "temporary" }, { status: 503 });
  }
  if (token === "delivery-terminal-failure") {
    return Response.json(
      { code: 10_015, message: "invalid interaction" },
      { status: 404 },
    );
  }
  if (token === "delivery-clatter-rejected") {
    return Response.json(
      {
        code: 10_008,
        message: "sensitive provider detail",
        errors: { token: "must not be logged" },
      },
      { status: 404 },
    );
  }
  if (token === "delivery-rate-limited") {
    return Response.json(
      { message: "rate limited" },
      { status: 429, headers: { "retry-after": "2" } },
    );
  }
  return Response.json({ message: "unexpected outbound request" }, { status: 418 });
}

export default defineConfig({
  resolve: {
    alias: {
      crypto: new URL(
        "./packages/roll-domain/src/worker-crypto.ts",
        (import.meta as ImportMeta & { url: string }).url,
      ).pathname,
    },
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        workers: [
          {
            name: "dice-witch-gateway",
            modules: [
              {
                type: "ESModule",
                path: "gateway-status-mock.mjs",
                contents: `
                  import { WorkerEntrypoint } from "cloudflare:workers";
                  export class GatewayStatusService extends WorkerEntrypoint {
                    getLogicalGuildShard(guildId) {
                      if (guildId === "100000000000000099") {
                        return { status: "unavailable" };
                      }
                      return {
                        status: "available",
                        shardId: 2,
                        shardCount: 4,
                        generation: 16
                      };
                    }
                  }
                `,
              },
            ],
          },
          {
            name: "dice-witch-discord-rest",
            modules: [
              {
                type: "ESModule",
                path: "discord-rest-mock.mjs",
                contents: `
                  import { WorkerEntrypoint } from "cloudflare:workers";
                  const logAttempts = new Map();
                  export class DiscordRestService extends WorkerEntrypoint {
                    sendRollHelper() { return { status: "delivered" }; }
                    deliverWebRoll(value) {
                      const key = "web:" + value.rollId;
                      const attempts = (logAttempts.get(key) ?? 0) + 1;
                      logAttempts.set(key, attempts);
                      if (value.payload?.embeds?.[0]?.title === "web-retry" && attempts === 1) {
                        return { status: "retryable", httpStatus: 503, retryAfterMs: 1000 };
                      }
                      if (value.payload?.embeds?.[0]?.title === "web-permission") {
                        return { status: "permission_error" };
                      }
                      if (value.payload?.embeds?.[0]?.title === "web-failed") {
                        return { status: "failed", httpStatus: 400 };
                      }
                      return { status: "delivered" };
                    }
                    deliverRollLogV1(value) {
                      const artifact = value.artifact;
                      const attempts = (logAttempts.get(artifact.rollId) ?? 0) + 1;
                      logAttempts.set(artifact.rollId, attempts);
                      if (artifact.user.username === "log-retry" && attempts === 1) {
                        return { status: "retryable", httpStatus: 429, retryAfterMs: 1000 };
                      }
                      if (artifact.user.username === "log-outage") {
                        return { status: "retryable", httpStatus: 503, retryAfterMs: null };
                      }
                      if (artifact.user.username === "log-image-rejected") {
                        if (artifact.image.status === "available") {
                          return { status: "image-rejected", httpStatus: 400 };
                        }
                        if (!JSON.stringify(artifact.payload).includes("**image unavailable**")) {
                          return { status: "failed", httpStatus: 400 };
                        }
                      }
                      if (artifact.user.username === "log-shard-unavailable" &&
                          value.logicalShard.status !== "unavailable") {
                        return { status: "failed", httpStatus: 400 };
                      }
                      return { status: "delivered", httpStatus: 200 };
                    }
                  }
                `,
              },
            ],
          },
        ],
        outboundService: discordTestResponse,
        serviceBindings: { DATA_SERVICE: dataTestResponse },
        bindings: { ROLL_RENDER_VERSION: "4" },
      },
      wrangler: {
        configPath: "./wrangler.roll.example.jsonc",
      },
    }),
  ],
  test: {
    fileParallelism: false,
    include: ["tests/roll/**/*.test.ts"],
    maxWorkers: 1,
  },
});
