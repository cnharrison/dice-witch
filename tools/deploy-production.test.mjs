import assert from "node:assert/strict";
import test from "node:test";
import {
  createGhClient,
  discoverDispatchedRun,
  pendingProductionApproval,
  runIdFromDispatch,
  superviseProductionRun,
  validateProductionEnvironment,
} from "./deploy-production.mjs";

const sha = "2f0915c3a057494dc544af50aee40ea388bdeb12";

function run(status, jobs = [], conclusion = "") {
  return {
    status,
    conclusion,
    headSha: sha,
    jobs,
    url: "https://github.com/cnharrison/dice-witch/actions/runs/123",
  };
}

function pending(canApprove = true) {
  return [{
    environment: { id: 18_738_075_925, name: "production" },
    current_user_can_approve: canApprove,
  }];
}

test("extracts the immutable run id returned by workflow dispatch", () => {
  assert.equal(
    runIdFromDispatch(
      "https://github.com/cnharrison/dice-witch/actions/runs/31557273879",
    ),
    "31557273879",
  );
  assert.equal(runIdFromDispatch("workflow dispatched"), undefined);
});

test("discovers the exact new run when dispatch omits its URL", async () => {
  const runId = await discoverDispatchedRun({
    dispatchOutput: "workflow dispatched",
    previousRunIds: new Set(["122"]),
    expectedSha: sha,
    gh: {
      listProductionRuns: () => [
        { databaseId: 122, headSha: sha },
        { databaseId: 123, headSha: sha },
        { databaseId: 124, headSha: "a".repeat(40) },
      ],
    },
    sleep: async () => undefined,
    now: () => 0,
  });
  assert.equal(runId, "123");
});

test("requires the authenticated operator as a production reviewer", () => {
  const environment = {
    name: "production",
    protection_rules: [{
      type: "required_reviewers",
      prevent_self_review: false,
      reviewers: [{ type: "User", reviewer: { login: "cnharrison" } }],
    }],
  };
  assert.doesNotThrow(() =>
    validateProductionEnvironment(environment, "cnharrison"));
  assert.throws(
    () => validateProductionEnvironment(environment, "another-user"),
    /not a production reviewer/u,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...environment, protection_rules: [] }, "cnharrison"),
    /does not permit operator approval/u,
  );
});

test("accepts only one approvable production environment", () => {
  assert.equal(pendingProductionApproval(pending()), 18_738_075_925);
  assert.throws(
    () => pendingProductionApproval([]),
    /exactly one pending production deployment/u,
  );
  assert.throws(
    () => pendingProductionApproval([{ ...pending()[0], environment: { id: 1, name: "staging" } }]),
    /does not target the production environment/u,
  );
  assert.throws(
    () => pendingProductionApproval(pending(false)),
    /cannot approve production/u,
  );
});

test("approves the first waiting production state before polling again", async () => {
  const states = [
    run("in_progress", [{ name: "preflight", status: "in_progress", steps: [] }]),
    run("waiting", [{ name: "deploy", status: "waiting", steps: [] }]),
    run("in_progress", [{
      name: "deploy",
      status: "in_progress",
      steps: [{ name: "Install dependencies", status: "in_progress" }],
    }]),
    run("completed", [{ name: "deploy", status: "completed", steps: [] }], "success"),
  ];
  const events = [];
  const gh = {
    getRun() {
      const state = states.shift();
      assert.ok(state);
      events.push(`run:${state.status}`);
      return state;
    },
    getPendingDeployments() {
      events.push("pending");
      return pending();
    },
    approve(_runId, environmentId) {
      events.push(`approve:${environmentId}`);
    },
  };

  await superviseProductionRun({
    runId: "123",
    expectedSha: sha,
    gh,
    sleep: async () => events.push("sleep"),
    log: (message) => events.push(`log:${message}`),
  });

  const waitingIndex = events.indexOf("run:waiting");
  assert.deepEqual(events.slice(waitingIndex, waitingIndex + 4), [
    "run:waiting",
    "log:waiting",
    "pending",
    "approve:18738075925",
  ]);
  assert.equal(events[waitingIndex + 4], "log:production approval submitted");
  assert.equal(events[waitingIndex + 5], "sleep");
  assert.equal(events[waitingIndex + 6], "run:in_progress");
});

test("fails when production remains queued without steps after approval", async () => {
  const states = [
    run("waiting", [{ name: "deploy", status: "waiting", steps: [] }]),
    run("queued", [{ name: "deploy", status: "queued", steps: [] }]),
    run("completed", [{ name: "deploy", status: "completed", steps: [] }], "cancelled"),
  ];
  let approvals = 0;
  let cancellations = 0;
  let clock = 0;
  const gh = {
    getRun: () => states.shift(),
    getPendingDeployments: () => pending(),
    approve: () => {
      approvals += 1;
    },
    cancel: () => {
      cancellations += 1;
    },
  };

  await assert.rejects(
    superviseProductionRun({
      runId: "123",
      expectedSha: sha,
      gh,
      now: () => clock,
      sleep: async () => {
        clock += 1;
      },
      approvalStartTimeoutMs: 0,
      log: () => undefined,
    }),
    /did not start within the approval timeout/u,
  );
  assert.equal(approvals, 1);
  assert.equal(cancellations, 1);
});

