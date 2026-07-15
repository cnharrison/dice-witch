import { describe, expect, it } from "vitest";
import { classifyGatewayControlError } from "../../workers/gateway/src";
import { classifyGatewayRuntimeError } from "../../workers/gateway/src/gateway-shard-connection";

describe("Gateway control error classification", () => {
  it.each([
    [
      new Error("listCurrentGuildIdsPage RPC method failed"),
      "discord-guild-page-rpc",
    ],
    [new Error("Too many subrequests"), "subrequest-limit"],
    [new Error("secret-value"), "unexpected"],
  ])("returns only the allowlisted class for %p", (error, expected) => {
    expect(classifyGatewayControlError(error)).toBe(expected);
  });
});

describe("Gateway socket error classification", () => {
  it("classifies cross-Durable-Object I/O without exposing raw errors", () => {
    expect(
      classifyGatewayRuntimeError(
        new Error(
          "Cannot perform I/O on behalf of a different Durable Object. secret-value",
        ),
      ),
    ).toBe("cross-durable-object-io");
  });

  it.each([
    [new Error("Gateway Ready data is invalid"), "gateway-protocol"],
    [
      new Error("Discord Get Gateway Bot returned HTTP 429"),
      "discord-gateway-bot-http-429",
    ],
    [
      new Error("Discord Gateway socket is not open"),
      "discord-socket-not-open",
    ],
    [new Error("Discord Gateway request failed"), "discord-response"],
    [
      new Error("Guild lifecycle logging response is invalid"),
      "guild-lifecycle-log-invalid-response",
    ],
    [
      new Error("Initial guild classification failed"),
      "guild-initial-classification-failed",
    ],
    [new Error("secret-value"), "unexpected"],
    ["secret-value", "non-error"],
  ])("returns only the allowlisted class for %p", (error, expected) => {
    expect(classifyGatewayRuntimeError(error)).toBe(expected);
  });
});
