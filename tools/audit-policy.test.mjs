import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuditReport } from "./audit-policy.mjs";

function undiciAdvisory() {
  return {
    severity: "high",
    isDirect: false,
    via: [
      {
        source: 1_130_715,
        url: "https://github.com/advisories/GHSA-8xcm-r25x-g524",
        severity: "moderate",
      },
      {
        source: 1_130_716,
        url: "https://github.com/advisories/GHSA-8xcm-r25x-g524",
        severity: "moderate",
      },
      {
        source: 1_130_718,
        url: "https://github.com/advisories/GHSA-4cwx-7wf7-3272",
        severity: "high",
      },
      {
        source: 1_130_726,
        url: "https://github.com/advisories/GHSA-m8rv-5g2x-5cg5",
        severity: "moderate",
      },
      {
        source: 1_130_727,
        url: "https://github.com/advisories/GHSA-m8rv-5g2x-5cg5",
        severity: "moderate",
      },
      {
        source: 1_130_729,
        url: "https://github.com/advisories/GHSA-jr45-8vmc-qm54",
        severity: "moderate",
      },
      {
        source: 1_130_731,
        url: "https://github.com/advisories/GHSA-v3r7-h72x-cjcm",
        severity: "moderate",
      },
      {
        source: 1_130_732,
        url: "https://github.com/advisories/GHSA-v3r7-h72x-cjcm",
        severity: "moderate",
      },
    ],
    effects: ["miniflare"],
    range: "<=6.27.0 || 7.0.0 - 7.28.0",
    nodes: [
      "node_modules/node-gyp/node_modules/undici",
      "node_modules/undici",
    ],
  };
}

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
      undici: undiciAdvisory(),
      ...extra,
    },
  };
}

test("allows only bounded unreachable advisories before expiry", () => {
  assert.deepEqual(
    evaluateAuditReport(report(), Date.parse("2026-08-03T00:00:00Z")),
    {
      allowed: ["react-router", "react-router-dom", "undici"],
      exceptions: [
        {
          urls: ["https://github.com/advisories/GHSA-qwww-vcr4-c8h2"],
          reason: "unstable RSC APIs are not used",
          expiresAt: "2026-08-07T00:00:00.000Z",
        },
        {
          urls: [
            "https://github.com/advisories/GHSA-8xcm-r25x-g524",
            "https://github.com/advisories/GHSA-4cwx-7wf7-3272",
            "https://github.com/advisories/GHSA-m8rv-5g2x-5cg5",
            "https://github.com/advisories/GHSA-jr45-8vmc-qm54",
            "https://github.com/advisories/GHSA-v3r7-h72x-cjcm",
          ],
          reason:
            "the high-severity cache interceptor is not configured; the remaining advisories are moderate and all affected packages are development-only",
          expiresAt: "2026-08-05T00:00:00.000Z",
        },
      ],
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

test("rejects any changed undici advisory chain", () => {
  const changed = undiciAdvisory();
  changed.via[2].source = 1_130_719;

  assert.throws(
    () =>
      evaluateAuditReport(
        report({ undici: changed }),
        Date.parse("2026-08-03T00:00:00Z"),
      ),
    /blocking packages: undici/,
  );
});

test("rejects an undici advisory severity escalation", () => {
  const escalated = undiciAdvisory();
  escalated.via[0].severity = "critical";

  assert.throws(
    () =>
      evaluateAuditReport(
        report({ undici: escalated }),
        Date.parse("2026-08-03T00:00:00Z"),
      ),
    /blocking packages: undici/,
  );
});

test("fails closed when the undici exception expires", () => {
  assert.throws(
    () => evaluateAuditReport(report(), Date.parse("2026-08-05T00:00:00Z")),
    /temporary undici audit exception has expired/,
  );
});

test("fails closed when the React Router exception expires", () => {
  const withoutUndici = report();
  delete withoutUndici.vulnerabilities.undici;

  assert.throws(
    () =>
      evaluateAuditReport(
        withoutUndici,
        Date.parse("2026-08-07T00:00:00Z"),
      ),
    /temporary react-router audit exception has expired/,
  );
});
