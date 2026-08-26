import Busboy from "@fastify/busboy";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { z } from "zod";
import type { SchemaInput } from "./packages/discord-contracts/src/schema-primitives";
import {
  BUILTIN_APPEARANCE_RECIPES_V2,
  BUILTIN_APPEARANCE_RECIPES_R34_V3,
  CHAOTIC_APPEARANCE_STYLE_ID,
  randomRecipeForResolutionV3,
} from "./packages/dice-appearance/src/catalog";
import { APPEARANCE_TARGETS } from "./packages/dice-appearance/src/types";
import { createDefaultDiceViewPreferencesV4 } from "./../packages/dice-v4-model/src/dice-view-preferences";

const V2PayloadSchema = z.object({
  flags: z.number().optional(),
  components: z.array(z.object({
    type: z.number(),
    content: z.string().optional(),
  }).loose()),
});
const AppearanceRequestSchema = z.object({
  userId: z.string(),
  guildId: z.string().nullable(),
});
const SavedRollCopySchema = z.object({
  id: z.string(),
  draft: z.object({
    version: z.number(),
    name: z.string(),
    nameColor: z.string().optional(),
  }),
});
const SavedRollGetSchema = z.object({
  id: z.string(),
  owner: z.discriminatedUnion("type", [
    z.object({ type: z.literal("user"), userId: z.string() }),
    z.object({ type: z.literal("guild"), guildId: z.string() }),
  ]),
});
const GuildSettingsRequestSchema = z.object({
  guildId: z.string(),
  version: z.literal(2),
});
const LifecycleRequestSchema = z.object({
  interactionId: z.string(),
  context: z.object({ rendererRevision: z.string().nullable() }),
});
const AccountingRequestSchema = z.object({
  interactionId: z.string(),
  username: z.string(),
});

type EmptyAppearanceResponse = {
  version: number;
  recipes: object;
  diceView?: ReturnType<typeof createDefaultDiceViewPreferencesV4>;
};
type AppearanceResponse = {
  version: number;
  recipes:
    | ReturnType<typeof effectiveRecipesV2>
    | ReturnType<typeof effectiveRecipesV3>;
  diceView?: ReturnType<typeof createDefaultDiceViewPreferencesV4>;
};
type SavedRollResponse = {
  version: number;
  id: string;
  owner: z.output<typeof SavedRollGetSchema>["owner"];
  displayName: string;
  comparisonKey: string;
  notation: string;
  title: string;
  repetitions: number;
  nameColor?: string;
  pinned: boolean;
  manualOrder: number;
  revision: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: number;
  updatedAt: number;
};

const accountingAttempts = new Map<string, number>();
const appearanceAttempts = new Map<string, number>();
const lifecycleRendererRevisions = new Map<string, string | null>();
const resultDeliveryAttempts = new Map<string, number>();

function v2TopLevelText(payload: SchemaInput): string | null {
  const parsed = V2PayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  return parsed.data.components.find((component) => component.type === 10)
    ?.content ?? null;
}

