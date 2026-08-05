import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAuditReport,
  REACT_ROUTER_EXCEPTION,
  UNDICI_EXCEPTION,
} from "./audit-policy.mjs";

// Clocks are derived from the configured expiries so renewing an exception
// never requires editing an unrelated test.
const BEFORE_ANY_EXPIRY =
  Math.min(REACT_ROUTER_EXCEPTION.expiresAt, UNDICI_EXCEPTION.expiresAt) - 1;

function isoExpiry(exception) {
  return new Date(exception.expiresAt).toISOString();
}

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

test("configures every exception with a finite expiry", () => {
  for (const exception of [REACT_ROUTER_EXCEPTION, UNDICI_EXCEPTION]) {
    assert.ok(
      Number.isFinite(exception.expiresAt),
      `${exception.package} expiry must be a parsable instant`,
    );
  }
});

test("allows only bounded unreachable advisories before expiry", () => {
  assert.deepEqual(
    evaluateAuditReport(report(), BEFORE_ANY_EXPIRY),
    {
      allowed: ["react-router", "react-router-dom", "undici"],
      exceptions: [
        {
          urls: ["https://github.com/advisories/GHSA-qwww-vcr4-c8h2"],
          reason: REACT_ROUTER_EXCEPTION.reason,
          expiresAt: isoExpiry(REACT_ROUTER_EXCEPTION),
        },
        {
          urls: [
            "https://github.com/advisories/GHSA-8xcm-r25x-g524",
            "https://github.com/advisories/GHSA-4cwx-7wf7-3272",
            "https://github.com/advisories/GHSA-m8rv-5g2x-5cg5",
            "https://github.com/advisories/GHSA-jr45-8vmc-qm54",
            "https://github.com/advisories/GHSA-v3r7-h72x-cjcm",
          ],
          reason: UNDICI_EXCEPTION.reason,
          expiresAt: isoExpiry(UNDICI_EXCEPTION),
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
        BEFORE_ANY_EXPIRY,
      ),
    /blocking packages: tar/,
  );
});

test("rejects an incomplete advisory dependency chain", () => {
  const incomplete = report();
  delete incomplete.vulnerabilities["react-router-dom"];

  assert.throws(
    () =>
      evaluateAuditReport(incomplete, BEFORE_ANY_EXPIRY),
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
        BEFORE_ANY_EXPIRY,
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
        BEFORE_ANY_EXPIRY,
      ),
    /blocking packages: undici/,
  );
});

test("fails closed when the undici exception expires", () => {
  // Only one exception is under test, so the other advisory chain is removed
  // rather than relying on which expiry happens to come first.
  const withoutReactRouter = report();
  delete withoutReactRouter.vulnerabilities["react-router"];
  delete withoutReactRouter.vulnerabilities["react-router-dom"];

  assert.throws(
    () => evaluateAuditReport(withoutReactRouter, UNDICI_EXCEPTION.expiresAt),
    /temporary undici audit exception has expired/,
  );
});

test("fails closed when the React Router exception expires", () => {
  const withoutUndici = report();
  delete withoutUndici.vulnerabilities.undici;

  assert.throws(
    () =>
      evaluateAuditReport(withoutUndici, REACT_ROUTER_EXCEPTION.expiresAt),
    /temporary react-router audit exception has expired/,
  );
});
