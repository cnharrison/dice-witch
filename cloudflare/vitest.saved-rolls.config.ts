import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/saved-rolls/**/*.test.ts"],
  },
});
