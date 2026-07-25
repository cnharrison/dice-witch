import path from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;
const CLI_USAGE =
  "Usage: node tools/production-smoke.mjs --web-origin <url> --expected-sha <full-sha>";
const PROPAGATION_ATTEMPTS = 61;
const PROPAGATION_RETRY_MS = 5_000;

function productionOrigin(value) {
  if (value !== "https://dicewit.ch") {
    throw new Error("Production web origin must be https://dicewit.ch");
  }
  return value;
}

async function request(fetchImplementation, name, url, init = {}) {
  try {
    return await fetchImplementation(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      ...init,
    });
  } catch (error) {
    throw new Error(`${name} request failed: ${error.message}`, { cause: error });
  }
}

function requireStatus(name, response, expected) {
  if (response.status !== expected) {
    throw new Error(`${name} expected HTTP ${expected}, received ${response.status}`);
  }
}

export async function runProductionSmoke(targets, fetchImplementation = fetch) {
  if (typeof targets !== "object" || targets === null) {
    throw new Error("Production smoke targets are required");
  }
  const webOrigin = productionOrigin(targets.webOrigin);
  if (!FULL_SHA.test(targets.expectedSha ?? "")) {
    throw new Error("expectedSha must be a full commit SHA");
  }

  const root = await request(fetchImplementation, "web root", `${webOrigin}/`);
  requireStatus("web root", root, 200);
  if (!(root.headers.get("content-type") ?? "").startsWith("text/html")) {
    throw new Error("web root must return HTML");
  }
  if (!(await root.text()).includes('id="root"')) {
    throw new Error("web root is missing the application root");
  }

  const metadata = await request(
    fetchImplementation,
    "build metadata",
    `${webOrigin}/api/meta`,
  );
  requireStatus("build metadata", metadata, 200);
  const metadataBody = await metadata.json();
  if (metadataBody?.environment !== "production") {
    throw new Error("metadata environment must be production");
  }
  if (metadataBody?.build?.sha !== targets.expectedSha) {
    throw new Error("metadata SHA does not match the expected source SHA");
  }
  if (typeof metadataBody.build.time !== "string" || Number.isNaN(Date.parse(metadataBody.build.time))) {
    throw new Error("metadata build time is invalid");
  }

  const session = await request(
    fetchImplementation,
    "anonymous session",
    `${webOrigin}/api/auth/session`,
  );
  requireStatus("anonymous session", session, 401);
  const sessionBody = await session.json();
  if (
    typeof sessionBody !== "object" ||
    sessionBody === null ||
    Array.isArray(sessionBody) ||
    Object.keys(sessionBody).length !== 1 ||
    sessionBody.user !== null
  ) {
    throw new Error("anonymous session response is invalid");
  }

  const stats = await request(
    fetchImplementation,
    "public stats",
    `${webOrigin}/api/stats/public`,
  );
  requireStatus("public stats", stats, 200);
  const statsBody = await stats.json();
  for (const key of ["liveGuilds", "knownDiceWitchUsers", "shardCount"]) {
    if (!Number.isSafeInteger(statsBody?.[key]) || statsBody[key] < 0) {
      throw new Error("public stats response is invalid");
    }
  }

  const interactionGet = await request(
    fetchImplementation,
    "interaction GET boundary",
    `${webOrigin}/interactions`,
  );
  requireStatus("interaction GET boundary", interactionGet, 404);

  const interactionPost = await request(
    fetchImplementation,
    "interaction POST boundary",
    `${webOrigin}/interactions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: 1 }),
    },
  );
  requireStatus("interaction POST boundary", interactionPost, 401);

  return {
    status: "passed",
    checks: [
      ["web root", 200],
      ["build metadata", 200],
      ["anonymous session", 401],
      ["public stats", 200],
      ["interaction GET boundary", 404],
      ["interaction POST boundary", 401],
    ],
  };
}

export async function runProductionSmokeWithPropagationRetry(
  targets,
  fetchImplementation = fetch,
  wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  for (let attempt = 1; attempt <= PROPAGATION_ATTEMPTS; attempt += 1) {
    try {
      return await runProductionSmoke(targets, fetchImplementation);
    } catch (error) {
      const retryable =
        error instanceof Error &&
        error.message === "metadata SHA does not match the expected source SHA";
      if (!retryable || attempt === PROPAGATION_ATTEMPTS) throw error;
      await wait(PROPAGATION_RETRY_MS);
    }
  }
  throw new Error("Production smoke retry state is invalid");
}

function parseArguments(arguments_) {
  if (
    arguments_.length !== 4 ||
    arguments_[0] !== "--web-origin" ||
    arguments_[2] !== "--expected-sha"
  ) {
    throw new Error(CLI_USAGE);
  }
  return { webOrigin: arguments_[1], expectedSha: arguments_[3] };
}

async function main() {
  const result = await runProductionSmokeWithPropagationRetry(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
