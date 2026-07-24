import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXCEPTION = {
  source: 1_124_282,
  package: "react-router",
  dependent: "react-router-dom",
  url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
  expiresAt: Date.parse("2026-08-07T00:00:00Z"),
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedReactRouterAdvisory(name, vulnerability) {
  if (!isRecord(vulnerability) || !Array.isArray(vulnerability.via)) {
    return false;
  }
  if (name === EXCEPTION.package) {
    return (
      vulnerability.via.length === 1 &&
      isRecord(vulnerability.via[0]) &&
      vulnerability.via[0].source === EXCEPTION.source &&
      vulnerability.via[0].url === EXCEPTION.url
    );
  }
  return (
    name === EXCEPTION.dependent &&
    vulnerability.via.length === 1 &&
    vulnerability.via[0] === EXCEPTION.package
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
    if (isAllowedReactRouterAdvisory(name, vulnerability)) {
      allowed.push(name);
    } else {
      blocking.push(name);
    }
  }
  if (blocking.length > 0) {
    throw new Error(`npm audit found blocking packages: ${blocking.sort().join(", ")}`);
  }
  if (
    allowed.length > 0 &&
    (!allowed.includes(EXCEPTION.package) ||
      !allowed.includes(EXCEPTION.dependent))
  ) {
    throw new Error("The React Router audit exception chain is incomplete");
  }
  if (allowed.length > 0 && now >= EXCEPTION.expiresAt) {
    throw new Error("The temporary React Router audit exception has expired");
  }
  return {
    allowed: allowed.sort(),
    expiresAt: new Date(EXCEPTION.expiresAt).toISOString(),
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
  if (evaluation.allowed.length > 0) {
    process.stdout.write(
      `Allowed ${EXCEPTION.url} only: unstable RSC APIs are not used; expires ${evaluation.expiresAt}.\n`,
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
