import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ["tests/appearance/**/*.test.ts"],
    maxWorkers: 1,
  },
});
