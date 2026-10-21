import { createHash, X509Certificate } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { rootCertificates } from "node:tls";
import { fileURLToPath } from "node:url";

// Temporary root distrust while Node's eMudhra remediation is pending.
// Includes the direct issuers and both cross-signing paths, identified by key.
// https://emudhra.we-have-a-problem.com/roots.json
export const DISTRUSTED_CA_KEYS = new Set([
  "C619E4780ED8E0ABEDA24AD732567DE4383A7EA941338F6D1A7D1B49AC792FE9", // emSign Root TLS CA - G3
  "0A6C2B2CA5B364207954171987AC9D2178561569D8205457E77CA90C32EDE282", // emSign Root CS CA - G3
  "BD153ED7B0434F6886B17BCE8BBE84ED340C7132D702A8F4FA318F756ECBD6F3", // AAA Certificate Services
  "8D417DB2DD8BF5E3084D1E3F196D583849D81BDD4C00C70B9D39369E96B8C782", // emSign ECC Root CA - G3
]);

export function certificateKeyHash(pem) {
  const key = new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(key).digest("hex").toUpperCase();
}

export function writeTrustBundle(directory) {
  const certificates = rootCertificates.filter((pem) => !DISTRUSTED_CA_KEYS.has(certificateKeyHash(pem)));
  if (certificates.length === 0) throw new Error("Refusing an empty TLS trust bundle");
  mkdirSync(resolve(directory, "empty"), { recursive: true, mode: 0o700 });
  const bundle = resolve(directory, "ca.pem");
  writeFileSync(bundle, `${certificates.join("\n")}\n`, { mode: 0o600, flag: "wx" });
  return bundle;
}

export function trustedTlsEnvironment(directory, environment = process.env) {
  if (/--use[-_](?:bundled|system)[-_]ca\b/.test(environment.NODE_OPTIONS ?? "")) {
    throw new Error("Remove conflicting CA flags from NODE_OPTIONS before using trusted TLS");
  }
  const bundle = writeTrustBundle(directory);
  return {
    ...environment,
    NODE_OPTIONS: `${environment.NODE_OPTIONS ?? ""} --use-openssl-ca`.trim(),
    NODE_USE_SYSTEM_CA: "0",
    NODE_EXTRA_CA_CERTS: "",
    NODE_TLS_REJECT_UNAUTHORIZED: "1",
    SSL_CERT_FILE: bundle,
    SSL_CERT_DIR: resolve(directory, "empty"),
    CURL_CA_BUNDLE: bundle,
    NPM_CONFIG_CAFILE: bundle,
    npm_config_cafile: bundle,
    NPM_CONFIG_STRICT_SSL: "true",
    npm_config_strict_ssl: "true",
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.argv[2]) throw new Error("Usage: node tools/tls-trust.mjs DIRECTORY");
  writeTrustBundle(process.argv[2]);
}
