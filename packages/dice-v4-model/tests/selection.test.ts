import { describe, expect, it } from "vitest";
import {
  createDeterministicRandomV4,
  resolveAppearanceSelectionV4,
  resolveCompatiblePolyhedralFormV4,
} from "../src";

describe("V4 appearance selections", () => {
  it("resolves fixed, allowlist, and weighted choices deterministically", () => {
    expect(
      resolveAppearanceSelectionV4(
        { mode: "fixed", value: "fixed" },
        createDeterministicRandomV4(0),
      ),
    ).toBe("fixed");
    expect(
      resolveAppearanceSelectionV4(
        { mode: "allowlist", values: ["a", "b", "c"] },
        createDeterministicRandomV4(1),
      ),
    ).toBe("b");

    const weighted = {
      mode: "weighted" as const,
      options: [
        { value: "first", weight: 1 },
        { value: "second", weight: 3 },
        { value: "third", weight: 6 },
      ],
    };
    expect(
      resolveAppearanceSelectionV4(
        weighted,
        createDeterministicRandomV4(4),
      ),
    ).toBe("first");
    expect(
      resolveAppearanceSelectionV4(
        weighted,
        createDeterministicRandomV4(3),
      ),
    ).toBe("second");
    expect(
      resolveAppearanceSelectionV4(
        weighted,
        createDeterministicRandomV4(1),
      ),
    ).toBe("third");
  });

  it("filters forms against the selected material family", () => {
    expect(
      resolveCompatiblePolyhedralFormV4(
        {
          mode: "allowlist",
          values: ["crystal-cut", "standard"],
        },
        "classic",
        createDeterministicRandomV4(1),
      ),
    ).toBe("standard");
    expect(
      resolveCompatiblePolyhedralFormV4(
        {
          mode: "allowlist",
          values: ["standard", "crystal-cut"],
        },
        "gemstone",
        createDeterministicRandomV4(1),
      ),
    ).toBe("crystal-cut");
    expect(() =>
      resolveCompatiblePolyhedralFormV4(
        { mode: "fixed", value: "standard" },
        "hollow-metal",
        createDeterministicRandomV4(1),
      ),
    ).toThrow("Appearance form selection has no option for hollow-metal");
  });

  it("rejects structurally empty or invalid trusted selections", () => {
    expect(() =>
      resolveAppearanceSelectionV4(
        { mode: "allowlist", values: [] },
        createDeterministicRandomV4(0),
      ),
    ).toThrow("Appearance selection is empty");
    expect(() =>
      resolveAppearanceSelectionV4(
        { mode: "weighted", options: [{ value: "bad", weight: 0 }] },
        createDeterministicRandomV4(0),
      ),
    ).toThrow("Appearance selection weights must be positive safe integers");
  });
});
