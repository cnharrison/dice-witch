import { describe, expect, it } from "vitest";
import {
  composeD4AppearanceSvg,
  composeD4AppearanceSvgV3,
  composeD8AppearanceSvg,
  composeD8AppearanceSvgV3,
  composeD10AppearanceSvg,
  composeD10AppearanceSvgV3,
  composeD12AppearanceSvg,
  composeD12AppearanceSvgV3,
  composeOriginalD10AppearanceSvgV3,
  getD4VisibleFaceValues,
  getD8VisibleFaceValues,
  getD10VisibleFaceValues,
  getD12VisibleFaceValues,
  getOriginalD10VisibleFaceValues,
  renderD4AppearanceToPng,
  renderD8AppearanceToPng,
  renderD10AppearanceToPng,
  renderD12AppearanceToPng,
  renderComposedSvgToPng,
  type D10VisibleFaceValues,
  type RenderAppearanceV3,
} from "../../packages/dice-svg/src";
import { composeD12AppearanceSvgWithOptions } from "../../packages/dice-svg/src/dice/generatePolyhedralAppearance";

const baseAppearance = {
  primaryColor: "#5426a8",
  secondaryColor: "#c93ee8",
  textColor: "#ffffff",
  outlineColor: "#000000" as const,
  fill: { type: "gradient" as const },
  fontId: "liberation-sans" as const,
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

const geometries = [
  {
    name: "d4",
    sides: 4,
    visibleCount: 3,
    compose: composeD4AppearanceSvg,
    getVisible: getD4VisibleFaceValues,
  },
  {
    name: "d8",
    sides: 8,
    visibleCount: 4,
    compose: composeD8AppearanceSvg,
    getVisible: getD8VisibleFaceValues,
  },
  {
    name: "d10",
    sides: 10,
    visibleCount: 5,
    compose: composeD10AppearanceSvg,
    getVisible: getD10VisibleFaceValues,
  },
  {
    name: "d12",
    sides: 12,
    visibleCount: 6,
    compose: composeD12AppearanceSvg,
    getVisible: getD12VisibleFaceValues,
  },
] as const;

const v3Geometries = [
  {
    name: "d4",
    sides: 4,
    visibleCount: 3,
    composeV2: composeD4AppearanceSvg,
    composeV3: composeD4AppearanceSvgV3,
  },
  {
    name: "d8",
    sides: 8,
    visibleCount: 4,
    composeV2: composeD8AppearanceSvg,
    composeV3: composeD8AppearanceSvgV3,
  },
  {
    name: "d10",
    sides: 10,
    visibleCount: 5,
    composeV2: composeD10AppearanceSvg,
    composeV3: composeD10AppearanceSvgV3,
  },
  {
    name: "d12",
    sides: 12,
    visibleCount: 6,
    composeV2: composeD12AppearanceSvg,
    composeV3: composeD12AppearanceSvgV3,
  },
] as const;

function hasPngSignature(bytes: Uint8Array): boolean {
  return [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
}

function projectedLabelArea(transform: string, fontSize: number): number {
  const matrix = transform.match(
    /^matrix\((-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) /,
  );
  if (matrix) {
    const a = Number(matrix[1]);
    const b = Number(matrix[2]);
    const c = Number(matrix[3]);
    const d = Number(matrix[4]);
    return fontSize ** 2 * Math.abs(a * d - b * c);
  }
  const scale = transform.match(/scale\((-?[\d.]+) (-?[\d.]+)\)$/);
  if (!scale) {
    throw new Error(`Label transform ${JSON.stringify(transform)} is invalid`);
  }
  return fontSize ** 2 * Math.abs(Number(scale[1]) * Number(scale[2]));
}

function faceLabelMarkup(svg: string, slot: string): string {
  const start = svg.indexOf(`data-label-slot="${slot}"`);
  const end = svg.indexOf("\n  </g>", start);
  if (start === -1 || end === -1) {
    throw new Error(`Label ${slot} markup is missing`);
  }
  return svg.slice(start, end + "\n  </g>".length);
}

function faceLabelTransform(
  svg: string,
  slot: string,
  value?: number,
): string {
  const valueMarker =
    value === undefined ? "" : ` data-face-value="${String(value)}"`;
  const marker = `data-label-slot="${slot}"${valueMarker}`;
  const labelStart = svg.indexOf(marker);
  if (labelStart === -1) {
    throw new Error(`Label ${marker} is missing`);
  }
  const transform = svg.slice(labelStart).match(/<g transform="([^"]+)"/)?.[1];
  if (transform === undefined) {
    throw new Error(`Label ${marker} transform is missing`);
  }
  return transform;
}

function d10FaceValues(
  result: number,
  upperLeft: number,
  upperRight: number,
  lowerLeft: number,
  lowerRight: number,
): D10VisibleFaceValues {
  return {
    result,
    "upper-left": upperLeft,
    "upper-right": upperRight,
    "lower-left": lowerLeft,
    "lower-right": lowerRight,
  };
}

describe("polyhedral appearance renderers", () => {
  it.each(geometries)(
    "$name assigns unique deterministic values to every visible facet",
    ({ sides, visibleCount, getVisible }) => {
      for (let result = 1; result <= sides; result += 1) {
        const first = Object.values(getVisible(result));
        const second = Object.values(getVisible(result));
        expect(first).toEqual(second);
        expect(first).toHaveLength(visibleCount);
        expect(new Set(first).size).toBe(visibleCount);
        expect(first.every((face) => face >= 1 && face <= sides)).toBe(true);
        expect(first).toContain(result);
      }
    },
  );

  it("keeps additive pattern assets outside the V2 composer", () => {
    expect(() =>
      composeD12AppearanceSvg({
        ...baseAppearance,
        fill: { type: "pattern", pattern: "stripes-v2" },
        result: 12,
      }),
    ).toThrow("D12 appearance fill is invalid");
  });

  it("preserves the original d8 face-value arrangement", () => {
    const values = Array.from({ length: 8 }, (_, index) =>
      getD8VisibleFaceValues(index + 1),
    );

    expect(values).toEqual([
      { result: 1, bottom: 6, left: 4, right: 8 },
      { result: 2, bottom: 5, left: 7, right: 3 },
      { result: 3, bottom: 8, left: 2, right: 6 },
      { result: 4, bottom: 7, left: 5, right: 1 },
      { result: 5, bottom: 2, left: 8, right: 4 },
      { result: 6, bottom: 1, left: 3, right: 7 },
      { result: 7, bottom: 4, left: 6, right: 2 },
      { result: 8, bottom: 3, left: 1, right: 5 },
    ]);
  });

  it("preserves the original d10 face-value arrangement", () => {
    const values = Array.from({ length: 11 }, (_, result) =>
      getOriginalD10VisibleFaceValues(result),
    );

    expect(values).toEqual([
      d10FaceValues(0, 4, 8, 5, 2),
      d10FaceValues(1, 7, 3, 9, 2),
      d10FaceValues(2, 8, 6, 3, 1),
      d10FaceValues(3, 1, 9, 2, 8),
      d10FaceValues(4, 6, 10, 7, 5),
      d10FaceValues(5, 9, 7, 10, 4),
      d10FaceValues(6, 2, 4, 1, 7),
      d10FaceValues(7, 5, 1, 4, 9),
      d10FaceValues(8, 10, 2, 6, 3),
      d10FaceValues(9, 3, 5, 8, 10),
      d10FaceValues(10, 4, 8, 5, 2),
    ]);
  });

  it("keeps the d10 result face unchanged and projects every neighboring label like the original", () => {
    const current = composeD10AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 10,
    });
    const originalGuided = composeOriginalD10AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 10,
    });
    expect(faceLabelMarkup(originalGuided, "result")).toBe(
      faceLabelMarkup(current, "result"),
    );
    expect(faceLabelTransform(originalGuided, "upper-left")).toBe(
      "matrix(0.416 0.435 -0.582 0.712 143 227)",
    );
    expect(faceLabelTransform(originalGuided, "upper-right")).toBe(
      "matrix(0.562 -0.391 0.548 0.599 457 227)",
    );
    expect(faceLabelTransform(originalGuided, "lower-left")).toBe(
      "matrix(-0.703 0 -0.345 -0.87 193 399)",
    );
    expect(faceLabelTransform(originalGuided, "lower-right")).toBe(
      "matrix(-0.703 0 0.215 -0.87 410 399)",
    );

    const doubleDigitCases = [
      [8, "upper-left", "matrix(0.282 0.345 -0.576 0.712 155 222)"],
      [4, "upper-right", "matrix(0.437 -0.256 0.559 0.582 457 228)"],
      [5, "lower-left", "matrix(-0.706 0 -0.345 -0.87 197 399)"],
      [9, "lower-right", "matrix(-0.706 0 0.215 -0.87 404 399)"],
    ] as const;
    for (const [result, slot, transform] of doubleDigitCases) {
      const svg = composeOriginalD10AppearanceSvgV3({
        ...baseAppearanceV3,
        result,
      });
      expect(faceLabelTransform(svg, slot, 10)).toBe(transform);
    }
  });

  it.each(geometries)(
    "$name numbers every visible facet with engraved selectable text",
    ({ name, sides, visibleCount, compose }) => {
      const svg = compose({ ...baseAppearance, result: sides });

      expect(svg).toContain(`data-die="${name}"`);
      expect(svg.match(/data-face-surface=/g)).toHaveLength(visibleCount);
      expect(svg.match(/data-face-value=/g)).toHaveLength(visibleCount);
      expect(svg).toContain('<filter id="engraved-number"');
      expect(svg).toContain(
        'stroke="#000000" stroke-width="3" stroke-linejoin="round"',
      );
      expect(svg).not.toContain('class="text" d=');
    },
  );

  it.each(geometries)(
    "$name uses one consistent pattern across every visible facet",
    ({ sides, visibleCount, compose }) => {
      const svg = compose({
        ...baseAppearance,
        result: sides,
        fill: { type: "pattern", pattern: "stripes" },
      });
      const faceFills = Array.from(
        svg.matchAll(/class="face"[^>]*fill="([^"]+)"/g),
        (match) => match[1],
      );

      expect(svg.match(/<pattern /g)).toHaveLength(1);
      expect(faceFills).toHaveLength(visibleCount);
      expect(new Set(faceFills).size).toBe(1);
      expect(faceFills[0]).toMatch(/^url\(#pattern_stripes_/);
      expect(svg).not.toContain("_face-");
    },
  );

  it.each(geometries)(
    "$name keeps the rolled result visually dominant",
    ({ sides, compose }) => {
      const svg = compose({ ...baseAppearance, result: sides });
      const labels = Array.from(
        svg.matchAll(
          /<g transform="([^"]+)">\s*<text[^>]*data-face="(result|neighbor)"[^>]*font-size="(\d+)"/g,
        ),
        (match) => ({
          role: match[2],
          area: projectedLabelArea(match[1] ?? "", Number(match[3])),
        }),
      );
      const resultArea = labels.find(({ role }) => role === "result")?.area;
      const neighborAreas = labels
        .filter(({ role }) => role === "neighbor")
        .map(({ area }) => area);

      expect(resultArea).toBeDefined();
      expect(resultArea).toBeGreaterThan(Math.max(...neighborAreas));
    },
  );

  it("contains every numeral within its physical facet", () => {
    const dice = [
      composeD4AppearanceSvg({ ...baseAppearance, result: 4 }),
      composeD8AppearanceSvg({ ...baseAppearance, result: 8 }),
      composeD10AppearanceSvg({ ...baseAppearance, result: 10 }),
      composeD12AppearanceSvg({ ...baseAppearance, result: 12 }),
    ];

    for (const svg of dice) {
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

  it("keeps the d4 primary numeral inset within a larger result face", () => {
    const svg = composeD4AppearanceSvg({ ...baseAppearance, result: 4 });

    expect(svg).toContain('points="70,500 530,500 300,275"');
    expect(svg).toMatch(
      /data-label-slot="result"[\s\S]*?transform="translate\(300 406\)[^"]*"[\s\S]*?font-size="130"/,
    );
    expect(svg).toMatch(
      /data-label-slot="left"[\s\S]*?transform="translate\(250 235\)[^"]*"[\s\S]*?font-size="64"/,
    );
    expect(svg).toMatch(
      /data-label-slot="right"[\s\S]*?transform="translate\(350 235\)[^"]*"[\s\S]*?font-size="64"/,
    );
  });

  it("derives the d8 numeral trapezoid from its facet vertices", () => {
    const svg = composeD8AppearanceSvg({ ...baseAppearance, result: 8 });

    expect(svg).toMatch(
      /data-label-slot="result"[\s\S]*?matrix\(1 0 0 1 300 302\)[\s\S]*?font-size="210"/,
    );
    expect(svg).toMatch(
      /data-label-slot="left"[\s\S]*?matrix\(-0\.003 0\.826 -0\.513 0\.483 136 209\)[\s\S]*?font-size="210"/,
    );
    expect(svg).toMatch(
      /data-label-slot="right"[\s\S]*?matrix\(0\.002 -0\.792 0\.608 0\.616 474 210\)[\s\S]*?font-size="210"/,
    );
    expect(svg).toMatch(
      /data-label-slot="bottom"[\s\S]*?matrix\(-0\.828 0\.001 -0\.001 -0\.533 301 474\)[\s\S]*?font-size="210"/,
    );
  });

  it("keeps the original d10 face orientation with contained labels", () => {
    const svg = composeD10AppearanceSvg({ ...baseAppearance, result: 0 });

    expect(svg).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(298 251\) rotate\(0\)[\s\S]*?font-size="134"/,
    );
    expect(svg).toMatch(
      /data-label-slot="upper-left"[\s\S]*?translate\(150 240\) rotate\(-42\)[\s\S]*?font-size="82"/,
    );
    expect(svg).toMatch(
      /data-label-slot="upper-right"[\s\S]*?translate\(450 240\) rotate\(42\)[\s\S]*?font-size="76"/,
    );
    expect(svg).toMatch(
      /data-label-slot="lower-left"[\s\S]*?translate\(224 432\) rotate\(62\)[\s\S]*?font-size="102"/,
    );
    expect(svg).toMatch(
      /data-label-slot="lower-right"[\s\S]*?translate\(373 431\) rotate\(-62\)[\s\S]*?font-size="102"/,
    );
  });

  it("keeps the original d12 face orientation with contained labels", () => {
    const svg = composeD12AppearanceSvg({ ...baseAppearance, result: 12 });

    expect(svg).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(298 316\) rotate\(0\)[\s\S]*?font-size="155"/,
    );
    expect(svg).toMatch(
      /data-label-slot="upper-left"[\s\S]*?translate\(182 139\) rotate\(-36\)[\s\S]*?font-size="72"/,
    );
    expect(svg).toMatch(
      /data-label-slot="upper-right"[\s\S]*?translate\(411 146\) rotate\(36\)[\s\S]*?font-size="86"/,
    );
    expect(svg).toMatch(
      /data-label-slot="left"[\s\S]*?translate\(121 358\) rotate\(-110\)[\s\S]*?font-size="82"/,
    );
    expect(svg).toMatch(
      /data-label-slot="right"[\s\S]*?translate\(478 355\) rotate\(104\)[\s\S]*?font-size="82"/,
    );
    expect(svg).toMatch(
      /data-label-slot="bottom"[\s\S]*?translate\(302 484\) rotate\(180\)[\s\S]*?font-size="127"/,
    );
  });

  it("uses larger secondary numerals on the d12", () => {
    const singleDigitSvg = composeD12AppearanceSvg({
      ...baseAppearance,
      result: 12,
    });
    const neighborSizes = Array.from(
      singleDigitSvg.matchAll(
        /data-face="neighbor"[^>]*font-size="(\d+)"/g,
      ),
      (match) => Number(match[1]),
    );
    const doubleDigitBottom = composeD12AppearanceSvg({
      ...baseAppearance,
      result: 1,
    }).match(
      /data-label-slot="bottom"[\s\S]*?data-face="neighbor"[^>]*font-size="(\d+)"/,
    )?.[1];

    expect(neighborSizes).toEqual([72, 86, 82, 82, 127]);
    expect(Number(doubleDigitBottom)).toBe(100);
  });

  it("renders a zero face for percentile ones dice", () => {
    const values = Object.values(getD10VisibleFaceValues(0));
    const svg = composeD10AppearanceSvg({ ...baseAppearance, result: 0 });

    expect(values).toHaveLength(5);
    expect(new Set(values).size).toBe(5);
    expect(values).toContain(0);
    expect(svg).toContain('data-label-slot="result" data-face-value="0"');
  });

  it("marks standalone sixes without marking compound values", () => {
    const d10 = composeD10AppearanceSvg({ ...baseAppearance, result: 6 });
    const d12 = composeD12AppearanceSvg({ ...baseAppearance, result: 10 });

    expect(d10).toContain('data-orientation-mark="true"');
    const ten = d12.slice(
      d12.indexOf('data-face-value="10"'),
      d12.indexOf("</g>\n  </g>", d12.indexOf('data-face-value="10"')),
    );
    expect(ten).not.toContain('data-orientation-mark="true"');
  });

  it("adds the approved critical outline glow", () => {
    const svg = composeD8AppearanceSvg({
      ...baseAppearance,
      result: 8,
      effect: "critical-success",
    });

    expect(svg).toContain('data-effect="critical-success"');
    expect(svg).toContain("#ffcc00");
  });

  it.each(v3Geometries)(
    "$name preserves the Subtle facet compatibility compositor on unchanged geometry",
    ({ sides, visibleCount, composeV3 }) => {
      const svg = composeV3({ ...baseAppearanceV3, result: sides });

      expect(svg.match(/data-face-surface=/g)).toHaveLength(visibleCount);
      expect(svg.match(/data-face-value=/g)).toHaveLength(visibleCount);
      expect(svg.match(/data-lighting-layer="facet"/g)).toHaveLength(
        visibleCount - 1,
      );
      expect(svg).toContain('data-appearance-layer="material"');
      expect(svg).toContain('data-facet-compositor="legacy-v1"');
      expect(svg).not.toContain('data-appearance-layer="facet"');
      expect(svg).not.toContain('data-appearance-layer="directional"');
      expect(svg).toContain('data-appearance-layer="borders"');
      expect(svg).toContain('data-appearance-layer="labels"');
    },
  );

  it("shares V3 solid and pattern materials across every facet", () => {
    const solid = composeD4AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 4,
      surface: { type: "solid", color: "#5426a8" },
      lighting: { mode: "none" },
    });
    const pattern = composeD8AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 8,
      surface: {
        type: "pattern",
        pattern: "checkerboard",
        primaryColor: "#5426a8",
        secondaryColor: "#c93ee8",
      },
      lighting: { mode: "none" },
    });

    expect(solid.match(/class="face" fill="#5426a8"/g)).toHaveLength(3);
    expect(solid).not.toContain("<linearGradient");
    expect(pattern.match(/<pattern /g)).toHaveLength(1);
    expect(
      pattern.match(
        /class="face" fill="url\(#pattern_checkerboard_5426a8_c93ee8\)"/g,
      ),
    ).toHaveLength(4);
  });

  it("composes every V3 lighting mode in the approved layer order", () => {
    const none = composeD12AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 12,
      lighting: { mode: "none" },
    });
    const directional = composeD12AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 12,
      lighting: {
        mode: "directional",
        strength: "subtle",
        direction: "upper-left",
      },
    });
    const combined = composeD12AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 12,
      lighting: {
        mode: "combined",
        strength: "strong",
        direction: "right",
      },
      requiresLocalSeparation: true,
    });

    expect(none).not.toContain('data-appearance-layer="facet"');
    expect(none).not.toContain('data-appearance-layer="directional"');
    expect(directional).not.toContain('data-appearance-layer="facet"');
    expect(directional).toContain('data-appearance-layer="directional"');
    expect(combined).toContain(
      `opacity="${String(0.2 * (5 / 3))}"`,
    );
    const orderedLayers = [
      "material",
      "facet",
      "directional",
      "local-separation",
      "borders",
      "labels",
    ].map((name) => combined.indexOf(`data-appearance-layer="${name}"`));
    expect(orderedLayers.every((index) => index >= 0)).toBe(true);
    expect(orderedLayers).toEqual([...orderedLayers].sort((a, b) => a - b));
  });

  it("preserves migrated local-separation compositor pixels", async () => {
    const v2 = composeD12AppearanceSvgWithOptions(
      {
        ...baseAppearance,
        result: 12,
        textColor: "#faf9f6",
      },
      { localSeparation: true },
    );
    const v3 = composeD12AppearanceSvgV3({
      ...baseAppearanceV3,
      result: 12,
      requiresLocalSeparation: true,
    });

    expect(v3).toContain('data-facet-compositor="legacy-v1"');
    expect(await renderComposedSvgToPng(v3)).toEqual(
      await renderComposedSvgToPng(v2),
    );
  });

  it.each(v3Geometries)(
    "$name migrated V3 treatment rasterizes identically to V2",
    async ({ sides, composeV2, composeV3 }) => {
      const v2 = composeV2({
        ...baseAppearance,
        result: sides,
        textColor: "#faf9f6",
      });
      const v3 = composeV3({ ...baseAppearanceV3, result: sides });

      expect(await renderComposedSvgToPng(v3)).toEqual(
        await renderComposedSvgToPng(v2),
      );
    },
  );

  it.each([
    [
      "d4",
      renderD4AppearanceToPng,
      { ...baseAppearance, result: 4 },
    ],
    [
      "d8",
      renderD8AppearanceToPng,
      {
        ...baseAppearance,
        result: 8,
        fontId: "new-rocker",
        fill: { type: "pattern", pattern: "swirl" },
      },
    ],
    [
      "d10",
      renderD10AppearanceToPng,
      {
        ...baseAppearance,
        result: 10,
        textColor: "#111111",
        primaryColor: "#f2d95c",
        secondaryColor: "#fff2a8",
        fill: { type: "pattern", pattern: "honeycomb" },
      },
    ],
    [
      "d12",
      renderD12AppearanceToPng,
      {
        ...baseAppearance,
        result: 12,
        fontId: "new-rocker",
        fill: { type: "pattern", pattern: "checkerboard" },
      },
    ],
  ] as const)("rasterizes %s output", async (_name, render, request) => {
    const png = await render(request);

    expect(hasPngSignature(png)).toBe(true);
    expect(png.byteLength).toBeGreaterThan(1_000);
  });

  it.each(geometries)(
    "$name strictly validates its result boundary",
    ({ sides, compose }) => {
      expect(() =>
        compose({ ...baseAppearance, result: sides + 1 }),
      ).toThrow(
        sides === 10
          ? "D10 appearance result must be from 0 through 10"
          : `D${String(sides)} appearance result must be from 1 through ${String(sides)}`,
      );
    },
  );
});
