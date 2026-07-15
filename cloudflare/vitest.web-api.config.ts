import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/web-api/**/*.test.ts"],
  },
});
