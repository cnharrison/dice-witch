import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["packages/dice-canvaskit/benchmark.node.test.ts"],
    maxWorkers: 1,
    testTimeout: 600_000,
  },
});
