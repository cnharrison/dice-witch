import { describe, expect, it } from "vitest";
import { validateRenderRequest } from "../../packages/dice-svg/src";

const validDie = {
  sides: 20,
  rolled: 17,
  color: "#6f42c1",
  secondaryColor: "#24143d",
  textColor: "#faf9f6",
  outlineColor: "#000000",
  icons: [],
  fill: { type: "gradient" },
};

function requestWith(overrides: Record<string, unknown>) {
  return {
    version: 1,
    groups: [[{ ...validDie, ...overrides }]],
  };
}

describe("validateRenderRequest", () => {
  it("rejects values that could inject external SVG content", () => {
    expect(() =>
      validateRenderRequest(
        requestWith({ color: "url(https://example.test/asset.svg)" }),
      ),
    ).toThrow("color must be a six-digit hex color");
  });

  it("rejects unsupported sides, icons, and fills", () => {
    expect(() => validateRenderRequest(requestWith({ sides: "script" }))).toThrow(
      "sides must be an integer from 1 through 999, %, or F",
    );
    expect(() =>
      validateRenderRequest(requestWith({ icons: ["external-image"] })),
    ).toThrow("is not a supported icon");
    expect(() =>
      validateRenderRequest(
        requestWith({ icons: ["blank", "blank", "blank", "blank"] }),
      ),
    ).toThrow("at most three icons");
    expect(() =>
      validateRenderRequest(
        requestWith({ fill: { type: "pattern", pattern: "remote" } }),
      ),
    ).toThrow("must select gradient or a supported pattern");
  });

  it("enforces the Fudge, percentile, and total-dice bounds", () => {
    expect(() =>
      validateRenderRequest(requestWith({ sides: "F", rolled: 2 })),
    ).toThrow("must be -1, 0, or 1 for Fudge dice");
    expect(() =>
      validateRenderRequest(requestWith({ sides: "%", rolled: 100 })),
    ).toThrow("must be a multiple of 10 from 0 through 90");
    expect(() =>
      validateRenderRequest({
        version: 1,
        groups: [Array.from({ length: 51 }, () => validDie)],
      }),
    ).toThrow("Render request exceeds 50 dice");
  });

  it("accepts compounded numeric results for legacy modulo display", () => {
    const request = validateRenderRequest(requestWith({ sides: 6, rolled: 19 }));

    expect(request.groups[0]?.[0]?.rolled).toBe(19);
  });

  it("rejects empty and malformed groups", () => {
    expect(() => validateRenderRequest({ version: 1, groups: [] })).toThrow(
      "groups must be a non-empty array",
    );
    expect(() => validateRenderRequest({ version: 1, groups: [[]] })).toThrow(
      "groups[0] must be a non-empty array",
    );
  });
});
