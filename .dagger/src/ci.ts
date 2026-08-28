export enum TestSuite {
  CloudflareConfiguration = "cloudflare-configuration",
  CanvasKitRuntime = "canvaskit-runtime",
  Appearance = "appearance",
  SavedRolls = "saved-rolls",
  SvgRenderer = "svg-renderer",
  Gateway = "gateway",
  DiscordRest = "discord-rest",
  Interactions = "interactions",
  Roll = "roll",
  Data = "data",
  WebApi = "web-api",
  Frontend = "frontend",
  V4Model = "v4-model",
}

export const TEST_SUITE_COMMANDS: Readonly<{
  [suite in TestSuite]: readonly string[]
}> = {
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

export const WORKER_DRY_RUN_ORDER = [
  "data",
  "discord-rest",
  "roll",
  "gateway",
  "interactions",
  "web-api",
] as const

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/
const RUN_NONCE_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

export function validateCommitSha(sha: string): string {
  if (!COMMIT_SHA_PATTERN.test(sha)) {
    throw new Error("build SHA must be a full lowercase commit SHA")
  }
  return sha
}

export function validateRunNonce(runNonce: string): string {
  if (!RUN_NONCE_PATTERN.test(runNonce)) {
    throw new Error(
      "run nonce must contain 1-128 letters, numbers, dots, underscores, or hyphens",
    )
  }
  return runNonce
}
