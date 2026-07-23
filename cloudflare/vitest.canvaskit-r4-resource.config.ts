import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.canvaskit-runtime.jsonc" },
    }),
  ],
  test: {
    include: [
      "packages/dice-canvaskit/stress/r4-projected-resource.test.ts",
    ],
  },
});
