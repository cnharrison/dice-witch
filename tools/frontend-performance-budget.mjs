import { readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

export const FRONTEND_PERFORMANCE_BUDGET = Object.freeze({
  initialTransferBytes: 225 * 1024,
  initialJavaScriptBytes: 90 * 1024,
  thirdPartyOrigins: 1,
});

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)].map(
      ([, name, doubleQuoted, singleQuoted]) => [
        name,
        doubleQuoted ?? singleQuoted,
      ],
    ),
  );
}

function initialReferences(html) {
  const references = [];
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const values = attributes(match[0]);
    const reference = values.src ?? values.href;
    if (reference === undefined) continue;
    const rel = values.rel ?? "";
    const included =
      match[0].startsWith("<script") ||
      rel === "modulepreload" ||
      rel === "stylesheet" ||
      rel === "preload";
    if (included) references.push(reference);
  }
  return [...new Set(references)];
}

function compressedBytes(file, contents) {
  return /\.(?:css|html|js)$/.test(file)
    ? gzipSync(contents, { level: 9 }).byteLength
    : contents.byteLength;
}

export async function measureFrontendEntry(distDirectory) {
  const indexPath = path.join(distDirectory, "index.html");
  const html = await readFile(indexPath, "utf8");
  const localReferences = [];
  const thirdPartyOrigins = new Set();
  for (const reference of initialReferences(html)) {
    if (/^https?:\/\//.test(reference)) {
      thirdPartyOrigins.add(new URL(reference).origin);
    } else {
      localReferences.push(reference);
    }
  }

  const assets = [];
  for (const reference of [...new Set(localReferences)]) {
    const file = path.join(distDirectory, reference.replace(/^\//, ""));
    const contents = await readFile(file);
    assets.push({
      reference,
      bytes: compressedBytes(file, contents),
      javascript: file.endsWith(".js"),
    });
  }
  const htmlBytes = compressedBytes(indexPath, Buffer.from(html));
  return {
    htmlBytes,
    assets,
    initialTransferBytes:
      htmlBytes + assets.reduce((total, asset) => total + asset.bytes, 0),
    initialJavaScriptBytes: assets
      .filter(({ javascript }) => javascript)
      .reduce((total, asset) => total + asset.bytes, 0),
    thirdPartyOrigins: [...thirdPartyOrigins].sort(),
  };
}

export function assertFrontendPerformanceBudget(measurement) {
  const failures = [];
  if (
    measurement.initialTransferBytes >
    FRONTEND_PERFORMANCE_BUDGET.initialTransferBytes
  ) {
    failures.push("initial transfer budget exceeded");
  }
  if (
    measurement.initialJavaScriptBytes >
    FRONTEND_PERFORMANCE_BUDGET.initialJavaScriptBytes
  ) {
    failures.push("initial JavaScript budget exceeded");
  }
  if (
    measurement.thirdPartyOrigins.length >
    FRONTEND_PERFORMANCE_BUDGET.thirdPartyOrigins
  ) {
    failures.push("third-party origin budget exceeded");
  }
  if (failures.length > 0) throw new Error(failures.join("; "));
}

async function main() {
  const distDirectory = path.resolve(process.argv[2] ?? "frontend/dist");
  const measurement = await measureFrontendEntry(distDirectory);
  assertFrontendPerformanceBudget(measurement);
  process.stdout.write(
    `${JSON.stringify({ budget: FRONTEND_PERFORMANCE_BUDGET, measurement }, null, 2)}\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
