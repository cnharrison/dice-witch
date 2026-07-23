import path from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;
const CLI_USAGE =
  "Usage: node tools/staging-smoke.mjs --web-origin <url> --roll-origin <url> --gateway-origin <url> --expected-sha <full-sha>";

function parseHttpsOrigin(name, value) {
  if (typeof value !== "string") {
    throw new Error(`${name} is required`);
  }
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
  const body = await response.json();
  if (body?.environment !== "staging") {
    throw new Error("metadata environment must be staging");
  }
  if (body?.build?.sha !== expectedSha) {
    throw new Error("metadata SHA does not match the expected source SHA");
  }
  if (
    typeof body.build.time !== "string" ||
    Number.isNaN(Date.parse(body.build.time))
  ) {
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
  const body = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    body.user !== null
  ) {
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
  const body = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    body.ok !== true ||
    typeof body.service !== "string" ||
    (body.service !== serviceName && !body.service.startsWith(`${serviceName}-`)) ||
    (expectedRenderVersion !== undefined &&
      body.renderVersion !== expectedRenderVersion)
  ) {
    throw new Error(`${name} health response is invalid`);
  }
  return { name: `${name} health`, status: response.status };
}

export async function runStagingSmoke(targets, fetchImplementation = fetch) {
  if (typeof targets !== "object" || targets === null) {
    throw new Error("Staging smoke targets are required");
  }
  const webOrigin = parseHttpsOrigin("webOrigin", targets.webOrigin);
  const rollOrigin = parseHttpsOrigin("rollOrigin", targets.rollOrigin);
  const gatewayOrigin = parseHttpsOrigin("gatewayOrigin", targets.gatewayOrigin);
  if (!FULL_SHA.test(targets.expectedSha ?? "")) {
    throw new Error("expectedSha must be a full commit SHA");
  }
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
  const result = await runStagingSmoke(parseArguments(process.argv.slice(2)));
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
