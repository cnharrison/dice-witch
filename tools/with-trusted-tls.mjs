import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { trustedTlsEnvironment } from "./tls-trust.mjs";

const [command, ...arguments_] = process.argv.slice(2);
if (!command) throw new Error("Usage: npm run trusted-tls -- COMMAND [ARGUMENTS...]");
const directory = mkdtempSync(join(tmpdir(), "dice-witch-tls-"));
let result;
try {
  result = spawnSync(command, arguments_, {
    env: trustedTlsEnvironment(directory),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
if (result.signal) process.kill(process.pid, result.signal);
process.exitCode = result.status ?? 1;
