import {
  argument,
  Container,
  dag,
  Directory,
  func,
  object,
  Secret,
} from "@dagger.io/dagger"

import {
  SOURCE_IGNORES,
  TEST_SUITE_COMMANDS,
  TestSuite,
  validateCommitSha,
  validateRunNonce,
  WORKER_DRY_RUN_ORDER,
} from "./ci.js"
import { validateBuildTime } from "./validation.js"

@object()
export class DiceWitch {
  /** Run every current CI gate. */
  @func({ cache: "never" })
  async ci(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
    runNonce: string,
  ): Promise<string> {
    await this.staticValidation(source, sha, runNonce)
    for (const suite of Object.values(TestSuite)) {
      await this.testSuite(source, suite, sha)
    }
    await this.workerDryRuns(source, sha)

    return "all CI gates passed"
  }

  /** Run tooling tests, the live dependency audit, type-check, lint, and build. */
  @func({ cache: "never" })
  async staticValidation(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
    runNonce: string,
  ): Promise<string> {
    const validatedSha = validateCommitSha(sha)
    const validatedRunNonce = validateRunNonce(runNonce)

    await this.run(source, validatedSha, [
      ["sh", "-c", "node --test tools/*.test.mjs"],
    ])
    await this.run(
      source,
      validatedSha,
      [["npm", "run", "audit:ci"]],
      validatedRunNonce,
    )
    await this.run(source, validatedSha, [
      ["npm", "run", "type-check"],
      ["npm", "run", "lint:ci"],
      ["npm", "run", "build"],
    ])

    return "static validation passed"
  }

  /** Run one closed-set CI test suite. */
  @func()
  async testSuite(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    suite: TestSuite,
    sha: string,
  ): Promise<string> {
    const validatedSha = validateCommitSha(sha)
    await this.run(source, validatedSha, [TEST_SUITE_COMMANDS[suite]])
    return `${suite} tests passed`
  }

  /** Build frontend assets, then dry-run the complete public Worker cohort. */
  @func()
  async workerDryRuns(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
  ): Promise<string> {
    const validatedSha = validateCommitSha(sha)
    let container = this.environment(source, validatedSha).withExec([
      "npm",
      "run",
      "build",
      "--workspace=@dice-witch/frontend",
    ])

    container = container.withWorkdir("/workspace/cloudflare")
    for (const worker of WORKER_DRY_RUN_ORDER) {
      container = container.withExec([
        "npx",
        "--no-install",
        "wrangler",
        "deploy",
        "--dry-run",
        "--config",
        `wrangler.${worker}.example.jsonc`,
      ])
    }

    await container.sync()
    return "public Worker dry-runs passed"
  }

  /** Validate private staging configuration without Cloudflare credentials or mutations. */
  @func({ cache: "never" })
  async stagingValidate(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
    buildTime: string,
    runNonce: string,
    configBundle: Secret,
    productionDenylist: Secret,
    rollOrigin: Secret,
    gatewayOrigin: Secret,
  ): Promise<string> {
    const input = this.validationInput(source, sha, buildTime, runNonce)
    const container = input.container
      .withSecretVariable("STAGING_CONFIG_B64", configBundle)
      .withSecretVariable(
        "STAGING_PRODUCTION_DENYLIST_B64",
        productionDenylist,
      )
      .withSecretVariable("STAGING_ROLL_ORIGIN", rollOrigin)
      .withSecretVariable("STAGING_GATEWAY_ORIGIN", gatewayOrigin)
      .withExec(this.validationCommand("staging", input.sha, input.buildTime))

    await container.sync()
    return "private staging validation passed"
  }

  /** Deploy the complete staging cohort after guarded validation. */
  @func({ cache: "never" })
  async stagingDeploy(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
    buildTime: string,
    runNonce: string,
    applyMigrations: boolean,
    allowGatewayDeploy: boolean,
    configBundle: Secret,
    productionDenylist: Secret,
    rollOrigin: Secret,
    gatewayOrigin: Secret,
    cloudflareApiToken: Secret,
    cloudflareAccountId: Secret,
  ): Promise<string> {
    const input = this.validationInput(source, sha, buildTime, runNonce)
    const container = input.container
      .withSecretVariable("STAGING_CONFIG_B64", configBundle)
      .withSecretVariable(
        "STAGING_PRODUCTION_DENYLIST_B64",
        productionDenylist,
      )
      .withSecretVariable("STAGING_ROLL_ORIGIN", rollOrigin)
      .withSecretVariable("STAGING_GATEWAY_ORIGIN", gatewayOrigin)
      .withSecretVariable("CLOUDFLARE_API_TOKEN", cloudflareApiToken)
      .withSecretVariable("CLOUDFLARE_ACCOUNT_ID", cloudflareAccountId)
      .withExec(
        this.stagingDeployCommand(
          input.sha,
          input.buildTime,
          applyMigrations,
          allowGatewayDeploy,
        ),
      )

    await container.sync()
    return "staging deployment passed"
  }

  /** Validate private production configuration without Cloudflare credentials or mutations. */
  @func({ cache: "never" })
  async productionValidate(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
    buildTime: string,
    runNonce: string,
    values: Secret,
  ): Promise<string> {
    const input = this.validationInput(source, sha, buildTime, runNonce)
    const container = input.container
      .withSecretVariable("PRODUCTION_VALUES_B64", values)
      .withExec(this.validationCommand("production", input.sha, input.buildTime))

    await container.sync()
    return "private production validation passed"
  }

