import { cp, lstat, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { adaptCanvasKitLoader } from "./adapt-loader.mjs";
import { requireSha256 } from "./hash.mjs";
import {
  BUILD_ARGUMENTS,
  BUILD_HASHES,
  EMSDK_IMAGE,
  SKIA_REVISION,
  WASM_MEMORY_POLICY,
} from "./policy.mjs";
import { verifyCanvasKitRuntime } from "./verify.mjs";
import { readWasmMemoryLimits } from "./wasm-memory.mjs";

const SKIA_REPOSITORY = "https://skia.googlesource.com/skia.git";
const toolDirectory = dirname(fileURLToPath(import.meta.url));
const cloudflareDirectory = resolve(toolDirectory, "../..");
const buildRoot = resolve(cloudflareDirectory, ".generated/canvaskit-build");
const sourceDirectory = resolve(buildRoot, "skia");
const outputDirectory = resolve(sourceDirectory, "out/dice-witch-canvaskit");
const assetsDirectory = resolve(
  cloudflareDirectory,
  "packages/dice-canvaskit/assets",
);
const patchPath = resolve(toolDirectory, "canvaskit-0.41.1.patch");
const dependenciesPath = resolve(toolDirectory, "minimal-DEPS");

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(
        new Error(
          `${command} exited with ${code === null ? `signal ${String(signal)}` : `code ${String(code)}`}`,
        ),
      );
    });
  });
}

function runStatus(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "ignore", ...options });
    child.on("error", reject);
    child.on("exit", (code) => resolveRun(code === 0));
  });
}

async function commandOutput(command, args, options = {}) {
  return await new Promise((resolveOutput, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "inherit"],
      ...options,
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveOutput(output.trim());
        return;
      }
      reject(
        new Error(
          `${command} exited with ${code === null ? `signal ${String(signal)}` : `code ${String(code)}`}`,
        ),
      );
    });
  });
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function checkoutSource() {
  if (!(await pathExists(resolve(sourceDirectory, ".git")))) {
    await mkdir(buildRoot, { recursive: true });
    await run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      SKIA_REPOSITORY,
      sourceDirectory,
    ]);
    await run("git", [
      "-C",
      sourceDirectory,
      "fetch",
      "--depth=1",
      "origin",
      SKIA_REVISION,
    ]);
    await run("git", [
      "-C",
      sourceDirectory,
      "checkout",
      "--detach",
      SKIA_REVISION,
    ]);
  }
  const revision = await commandOutput("git", [
    "-C",
    sourceDirectory,
    "rev-parse",
    "HEAD",
  ]);
  if (revision !== SKIA_REVISION) {
    throw new Error(
      `Skia revision must be ${SKIA_REVISION}; received ${revision}`,
    );
  }
}

async function applySourcePatch() {
  const canApply = await runStatus("git", [
    "-C",
    sourceDirectory,
    "apply",
    "--check",
    patchPath,
  ]);
  if (canApply) {
    await run("git", ["-C", sourceDirectory, "apply", patchPath]);
    return;
  }
  const alreadyApplied = await runStatus("git", [
    "-C",
    sourceDirectory,
    "apply",
    "--reverse",
    "--check",
    patchPath,
  ]);
  if (!alreadyApplied) {
    throw new Error("CanvasKit source patch does not match the pinned source");
  }
}

async function prepareBuildInputs() {
  const [patch, dependencies] = await Promise.all([
    readFile(patchPath),
    readFile(dependenciesPath),
  ]);
  requireSha256("CanvasKit source patch", patch, BUILD_HASHES.sourcePatch);
  requireSha256(
    "CanvasKit minimal dependencies",
    dependencies,
    BUILD_HASHES.minimalDependencies,
  );
  await writeFile(resolve(sourceDirectory, "dice-witch.DEPS"), dependencies);
  const emsdkPath = resolve(sourceDirectory, "third_party/externals/emsdk");
  await mkdir(dirname(emsdkPath), { recursive: true });
  if (await pathExists(emsdkPath)) {
    const target = await readlink(emsdkPath).catch(() => null);
    if (target !== "/emsdk") {
      throw new Error("Pinned Skia source has an unexpected Emscripten path");
    }
  } else {
    await symlink("/emsdk", emsdkPath);
  }
}

