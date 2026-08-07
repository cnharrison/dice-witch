import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuditReport, UNDICI_EXCEPTION } from "./audit-policy.mjs";

// Clocks are derived from the configured expiries so renewing an exception
// never requires editing an unrelated test.
const BEFORE_ANY_EXPIRY = UNDICI_EXCEPTION.expiresAt - 1;

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
        source: 1_130_729,
        url: "https://github.com/advisories/GHSA-jr45-8vmc-qm54",
        severity: "moderate",
      },
      {
        source: 1_130_731,
        url: "https://github.com/advisories/GHSA-v3r7-h72x-cjcm",
        severity: "moderate",
      },
    ],
    effects: ["miniflare"],
    range: "7.0.0 - 7.28.0",
    nodes: ["node_modules/miniflare/node_modules/undici"],
  };
}

function report(extra = {}) {
  return {
    vulnerabilities: {
      undici: undiciAdvisory(),
      ...extra,
    },
  };
}

test("configures every exception with a finite expiry", () => {
  for (const exception of [UNDICI_EXCEPTION]) {
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
      allowed: ["undici"],
      exceptions: [
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
  assert.throws(
    () => evaluateAuditReport(report(), UNDICI_EXCEPTION.expiresAt),
    /temporary undici audit exception has expired/,
  );
});

