import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NO_PENDING_MIGRATIONS = "No migrations to apply!";
const PENDING_MIGRATIONS = "Migrations to be applied:";
const CLI_USAGE =
  "Usage: node tools/assert-migration-state.mjs --output <path> --apply-migrations <true|false>";

export function assertMigrationState({ output, applyMigrations }) {
  if (typeof output !== "string" || typeof applyMigrations !== "boolean") {
    throw new Error("D1 migration state input is invalid");
  }
  const noPending = output.includes(NO_PENDING_MIGRATIONS);
  const pending = output.includes(PENDING_MIGRATIONS);
  if (noPending === pending) {
    throw new Error("D1 migration state could not be verified");
  }
  if (noPending) return 0;
  if (!applyMigrations) {
    throw new Error(
      "Pending D1 migrations require explicit migration authorization before deployment",
    );
  }
  return 1;
}

function parseArguments(arguments_) {
  if (
    arguments_.length !== 4 ||
    arguments_[0] !== "--output" ||
    arguments_[2] !== "--apply-migrations" ||
    !["true", "false"].includes(arguments_[3])
  ) {
    throw new Error(CLI_USAGE);
  }
  return {
    outputPath: arguments_[1],
    applyMigrations: arguments_[3] === "true",
  };
}

async function main() {
  const { outputPath, applyMigrations } = parseArguments(process.argv.slice(2));
  const pending = assertMigrationState({
    output: await readFile(outputPath, "utf8"),
    applyMigrations,
  });
  process.stdout.write(`${JSON.stringify({ pending })}\n`);
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
