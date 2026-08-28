import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  TEST_SUITE_COMMANDS,
  TestSuite,
  WORKER_DRY_RUN_ORDER,
  validateCommitSha,
  validateRunNonce,
} from "../src/ci.ts"

const EXPECTED_TEST_SUITES = {
  [TestSuite.CloudflareConfiguration]: [
    "npm",
    "run",
    "test:config",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.CanvasKitRuntime]: [
    "npm",
    "run",
    "test:canvaskit-runtime",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.Appearance]: [
    "npm",
    "run",
    "test:appearance",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.SavedRolls]: [
    "npm",
    "run",
    "test:saved-rolls",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.SvgRenderer]: [
    "npm",
    "run",
    "test:dice-svg",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.Gateway]: [
    "npm",
    "run",
    "test:gateway",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.DiscordRest]: [
    "npm",
    "run",
    "test:discord-rest",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.Interactions]: [
    "npm",
    "run",
    "test:interactions",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.Roll]: [
    "npm",
    "run",
    "test:roll",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.Data]: [
    "npm",
    "run",
    "test:data",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.WebApi]: [
    "npm",
    "run",
    "test:web-api",
    "--workspace=@dice-witch/cloudflare",
  ],
  [TestSuite.Frontend]: [
    "npm",
    "run",
    "test",
    "--workspace=@dice-witch/frontend",
    "--",
    "--maxWorkers=1",
  ],
  [TestSuite.V4Model]: [
    "npm",
    "run",
    "test",
    "--workspace=@dice-witch/dice-v4-model",
    "--",
    "--maxWorkers=1",
  ],
}

describe("Dagger CI contract", () => {
  it("uses the complete current CI suite allowlist and exact commands", () => {
    assert.equal(Object.values(TestSuite).length, 13)
    assert.deepEqual(TEST_SUITE_COMMANDS, EXPECTED_TEST_SUITES)
  })

  it("dry-runs the complete Worker cohort in current CI order", () => {
    assert.deepEqual(WORKER_DRY_RUN_ORDER, [
      "data",
      "discord-rest",
      "roll",
      "gateway",
      "interactions",
      "web-api",
    ])
  })

  it("requires a full lowercase commit SHA", () => {
    const sha = "2164349b8ef0f94b05a1545764b04f4363f32b8a"
    assert.equal(validateCommitSha(sha), sha)

    for (const invalid of ["", "2164349", "G".repeat(40), "a".repeat(41)]) {
      assert.throws(() => validateCommitSha(invalid), /full lowercase commit SHA/)
    }
  })

  it("requires a bounded run nonce suitable for cache invalidation", () => {
    assert.equal(validateRunNonce("123456789.2"), "123456789.2")

    for (const invalid of ["", "contains spaces", "x".repeat(129)]) {
      assert.throws(() => validateRunNonce(invalid), /run nonce/)
    }
  })
})
