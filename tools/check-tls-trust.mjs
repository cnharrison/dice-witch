import assert from "node:assert/strict";
import https from "node:https";

const certificateErrors = new Set([
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_UNTRUSTED",
  "CERT_REVOKED",
  "SELF_SIGNED_CERT_IN_CHAIN",
]);

function httpsRequest(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { signal: AbortSignal.timeout(10000) }, (response) => {
      response.destroy();
      resolve();
    });
    request.on("error", reject);
  });
}

async function fetchRequest(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  await response.body?.cancel();
}

const hosts = ["https://dicewit.ch/", "https://registry.npmjs.org/"];
const compromised = ["dv", "ov", "ev"].flatMap((usage) =>
  ["b", "c"].flatMap((region) => ["", "-aaa"].map((crossSign) =>
    `https://${usage}-g3${region}${crossSign}-emudhra.we-have-a-problem.com/`,
  )),
);
for (const [client, request] of [["fetch", fetchRequest], ["https", httpsRequest]]) {
  for (const url of hosts) await request(url);
  await Promise.all(compromised.map(async (url) => {
    await assert.rejects(request(url), (error) => certificateErrors.has(error.cause?.code ?? error.code),
      `${client} must reject the compromised certificate at ${url}`);
  }));
  console.log(`${client}: 12 compromised chains rejected; production and npm HTTPS accepted`);
}