function effectiveRecipesV2(primary: string | null) {
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

function effectiveRecipesV3(primary: string | null) {
  const builtin = BUILTIN_APPEARANCE_RECIPES_R34_V3[CHAOTIC_APPEARANCE_STYLE_ID];
  if (builtin === undefined) throw new Error("Chaotic V3 test recipe is missing");
  const recipe = structuredClone(
    randomRecipeForResolutionV3(builtin.recipe, false),
  );
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
  const value: SchemaInput = await request.json();
  if (
    path === "/internal/appearance/v2/effective" ||
    path === "/internal/appearance/v3/effective" ||
    path === "/internal/appearance/v4/effective"
  ) {
    const appearanceRequest = AppearanceRequestSchema.safeParse(value);
    if (!appearanceRequest.success) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const { userId } = appearanceRequest.data;
    const attempts = (appearanceAttempts.get(userId) ?? 0) + 1;
    appearanceAttempts.set(userId, attempts);
    if (userId === "100000000000000099") {
      return Response.json({ error: "temporary" }, { status: 503 });
    }
    if (userId === "100000000000000098") {
      const emptyAppearance: EmptyAppearanceResponse = {
        version: path.includes("/v4/") ? 4 : path.includes("/v3/") ? 3 : 2,
        recipes: {},
      };
      if (path.includes("/v4/")) {
        emptyAppearance.diceView = createDefaultDiceViewPreferencesV4();
      }
      return Response.json(emptyAppearance);
    }
    if (userId === "100000000000000088" && attempts > 1) {
      return Response.json({ error: "changed" }, { status: 503 });
    }
    const version = path.includes("/v4/") ? 4 : path.includes("/v3/") ? 3 : 2;
    const primary = userId === "100000000000000088" ? "#aa0000" : null;
    const appearanceResponse: AppearanceResponse = {
      version,
      recipes:
        version >= 3
          ? effectiveRecipesV3(primary)
          : effectiveRecipesV2(primary),
    };
    if (version === 4) {
      appearanceResponse.diceView = createDefaultDiceViewPreferencesV4();
    }
    return Response.json(appearanceResponse);
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
    const copyRequest = SavedRollCopySchema.safeParse(value);
    if (
      !copyRequest.success ||
      (path.includes("/v2/") &&
        (copyRequest.data.draft.version !== 2 ||
          copyRequest.data.draft.nameColor !== "#AABBCC"))
    ) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    if (copyRequest.data.draft.name === "Attack") {
      return Response.json(
        { status: "name_conflict", listRevision: 0 },
        { status: 409 },
      );
    }
    return Response.json({
      status: "applied",
      listRevision: 1,
      savedRoll: { id: copyRequest.data.id },
    });
  }
  if (
    path === "/internal/saved-rolls/v1/get" ||
    path === "/internal/saved-rolls/v2/get"
  ) {
    const getRequest = SavedRollGetSchema.safeParse(value);
    if (!getRequest.success) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const { id, owner } = getRequest.data;
    if (id === "323e4567-e89b-42d3-a456-426614174000") {
      return Response.json({ status: "missing" }, { status: 404 });
    }
    const version = path.includes("/v2/") ? 2 : 1;
    const savedRoll: SavedRollResponse = {
      version,
      id,
      owner,
        displayName: "Attack",
        comparisonKey: "attack",
        notation: "2d20+5",
        title: "Sword",
        repetitions: 2,
      pinned: true,
        manualOrder: 0,
      revision: id === "423e4567-e89b-42d3-a456-426614174000" ? 4 : 3,
      createdByUserId: "100000000000000003",
      updatedByUserId: "100000000000000003",
      createdAt: 100,
      updatedAt: 200,
    };
    if (version === 2) savedRoll.nameColor = "#AABBCC";
    return Response.json({ status: "found", savedRoll });
  }
  if (path === "/internal/guilds/settings") {
    const settingsRequest = GuildSettingsRequestSchema.safeParse(value);
    if (!settingsRequest.success) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const { guildId } = settingsRequest.data;
    return Response.json({
      status: "found",
      settings: {
        skipDiceDelay: [
          "100000000000000003",
          "100000000000000004",
        ].includes(guildId),
        hideRollResultText: guildId === "100000000000000004",
      },
    });
  }
  if (path === "/internal/roll-lifecycle") {
    const lifecycleRequest = LifecycleRequestSchema.safeParse(value);
    if (!lifecycleRequest.success) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const { interactionId, context } = lifecycleRequest.data;
    const rendererRevision = context.rendererRevision;
    if (
      lifecycleRendererRevisions.has(interactionId) &&
      lifecycleRendererRevisions.get(interactionId) !== rendererRevision
    ) {
      return Response.json({ status: "conflict" }, { status: 409 });
    }
    lifecycleRendererRevisions.set(interactionId, rendererRevision);
    return Response.json({ status: "applied" });
  }
  if (path !== "/internal/roll-accounting") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const accountingRequest = AccountingRequestSchema.safeParse(value);
  if (!accountingRequest.success) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const { interactionId, username } = accountingRequest.data;
  const attempts = (accountingAttempts.get(interactionId) ?? 0) + 1;
  accountingAttempts.set(interactionId, attempts);
  if (username === "accounting-temporary" && attempts === 1) {
    return Response.json({ error: "temporary" }, { status: 503 });
  }
  if (username === "accounting-conflict") {
    return Response.json({ status: "conflict" }, { status: 409 });
  }
  return Response.json({ status: "applied" });
}

async function multipartPayload(request: Request): Promise<SchemaInput> {
  const contentType = request.headers.get("content-type");
  if (contentType === null) return null;
  const parser = new Busboy({ headers: { "content-type": contentType } });
  let payload: SchemaInput = null;
  const completed = new Promise<void>((resolve, reject) => {
    parser.on("field", (name, value) => {
      if (name === "payload_json") payload = JSON.parse(value);
    });
    parser.on("finish", resolve);
    parser.on("error", reject);
  });
  parser.end(Buffer.from(await request.arrayBuffer()));
  await completed;
  return payload;
}

async function discordTestResponse(request: Request): Promise<Response> {
  const token = new URL(request.url).pathname.split("/")[5] ?? "";
  if (token === "delivery-clatter-contract") {
    const contentType = request.headers.get("content-type") ?? "";
    let payload: SchemaInput;
    if (contentType.startsWith("application/json")) {
      payload = await request.json();
    } else {
      payload = await multipartPayload(request);
    }
    const parsedPayload = V2PayloadSchema.safeParse(payload);
    if (
      !parsedPayload.success ||
      parsedPayload.data.flags !== (1 << 15) ||
      !v2TopLevelText(payload)?.startsWith("_...") ||
      !v2TopLevelText(payload)?.endsWith("..._")
    ) {
      return Response.json({ message: "clatter missing" }, { status: 400 });
    }
    return Response.json({ id: "100000000000000087" });
  }
  if (token === "delivery-success") {
    return Response.json({ id: "100000000000000087" });
  }
  if (token === "invalid-private-help") {
    return Response.json(
      { message: "Preflighted invalid-roll help must not be edited" },
      { status: 418 },
    );
  }
  if (token === "direct-public-roll") {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    const url = new URL(request.url);
    if (
      attempts !== 1 ||
      request.method !== "PATCH" ||
      !url.pathname.endsWith("/messages/@original") ||
      !request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      return Response.json({ message: "public original response is invalid" }, { status: 400 });
    }
    return Response.json({ id: "100000000000000087" });
  }
  if (token.startsWith("saved-channel-")) {
    const pathname = new URL(request.url).pathname;
    if (
      request.method !== "DELETE" ||
      !pathname.endsWith("/messages/@original")
    ) {
      return Response.json(
        { message: "standalone picker cleanup is invalid" },
        { status: 400 },
      );
    }
    return new Response(null, { status: 204 });
  }
  if (token.startsWith("delivery-result-temporary-")) {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    if (attempts === 1) {
      return Response.json({ message: "temporary" }, { status: 503 });
    }
    return Response.json({ id: "100000000000000087" });
  }
  if (token === "delivery-temporary") {
    return Response.json({ message: "temporary" }, { status: 503 });
  }
  if (token === "delivery-deadline") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.startsWith("application/json")) {
      const payload = V2PayloadSchema.safeParse(await request.json());
      if (
        payload.success &&
        payload.data.flags === ((1 << 15) | 64) &&
        JSON.stringify(payload.data.components).includes(
          "This roll could not be completed. Please try again.",
        )
      ) {
        return Response.json({ id: "100000000000000087" });
      }
    }
    return Response.json({ message: "temporary" }, { status: 503 });
  }
  if (token === "delivery-result-message-missing") {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    return attempts === 1
      ? Response.json({ id: "100000000000000087" })
      : Response.json(
          { code: 10_008, message: "unknown message" },
          { status: 404 },
        );
  }
  if (token === "delivery-result-webhook-unknown") {
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    return attempts === 1
      ? Response.json({ id: "100000000000000087" })
      : Response.json(
          { code: 10_015, message: "unknown webhook" },
          { status: 404 },
        );
  }
  if (token === "delivery-result-webhook-probe-read") {
    if (request.method === "GET") {
      return Response.json({ id: "100000000000000087" });
    }
    const attempts = (resultDeliveryAttempts.get(token) ?? 0) + 1;
    resultDeliveryAttempts.set(token, attempts);
    return attempts === 1
      ? Response.json({})
      : Response.json(
          { code: 10_015, message: "unknown webhook" },
          { status: 404 },
        );
  }
  if (token === "delivery-terminal-failure") {
    return Response.json(
      { code: 10_015, message: "invalid interaction" },
      { status: 404 },
    );
  }
  if (token === "delivery-zero-code") {
    return Response.json({ code: 0 }, { status: 404 });
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
        import.meta.url,
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
                  export class DiscordMessageProbeService extends WorkerEntrypoint {
                    inspectDiscordMessageExistence() { return { outcome: "missing" }; }
                  }
                  export class DiscordRestService extends WorkerEntrypoint {
                    sendRollHelper() { return { status: "delivered" }; }
                    deliverChannelRollMessageV1(value) {
                      const validCreate = value.version === 1 &&
                        value.operation === "create-clatter" &&
                        value.channelId === "100000000000000010" &&
                        value.payload?.flags === (1 << 15);
                      const validResultCreate = value.version === 1 &&
                        value.operation === "create-result" &&
                        value.channelId === "100000000000000010" &&
                        value.payload?.flags === (1 << 15) &&
                        value.filename?.endsWith(".png") &&
                        value.png instanceof Uint8Array;
                      const validEdit = value.version === 1 &&
                        value.operation === "edit-result" &&
                        value.channelId === "100000000000000010" &&
                        value.messageId === "100000000000000099" &&
                        value.payload?.flags === (1 << 15) &&
                        value.filename?.endsWith(".png") &&
                        value.png instanceof Uint8Array;
                      return validCreate || validResultCreate || validEdit
                        ? {
                            status: "delivered",
                            messageId: "100000000000000099",
                            httpStatus: 200
                          }
                        : {
                            status: "failed",
                            httpStatus: 400,
                            discordErrorCode: null
                          };
                    }
                    deliverWebRoll(value) {
                      const key = "web:" + value.rollId;
                      const attempts = (logAttempts.get(key) ?? 0) + 1;
                      logAttempts.set(key, attempts);
                      const payloadJson = JSON.stringify(value.payload);
                      if (payloadJson.includes("## web retry") && attempts === 1) {
                        return { status: "retryable", httpStatus: 503, retryAfterMs: 1000 };
                      }
                      if (payloadJson.includes("## web permission")) {
                        return { status: "permission_error" };
                      }
                      if (payloadJson.includes("## web failed")) {
                        return { status: "failed", httpStatus: 400 };
                      }
                      return {
                        status: "delivered",
                        messageId: "100000000000000098"
                      };
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
        bindings: { ROLL_RENDER_VERSION: "4", ROLL_VIEW_POLICY: "r19" },
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
