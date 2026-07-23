import { open, realpath, rm } from "node:fs/promises";
import path from "node:path";

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function canonicalizePrivateJsonPath(
  evidencePath,
  repositoryRoot,
  label,
) {
  if (
    typeof evidencePath !== "string" ||
    !path.isAbsolute(evidencePath) ||
    path.extname(evidencePath) !== ".json"
  ) {
    throw new Error(`${label} must use an absolute private JSON path`);
  }
  const [evidenceParent, sourceRoot] = await Promise.all([
    realpath(path.dirname(evidencePath)),
    realpath(repositoryRoot),
  ]);
  const canonicalPath = path.join(evidenceParent, path.basename(evidencePath));
  if (isInside(sourceRoot, canonicalPath)) {
    throw new Error(`${label} must be stored outside the source repository`);
  }
  return canonicalPath;
}

export async function createPrivateJsonEvidenceFile(
  evidencePath,
  initialEvidence,
  label,
) {
  let handle;
  try {
    handle = await open(evidencePath, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`${label} already exists: ${evidencePath}`, {
        cause: error,
      });
    }
    throw error;
  }
  try {
    await handle.writeFile(serialize(initialEvidence), "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(evidencePath, { force: true });
    throw error;
  }

  let finalized = false;
  async function finalize(evidence) {
    if (finalized) throw new Error(`${label} is already finalized`);
    finalized = true;
    try {
      await handle.truncate(0);
      await handle.write(serialize(evidence), 0, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  return { complete: finalize, fail: finalize };
}
