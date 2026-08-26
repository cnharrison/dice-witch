import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const FULL_SHA = /^[0-9a-f]{40}$/;
const CLI_USAGE =
  "Usage: node tools/staging-smoke.mjs --web-origin <url> --roll-origin <url> --gateway-origin <url> --expected-sha <full-sha>";
const PROPAGATION_ATTEMPTS = 12;
const PROPAGATION_RETRY_MS = 5_000;
const TargetsSchema = z.object({
  webOrigin: z.string(),
  rollOrigin: z.string(),
  gatewayOrigin: z.string(),
  expectedSha: z.string().regex(FULL_SHA),
});
const MetadataSchema = z.object({
  environment: z.literal("staging"),
  build: z.object({ sha: z.string(), time: z.string() }),
});
const AnonymousSessionSchema = z.strictObject({ user: z.null() });
const WorkerHealthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  renderVersion: z.number().optional(),
});
const PROPAGATION_ERRORS = new Set([
  "metadata SHA does not match the expected source SHA",
  "interaction boundary expected HTTP 404, received 500",
]);

function parseHttpsOrigin(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== value ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  return url.origin;
}

async function request(fetchImplementation, name, url) {
  try {
    return await fetchImplementation(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`${name} request failed: ${error.message}`, {
      cause: error,
    });
  }
}

function requireStatus(name, response, expected) {
  if (response.status !== expected) {
    throw new Error(
      `${name} expected HTTP ${expected}, received ${response.status}`,
    );
  }
}

async function checkWebRoot(fetchImplementation, webOrigin) {
  const response = await request(fetchImplementation, "web root", `${webOrigin}/`);
  requireStatus("web root", response, 200);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("text/html")) {
    throw new Error("web root must return HTML");
  }
  if (!(await response.text()).includes('id="root"')) {
    throw new Error("web root is missing the application root");
  }
  return { name: "web root", status: response.status };
}

async function checkMetadata(fetchImplementation, webOrigin, expectedSha) {
  const response = await request(
    fetchImplementation,
    "build metadata",
    `${webOrigin}/api/meta`,
  );
  requireStatus("build metadata", response, 200);
  const body = MetadataSchema.parse(await response.json());
  if (body.build.sha !== expectedSha) {
    throw new Error("metadata SHA does not match the expected source SHA");
  }
  if (Number.isNaN(Date.parse(body.build.time))) {
    throw new Error("metadata build time is invalid");
  }
  return { name: "build metadata", status: response.status };
}

async function checkAnonymousSession(fetchImplementation, webOrigin) {
  const response = await request(
    fetchImplementation,
    "anonymous session",
    `${webOrigin}/api/auth/session`,
  );
  requireStatus("anonymous session", response, 401);
  const body = AnonymousSessionSchema.safeParse(await response.json());
  if (!body.success) {
    throw new Error("anonymous session response is invalid");
  }
  return { name: "anonymous session", status: response.status };
}

async function checkInteractionBoundary(fetchImplementation, webOrigin) {
  const response = await request(
    fetchImplementation,
    "interaction boundary",
    `${webOrigin}/interactions`,
  );
  requireStatus("interaction boundary", response, 404);
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error("interaction boundary must return JSON");
  }
  return { name: "interaction boundary", status: response.status };
}

async function checkWorkerHealth(
  fetchImplementation,
  name,
  origin,
  serviceName,
  expectedRenderVersion,
) {
  const response = await request(
    fetchImplementation,
    `${name} health`,
    `${origin}/health`,
  );
  requireStatus(`${name} health`, response, 200);
  const parsedBody = WorkerHealthSchema.safeParse(await response.json());
  if (
    !parsedBody.success ||
    (parsedBody.data.service !== serviceName &&
      !parsedBody.data.service.startsWith(`${serviceName}-`)) ||
    (expectedRenderVersion !== undefined &&
      parsedBody.data.renderVersion !== expectedRenderVersion)
  ) {
    throw new Error(`${name} health response is invalid`);
  }
  return { name: `${name} health`, status: response.status };
}

export async function runStagingSmoke(value, fetchImplementation = fetch) {
  const parsedTargets = TargetsSchema.safeParse(value);
  if (!parsedTargets.success) {
    throw new Error("Staging smoke targets are required");
  }
  const targets = parsedTargets.data;
  const webOrigin = parseHttpsOrigin("webOrigin", targets.webOrigin);
  const rollOrigin = parseHttpsOrigin("rollOrigin", targets.rollOrigin);
  const gatewayOrigin = parseHttpsOrigin("gatewayOrigin", targets.gatewayOrigin);
  const checks = [];
  checks.push(await checkWebRoot(fetchImplementation, webOrigin));
  checks.push(
    await checkMetadata(fetchImplementation, webOrigin, targets.expectedSha),
  );
  checks.push(await checkAnonymousSession(fetchImplementation, webOrigin));
  checks.push(await checkInteractionBoundary(fetchImplementation, webOrigin));
  checks.push(
    await checkWorkerHealth(
      fetchImplementation,
      "roll",
      rollOrigin,
      "dice-witch-roll",
      4,
    ),
  );
  checks.push(
    await checkWorkerHealth(
      fetchImplementation,
      "gateway",
      gatewayOrigin,
      "dice-witch-gateway",
    ),
  );
  return { status: "passed", checks };
}

export async function runStagingSmokeWithPropagationRetry(
  targets,
  fetchImplementation = fetch,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  for (let attempt = 1; attempt <= PROPAGATION_ATTEMPTS; attempt += 1) {
    try {
      return await runStagingSmoke(targets, fetchImplementation);
    } catch (error) {
      const isPropagationMismatch =
        error instanceof Error && PROPAGATION_ERRORS.has(error.message);
      if (!isPropagationMismatch || attempt === PROPAGATION_ATTEMPTS) {
        throw error;
      }
      await wait(PROPAGATION_RETRY_MS);
    }
  }
  throw new Error("Staging smoke retry state is invalid");
}

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(CLI_USAGE);
    }
    values[flag.slice(2)] = value;
  }
  const expected = [
    "expected-sha",
    "gateway-origin",
    "roll-origin",
    "web-origin",
  ];
  if (
    Object.keys(values).sort().join(",") !== expected.join(",")
  ) {
    throw new Error(CLI_USAGE);
  }
  return {
    webOrigin: values["web-origin"],
    rollOrigin: values["roll-origin"],
    gatewayOrigin: values["gateway-origin"],
    expectedSha: values["expected-sha"],
  };
}

async function main() {
  const result = await runStagingSmokeWithPropagationRetry(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
