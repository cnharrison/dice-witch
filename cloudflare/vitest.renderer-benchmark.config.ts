import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/renderer/benchmark-renderer.benchmark.ts"],
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