  /** Deploy and verify the complete production cohort after guarded validation. */
  @func({ cache: "never" })
  async productionDeploy(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
    buildTime: string,
    runNonce: string,
    applyMigrations: boolean,
    allowGatewayDeploy: boolean,
    values: Secret,
    cloudflareApiToken: Secret,
    cloudflareAccountId: Secret,
  ): Promise<string> {
    const input = this.validationInput(source, sha, buildTime, runNonce)
    const container = input.container
      .withSecretVariable("PRODUCTION_VALUES_B64", values)
      .withSecretVariable("CLOUDFLARE_API_TOKEN", cloudflareApiToken)
      .withSecretVariable("CLOUDFLARE_ACCOUNT_ID", cloudflareAccountId)
      .withExec(
        this.productionDeployCommand(
          input.sha,
          input.buildTime,
          applyMigrations,
          allowGatewayDeploy,
        ),
      )

    await container.sync()
    return "production deployment passed"
  }

  /** Bake and verify the exact deployed production appearance thumbnails. */
  @func({ cache: "never" })
  async productionThumbsBake(
    @argument({ defaultPath: "/", ignore: SOURCE_IGNORES }) source: Directory,
    sha: string,
    runNonce: string,
    bakeSecret: Secret,
  ): Promise<string> {
    const validatedSha = validateCommitSha(sha)
    const validatedRunNonce = validateRunNonce(runNonce)
    const container = this.environment(source, validatedSha)
      .withoutMount("/root/.npm")
      .withEnvVariable("DAGGER_RUN_NONCE", validatedRunNonce)
      .withSecretVariable(
        "PRODUCTION_APPEARANCE_THUMBS_BAKE_SECRET",
        bakeSecret,
      )
      .withExec([
        "node",
        "/workspace/cloudflare/tools/production-thumbs-bake.mjs",
        "--expected-sha",
        validatedSha,
      ])

    await container.sync()
    return "production thumbnails baked and verified"
  }

  private environment(source: Directory, sha: string): Container {
    const manifests = dag
      .directory()
      .withFile("package.json", source.file("package.json"))
      .withFile("package-lock.json", source.file("package-lock.json"))
      .withFile("cloudflare/package.json", source.file("cloudflare/package.json"))
      .withFile("frontend/package.json", source.file("frontend/package.json"))
      .withFile(
        "packages/dice-v4-model/package.json",
        source.file("packages/dice-v4-model/package.json"),
      )

    return dag
      .container()
      .from("node:24.13.0-bookworm-slim")
      .withMountedCache("/root/.npm", dag.cacheVolume("npm-11"))
      .withWorkdir("/workspace")
      .withExec(["npm", "install", "--global", "npm@11.6.2"])
      .withDirectory("/workspace", manifests)
      .withExec(["npm", "ci"])
      .withDirectory("/workspace", source)
      .withEnvVariable("VITE_API_BASE", "https://ci.invalid")
      .withEnvVariable("VITE_DISCORD_CLIENT_ID", "100000000000000001")
      .withEnvVariable("VITE_ENVIRONMENT", "development")
      .withEnvVariable("VITE_BUILD_SHA", sha)
  }

  private validationInput(
    source: Directory,
    sha: string,
    buildTime: string,
    runNonce: string,
  ) {
    const validatedSha = validateCommitSha(sha)
    const validatedBuildTime = validateBuildTime(buildTime)
    const validatedRunNonce = validateRunNonce(runNonce)
    const container = this.environment(source, validatedSha)
      .withoutMount("/root/.npm")
      .withDirectory("/source", source)
      .withMountedTemp("/private")
      .withEnvVariable("DAGGER_RUN_NONCE", validatedRunNonce)

    return {
      container,
      sha: validatedSha,
      buildTime: validatedBuildTime,
    }
  }

  private productionDeployCommand(
    sha: string,
    buildTime: string,
    applyMigrations: boolean,
    allowGatewayDeploy: boolean,
  ): string[] {
    return [
      "node",
      "/workspace/cloudflare/tools/dagger-production-deploy.mjs",
      "--sha",
      sha,
      "--build-time",
      buildTime,
      "--source",
      "/source",
      "--workspace",
      "/private/workspace",
      "--node-modules",
      "/workspace/node_modules",
      "--apply-migrations",
      String(applyMigrations),
      "--allow-gateway-deploy",
      String(allowGatewayDeploy),
    ]
  }

  private stagingDeployCommand(
    sha: string,
    buildTime: string,
    applyMigrations: boolean,
    allowGatewayDeploy: boolean,
  ): string[] {
    return [
      "node",
      "/workspace/cloudflare/tools/dagger-staging-deploy.mjs",
      "--sha",
      sha,
      "--build-time",
      buildTime,
      "--source",
      "/source",
      "--workspace",
      "/private/workspace",
      "--node-modules",
      "/workspace/node_modules",
      "--apply-migrations",
      String(applyMigrations),
      "--allow-gateway-deploy",
      String(allowGatewayDeploy),
    ]
  }

  private validationCommand(
    environment: "staging" | "production",
    sha: string,
    buildTime: string,
  ): string[] {
    return [
      "node",
      "/workspace/cloudflare/tools/dagger-validation.mjs",
      "--environment",
      environment,
      "--sha",
      sha,
      "--build-time",
      buildTime,
      "--source",
      "/source",
      "--workspace",
      "/private/workspace",
      "--node-modules",
      "/workspace/node_modules",
    ]
  }

  private async run(
    source: Directory,
    sha: string,
    commands: readonly (readonly string[])[],
    runNonce?: string,
  ): Promise<void> {
    let container = this.environment(source, sha)

    if (runNonce) {
      container = container.withEnvVariable("DAGGER_RUN_NONCE", runNonce)
    }
    for (const command of commands) {
      container = container.withExec([...command])
    }

    await container.sync()
  }
}
