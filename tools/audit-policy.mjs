import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

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

const AdvisorySchema = z.object({
  source: z.number(),
  url: z.string(),
  severity: z.string(),
});
const AllowedVulnerabilitySchema = z.object({
  isDirect: z.literal(false),
  range: z.string(),
  via: z.array(z.json()),
  effects: z.array(z.string()),
  nodes: z.array(z.string()),
});
const AuditReportSchema = z.object({
  vulnerabilities: z.record(z.string(), z.json()),
});
const VulnerabilitySeveritySchema = z.object({ severity: z.string() });

function isAllowedUndiciAdvisory(name, value) {
  const vulnerability = AllowedVulnerabilitySchema.safeParse(value);
  if (
    name !== UNDICI_EXCEPTION.package ||
    !vulnerability.success ||
    vulnerability.data.range !== UNDICI_EXCEPTION.range
  ) {
    return false;
  }
  const advisories = vulnerability.data.via
    .map((value) => {
      const advisory = AdvisorySchema.safeParse(value);
      return advisory.success
        ? [advisory.data.source, advisory.data.url, advisory.data.severity]
        : null;
    })
    .filter((advisory) => advisory !== null)
    .sort(([first], [second]) => first - second);
  return (
    advisories.length === vulnerability.data.via.length &&
    JSON.stringify(advisories) === JSON.stringify(UNDICI_EXCEPTION.advisories) &&
    JSON.stringify([...vulnerability.data.effects].sort()) ===
      JSON.stringify(UNDICI_EXCEPTION.effects) &&
    JSON.stringify([...vulnerability.data.nodes].sort()) ===
      JSON.stringify(UNDICI_EXCEPTION.nodes)
  );
}

export function evaluateAuditReport(value, now = Date.now()) {
  const report = AuditReportSchema.safeParse(value);
  if (!report.success) {
    throw new Error("npm audit returned an invalid report");
  }
  const blocking = [];
  const allowed = [];
  for (const [name, vulnerability] of Object.entries(report.data.vulnerabilities)) {
    const parsed = VulnerabilitySeveritySchema.safeParse(vulnerability);
    if (
      !parsed.success ||
      (parsed.data.severity !== "high" &&
        parsed.data.severity !== "critical")
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
