import { describe, expect, it } from "vitest";
import {
  createAppearanceSurfaceFillV3,
  generateAppearanceGradientV3,
} from "../../packages/dice-svg/src/appearanceV3";
import generateLinearGradientFill from "../../packages/dice-svg/src/fills/generateLinearGradientFill";
import type {
  RenderLinearDirectionV3,
  RenderSurfaceV3,
} from "../../packages/dice-svg/src/types";

const REPEATED_VECTORS: Record<RenderLinearDirectionV3, string> = {
  "top-to-bottom": 'x1=".5" y1="0" x2=".5" y2="1"',
  "upper-right-to-lower-left": 'x1="1" y1="0" x2="0" y2="1"',
  "right-to-left": 'x1="1" y1=".5" x2="0" y2=".5"',
  "lower-right-to-upper-left": 'x1="1" y1="1" x2="0" y2="0"',
  "bottom-to-top": 'x1=".5" y1="1" x2=".5" y2="0"',
  "lower-left-to-upper-right": 'x1="0" y1="1" x2="1" y2="0"',
  "left-to-right": 'x1="0" y1=".5" x2="1" y2=".5"',
  "upper-left-to-lower-right": 'x1="0" y1="0" x2="1" y2="1"',
};

const WHOLE_DIE_VECTORS: Record<RenderLinearDirectionV3, string> = {
  "top-to-bottom": 'x1="300" y1="45" x2="300" y2="555"',
  "upper-right-to-lower-left": 'x1="530" y1="60" x2="70" y2="540"',
  "right-to-left": 'x1="555" y1="300" x2="45" y2="300"',
  "lower-right-to-upper-left": 'x1="530" y1="540" x2="70" y2="60"',
  "bottom-to-top": 'x1="300" y1="555" x2="300" y2="45"',
  "lower-left-to-upper-right": 'x1="70" y1="540" x2="530" y2="60"',
  "left-to-right": 'x1="45" y1="300" x2="555" y2="300"',
  "upper-left-to-lower-right": 'x1="70" y1="60" x2="530" y2="540"',
};

function gradient(
  scope: "repeated" | "die-wide",
  direction: RenderLinearDirectionV3,
  colors: [string, string, ...string[]] = ["#111111", "#eeeeee"],
): Extract<RenderSurfaceV3, { type: "gradient" }> {
  return { type: "gradient", colors, scope, direction };
}

