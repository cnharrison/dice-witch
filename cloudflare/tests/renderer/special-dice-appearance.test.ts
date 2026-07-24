import { describe, expect, it } from "vitest";
import {
  composeFudgeAppearanceSvg,
  composeFudgeAppearanceSvgV3,
  composeOtherAppearanceSvg,
  composeOtherAppearanceSvgV3,
  composePercentileAppearanceSvg,
  composePercentileAppearanceSvgV3,
  getFudgeVisibleFaceValues,
  getPercentileVisibleFaceValues,
  renderFudgeAppearanceToPng,
  renderOtherAppearanceToPng,
  renderPercentileAppearanceToPng,
  renderComposedSvgToPng,
  type AppearanceFontId,
  type RenderAppearanceV3,
} from "../../packages/dice-svg/src";
import { composeOtherAppearanceSvgWithOptions } from "../../packages/dice-svg/src/dice/generateSpecialAppearance";

const baseAppearance = {
  primaryColor: "#5426a8",
  secondaryColor: "#c93ee8",
  textColor: "#ffffff",
  outlineColor: "#000000" as const,
  fill: { type: "gradient" as const },
  fontId: "liberation-sans" as AppearanceFontId,
  effect: null,
};

const baseAppearanceV3: RenderAppearanceV3 = {
  surface: {
    type: "gradient",
    colors: ["#5426a8", "#c93ee8"],
    scope: "repeated",
    direction: "top-to-bottom",
  },
  lighting: { mode: "facet", strength: "subtle" },
  textColor: "#faf9f6",
  outlineColor: "#000000",
  fontId: "liberation-sans",
  effect: null,
  requiresLocalSeparation: false,
};

function hasPngSignature(bytes: Uint8Array): boolean {
  return [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
}

describe("percentile appearance renderer", () => {
  it("assigns five unique multiples of ten to visible facets", () => {
    for (let result = 0; result <= 90; result += 10) {
      const values = Object.values(getPercentileVisibleFaceValues(result));
      expect(values).toHaveLength(5);
      expect(new Set(values).size).toBe(5);
      expect(values.every((face) => face >= 0 && face <= 90)).toBe(true);
      expect(values.every((face) => face % 10 === 0)).toBe(true);
      expect(values).toContain(result);
    }
  });

  it("renders zero as 00 and numbers every visible facet", () => {
    const svg = composePercentileAppearanceSvg({
      ...baseAppearance,
      result: 0,
    });

    expect(svg).toContain('data-die="percentile"');
    expect(svg).toContain('data-face-value="00"');
    expect(svg.match(/data-face-value=/g)).toHaveLength(5);
    expect(svg).toContain('data-face="result"');
  });

  it("uses one consistent pattern across all five percentile facets", () => {
    const svg = composePercentileAppearanceSvg({
      ...baseAppearance,
      result: 0,
      fill: { type: "pattern", pattern: "circuit" },
    });
    const faceFills = Array.from(
      svg.matchAll(/class="face"[^>]*fill="([^"]+)"/g),
      (match) => match[1],
    );

    expect(svg.match(/<pattern /g)).toHaveLength(1);
    expect(faceFills).toHaveLength(5);
    expect(new Set(faceFills).size).toBe(1);
    expect(faceFills[0]).toMatch(/^url\(#pattern_circuit_/);
    expect(svg).not.toContain("_face-");
  });

  it("keeps the percentile result dominant and contained", () => {
    const svg = composePercentileAppearanceSvg({
      ...baseAppearance,
      result: 90,
    });

    expect(svg).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(300 250\)[\s\S]*?font-size="128"/,
    );
  });

  it("optically narrows wide percentile fonts without moving their anchors", () => {
    const syncopate = composePercentileAppearanceSvg({
      ...baseAppearance,
      fontId: "syncopate",
      result: 90,
    });
    const liberationSans = composePercentileAppearanceSvg({
      ...baseAppearance,
      result: 90,
    });

    expect(syncopate).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(300 250\) rotate\(0\) scale\(0\.75 0\.95\)/,
    );
    expect(liberationSans).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(300 250\) rotate\(0\) scale\(1 0\.95\)/,
    );
  });

  it("contains percentile and Fudge labels within their facets", () => {
    const percentile = composePercentileAppearanceSvg({
      ...baseAppearance,
      result: 90,
    });
    const fudge = composeFudgeAppearanceSvg({ ...baseAppearance, result: 1 });

    for (const svg of [percentile, fudge]) {
      const slots = Array.from(
        svg.matchAll(/data-label-slot="([^"]+)"/g),
        (match) => match[1],
      );

      for (const slot of slots) {
        expect(svg).toContain(`<clipPath id="label-${slot}"`);
        expect(svg).toContain(`clip-path="url(#label-${slot})"`);
      }
    }
  });

  it("strictly validates percentile results", () => {
    expect(() =>
      composePercentileAppearanceSvg({ ...baseAppearance, result: 15 }),
    ).toThrow(
      "Percentile appearance result must be a multiple of 10 from 0 through 90",
    );
  });
});

