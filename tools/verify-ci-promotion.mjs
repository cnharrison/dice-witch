import { pathToFileURL } from "node:url";

const ALLOWED_PROMOTION_BRANCHES = ["master", "feature/next-version-r1"];
const API_VERSION = "2026-03-10";
const FULL_SHA = /^[0-9a-f]{40}$/;

function requireFullSha(sha) {
  if (!FULL_SHA.test(sha)) {
    throw new Error("Promotion requires a full lowercase commit SHA");
  }
}

function requireRepository(repository) {
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error("GITHUB_REPOSITORY must use owner/repository format");
  }
  return parts;
}

export function buildWorkflowRunsUrl({ apiUrl, repository, sha }) {
  requireFullSha(sha);
  const [owner, name] = requireRepository(repository);
  const url = new URL(apiUrl);
  if (url.protocol !== "https:") {
    throw new Error("GITHUB_API_URL must use HTTPS");
  }

  url.pathname = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/workflows/ci.yml/runs`;
  url.searchParams.set("head_sha", sha);
  url.searchParams.set("event", "push");
  url.searchParams.set("per_page", "100");
  return url;
}

function runTimestamp(run) {
  const timestamp = Date.parse(run.created_at);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`CI run ${run.id ?? "unknown"} has an invalid creation time`);
  }
  return timestamp;
}

export function selectPromotionRun(payload, { sha, repository, allowedBranches }) {
  requireFullSha(sha);
  requireRepository(repository);
  if (!Array.isArray(payload?.workflow_runs)) {
    throw new Error("GitHub Actions response must contain a workflow_runs array");
  }
  if (
    !Number.isSafeInteger(payload.total_count) ||
    payload.total_count !== payload.workflow_runs.length
  ) {
    throw new Error("GitHub Actions response must contain a complete bounded result set");
  }

  const allowed = new Set(allowedBranches);
  const candidates = payload.workflow_runs.filter(
    (run) =>
      run.head_sha === sha &&
      run.event === "push" &&
      allowed.has(run.head_branch) &&
      run.head_repository?.full_name === repository &&
      run.repository?.full_name === repository,
  );

  if (candidates.length === 0) {
    throw new Error("No CI push run qualifies for exact-SHA production promotion");
  }

  const latest = candidates.toSorted((left, right) => {
    const byTime = runTimestamp(left) - runTimestamp(right);
    return byTime || Number(left.id) - Number(right.id);
  }).at(-1);

  if (latest.status !== "completed" || latest.conclusion !== "success") {
    throw new Error(
      `Latest qualifying CI run did not succeed: ${latest.id} (${latest.status}/${latest.conclusion})`,
    );
  }

  return latest;
}

function requestedSha(argv) {
  const [flag, sha] = argv;
  if (flag !== "--sha" || !sha || argv.length !== 2) {
    throw new Error("Usage: node tools/verify-ci-promotion.mjs --sha <full-sha>");
  }
  return sha;
}

async function main() {
  const sha = requestedSha(process.argv.slice(2));
  const repository = process.env.GITHUB_REPOSITORY;
  const apiUrl = process.env.GITHUB_API_URL;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !apiUrl || !token) {
    throw new Error("GITHUB_REPOSITORY, GITHUB_API_URL, and GITHUB_TOKEN are required");
  }

  const url = buildWorkflowRunsUrl({ apiUrl, repository, sha });
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub Actions API returned HTTP ${response.status}`);
  }

  const run = selectPromotionRun(await response.json(), {
    sha,
    repository,
    allowedBranches: ALLOWED_PROMOTION_BRANCHES,
  });
  console.log(`Verified exact-SHA CI run ${run.id}: ${run.html_url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
