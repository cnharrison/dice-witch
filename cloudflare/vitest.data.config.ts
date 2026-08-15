import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations/data");

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./workers/data/src/index.ts",
      miniflare: {
        compatibilityDate: "2026-07-10",
        d1Databases: ["DATA"],
        bindings: {
          APPEARANCE_CATALOG_POLICY: "r37",
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    include: ["tests/data/**/*.test.ts"],
  },
});
