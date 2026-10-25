import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { z } from "zod";

const require = createRequire(import.meta.resolve("wrangler"));
const { build } = require("esbuild");
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");

// Reuse the exact protocol fixture outside Cloudflare's runtime. The caller owns
// tunnel/process cleanup; binding only loopback prevents exposing any other host service.
export async function startLocalFixture({ hostname, sourceSha, expiresAt, secretsPath, port }) {
  assert.match(hostname, /^[a-z0-9-]+\.trycloudflare\.com$/);
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert(Number.isSafeInteger(expiresAt) && expiresAt > Date.now());
  const info = await stat(secretsPath);
  assert.equal(info.mode & 0o077, 0, "Fixture credentials must be private");
  const secrets = z.strictObject({ GATEWAY_CONTROL_TOKEN: z.string().min(50), DISCORD_BOT_TOKEN: z.string().min(50) }).parse(JSON.parse(await readFile(secretsPath, "utf8")));
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("./staging-fixture.mjs", import.meta.url))], bundle: true, format: "esm", platform: "browser", target: "es2022", external: ["cloudflare:workers", "node:*"], write: false });
  const script = bundle.outputFiles[0].text;
  const runtime = new Miniflare(convertV4MiniflareOptions({ host: "127.0.0.1", port, workers: [{
    name: "external-discord-fixture", modules: true, script,
    compatibilityDate: "2026-07-10", compatibilityFlags: ["nodejs_compat"],
    bindings: { ...secrets, FIXTURE_HOSTNAME: hostname, SOURCE_SHA: sourceSha, EXPIRES_AT: String(expiresAt) },
    durableObjects: { FIXTURE: { className: "FixtureController", useSQLite: true } },
  }] }));
  try {
    const url = await runtime.ready;
    return { runtime, url, bundleSha256: createHash("sha256").update(script).digest("hex") };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
