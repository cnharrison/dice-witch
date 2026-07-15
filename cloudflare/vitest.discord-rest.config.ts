import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          DISCORD_BOT_TOKEN: "fixture.bot.token",
        },
      },
      wrangler: { configPath: "./wrangler.discord-rest.example.jsonc" },
    }),
  ],
  test: {
    include: ["tests/discord-rest/**/*.test.ts"],
  },
});
