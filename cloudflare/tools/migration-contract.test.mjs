import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const APPLIED_APPEARANCE_MIGRATION_SHA256 =
  "a5aa191555aedcb37430c1c37675dc41fe784d0ca748c01c747afc767b1cd5ac";

test("keeps the applied appearance-profile migration byte-immutable", async () => {
  const migration = await readFile(
    new URL("../migrations/data/0004_appearance_profiles.sql", import.meta.url),
  );
  const actual = createHash("sha256").update(migration).digest("hex");

  assert.equal(actual, APPLIED_APPEARANCE_MIGRATION_SHA256);
});
