import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
                    listCurrentGuildIds() { return []; }
                    logGuildLifecycle() { return { status: "delivered" }; }
                  }
                `,
              },
            ],
          },
          {
            name: "dice-witch-roll",
            modules: [
              {
                type: "ESModule",
                path: "roll-work-mock.mjs",
                contents: `
                  import { DurableObject } from "cloudflare:workers";
                  export class RollWork extends DurableObject {
                    deliver() { return { status: "delivered" }; }
                  }
                `,
              },
            ],
            additionalUnboundDurableObjects: [
              { className: "RollWork", useSQLite: true },
            ],
          },
        ],
        serviceBindings: {
          DATA_SERVICE: () =>
            Response.json({
              status: "applied",
              deactivatedCount: 0,
              guildName: "Fixture Guild",
            }),
        },
        bindings: {
          DISCORD_BOT_TOKEN:
            "development-token-first-part.second.development-token-third-part",
          GATEWAY_CONTROL_TOKEN:
            "gateway-control-token-at-least-32-characters",
        },
      },
      wrangler: {
        configPath: "./wrangler.gateway.example.jsonc",
      },
    }),
  ],
  test: {
    include: ["tests/gateway/**/*.test.ts"],
  },
});
