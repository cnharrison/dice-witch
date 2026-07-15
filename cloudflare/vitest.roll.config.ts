import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const accountingAttempts = new Map<string, number>();

async function dataTestResponse(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const value: unknown = await request.json();
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
  if (token === "delivery-temporary") {
    return Response.json({ message: "temporary" }, { status: 503 });
  }
  if (token === "delivery-terminal-failure") {
    return Response.json({ message: "invalid interaction" }, { status: 404 });
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
            name: "dice-witch-discord-rest",
            modules: [
              {
                type: "ESModule",
                path: "discord-rest-mock.mjs",
                contents: `
                  import { WorkerEntrypoint } from "cloudflare:workers";
                  export class DiscordRestService extends WorkerEntrypoint {
                    sendRollHelper() { return { status: "delivered" }; }
                    logRoll(value) {
                      if (value.username === "logging-context") {
                        const context = value.context;
                        return context?.kind === "guild" &&
                          context.guildName === "Fixture Guild" &&
                          context.channelName === "dice-rolls" &&
                          context.channelType === 0
                          ? { status: "delivered" }
                          : { status: "failed", stage: "context", httpStatus: 400 };
                      }
                      if (value.username === "logging-temporary") {
                        return { status: "retryable", stage: "context", httpStatus: 503 };
                      }
                      if (value.username === "logging-forbidden") {
                        return { status: "failed", stage: "context", httpStatus: 403 };
                      }
                      return { status: "delivered" };
                    }
                  }
                `,
              },
            ],
          },
        ],
        outboundService: discordTestResponse,
        serviceBindings: { DATA_SERVICE: dataTestResponse },
      },
      wrangler: {
        configPath: "./wrangler.roll.example.jsonc",
      },
    }),
  ],
  test: {
    include: ["tests/roll/**/*.test.ts"],
  },
});