test("cancels when the approval request fails", async () => {
  const states = [
    run("waiting", [{ name: "deploy", status: "waiting", steps: [] }]),
    run("completed", [{ name: "deploy", status: "completed", steps: [] }], "cancelled"),
  ];
  let cancellations = 0;

  await assert.rejects(
    superviseProductionRun({
      runId: "123",
      expectedSha: sha,
      gh: {
        getRun: () => states.shift(),
        getPendingDeployments: () => pending(),
        approve: () => {
          throw new Error("approval request failed");
        },
        cancel: () => {
          cancellations += 1;
        },
      },
      sleep: async () => undefined,
      log: () => undefined,
    }),
    /approval request failed/u,
  );
  assert.equal(cancellations, 1);
});

test("retries briefly when GitHub has not exposed the approval record", async () => {
  const states = [
    run("waiting", [{ name: "deploy", status: "waiting", steps: [] }]),
    run("waiting", [{ name: "deploy", status: "waiting", steps: [] }]),
    run("in_progress", [{ name: "deploy", status: "in_progress", steps: [] }]),
    run("completed", [{ name: "deploy", status: "completed", steps: [] }], "success"),
  ];
  const pendingStates = [[], pending()];
  let approvals = 0;

  await superviseProductionRun({
    runId: "123",
    expectedSha: sha,
    gh: {
      getRun: () => states.shift(),
      getPendingDeployments: () => pendingStates.shift(),
      approve: () => {
        approvals += 1;
      },
    },
    sleep: async () => undefined,
    log: () => undefined,
  });
  assert.equal(approvals, 1);
});

test("cancels when GitHub never exposes the approval record", async () => {
  const states = [
    run("waiting", [{ name: "deploy", status: "waiting", steps: [] }]),
    run("waiting", [{ name: "deploy", status: "waiting", steps: [] }]),
    run("completed", [{ name: "deploy", status: "completed", steps: [] }], "cancelled"),
  ];
  let cancellations = 0;
  let clock = 0;

  await assert.rejects(
    superviseProductionRun({
      runId: "123",
      expectedSha: sha,
      gh: {
        getRun: () => states.shift(),
        getPendingDeployments: () => [],
        cancel: () => {
          cancellations += 1;
        },
      },
      now: () => clock,
      sleep: async () => {
        clock += 1;
      },
      approvalDiscoveryTimeoutMs: 0,
      log: () => undefined,
    }),
    /approval did not become available; run cancelled/u,
  );
  assert.equal(cancellations, 1);
});

test("refuses to approve a run for another SHA", async () => {
  let pendingLookups = 0;
  await assert.rejects(
    superviseProductionRun({
      runId: "123",
      expectedSha: sha,
      gh: {
        getRun: () => ({ ...run("waiting"), headSha: "a".repeat(40) }),
        getPendingDeployments: () => {
          pendingLookups += 1;
          return pending();
        },
        approve: () => assert.fail("approval must not be attempted"),
      },
      log: () => undefined,
    }),
    /run SHA mismatch/u,
  );
  assert.equal(pendingLookups, 0);
});

test("dispatches the exact workflow inputs", () => {
  const calls = [];
  const gh = createGhClient((command, args, options) => {
    calls.push({ command, args, options });
    return {
      status: 0,
      stdout: "https://github.com/cnharrison/dice-witch/actions/runs/123",
      stderr: "",
    };
  });
  gh.dispatch({ sha, applyMigrations: true, allowGatewayDeploy: true });

  assert.deepEqual(calls[0]?.args, [
    "workflow", "run", "deploy-production.yml",
    "--repo", "cnharrison/dice-witch",
    "--ref", "master",
    "-f", `sha=${sha}`,
    "-f", "apply_migrations=true",
    "-f", "allow_gateway_deploy=true",
    "-f", "confirmation=deploy-production",
  ]);
});

test("submits the environment id as a JSON integer", () => {
  const calls = [];
  const gh = createGhClient((command, args, options) => {
    calls.push({ command, args, options });
    return { status: 0, stdout: "[]", stderr: "" };
  });
  gh.approve("123", 18_738_075_925);

  assert.equal(calls[0]?.command, "gh");
  assert.deepEqual(JSON.parse(calls[0]?.options.input), {
    environment_ids: [18_738_075_925],
    state: "approved",
    comment: "Approved exact-SHA production deployment authorized by the operator command.",
  });
});
