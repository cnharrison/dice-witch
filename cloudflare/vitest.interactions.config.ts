import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        workers: [
          {
            name: "dice-witch-data",
            modules: [
              {
                type: "ESModule",
                path: "data-service-mock.mjs",
                contents: `
                  export default {
                    fetch() {
                      return Response.json({
                        totalGuilds: 1,
                        totalMembers: 42,
                        guildCounts: [1]
                      });
                    }
                  };
                `,
              },
            ],
          },
          {
            name: "dice-witch-gateway",
            modules: [
              {
                type: "ESModule",
                path: "gateway-status-mock.mjs",
                contents: `
                  import { WorkerEntrypoint } from "cloudflare:workers";
                  export class GatewayStatusService extends WorkerEntrypoint {
                    getStatusSnapshot() {
                      return {
                        phase: "idle",
                        shardCount: 1,
                        shards: [{ id: 0, state: "ready", ping: 25 }]
                      };
                    }
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
                  export class RollWork extends DurableObject {}
                `,
              },
            ],
            additionalUnboundDurableObjects: [
              { className: "RollWork", useSQLite: true },
            ],
          },
        ],
        bindings: {
          DISCORD_APPLICATION_ID: "100000000000000001",
          DISCORD_PUBLIC_KEY: "00".repeat(32),
          DISCORD_TEST_GUILD_ID: "100000000000000002",
        },
      },
      wrangler: { configPath: "./wrangler.interactions.example.jsonc" },
    }),
  ],
  test: {
    include: ["tests/interactions/**/*.test.ts"],
  },
});
