import { expect, it } from "vitest";
import { canvasKitFailureNameV4 } from "../src/error-diagnostics";

it("classifies hostile thrown values without replacing the original failure", () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  expect(canvasKitFailureNameV4(proxy)).toBe("UnknownError");
});
