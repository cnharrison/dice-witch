import { describe, expect, it } from "vitest";
import {
  APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES,
  APPEARANCE_FACET_LIGHTING_OPACITIES,
  APPEARANCE_GENTLE_LIGHTING_MULTIPLIER,
  APPEARANCE_STRONG_LIGHTING_MULTIPLIER,
  getContrastRatio,
  resolveAppearanceInk,
  resolveAppearanceInkV2,
} from "../../packages/dice-appearance/src";

describe("appearance ink contrast", () => {
  it("selects dark ink for the bright yellow honeycomb palette", () => {
    const ink = resolveAppearanceInk(
      ["#f2d95c", "#fff2a8"],
      { type: "pattern", patternId: "honeycomb" },
    );

    expect(ink.textColor).toBe("#111111");
    expect(ink.minimumContrast).toBeGreaterThanOrEqual(4.5);
    expect(ink.requiresLocalSeparation).toBe(false);
  });

  it("selects light ink for a uniformly dark pattern", () => {
    const ink = resolveAppearanceInk(
      ["#173f35", "#24584a"],
      { type: "pattern", patternId: "swirl" },
    );

    expect(ink.textColor).toBe("#faf9f6");
    expect(ink.minimumContrast).toBeGreaterThanOrEqual(4.5);
    expect(ink.requiresLocalSeparation).toBe(false);
  });

  it("considers every gradient or pattern color", () => {
    const mixedPattern = resolveAppearanceInk(
      ["#000000", "#ffffff"],
      { type: "pattern", patternId: "checkerboard" },
    );
    const solid = resolveAppearanceInk(
      ["#000000", "#ffffff"],
      { type: "solid" },
    );

    expect(mixedPattern.requiresLocalSeparation).toBe(true);
    expect(mixedPattern.minimumContrast).toBeLessThan(4.5);
    expect(solid.textColor).toBe("#faf9f6");
    expect(solid.requiresLocalSeparation).toBe(false);
  });

  it("maximizes the worst contrast before average contrast", () => {
    const first = resolveAppearanceInk(
      ["#000000", "#ffffff", "#f2d95c"],
      { type: "gradient" },
    );
    const second = resolveAppearanceInk(
      ["#f2d95c", "#ffffff", "#000000"],
      { type: "gradient" },
    );

    expect(first).toEqual(second);
  });

  it("publishes the approved lighting contrast constants", () => {
    expect(APPEARANCE_FACET_LIGHTING_OPACITIES).toEqual({
      d4: { highlight: 0.1, shadow: 0.14 },
      d6: { highlight: 0.12, shadow: 0.18 },
      d8: { highlight: 0.1, shadow: 0.18 },
      d10: { highlight: 0.1, shadow: 0.18 },
      d12: { highlight: 0.12, shadow: 0.2 },
      d20: { highlight: 0.11, shadow: 0.18 },
      percentile: { highlight: 0.1, shadow: 0.18 },
      fudge: { highlight: 0.12, shadow: 0.18 },
      other: { highlight: 0.2, shadow: 0.12 },
    });
    expect(APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES).toEqual({
      gentle: { highlight: 0.03, shadow: 0.04 },
      subtle: { highlight: 0.2, shadow: 0.3 },
      strong: { highlight: 0.34, shadow: 0.5 },
    });
    expect(APPEARANCE_GENTLE_LIGHTING_MULTIPLIER).toBe(0.2);
    expect(APPEARANCE_STRONG_LIGHTING_MULTIPLIER).toBe(5 / 3);
  });

  it("keeps Gentle hot pink recognizable across every die shape", () => {
    const surface = { type: "solid" as const, color: "#ff00ff" };
    const targets = [
      "d4",
      "d6",
      "d8",
      "d10",
      "d12",
      "d20",
      "percentile",
      "fudge",
      "other",
    ] as const;
    const gentle = targets.map((target) =>
      resolveAppearanceInkV2(
        surface,
        {
          mode: "combined",
          strength: "gentle",
          direction: "upper-left",
        },
        target,
      ),
    );
    const subtle = targets.map((target) =>
      resolveAppearanceInkV2(
        surface,
        {
          mode: "combined",
          strength: "subtle",
          direction: "upper-left",
        },
        target,
      ),
    );

    expect(gentle.every(({ textColor }) => textColor === "#111111")).toBe(true);
    expect(gentle.every(({ requiresLocalSeparation }) => !requiresLocalSeparation)).toBe(true);
    expect(subtle.some(({ requiresLocalSeparation }) => requiresLocalSeparation)).toBe(true);
  });

  it("includes target form and optional lighting extrema", () => {
    const surface = { type: "solid" as const, color: "#515151" };
    const unlitD6 = resolveAppearanceInkV2(surface, { mode: "none" }, "d6");
    const intrinsicOther = resolveAppearanceInkV2(
      surface,
      { mode: "none" },
      "other",
    );
    const facetOther = resolveAppearanceInkV2(
      surface,
      { mode: "facet", strength: "subtle" },
      "other",
    );
    const directionalD6 = resolveAppearanceInkV2(
      surface,
      {
        mode: "directional",
        strength: "strong",
        direction: "upper-left",
      },
      "d6",
    );
    const directionalOther = resolveAppearanceInkV2(
      surface,
      {
        mode: "directional",
        strength: "subtle",
        direction: "upper-left",
      },
      "other",
    );
    const combinedOther = resolveAppearanceInkV2(
      surface,
      {
        mode: "combined",
        strength: "subtle",
        direction: "upper-left",
      },
      "other",
    );

    expect(unlitD6.requiresLocalSeparation).toBe(false);
    expect(intrinsicOther.requiresLocalSeparation).toBe(true);
    expect(facetOther).toEqual(intrinsicOther);
    expect(directionalD6.requiresLocalSeparation).toBe(true);
    expect(combinedOther).toEqual(directionalOther);
  });

  it("samples gradient interpolation between otherwise passing stops", () => {
    const pattern = resolveAppearanceInkV2(
      {
        type: "pattern",
        patternId: "checkerboard",
        primaryColor: "#0080e0",
        secondaryColor: "#6080a0",
      },
      { mode: "none" },
      "d6",
    );
    const gradient = resolveAppearanceInkV2(
      {
        type: "gradient",
        colors: ["#0080e0", "#6080a0"],
        scope: "die-wide",
        direction: "left-to-right",
      },
      { mode: "none" },
      "d6",
    );

    const thresholdGradient = resolveAppearanceInkV2(
      {
        type: "gradient",
        colors: ["#a46b8e", "#149f96"],
        scope: "die-wide",
        direction: "left-to-right",
      },
      { mode: "none" },
      "d6",
    );

    expect(pattern.requiresLocalSeparation).toBe(false);
    expect(gradient.requiresLocalSeparation).toBe(true);
    expect(gradient.minimumContrast).toBeLessThan(pattern.minimumContrast);
    expect(thresholdGradient.minimumContrast).toBeLessThan(4.5);
    expect(thresholdGradient.requiresLocalSeparation).toBe(true);
  });

  it("uses the exact Strong facet multiplier at the threshold", () => {
    const ink = resolveAppearanceInkV2(
      { type: "solid", color: "#00b2c1" },
      { mode: "facet", strength: "strong" },
      "d4",
    );

    expect(ink.minimumContrast).toBeLessThan(4.5);
    expect(ink.requiresLocalSeparation).toBe(true);
  });

  it("composes Strong facet and directional extrema conservatively", () => {
    const surface = {
      type: "gradient" as const,
      colors: ["#515151", "#767676"] as [string, string],
      scope: "die-wide" as const,
      direction: "upper-left-to-lower-right" as const,
    };
    const facet = resolveAppearanceInkV2(
      surface,
      { mode: "facet", strength: "strong" },
      "d12",
    );
    const combined = resolveAppearanceInkV2(
      surface,
      {
        mode: "combined",
        strength: "strong",
        direction: "right",
      },
      "d12",
    );

    expect(facet.requiresLocalSeparation).toBe(true);
    expect(combined.requiresLocalSeparation).toBe(true);
    expect(combined.minimumContrast).toBeLessThanOrEqual(
      facet.minimumContrast,
    );
  });

  it("calculates WCAG contrast ratios", () => {
    expect(getContrastRatio("#000000", "#ffffff")).toBe(21);
    expect(getContrastRatio("#ffffff", "#ffffff")).toBe(1);
  });

  it("rejects incomplete or invalid resolved palettes", () => {
    expect(() => resolveAppearanceInk([], { type: "solid" })).toThrow(
      "Resolved appearance palette must contain from one through six colors",
    );
    expect(() =>
      resolveAppearanceInk(["#ffffff"], { type: "gradient" }),
    ).toThrow("Resolved gradient and pattern fills require at least two colors");
    expect(() =>
      resolveAppearanceInk(
        ["yellow", "#ffffff"],
        { type: "pattern", patternId: "honeycomb" },
      ),
    ).toThrow("Resolved appearance color must be a six-digit hex color");
  });
});
