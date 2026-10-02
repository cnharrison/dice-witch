import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_ACCOUNT, prepareStaging } from "./staging-prepare.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const manifest = await prepareStaging({ output: path.join(root, ".generated/gateway-memory-types"), accountId: APPROVED_ACCOUNT, workersSubdomain: "cnharrison", sourceSha, expiresAt: Date.now() + 58 * 60_000, purpose: "typecheck" });
execFileSync("npm", ["exec", "--no", "--", "wrangler", "types", path.join(root, ".generated/gateway-memory-bindings.d.ts"), "--config", manifest.configs[1].configPath, "--env-interface", "GatewayMemoryBindings", "--include-runtime", "false", "--strict-vars", "false"], { cwd: root, stdio: "inherit" });
