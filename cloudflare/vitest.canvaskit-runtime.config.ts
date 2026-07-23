import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.canvaskit-runtime.jsonc" },
    }),
  ],
  test: {
    fileParallelism: false,
    include: ["packages/dice-canvaskit/tests/**/*.test.ts"],
    maxWorkers: 1,
  },
});
