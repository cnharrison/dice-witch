import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rootCertificates } from "node:tls";
import test from "node:test";

import { certificateKeyHash, DISTRUSTED_CA_KEYS, trustedTlsEnvironment, writeTrustBundle } from "./tls-trust.mjs";

test("trust bundle removes the affected root keys and retains other bundled public roots", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "dice-witch-tls-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bundle = readFileSync(writeTrustBundle(directory), "utf8");
  let retained = 0;
  for (const pem of rootCertificates) {
    if (DISTRUSTED_CA_KEYS.has(certificateKeyHash(pem))) assert.ok(!bundle.includes(pem));
    else {
      assert.ok(bundle.includes(pem));
      retained++;
    }
  }
  assert.ok(retained > 100);
  assert.equal(statSync(join(directory, "ca.pem")).mode & 0o777, 0o600);
  assert.equal(statSync(join(directory, "empty")).mode & 0o777, 0o700);
  assert.throws(() => writeTrustBundle(directory), { code: "EEXIST" });
});

test("project trust replaces inherited CA paths and verification bypasses", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "dice-witch-tls-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = trustedTlsEnvironment(directory, {
    NODE_OPTIONS: "--trace-warnings",
    NODE_EXTRA_CA_CERTS: "/unsafe/extra.pem",
    NODE_USE_SYSTEM_CA: "1",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    SSL_CERT_FILE: "/unsafe/ca.pem",
    SSL_CERT_DIR: "/unsafe/ca-dir",
    npm_config_cafile: "/unsafe/npm.pem",
    npm_config_strict_ssl: "false",
  });
  assert.equal(env.NODE_OPTIONS, "--trace-warnings --use-openssl-ca");
  assert.equal(env.NODE_EXTRA_CA_CERTS, "");
  assert.equal(env.NODE_USE_SYSTEM_CA, "0");
  assert.equal(env.NODE_TLS_REJECT_UNAUTHORIZED, "1");
  assert.equal(env.SSL_CERT_DIR, join(directory, "empty"));
  for (const name of ["SSL_CERT_FILE", "CURL_CA_BUNDLE", "NPM_CONFIG_CAFILE", "npm_config_cafile"]) {
    assert.equal(env[name], join(directory, "ca.pem"));
  }
  assert.equal(env.NPM_CONFIG_STRICT_SSL, "true");
  assert.equal(env.npm_config_strict_ssl, "true");
});

test("conflicting Node CA modes fail before any command executes", () => {
  for (const option of ["--use-bundled-ca", "--use-system-ca", "--use_bundled_ca", "--use_system_ca"]) {
    assert.throws(() => trustedTlsEnvironment("/unused", { NODE_OPTIONS: option }), /conflicting CA flags/);
  }
});

test("local wrapper propagates command failure and cleans its trust bundle", () => {
  const result = spawnSync(process.execPath, [
    "tools/with-trusted-tls.mjs", process.execPath, "-e",
    "console.log(process.env.SSL_CERT_FILE); process.exitCode = 23;",
  ], { encoding: "utf8" });
  assert.equal(result.status, 23, result.stderr);
  const bundle = result.stdout.trim();
  assert.ok(bundle.endsWith("/ca.pem"));
  assert.throws(() => statSync(bundle), { code: "ENOENT" });
});

test("Dagger configures trusted TLS before its first dependency download", () => {
  const source = readFileSync(new URL("../.dagger/src/index.ts", import.meta.url), "utf8");
  const bootstrap = source.slice(source.indexOf("  private environment("), source.indexOf("  private validationInput("));
  const generation = bootstrap.indexOf('"/opt/dice-witch/tls-trust.mjs", "/opt/dice-witch/tls"');
  assert.ok(generation > 0 && generation < bootstrap.indexOf('"npm", "install"'));
  for (const [name, value] of Object.entries({
    NODE_OPTIONS: "--use-openssl-ca",
    NODE_EXTRA_CA_CERTS: "",
    SSL_CERT_FILE: "/opt/dice-witch/tls/ca.pem",
    SSL_CERT_DIR: "/opt/dice-witch/tls/empty",
    NPM_CONFIG_CAFILE: "/opt/dice-witch/tls/ca.pem",
    NPM_CONFIG_STRICT_SSL: "true",
  })) {
    const position = bootstrap.indexOf(`.withEnvVariable("${name}", "${value}")`);
    assert.ok(position > 0 && position < bootstrap.indexOf('"npm", "install"'), name);
  }
});

test("host-side CI promotion checks and production metadata use project trust", () => {
  for (const name of ["deploy-staging", "deploy-production", "dagger-staging-validation", "dagger-production-validation", "production-thumbs-bake"]) {
    const workflow = readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8");
    assert.match(workflow, /run: node tools\/with-trusted-tls\.mjs node tools\/verify-ci-promotion\.mjs/);
    if (name === "production-thumbs-bake") assert.match(workflow, /node tools\/with-trusted-tls\.mjs curl --fail/);
  }
});
