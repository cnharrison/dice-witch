import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const REPOSITORY = "cnharrison/dice-witch";
const WORKFLOW = "deploy-production.yml";
const REF = "master";
const ENVIRONMENT = "production";
const POLL_INTERVAL_MS = 3_000;
const APPROVAL_DISCOVERY_TIMEOUT_MS = 15_000;
const APPROVAL_START_TIMEOUT_MS = 30_000;
const RUN_DISCOVERY_TIMEOUT_MS = 15_000;
const CANCELLATION_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 60 * 60 * 1_000;
const FULL_SHA = /^[0-9a-f]{40}$/u;

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function commandError(command, result) {
  const detail = result.stderr.trim() || result.stdout.trim() || "unknown error";
  return new Error(`${command} failed: ${detail}`);
}

export function createGhClient(run = spawnSync) {
  const execute = (args, options = {}) => {
    const result = run("gh", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw commandError(`gh ${args.join(" ")}`, result);
    return result.stdout.trim();
  };

  return {
    verifyAuthentication() {
      execute(["auth", "status"]);
    },
    getAuthenticatedUser() {
      return execute(["api", "user", "--jq", ".login"]);
    },
    getMasterSha() {
      return execute([
        "api",
        `repos/${REPOSITORY}/commits/${REF}`,
        "--jq",
        ".sha",
      ]);
    },
    getEnvironment() {
      return parseJson(
        execute([
          "api",
          `repos/${REPOSITORY}/environments/${ENVIRONMENT}`,
        ]),
        "Production environment lookup",
      );
    },
    listProductionRuns() {
      return parseJson(
        execute([
          "run",
          "list",
          "--repo",
          REPOSITORY,
          "--workflow",
          WORKFLOW,
          "--event",
          "workflow_dispatch",
          "--limit",
          "20",
          "--json",
          "databaseId,headSha,url",
        ]),
        "Production workflow run list",
      );
    },
    dispatch({ sha, applyMigrations, allowGatewayDeploy }) {
      return execute([
        "workflow",
        "run",
        WORKFLOW,
        "--repo",
        REPOSITORY,
        "--ref",
        REF,
        "-f",
        `sha=${sha}`,
        "-f",
        `apply_migrations=${String(applyMigrations)}`,
        "-f",
        `allow_gateway_deploy=${String(allowGatewayDeploy)}`,
        "-f",
        "confirmation=deploy-production",
      ]);
    },
    getRun(runId) {
      return parseJson(
        execute([
          "run",
          "view",
          String(runId),
          "--repo",
          REPOSITORY,
          "--json",
          "status,conclusion,headSha,jobs,url",
        ]),
        "Workflow run lookup",
      );
    },
    getPendingDeployments(runId) {
      return parseJson(
        execute([
          "api",
          `repos/${REPOSITORY}/actions/runs/${runId}/pending_deployments`,
        ]),
        "Pending deployment lookup",
      );
    },
    cancel(runId) {
      execute(["run", "cancel", String(runId), "--repo", REPOSITORY]);
    },
    approve(runId, environmentId) {
      const payload = JSON.stringify({
        environment_ids: [environmentId],
        state: "approved",
        comment: "Approved exact-SHA production deployment authorized by the operator command.",
      });
      execute(
        [
          "api",
          "--method",
          "POST",
          `repos/${REPOSITORY}/actions/runs/${runId}/pending_deployments`,
          "--input",
          "-",
        ],
        { input: payload },
      );
    },
  };
}

export function runIdFromDispatch(output) {
  return output.match(/\/actions\/runs\/(\d+)(?:\b|\/)/u)?.[1];
}

export async function discoverDispatchedRun({
  dispatchOutput,
  previousRunIds,
  expectedSha,
  gh,
  sleep,
  now,
  timeoutMs = RUN_DISCOVERY_TIMEOUT_MS,
}) {
  const returnedRunId = runIdFromDispatch(dispatchOutput);
  if (returnedRunId !== undefined) return returnedRunId;

  const startedAt = now();
  for (;;) {
    const candidates = gh.listProductionRuns().filter(
      ({ databaseId, headSha }) =>
        headSha === expectedSha && !previousRunIds.has(String(databaseId)),
    );
    if (candidates.length === 1) return String(candidates[0].databaseId);
    if (candidates.length > 1) {
      throw new Error("Multiple new production runs matched the requested SHA");
    }
    if (now() - startedAt > timeoutMs) {
      throw new Error("The dispatched production run could not be identified");
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function activeStep(run) {
  for (const job of run.jobs ?? []) {
    const step = job.steps?.find(({ status }) => status === "in_progress");
    if (step !== undefined) return `${job.name}: ${step.name}`;
    if (job.status === "in_progress") return job.name;
  }
  return run.status;
}

function deployJobStarted(run) {
  const deploy = run.jobs?.find(({ name }) => name === "deploy");
  return (
    deploy !== undefined &&
    (deploy.status === "in_progress" ||
      deploy.status === "completed" ||
      (deploy.steps?.length ?? 0) > 0)
  );
}

export function validateProductionEnvironment(environment, authenticatedUser) {
  if (environment?.name !== ENVIRONMENT) {
    throw new Error("Production environment lookup returned the wrong environment");
  }
  const reviewerRule = environment.protection_rules?.find(
    ({ type }) => type === "required_reviewers",
  );
  if (reviewerRule === undefined || reviewerRule.prevent_self_review === true) {
    throw new Error("Production does not permit operator approval");
  }
  const isReviewer = reviewerRule.reviewers?.some(
    ({ type, reviewer }) =>
      type === "User" && reviewer?.login === authenticatedUser,
  );
  if (!isReviewer) {
    throw new Error(`${authenticatedUser} is not a production reviewer`);
  }
}

export function pendingProductionApproval(pendingDeployments) {
  if (!Array.isArray(pendingDeployments) || pendingDeployments.length !== 1) {
    throw new Error("Expected exactly one pending production deployment");
  }
  const [pending] = pendingDeployments;
  if (
    pending?.environment?.name !== ENVIRONMENT ||
    !Number.isSafeInteger(pending.environment.id)
  ) {
    throw new Error("Pending deployment does not target the production environment");
  }
  if (pending.current_user_can_approve !== true) {
    throw new Error("The authenticated GitHub user cannot approve production");
  }
  return pending.environment.id;
}

async function cancelUnstartedRun({
  runId,
  expectedSha,
  gh,
  sleep,
  now,
  pollIntervalMs,
  cancellationTimeoutMs,
}) {
  gh.cancel(runId);
  const cancellationStartedAt = now();
  for (;;) {
    const run = gh.getRun(runId);
    if (run.headSha !== expectedSha) {
      throw new Error("Cancelled production run SHA could not be verified");
    }
    if (run.status === "completed") {
      if (run.conclusion === "cancelled") return;
      throw new Error(`Production completed while cancellation was pending: ${run.url}`);
    }
    if (deployJobStarted(run)) {
      throw new Error(`Production started while cancellation was pending: ${run.url}`);
    }
    if (now() - cancellationStartedAt > cancellationTimeoutMs) {
      throw new Error(`Production run cancellation could not be confirmed: ${run.url}`);
    }
    await sleep(pollIntervalMs);
  }
}

export async function superviseProductionRun({
  runId,
  expectedSha,
  gh,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
  log = console.log,
  pollIntervalMs = POLL_INTERVAL_MS,
  approvalDiscoveryTimeoutMs = APPROVAL_DISCOVERY_TIMEOUT_MS,
  approvalStartTimeoutMs = APPROVAL_START_TIMEOUT_MS,
  cancellationTimeoutMs = CANCELLATION_TIMEOUT_MS,
  runTimeoutMs = RUN_TIMEOUT_MS,
}) {
  const startedAt = now();
  const cancelRun = () =>
    cancelUnstartedRun({
      runId,
      expectedSha,
      gh,
      sleep,
      now,
      pollIntervalMs,
      cancellationTimeoutMs,
    });
  let approvalDiscoveryStartedAt;
  let approvalSubmittedAt;
  let lastTransition;

  for (;;) {
    const run = gh.getRun(runId);
    if (run.headSha !== expectedSha) {
      throw new Error(`Production run SHA mismatch: expected ${expectedSha}, received ${run.headSha}`);
    }

    const transition = activeStep(run);
    if (transition !== lastTransition) {
      log(transition);
      lastTransition = transition;
    }

    if (run.status === "completed") {
      if (run.conclusion !== "success") {
        throw new Error(`Production deployment concluded ${run.conclusion || "without a result"}: ${run.url}`);
      }
      return run;
    }

    const waiting = (run.jobs ?? []).some(({ status }) => status === "waiting");
    if (waiting && approvalSubmittedAt === undefined) {
      const pending = gh.getPendingDeployments(runId);
      if (Array.isArray(pending) && pending.length === 0) {
        approvalDiscoveryStartedAt ??= now();
        if (now() - approvalDiscoveryStartedAt > approvalDiscoveryTimeoutMs) {
          await cancelRun();
          throw new Error("Production approval did not become available; run cancelled");
        }
      } else {
        let environmentId;
        try {
          environmentId = pendingProductionApproval(pending);
        } catch (error) {
          await cancelRun();
          throw error;
        }
        try {
          gh.approve(runId, environmentId);
        } catch (error) {
          await cancelRun();
          throw error;
        }
        approvalSubmittedAt = now();
        log("production approval submitted");
      }
    }

    if (
      approvalSubmittedAt !== undefined &&
      !deployJobStarted(run) &&
      now() - approvalSubmittedAt > approvalStartTimeoutMs
    ) {
      await cancelRun();
      throw new Error("Production did not start within the approval timeout; run cancelled");
    }

    if (now() - startedAt > runTimeoutMs) {
      throw new Error(`Production deployment exceeded its monitoring timeout: ${run.url}`);
    }
    await sleep(pollIntervalMs);
  }
}

function parseOptions() {
  const { values } = parseArgs({
    options: {
      sha: { type: "string" },
      "apply-migrations": { type: "boolean", default: false },
      "allow-gateway-deploy": { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.sha === undefined || !FULL_SHA.test(values.sha)) {
    throw new Error("--sha must be a full lowercase commit SHA");
  }
  if (!values["allow-gateway-deploy"]) {
    throw new Error("--allow-gateway-deploy is required for the complete production cohort");
  }
  return {
    sha: values.sha,
    applyMigrations: values["apply-migrations"],
    allowGatewayDeploy: values["allow-gateway-deploy"],
  };
}

async function main() {
  const options = parseOptions();
  const gh = createGhClient();
  gh.verifyAuthentication();
  validateProductionEnvironment(
    gh.getEnvironment(),
    gh.getAuthenticatedUser(),
  );
  if (gh.getMasterSha() !== options.sha) {
    throw new Error("--sha must match the current remote master commit");
  }

  const previousRunIds = new Set(
    gh.listProductionRuns().map(({ databaseId }) => String(databaseId)),
  );
  const dispatchOutput = gh.dispatch(options);
  const runId = await discoverDispatchedRun({
    dispatchOutput,
    previousRunIds,
    expectedSha: options.sha,
    gh,
    sleep: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now: Date.now,
  });
  console.log(`https://github.com/${REPOSITORY}/actions/runs/${runId}`);
  await superviseProductionRun({ runId, expectedSha: options.sha, gh });
  console.log(`production deployment ${runId} succeeded`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