describe("V3 gradient materials", () => {
  it("uses approved object-bounding-box vectors for every repeated direction", () => {
    for (const [direction, vector] of Object.entries(REPEATED_VECTORS)) {
      const definition = generateAppearanceGradientV3(
        gradient("repeated", direction as RenderLinearDirectionV3),
      );
      expect(definition.string).toContain(
        `gradientUnits="objectBoundingBox" ${vector}`,
      );
    }
  });

  it("uses approved 600-unit vectors for every whole-die direction", () => {
    for (const [direction, vector] of Object.entries(WHOLE_DIE_VECTORS)) {
      const definition = generateAppearanceGradientV3(
        gradient("die-wide", direction as RenderLinearDirectionV3),
      );
      expect(definition.string).toContain(
        `gradientUnits="userSpaceOnUse" ${vector}`,
      );
    }
  });

  it("places two through six ordered stops at even offsets", () => {
    const cases: Array<{
      colors: [string, string, ...string[]];
      offsets: string[];
    }> = [
      { colors: ["#000000", "#ffffff"], offsets: ["0%", "100%"] },
      {
        colors: ["#000000", "#777777", "#ffffff"],
        offsets: ["0%", "50%", "100%"],
      },
      {
        colors: ["#000000", "#555555", "#aaaaaa", "#ffffff"],
        offsets: ["0%", "33.3333%", "66.6667%", "100%"],
      },
      {
        colors: [
          "#000000",
          "#444444",
          "#888888",
          "#cccccc",
          "#ffffff",
        ],
        offsets: ["0%", "25%", "50%", "75%", "100%"],
      },
      {
        colors: [
          "#000000",
          "#333333",
          "#666666",
          "#999999",
          "#cccccc",
          "#ffffff",
        ],
        offsets: ["0%", "20%", "40%", "60%", "80%", "100%"],
      },
    ];

    for (const { colors, offsets } of cases) {
      const definition = generateAppearanceGradientV3(
        gradient("die-wide", "left-to-right", colors),
      );
      expect(
        [...definition.string.matchAll(/<stop offset="([^"]+)"/g)].map(
          (match) => match[1],
        ),
      ).toEqual(offsets);
      expect(
        [...definition.string.matchAll(/stop-color="([^"]+)"/g)].map(
          (match) => match[1],
        ),
      ).toEqual(colors);
    }
  });

  it("preserves duplicate stops and derives deterministic material IDs", () => {
    const surface = gradient("die-wide", "left-to-right", [
      "#123456",
      "#123456",
      "#abcdef",
    ]);
    const first = generateAppearanceGradientV3(surface);
    const replay = generateAppearanceGradientV3(structuredClone(surface));
    const reversed = generateAppearanceGradientV3({
      ...surface,
      colors: ["#abcdef", "#123456", "#123456"],
    });

    expect(replay).toEqual(first);
    expect(first.name).toBe(
      "appearance-gradient-v3_die-wide_left-to-right_123456_123456_abcdef",
    );
    expect(first.string.match(/stop-color="#123456"/g)).toHaveLength(2);
    expect(reversed.name).not.toBe(first.name);
  });

  it("creates solid, pattern, and gradient surface fills without changing pattern projection", () => {
    expect(
      createAppearanceSurfaceFillV3({ type: "solid", color: "#123456" }),
    ).toEqual({ definition: "", value: "#123456" });
    const pattern = createAppearanceSurfaceFillV3({
      type: "pattern",
      pattern: "checkerboard",
      primaryColor: "#123456",
      secondaryColor: "#abcdef",
    });
    expect(pattern.definition).toContain(
      '<pattern id="pattern_checkerboard_123456_abcdef" patternUnits="userSpaceOnUse"',
    );
    expect(pattern.value).toBe(
      "url(#pattern_checkerboard_123456_abcdef)",
    );

    const material = createAppearanceSurfaceFillV3(
      gradient("repeated", "top-to-bottom"),
    );
    expect(material.definition).toContain("<linearGradient");
    expect(material.value).toContain("url(#appearance-gradient-v3_");
  });

  it("uses readable native geometry without changing legacy stripes", () => {
    const legacy = createAppearanceSurfaceFillV3({
      type: "pattern",
      pattern: "stripes",
      primaryColor: "#123456",
      secondaryColor: "#abcdef",
    });
    expect(legacy.definition).toContain(
      'width="20" height="20" patternTransform="scale(0.75)"',
    );
    expect(legacy.definition).toContain(
      '<rect y="8" width="20" height="4" fill="#abcdef"/>',
    );

    const nativeCases = [
      ["checkerboard-v2", 'width="48" height="48"'],
      ["dots-v2", 'circle cx="24" cy="24" r="14"'],
      ["stripes-v2", 'patternTransform="rotate(-32)"'],
      ["triangles-v2", 'polygon points="48,4 92,80 4,80"'],
      ["crosshatch-v2", 'stroke-width="8"'],
    ] as const;
    for (const [pattern, geometry] of nativeCases) {
      const fill = createAppearanceSurfaceFillV3({
        type: "pattern",
        pattern,
        primaryColor: "#123456",
        secondaryColor: "#abcdef",
      });
      expect(fill.definition).toContain(geometry);
      expect(fill.definition).not.toContain('patternTransform="scale(0.75)"');
    }
  });

  it("keeps the V2 two-color vertical gradient definition unchanged", () => {
    expect(generateLinearGradientFill("#123456", "#abcdef")).toEqual({
      name: "linearGradient_123456_abcdef",
      string: `<linearGradient id="linearGradient_123456_abcdef" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#123456"/>
            <stop offset="100%" stop-color="#abcdef"/>
        </linearGradient>`,
    });
  });
});
