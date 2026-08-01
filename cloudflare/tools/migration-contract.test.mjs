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

test("keeps both applied 0013 migrations byte-immutable", async () => {
  const expected = {
    "0013_discord_channel_directory.sql":
      "05ed17950b00beec9053a8fe0f959309ae19f16b2a56b4267b318601f44b9cc2",
    "0013_roll_lifecycle_diagnostics.sql":
      "730c9eb5fdb14ec2895442602391add23f54737c62eabbce3708fee2279a7f8f",
  };

  for (const [filename, digest] of Object.entries(expected)) {
    const migration = await readFile(
      new URL(`../migrations/data/${filename}`, import.meta.url),
    );
    assert.equal(createHash("sha256").update(migration).digest("hex"), digest);
  }
});
