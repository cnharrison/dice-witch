import { performance } from "node:perf_hooks";

const MAX_PNG_BYTES = 2 * 1024 * 1024;

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (match === null) throw new Error(`Invalid argument: ${argument}`);
    values.set(match[1], match[2]);
  }
  const sizesValue = values.get("sizes");
  const iterationsValue = values.get("iterations");
  if (sizesValue === undefined || iterationsValue === undefined) {
    throw new Error("--sizes and --iterations are required");
  }
  const sizes = sizesValue.split(",").map((value) =>
    parsePositiveInteger(value, "PNG size"),
  );
  if (sizes.some((size) => size > MAX_PNG_BYTES)) {
    throw new Error(`PNG sizes must not exceed ${String(MAX_PNG_BYTES)} bytes`);
  }
  return {
    sizes: [...new Set(sizes)],
    iterations: parsePositiveInteger(iterationsValue, "Iterations"),
  };
}

function percentile(values, proportion) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * proportion) - 1,
  );
  return sorted[index];
}

function logPayload() {
  return {
    nonce: "log:100000000000000001",
    enforce_nonce: true,
    embeds: [
      {
        title: "Dice result",
        description: "Result: 42",
        image: { url: "attachment://dice-result.png" },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

async function serializeMultipart(png) {
  const form = new FormData();
  form.set("payload_json", JSON.stringify(logPayload()));
  form.set(
    "files[0]",
    new Blob([png], { type: "image/png" }),
    "dice-result.png",
  );
  const request = new Request("https://discord.invalid/channels/1/messages", {
    method: "POST",
    body: form,
  });
  return request.arrayBuffer();
}

async function measure(size, iterations) {
  const png = new Uint8Array(size);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let index = 0; index < 5; index += 1) await serializeMultipart(png);

  const durationsMs = [];
  const memoryDeltas = {
    heapUsed: [],
    external: [],
    arrayBuffers: [],
    rss: [],
  };
  let serializedBytes = 0;
  for (let index = 0; index < iterations; index += 1) {
    globalThis.gc?.();
    const memoryBefore = process.memoryUsage();
    const startedAt = performance.now();
    const serialized = await serializeMultipart(png);
    durationsMs.push(performance.now() - startedAt);
    const memoryAfter = process.memoryUsage();
    for (const key of Object.keys(memoryDeltas)) {
      memoryDeltas[key].push(
        Math.max(0, memoryAfter[key] - memoryBefore[key]),
      );
    }
    serializedBytes = serialized.byteLength;
  }
  const memoryDeltaBytes = Object.fromEntries(
    Object.entries(memoryDeltas).map(([key, values]) => [
      key,
      {
        median: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        max: Math.max(...values),
      },
    ]),
  );
  return {
    pngBytes: size,
    multipartBytes: serializedBytes,
    multipartOverheadBytes: serializedBytes - size,
    durationMs: {
      median: percentile(durationsMs, 0.5),
      p95: percentile(durationsMs, 0.95),
      max: Math.max(...durationsMs),
    },
    retainedMemorySnapshotDeltaBytes: memoryDeltaBytes,
  };
}

const { sizes, iterations } = parseArguments(process.argv.slice(2));
const results = [];
for (const size of sizes) results.push(await measure(size, iterations));
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      platform: `${process.platform}-${process.arch}`,
      iterations,
      measurement: "Node Request/FormData construction and full body serialization",
      representativeness:
        "Local retained-memory snapshots only; clamped deltas miss transient peaks. Staging workerd and Discord latency remain required.",
      results,
    },
    null,
    2,
  ),
);
