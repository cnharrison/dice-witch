import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { retirePage } from "./storage-retirement/run.mjs";

test("retirement plans without I/O, bounds requests, resumes and stops uncertain results", async () => {
  const dir = await mkdtemp(join(tmpdir(), "retirement-"));
  const previous = process.env.RETIREMENT_TOKEN;
  process.env.RETIREMENT_TOKEN = "local-test-token";
  try {
    const manifestPath = join(dir, "manifest.json");
    const journalPath = join(dir, "receipts.jsonl");
    const ids = ["1".repeat(64), "2".repeat(64), "3".repeat(64)];
    await writeFile(manifestPath, JSON.stringify({ accountId: "a".repeat(32), namespaceId: "b".repeat(32), cursor: "next-page", ids }));
    const options = { manifestPath, journalPath, endpoint: "https://maintenance.invalid", budget: 1, apply: false };
    const requests = [];
    const transport = async (_url, request) => {
      requests.push(JSON.parse(request.body));
      return Response.json({ status: requests.length === 1 ? "retired" : "retained" });
    };
    assert.equal((await retirePage(options, transport)).mode, "plan");
    assert.equal(requests.length, 0);
    await retirePage({ ...options, apply: true }, transport);
    assert.equal(requests.length, 1);
    await retirePage({ ...options, apply: true }, transport);
    assert.deepEqual(requests.map(({ id }) => id), ids.slice(0, 2));
    const before = await readFile(journalPath, "utf8");
    await assert.rejects(retirePage({ ...options, apply: true }, async () => { throw new Error("response lost"); }), /response lost/);
    assert.equal(await readFile(journalPath, "utf8"), before);
    await retirePage({ ...options, apply: true }, transport);
    assert.deepEqual(requests.map(({ id }) => id), ids);
    await writeFile(manifestPath, JSON.stringify({ accountId: "c".repeat(32), namespaceId: "b".repeat(32), cursor: null, ids }));
    await assert.rejects(retirePage({ ...options, apply: true }, transport), /another manifest/);
  } finally {
    if (previous === undefined) delete process.env.RETIREMENT_TOKEN;
    else process.env.RETIREMENT_TOKEN = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
