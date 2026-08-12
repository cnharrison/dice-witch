import assert from "node:assert/strict";
import test from "node:test";
import { assertMigrationState } from "./assert-migration-state.mjs";

test("allows a deployment without migration approval when none are pending", () => {
  assert.equal(
    assertMigrationState({
      output: "✅ No migrations to apply!\n",
      applyMigrations: false,
    }),
    0,
  );
});

test("blocks a deployment with pending migrations unless they are authorized", () => {
  const output = "Migrations to be applied:\n┌───────────────────────────────┐\n│ Name                          │\n├───────────────────────────────┤\n│ 0014_hide_roll_result_text.sql │\n└───────────────────────────────┘\n";
  assert.throws(
    () => assertMigrationState({ output, applyMigrations: false }),
    /Pending D1 migrations require explicit migration authorization/,
  );
  assert.equal(assertMigrationState({ output, applyMigrations: true }), 1);
});

test("fails closed when Wrangler migration output is unrecognized or contradictory", () => {
  for (const output of [
    "Unexpected migration response",
    "✅ No migrations to apply!\nMigrations to be applied:\n",
  ]) {
    assert.throws(
      () => assertMigrationState({ output, applyMigrations: true }),
      /D1 migration state could not be verified/,
    );
  }
});
