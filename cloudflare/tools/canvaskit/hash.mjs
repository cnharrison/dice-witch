import { createHash } from "node:crypto";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function requireSha256(name, value, expected) {
  const actual = sha256(value);
  if (actual !== expected) {
    throw new Error(
      `${name} SHA-256 changed: expected ${expected}, received ${actual}`,
    );
  }
  return actual;
}