describe("Fudge appearance renderer", () => {
  it("places minus, blank, and plus across all three visible cube facets", () => {
    expect(getFudgeVisibleFaceValues(-1)).toEqual({
      result: -1,
      top: 0,
      right: 1,
    });
    expect(getFudgeVisibleFaceValues(0)).toEqual({
      result: 0,
      top: 1,
      right: -1,
    });
    expect(getFudgeVisibleFaceValues(1)).toEqual({
      result: 1,
      top: -1,
      right: 0,
    });

    const svg = composeFudgeAppearanceSvg({ ...baseAppearance, result: 0 });
    expect(svg).toContain('data-die="fudge"');
    expect(svg).toContain('data-face-value="blank"');
    expect(svg).toContain('data-face-value="plus"');
    expect(svg).toContain('data-face-value="minus"');
    expect(svg.match(/data-face-value=/g)).toHaveLength(3);
  });

  it("matches the original Fudge result alignment and scale", () => {
    const svg = composeFudgeAppearanceSvg({ ...baseAppearance, result: 1 });

    expect(svg).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(270 337\)[\s\S]*?font-size="392"/,
    );
    expect(svg).toMatch(
      /data-label-slot="top"[\s\S]*?translate\(317 128\)[\s\S]*?font-size="160"/,
    );
  });

  it("strictly validates Fudge results", () => {
    expect(() =>
      composeFudgeAppearanceSvg({ ...baseAppearance, result: 2 }),
    ).toThrow("Fudge appearance result must be -1, 0, or 1");
  });
});

describe("shared V3 special faceted renderers", () => {
  it("composes percentile material, lighting, separation, borders, and labels in order", () => {
    const svg = composePercentileAppearanceSvgV3({
      ...baseAppearanceV3,
      result: 90,
      surface: {
        type: "gradient",
        colors: ["#5426a8", "#c93ee8", "#f2d95c"],
        scope: "die-wide",
        direction: "upper-left-to-lower-right",
      },
      lighting: {
        mode: "combined",
        strength: "strong",
        direction: "upper-right",
      },
      requiresLocalSeparation: true,
    });
    const orderedLayers = [
      "material",
      "facet",
      "directional",
      "local-separation",
      "borders",
      "labels",
    ].map((name) => svg.indexOf(`data-appearance-layer="${name}"`));

    expect(svg.match(/data-face-value=/g)).toHaveLength(5);
    expect(svg).toContain('data-face-value="90"');
    expect(svg).toContain('gradientUnits="userSpaceOnUse"');
    expect(orderedLayers.every((index) => index >= 0)).toBe(true);
    expect(orderedLayers).toEqual([...orderedLayers].sort((a, b) => a - b));
  });

  it("composes Fudge V3 labels and active lighting without changing geometry", () => {
    const facet = composeFudgeAppearanceSvgV3({
      ...baseAppearanceV3,
      result: 1,
    });
    const none = composeFudgeAppearanceSvgV3({
      ...baseAppearanceV3,
      result: 1,
      lighting: { mode: "none" },
    });

    expect(facet).toContain('data-face-value="plus"');
    expect(facet).toContain('data-face-value="minus"');
    expect(facet).toContain('data-face-value="blank"');
    expect(facet.match(/data-lighting-layer="facet"/g)).toHaveLength(2);
    expect(facet).toContain('data-facet-compositor="legacy-v1"');
    expect(none).not.toContain('data-lighting-layer="facet"');
    expect(none).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(270 337\)[\s\S]*?font-size="392"/,
    );
  });

  it.each([
    [
      "percentile",
      () =>
        composePercentileAppearanceSvg({
          ...baseAppearance,
          result: 90,
          textColor: "#faf9f6",
        }),
      () =>
        composePercentileAppearanceSvgV3({
          ...baseAppearanceV3,
          result: 90,
        }),
    ],
    [
      "Fudge",
      () =>
        composeFudgeAppearanceSvg({
          ...baseAppearance,
          result: 1,
          textColor: "#faf9f6",
        }),
      () =>
        composeFudgeAppearanceSvgV3({
          ...baseAppearanceV3,
          result: 1,
        }),
    ],
  ] as const)(
    "%s migrated V3 treatment rasterizes identically to V2",
    async (_name, composeV2, composeV3) => {
      expect(await renderComposedSvgToPng(composeV3())).toEqual(
        await renderComposedSvgToPng(composeV2()),
      );
    },
  );
});