function dockerBaseArguments() {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === undefined || gid === undefined) {
    throw new Error("CanvasKit build requires a POSIX user and group id");
  }
  return [
    "run",
    "--rm",
    "--user",
    `${String(uid)}:${String(gid)}`,
    "--entrypoint",
    "/bin/bash",
    "-e",
    "HOME=/tmp",
    "-e",
    "EM_CACHE=/SRC/out/emscripten-cache",
    "-v",
    `${sourceDirectory}:/SRC`,
    "-w",
    "/SRC",
  ];
}

async function buildSource() {
  const docker = dockerBaseArguments();
  await run("docker", [
    ...docker,
    "-e",
    "GIT_SYNC_DEPS_PATH=/SRC/dice-witch.DEPS",
    "-e",
    "GIT_SYNC_DEPS_SKIP_EMSDK=1",
    EMSDK_IMAGE,
    "-lc",
    "python3 tools/git-sync-deps",
  ]);
  await run("docker", [
    ...docker,
    "-e",
    "BUILD_DIR=out/dice-witch-canvaskit",
    EMSDK_IMAGE,
    "-lc",
    `./modules/canvaskit/compile.sh ${BUILD_ARGUMENTS.join(" ")}`,
  ]);
}

async function verifyBuiltArtifacts({ writeAssets }) {
  const [rawLoader, wasmBuffer] = await Promise.all([
    readFile(resolve(outputDirectory, "canvaskit.js"), "utf8"),
    readFile(resolve(outputDirectory, "canvaskit.wasm")),
  ]);
  requireSha256("Raw CanvasKit loader", rawLoader, BUILD_HASHES.rawLoader);
  const loader = adaptCanvasKitLoader(rawLoader);
  requireSha256("CanvasKit loader", loader, BUILD_HASHES.loader);
  requireSha256("CanvasKit WebAssembly", wasmBuffer, BUILD_HASHES.wasm);
  const wasm = new Uint8Array(wasmBuffer);
  const memory = readWasmMemoryLimits(wasm);
  if (
    memory.flags !== 1 ||
    memory.initialPages !== WASM_MEMORY_POLICY.initialPages ||
    memory.maximumPages !== WASM_MEMORY_POLICY.maximumPages
  ) {
    throw new Error("Source-built CanvasKit heap does not match policy");
  }
  if (writeAssets) {
    await Promise.all([
      writeFile(resolve(assetsDirectory, "canvaskit.mjs"), loader),
      writeFile(resolve(assetsDirectory, "canvaskit.wasm"), wasm),
      cp(resolve(sourceDirectory, "LICENSE"), resolve(assetsDirectory, "LICENSE.skia")),
    ]);
  }
  return { memory };
}

export async function buildCanvasKitRuntime({
  clean = false,
  writeAssets = false,
} = {}) {
  if (clean) await rm(buildRoot, { recursive: true, force: true });
  await checkoutSource();
  await applySourcePatch();
  await prepareBuildInputs();
  await buildSource();
  const build = await verifyBuiltArtifacts({ writeAssets });
  const verified = await verifyCanvasKitRuntime({ assetsDirectory });
  return {
    sourceDirectory,
    outputDirectory,
    writeAssets,
    build,
    verified,
  };
}

function parseArguments(args) {
  const supported = new Set(["--clean", "--write-assets"]);
  for (const argument of args) {
    if (!supported.has(argument)) {
      throw new Error(`Unknown CanvasKit build argument: ${argument}`);
    }
  }
  return {
    clean: args.includes("--clean"),
    writeAssets: args.includes("--write-assets"),
  };
}

const invokedPath =
  process.argv[1] === undefined
    ? null
    : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  const result = await buildCanvasKitRuntime(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
