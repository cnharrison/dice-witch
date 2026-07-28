import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkflowRunsUrl,
  selectPromotionRun,
} from "./verify-ci-promotion.mjs";

const SHA = "084a2fc7c8bc7c656355e2cb17efc14844ab4c63";
const REPOSITORY = "cnharrison/dice-witch";

function workflowRun(overrides = {}) {
  return {
    id: 30323028435,
    head_sha: SHA,
    head_branch: "feature/next-version-r1",
    event: "push",
    status: "completed",
    conclusion: "success",
    created_at: "2026-07-28T02:24:47Z",
    run_started_at: "2026-07-28T02:24:50Z",
    head_repository: { full_name: REPOSITORY },
    repository: { full_name: REPOSITORY },
    html_url: "https://github.com/cnharrison/dice-witch/actions/runs/30323028435",
    ...overrides,
  };
}

const options = {
  sha: SHA,
  repository: REPOSITORY,
  allowedBranches: ["master", "feature/next-version-r1"],
};

function workflowPayload(workflowRuns) {
  return {
    total_count: workflowRuns.length,
    workflow_runs: workflowRuns,
  };
}

test("builds a workflow-specific exact-SHA push query", () => {
  assert.equal(
    buildWorkflowRunsUrl({
      apiUrl: "https://api.github.com",
      repository: REPOSITORY,
      sha: SHA,
    }).href,
    `https://api.github.com/repos/${REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${SHA}&event=push&per_page=100`,
  );
});

test("accepts the latest successful exact-SHA push from an allowed branch", () => {
  const run = selectPromotionRun(
    workflowPayload([
      workflowRun({ id: 1, created_at: "2026-07-28T01:00:00Z" }),
      workflowRun({ id: 2, created_at: "2026-07-28T02:00:00Z" }),
    ]),
    options,
  );

  assert.equal(run.id, 2);
});

test("rejects runs from another SHA, branch, repository, or event", () => {
  const invalidRuns = [
    workflowRun({ head_sha: "a".repeat(40) }),
    workflowRun({ head_branch: "untrusted" }),
    workflowRun({ head_repository: { full_name: "other/repository" } }),
    workflowRun({ repository: { full_name: "other/repository" } }),
    workflowRun({ event: "pull_request" }),
  ];

  assert.throws(
    () => selectPromotionRun(workflowPayload(invalidRuns), options),
    /No CI push run qualifies/,
  );
});

test("rejects a newer incomplete or failed run instead of accepting an older success", () => {
  for (const latest of [
    workflowRun({
      id: 2,
      status: "in_progress",
      conclusion: null,
      created_at: "2026-07-28T02:00:00Z",
    }),
    workflowRun({
      id: 3,
      conclusion: "failure",
      created_at: "2026-07-28T03:00:00Z",
    }),
  ]) {
    assert.throws(
      () =>
        selectPromotionRun(
          workflowPayload([
            workflowRun({ id: 1, created_at: "2026-07-28T01:00:00Z" }),
            latest,
          ]),
          options,
        ),
      /Latest qualifying CI run did not succeed/,
    );
  }
});

test("rejects malformed or truncated API responses and invalid requested SHAs", () => {
  assert.throws(() => selectPromotionRun({}, options), /workflow_runs array/);
  assert.throws(
    () =>
      selectPromotionRun(
        { total_count: 101, workflow_runs: [workflowRun()] },
        options,
      ),
    /complete bounded result set/,
  );
  assert.throws(
    () => selectPromotionRun(workflowPayload([]), { ...options, sha: "short" }),
    /full lowercase commit SHA/,
  );
});
