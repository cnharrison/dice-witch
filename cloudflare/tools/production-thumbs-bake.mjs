import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const PRODUCTION_ORIGIN = "https://dicewit.ch";
const FULL_SHA = /^[0-9a-f]{40}$/;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MetadataSchema = z.object({
  environment: z.literal("production"),
  build: z.object({
    sha: z.string().regex(FULL_SHA),
    time: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  }),
});
const VersionSchema = z.object({
  version: z.literal(2),
  catalogVersion: z.number().int().positive(),
  rendererRevision: z.string().min(1),
  cacheRevision: z.number().int().positive(),
});
const BakeSchema = VersionSchema.extend({
  baked: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

async function jsonRequest(fetchImplementation, name, url, init) {
  const response = await fetchImplementation(url, init);
  if (!response.ok) {
    throw new Error(`${name} expected HTTP 200, received ${response.status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${name} returned invalid JSON`);
  }
}

async function verifyPublicPng(fetchImplementation, pathname) {
  const response = await fetchImplementation(`${PRODUCTION_ORIGIN}${pathname}`, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (
    response.status !== 200 ||
    !(response.headers.get("content-type") ?? "").startsWith("image/png")
  ) {
    throw new Error(`production thumbnail verification failed for ${pathname}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    throw new Error(`production thumbnail PNG is invalid for ${pathname}`);
  }
}

export async function bakeProductionThumbnails(
  { expectedSha, bakeSecret },
  fetchImplementation = fetch,
) {
  if (!FULL_SHA.test(expectedSha ?? "") || !bakeSecret) {
    throw new Error("Production thumbnail bake inputs are invalid");
  }

  const metadata = MetadataSchema.parse(
    await jsonRequest(
      fetchImplementation,
      "production metadata",
      `${PRODUCTION_ORIGIN}/api/meta`,
      { redirect: "error", signal: AbortSignal.timeout(15_000) },
    ),
  );
  if (metadata.build.sha !== expectedSha) {
    throw new Error("Production build does not match the expected SHA");
  }

  const version = VersionSchema.parse(
    await jsonRequest(
      fetchImplementation,
      "production thumbnail version",
      `${PRODUCTION_ORIGIN}/api/appearance/thumbs/version`,
      { redirect: "error", signal: AbortSignal.timeout(15_000) },
    ),
  );
  const bake = BakeSchema.parse(
    await jsonRequest(
      fetchImplementation,
      "production thumbnail bake",
      `${PRODUCTION_ORIGIN}/api/internal/appearance/thumbs`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          "x-appearance-thumbs-bake-secret": bakeSecret,
        },
        body: "{}",
        signal: AbortSignal.timeout(15 * 60_000),
      },
    ),
  );
  if (
    bake.catalogVersion !== version.catalogVersion ||
    bake.rendererRevision !== version.rendererRevision ||
    bake.cacheRevision !== version.cacheRevision ||
    bake.total < 1 ||
    bake.baked !== bake.total ||
    bake.skipped !== 0
  ) {
    throw new Error("The initial production thumbnail bake was incomplete");
  }

  const prefix = `/thumbs/${version.catalogVersion}-${version.rendererRevision}`;
  const paths = [
    `${prefix}/preset/solid.png`,
    `${prefix}/material/glass.png`,
    `${prefix}/font/liberation-sans.png`,
    `${prefix}/ink/matte-ink.png`,
  ];
  await Promise.all(
    paths.map((pathname) => verifyPublicPng(fetchImplementation, pathname)),
  );

  return {
    status: "passed",
    baked: bake.baked,
    total: bake.total,
    verifiedPngs: paths.length,
    version,
  };
}

function parseArguments(arguments_) {
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== "--expected-sha" ||
    !FULL_SHA.test(arguments_[1] ?? "")
  ) {
    throw new Error("Production thumbnail bake arguments are invalid");
  }
  return arguments_[1];
}

async function main() {
  const expectedSha = parseArguments(process.argv.slice(2));
  const bakeSecret = process.env.PRODUCTION_APPEARANCE_THUMBS_BAKE_SECRET;
  const result = await bakeProductionThumbnails({ expectedSha, bakeSecret });
  process.stdout.write(`${JSON.stringify(result)}\n`);
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