describe("Other appearance renderer", () => {
  it("retains the spherical representation and identifies its sides", () => {
    const svg = composeOtherAppearanceSvg({
      ...baseAppearance,
      sides: 7,
      result: 6,
    });

    expect(svg).toContain('data-die="other"');
    expect(svg).toContain('data-sides="7"');
    expect(svg).toContain('<circle class="surface"');
    expect(svg).toContain('data-face-value="6"');
    expect(svg).toContain(">d7</text>");
    expect(svg).toContain('data-orientation-mark="true"');
  });

  it("matches the original generic-die result alignment and scale", () => {
    const svg = composeOtherAppearanceSvg({
      ...baseAppearance,
      sides: 7,
      result: 6,
    });

    expect(svg).toMatch(
      /data-label-slot="result"[^>]*transform="translate\(298 280\)"[\s\S]*?font-size="250"/,
    );
  });

  it("keeps three-digit results inside the spherical die", () => {
    const svg = composeOtherAppearanceSvg({
      ...baseAppearance,
      fontId: "syncopate",
      sides: 999,
      result: 999,
    });

    expect(svg).toMatch(
      /data-label-slot="result"[^>]*transform="translate\(298 280\)"[\s\S]*?font-size="185"/,
    );
  });

  it("maps both gradient scopes byte-identically to every sphere-bound direction", () => {
    const vectors = {
      "top-to-bottom": 'x1="300" y1="48" x2="300" y2="552"',
      "upper-right-to-lower-left": 'x1="552" y1="48" x2="48" y2="552"',
      "right-to-left": 'x1="552" y1="300" x2="48" y2="300"',
      "lower-right-to-upper-left": 'x1="552" y1="552" x2="48" y2="48"',
      "bottom-to-top": 'x1="300" y1="552" x2="300" y2="48"',
      "lower-left-to-upper-right": 'x1="48" y1="552" x2="552" y2="48"',
      "left-to-right": 'x1="48" y1="300" x2="552" y2="300"',
      "upper-left-to-lower-right": 'x1="48" y1="48" x2="552" y2="552"',
    } as const;

    for (const [direction, vector] of Object.entries(vectors)) {
      const render = (scope: "repeated" | "die-wide") =>
        composeOtherAppearanceSvgV3({
          ...baseAppearanceV3,
          sides: 7,
          result: 6,
          surface: {
            type: "gradient",
            colors: ["#5426a8", "#c93ee8", "#f2d95c"],
            scope,
            direction: direction as keyof typeof vectors,
          },
          lighting: { mode: "none" },
        });
      const repeated = render("repeated");
      const wholeDie = render("die-wide");

      expect(repeated).toBe(wholeDie);
      expect(repeated).toContain(
        `gradientUnits="userSpaceOnUse" ${vector}`,
      );
      expect(repeated).toContain("appearance-gradient-v3_other_");
    }
  });

  it("retains intrinsic sphere form in every V3 lighting mode", () => {
    const render = (lighting: RenderAppearanceV3["lighting"]) =>
      composeOtherAppearanceSvgV3({
        ...baseAppearanceV3,
        sides: 7,
        result: 6,
        lighting,
      });
    const none = render({ mode: "none" });
    const facet = render({ mode: "facet", strength: "subtle" });
    const strongFacet = render({ mode: "facet", strength: "strong" });
    const directional = render({
      mode: "directional",
      strength: "strong",
      direction: "upper-left",
    });
    const combined = render({
      mode: "combined",
      strength: "strong",
      direction: "right",
    });

    for (const svg of [none, facet, strongFacet, directional, combined]) {
      expect(svg.match(/data-lighting-layer="intrinsic-form"/g)).toHaveLength(2);
      expect(svg).toContain('data-appearance-layer="intrinsic-form"');
      expect(svg).toContain('clip-path="url(#sphere-surface)"');
    }
    expect(none).toContain('fill="#ffffff" opacity="0.2"');
    expect(none).toContain('fill="#000000" opacity="0.12"');
    expect(facet).toContain('fill="#ffffff" opacity="0.2"');
    expect(strongFacet).toContain(
      `fill="#ffffff" opacity="${String(0.2 * (5 / 3))}"`,
    );
    expect(strongFacet).toContain('fill="#000000" opacity="0.2"');
    expect(directional).toContain('fill="#ffffff" opacity="0.2"');
    expect(directional).toContain('data-appearance-layer="directional"');
    expect(combined).toContain(
      `fill="#ffffff" opacity="${String(0.2 * (5 / 3))}"`,
    );
    expect(combined).toContain('data-appearance-layer="directional"');
  });

  it("composes every V3 Other material in the approved physical order", () => {
    const combined = composeOtherAppearanceSvgV3({
      ...baseAppearanceV3,
      sides: 999,
      result: 999,
      surface: {
        type: "pattern",
        pattern: "honeycomb",
        primaryColor: "#5426a8",
        secondaryColor: "#c93ee8",
      },
      lighting: {
        mode: "combined",
        strength: "subtle",
        direction: "top",
      },
      requiresLocalSeparation: true,
    });
    const solid = composeOtherAppearanceSvgV3({
      ...baseAppearanceV3,
      sides: 7,
      result: 6,
      surface: { type: "solid", color: "#5426a8" },
      lighting: { mode: "none" },
    });
    const orderedLayers = [
      "material",
      "intrinsic-form",
      "directional",
      "local-separation",
      "borders",
      "labels",
    ].map((name) => combined.indexOf(`data-appearance-layer="${name}"`));

    expect(combined.match(/<pattern /g)).toHaveLength(1);
    expect(combined).toContain('data-face-value="999"');
    expect(combined).toContain('font-size="185"');
    expect(orderedLayers.every((index) => index >= 0)).toBe(true);
    expect(orderedLayers).toEqual([...orderedLayers].sort((a, b) => a - b));
    expect(solid).toContain('.surface{fill:#5426a8;');
    expect(solid).toContain('<path data-lighting-layer="intrinsic-form"');
    expect(solid).toContain('<ellipse data-lighting-layer="intrinsic-form"');
  });

  it.each([
    [7, 6, "liberation-sans"],
    [999, 999, "syncopate"],
  ] as const)(
    "preserves exact V2 sphere and label pixels for d%i result %i",
    async (sides, result, fontId) => {
      const v2 = composeOtherAppearanceSvgWithOptions(
        {
          ...baseAppearance,
          sides,
          result,
          fontId,
          textColor: "#faf9f6",
        },
        { localSeparation: true },
      );
      const v3 = composeOtherAppearanceSvgV3({
        ...baseAppearanceV3,
        sides,
        result,
        fontId,
        requiresLocalSeparation: true,
      });

      expect(await renderComposedSvgToPng(v3)).toEqual(
        await renderComposedSvgToPng(v2),
      );
    },
  );

  it("strictly validates sides, result, and exact fields", () => {
    expect(() =>
      composeOtherAppearanceSvg({ ...baseAppearance, sides: 0, result: 1 }),
    ).toThrow("Other appearance sides must be from 1 through 999");
    expect(() =>
      composeOtherAppearanceSvg({ ...baseAppearance, sides: 7, result: 8 }),
    ).toThrow("Other appearance result must be from 1 through 7");
    expect(() =>
      composeOtherAppearanceSvgV3({
        ...baseAppearanceV3,
        sides: 1_000,
        result: 1,
      }),
    ).toThrow("Other appearance sides must be from 1 through 999");
    expect(() =>
      composeOtherAppearanceSvgV3({
        ...baseAppearanceV3,
        sides: 7,
        result: 8,
      }),
    ).toThrow("Other appearance result must be from 1 through 7");
    expect(() =>
      composeOtherAppearanceSvg({
        ...baseAppearance,
        sides: 7,
        result: 6,
        rawSvg: "<script/>",
      }),
    ).toThrow("Other appearance request has invalid fields");
  });
});

it.each([
  [
    "percentile",
    () =>
      renderPercentileAppearanceToPng({
        ...baseAppearance,
        result: 0,
        fontId: "new-rocker",
        fill: { type: "pattern", pattern: "checkerboard" },
      }),
  ],
  [
    "Fudge",
    () =>
      renderFudgeAppearanceToPng({
        ...baseAppearance,
        result: 1,
        fontId: "new-rocker",
        fill: { type: "pattern", pattern: "swirl" },
      }),
  ],
  [
    "Other",
    () =>
      renderOtherAppearanceToPng({
        ...baseAppearance,
        sides: 7,
        result: 6,
        textColor: "#111111",
        primaryColor: "#f2d95c",
        secondaryColor: "#fff2a8",
        fill: { type: "pattern", pattern: "honeycomb" },
      }),
  ],
] as const)("rasterizes %s output", async (_name, render) => {
  const png = await render();

  expect(hasPngSignature(png)).toBe(true);
  expect(png.byteLength).toBeGreaterThan(1_000);
});
