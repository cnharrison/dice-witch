import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const UNDICI_EXCEPTION = {
  package: "undici",
  advisories: [
    [
      1_130_715,
      "https://github.com/advisories/GHSA-8xcm-r25x-g524",
      "moderate",
    ],
    [
      1_130_718,
      "https://github.com/advisories/GHSA-4cwx-7wf7-3272",
      "high",
    ],
    [
      1_130_726,
      "https://github.com/advisories/GHSA-m8rv-5g2x-5cg5",
      "moderate",
    ],
    [
      1_130_729,
      "https://github.com/advisories/GHSA-jr45-8vmc-qm54",
      "moderate",
    ],
    [
      1_130_731,
      "https://github.com/advisories/GHSA-v3r7-h72x-cjcm",
      "moderate",
    ],
  ],
  range: "7.0.0 - 7.28.0",
  effects: ["miniflare"],
  nodes: ["node_modules/miniflare/node_modules/undici"],
  urls: [
    "https://github.com/advisories/GHSA-8xcm-r25x-g524",
    "https://github.com/advisories/GHSA-4cwx-7wf7-3272",
    "https://github.com/advisories/GHSA-m8rv-5g2x-5cg5",
    "https://github.com/advisories/GHSA-jr45-8vmc-qm54",
    "https://github.com/advisories/GHSA-v3r7-h72x-cjcm",
  ],
  reason:
    "the high-severity cache interceptor is not configured; the remaining advisories are moderate, all affected packages are development-only, and every published miniflare release pins undici 7.28.0 exactly",
  expiresAt: Date.parse("2026-08-19T00:00:00Z"),
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedUndiciAdvisory(name, vulnerability) {
  if (
    name !== UNDICI_EXCEPTION.package ||
    !isRecord(vulnerability) ||
    vulnerability.isDirect !== false ||
    vulnerability.range !== UNDICI_EXCEPTION.range ||
    !Array.isArray(vulnerability.via) ||
    !Array.isArray(vulnerability.effects) ||
    !Array.isArray(vulnerability.nodes)
  ) {
    return false;
  }
  const advisories = vulnerability.via
    .map((advisory) =>
      isRecord(advisory) &&
        typeof advisory.source === "number" &&
        typeof advisory.url === "string" &&
        typeof advisory.severity === "string"
        ? [advisory.source, advisory.url, advisory.severity]
        : null)
    .filter((advisory) => advisory !== null)
    .sort(([first], [second]) => first - second);
  return (
    advisories.length === vulnerability.via.length &&
    JSON.stringify(advisories) === JSON.stringify(UNDICI_EXCEPTION.advisories) &&
    JSON.stringify([...vulnerability.effects].sort()) ===
      JSON.stringify(UNDICI_EXCEPTION.effects) &&
    JSON.stringify([...vulnerability.nodes].sort()) ===
      JSON.stringify(UNDICI_EXCEPTION.nodes)
  );
}

export function evaluateAuditReport(report, now = Date.now()) {
  if (!isRecord(report) || !isRecord(report.vulnerabilities)) {
    throw new Error("npm audit returned an invalid report");
  }
  const blocking = [];
  const allowed = [];
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (
      !isRecord(vulnerability) ||
      (vulnerability.severity !== "high" &&
        vulnerability.severity !== "critical")
    ) {
      continue;
    }
    if (isAllowedUndiciAdvisory(name, vulnerability)) {
      allowed.push(name);
    } else {
      blocking.push(name);
    }
  }
  if (blocking.length > 0) {
    throw new Error(`npm audit found blocking packages: ${blocking.sort().join(", ")}`);
  }
  const exceptions = [];
  if (allowed.includes(UNDICI_EXCEPTION.package)) {
    exceptions.push(UNDICI_EXCEPTION);
  }
  for (const exception of exceptions) {
    if (now >= exception.expiresAt) {
      throw new Error(`The temporary ${exception.package} audit exception has expired`);
    }
  }
  return {
    allowed: allowed.sort(),
    exceptions: exceptions.map(({ urls, reason, expiresAt }) => ({
      urls,
      reason,
      expiresAt: new Date(expiresAt).toISOString(),
    })),
  };
}

function main() {
  const result = spawnSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`npm audit failed with exit code ${String(result.status)}`);
  }
  const evaluation = evaluateAuditReport(JSON.parse(result.stdout));
  for (const exception of evaluation.exceptions) {
    process.stdout.write(
      `Allowed ${exception.urls.join(", ")}: ${exception.reason}; expires ${exception.expiresAt}.\n`,
    );
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Dependency audit failed"}\n`,
    );
    process.exitCode = 1;
  }
}
