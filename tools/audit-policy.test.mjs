import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuditReport } from "./audit-policy.mjs";

function report(extra = {}) {
  return {
    vulnerabilities: {
      "react-router": {
        severity: "high",
        via: [
          {
            source: 1_124_282,
            url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
          },
        ],
      },
      "react-router-dom": {
        severity: "high",
        via: ["react-router"],
      },
      ...extra,
    },
  };
}

test("allows only the unreachable React Router RSC advisory before expiry", () => {
  assert.deepEqual(
    evaluateAuditReport(report(), Date.parse("2026-07-24T00:00:00Z")),
    {
      allowed: ["react-router", "react-router-dom"],
      expiresAt: "2026-08-07T00:00:00.000Z",
    },
  );
});

test("rejects every other high or critical advisory", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report({ tar: { severity: "high", via: [] } }),
        Date.parse("2026-07-24T00:00:00Z"),
      ),
    /blocking packages: tar/,
  );
});

test("rejects an incomplete advisory dependency chain", () => {
  const incomplete = report();
  delete incomplete.vulnerabilities["react-router-dom"];

  assert.throws(
    () =>
      evaluateAuditReport(incomplete, Date.parse("2026-07-24T00:00:00Z")),
    /audit exception chain is incomplete/,
  );
});

test("fails closed when the temporary exception expires", () => {
  assert.throws(
    () => evaluateAuditReport(report(), Date.parse("2026-08-07T00:00:00Z")),
    /temporary React Router audit exception has expired/,
  );
});
