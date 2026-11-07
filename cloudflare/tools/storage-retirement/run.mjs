import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";

const ManifestSchema = z.strictObject({
  accountId: z.string().regex(/^[a-f0-9]{32}$/),
  namespaceId: z.string().regex(/^[a-f0-9]{32}$/),
  // One reviewed enumeration page; the API cursor is retained for the next page.
  cursor: z.string().nullable(),
  ids: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
});
const ReceiptSchema = z.strictObject({
  manifest: z.string(),
  id: z.string(),
  status: z.enum(["retired", "retained"]),
});
const ResultSchema = z.strictObject({ status: z.enum(["retired", "retained"]) });

/** Sequential, resumable cleanup of one reviewed inventory page.
 * An uncertain response stops the batch without recording completion. Repeating
 * that object is safe because eligibility belongs to the Durable Object owner.
 */
export async function retirePage({ manifestPath, journalPath, endpoint, budget, apply }, transport = fetch) {
  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = ManifestSchema.parse(JSON.parse(manifestText));
  const fingerprint = createHash("sha256").update(manifestText).digest("hex");
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error("Supply a positive request budget");
  const completed = new Set();
  let journal = "";
  try {
    journal = await readFile(journalPath, "utf8");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  for (const line of journal.split("\n")) {
    if (!line) continue;
    const receipt = ReceiptSchema.parse(JSON.parse(line));
    if (receipt.manifest !== fingerprint) throw new Error("Journal belongs to another manifest");
    completed.add(receipt.id);
  }
  let requests = 0;
  for (const id of new Set(manifest.ids)) {
    if (completed.has(id)) continue;
    if (requests === budget) break;
    requests += 1;
    if (!apply) continue;
    const token = process.env.RETIREMENT_TOKEN;
    if (!token) throw new Error("RETIREMENT_TOKEN is required");
    const url = new URL("/retire", endpoint);
    if (url.protocol !== "https:") throw new Error("Cleanup endpoint must use HTTPS");
    const response = await transport(url, {
      method: "POST",
      redirect: "error",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ accountId: manifest.accountId, namespaceId: manifest.namespaceId, id }),
    });
    if (!response.ok) throw new Error(`Retirement stopped: HTTP ${response.status}`);
    const result = ResultSchema.parse(await response.json());
    await appendFile(journalPath, `${JSON.stringify({ manifest: fingerprint, id, status: result.status })}\n`, { mode: 0o600 });
  }
  return { mode: apply ? "apply" : "plan", requests, cursor: manifest.cursor };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: {
    manifest: { type: "string" }, journal: { type: "string" },
    endpoint: { type: "string" }, budget: { type: "string" }, apply: { type: "boolean", default: false },
  } });
  console.info(await retirePage({ manifestPath: values.manifest, journalPath: values.journal,
    endpoint: values.endpoint, budget: Number(values.budget), apply: values.apply }));
}
