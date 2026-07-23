import { describe, expect, it } from "vitest";
import {
  APPEARANCE_FONT_IDS,
  composeD20AppearanceSvg,
  composeD20AppearanceSvgV3,
  getD20NeighborValues,
  getD20VisibleFaceValues,
  renderComposedSvgToPng,
  renderD20AppearanceToPng,
  type D20AppearanceRequest,
  type RenderAppearanceV3,
} from "../../packages/dice-svg/src";
import { composeD20AppearanceSvgWithOptions } from "../../packages/dice-svg/src/dice/generateD20Appearance";

const request: D20AppearanceRequest = {
  result: 20,
  primaryColor: "#301934",
  secondaryColor: "#d4af37",
  textColor: "#ffffff",
  outlineColor: "#000000",
  fill: { type: "pattern", pattern: "checkerboard" },
  fontId: "new-rocker",
  effect: "critical-success",
};

const appearanceV3: RenderAppearanceV3 = {
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

function visibleFaceMarkup(svg: string, value: number): string {
  const marker = `data-face-value="${value}"`;
  const start = svg.indexOf(marker);
  const next = svg.indexOf("<g data-label-slot=", start + marker.length);
  return svg.slice(start, next === -1 ? undefined : next);
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("d20 appearance prototype", () => {
  it("uses deterministic neighboring faces", () => {
    expect(getD20NeighborValues(1)).toEqual([7, 13, 17]);
    expect(getD20NeighborValues(20)).toEqual([6, 12, 16]);
  });

  it("assigns a unique value to every visible face", () => {
    for (let result = 1; result <= 20; result += 1) {
      const values = Object.values(getD20VisibleFaceValues(result));

      expect(values).toHaveLength(10);
      expect(new Set(values).size).toBe(10);
      expect(values).toContain(result);
      expect(values.every((value) => value >= 1 && value <= 20)).toBe(true);
    }
  });

  it("renders selectable, optically weighted text instead of hardcoded numeral paths", () => {
    const svg = composeD20AppearanceSvg(request);

    expect(svg).toContain('data-font-id="new-rocker"');
    expect(svg).toContain('font-family:"New Rocker"');
    expect(svg).toContain('class="engraving-text engraving-ink"');
    expect(svg).toContain("paint-order:stroke fill");
    expect(svg).toContain('data-face="result"');
    expect(svg).toContain(">20</text>");
    expect(svg).not.toContain('class="text" d=');
  });

  it("contains every visible number within its own facet", () => {
    const svg = composeD20AppearanceSvg(request);
    const slots = [
      "result",
      "top-left",
      "top-right",
      "middle-left",
      "middle-right",
      "outer-left",
      "outer-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];

    for (const slot of slots) {
      expect(svg).toContain(`<clipPath id="label-${slot}"`);
      expect(svg).toContain(`data-label-slot="${slot}"`);
      expect(svg).toContain(`clip-path="url(#label-${slot})"`);
    }
    const renderedValues = Array.from(
      svg.matchAll(/data-face-value="(\d+)"/g),
      (match) => Number(match[1]),
    );
    expect(renderedValues).toHaveLength(10);
    expect(new Set(renderedValues).size).toBe(10);
  });

  it("keeps the original d20 face orientation with contained labels", () => {
    const svg = composeD20AppearanceSvg(request);
    const expected = [
      ["result", "303 326", "0", "106"],
      ["top-left", "243 124", "-4", "52"],
      ["top-right", "361 124", "4", "44"],
      ["middle-left", "178 229", "-62", "92"],
      ["middle-right", "420 238", "60", "74"],
      ["outer-left", "112 335", "-102", "36"],
      ["outer-right", "488 335", "110", "32"],
      ["bottom-left", "190 465", "-86", "37"],
      ["bottom-center", "303 448", "180", "72"],
      ["bottom-right", "413 465", "-114", "24"],
    ] as const;

    for (const [slot, position, rotation, size] of expected) {
      expect(svg).toMatch(
        new RegExp(
          `data-label-slot="${slot}"[\\s\\S]*?translate\\(${position}\\) rotate\\(${rotation}\\)[\\s\\S]*?font-size="${size}"`,
        ),
      );
    }
  });

  it.each(APPEARANCE_FONT_IDS)(
    "contains every lower-face numeral with %s",
    (fontId) => {
      const svg = composeD20AppearanceSvg({ ...request, fontId });

      for (const slot of ["bottom-left", "bottom-center", "bottom-right"]) {
        expect(svg).toMatch(
          new RegExp(`data-label-slot="${slot}"[\\s\\S]*?<text `),
        );
      }
      for (const slot of ["bottom-left", "bottom-center", "bottom-right"]) {
        expect(svg).toContain(`clip-path="url(#label-${slot})"`);
      }
    },
  );

  it("keeps secondary-face numerals readable inside narrow facets", () => {
    const svg = composeD20AppearanceSvg(request);
    const neighborSizes = Array.from(
      svg.matchAll(
        /class="engraving-text engraving-ink" data-face="neighbor"[^>]*font-size="(\d+)"/g,
      ),
      (match) => Number(match[1]),
    );

    expect(neighborSizes).toHaveLength(9);
    expect(neighborSizes.every((size) => size >= 24)).toBe(true);
  });

  it("renders a strong inner recess with same-ink weight and no contrasting outline", () => {
    const svg = composeD20AppearanceSvg(request);

    expect(svg).toContain('<filter id="engraved-number"');
    expect(svg).toContain('operator="out" result="shadow-mask"');
    expect(svg).toContain('operator="out" result="highlight-mask"');
    expect(svg).toContain('class="engraving-text engraving-ink"');
    expect(svg).toMatch(
      /\.engraving-text\{[^}]*stroke:#ffffff;[^}]*paint-order:stroke fill/,
    );
    expect(svg).toContain(
      '.engraving-ink{fill:#ffffff;filter:url(#engraved-number)}',
    );
    expect(svg).not.toContain('class="engraving-shadow"');
    expect(svg).not.toContain('class="engraving-highlight"');
  });

  it("preserves visible recessed depth with black numeral ink", () => {
    const svg = composeD20AppearanceSvg({
      ...request,
      textColor: "#111111",
    });

    expect(svg).toContain(
      '.engraving-ink{fill:#111111;filter:url(#engraved-number)}',
    );
    expect(svg).toContain(
      '<feFlood flood-color="#ffffff" flood-opacity="0.75" result="highlight-color"/>',
    );
    expect(svg).toContain(
      '<feComposite in="highlight-color" in2="highlight-mask" operator="in" result="inner-highlight"/>',
    );
    expect(svg).not.toContain('class="engraving-highlight"');
  });

  it("uses the existing d20's thin facet borders", () => {
    const svg = composeD20AppearanceSvg(request);

    expect(svg).toContain(
      'stroke="#000000" stroke-width="3" stroke-linejoin="round"',
    );
    expect(svg).toContain(
      'points="300,45 515,175 520,430 300,555 80,430 85,175" fill="none" stroke="#000000" stroke-width="3"',
    );
  });

  it("uses one consistent pattern across every visible face", () => {
    const svg = composeD20AppearanceSvg(request);
    const faceFills = Array.from(
      svg.matchAll(/class="face" fill="([^"]+)"/g),
      (match) => match[1],
    );

    expect(svg.match(/<pattern /g)).toHaveLength(1);
    expect(faceFills).toHaveLength(10);
    expect(new Set(faceFills).size).toBe(1);
    expect(faceFills[0]).toBe("url(#pattern_checkerboard_301934_d4af37)");
    expect(svg).not.toContain("_face-");
  });

  it("marks standalone six and nine labels and adds a critical outline glow", () => {
    const svg = composeD20AppearanceSvg(request);

    expect(visibleFaceMarkup(svg, 6)).toContain(
      'data-orientation-mark="true"',
    );
    expect(visibleFaceMarkup(svg, 9)).toContain(
      'data-orientation-mark="true"',
    );
    expect(visibleFaceMarkup(svg, 16)).not.toContain(
      'data-orientation-mark="true"',
    );
    expect(svg).toContain('data-effect="critical-success"');
    expect(svg).toContain("#ffcc00");
    expect(svg).toContain("feGaussianBlur");
  });

  it("composes every V3 material and lighting layer on the existing d20", () => {
    const combined = composeD20AppearanceSvgV3({
      ...appearanceV3,
      result: 20,
      surface: {
        type: "gradient",
        colors: ["#5426a8", "#c93ee8", "#f2d95c"],
        scope: "die-wide",
        direction: "lower-left-to-upper-right",
      },
      lighting: {
        mode: "combined",
        strength: "strong",
        direction: "top",
      },
      requiresLocalSeparation: true,
    });
    const none = composeD20AppearanceSvgV3({
      ...appearanceV3,
      result: 20,
      surface: { type: "solid", color: "#5426a8" },
      lighting: { mode: "none" },
    });
    const pattern = composeD20AppearanceSvgV3({
      ...appearanceV3,
      result: 20,
      surface: {
        type: "pattern",
        pattern: "checkerboard",
        primaryColor: "#5426a8",
        secondaryColor: "#c93ee8",
      },
      lighting: { mode: "facet", strength: "subtle" },
    });

    expect(combined.match(/data-face-value=/g)).toHaveLength(10);
    expect(combined.match(/data-lighting-layer="facet"/g)).toHaveLength(4);
    expect(combined).toContain(`opacity="${String(0.11 * (5 / 3))}"`);
    expect(combined).toContain(`opacity="${String(0.18 * (5 / 3))}"`);
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
    expect(none.match(/class="face" fill="#5426a8"/g)).toHaveLength(10);
    expect(none).not.toContain("data-lighting-layer");
    expect(pattern.match(/<pattern /g)).toHaveLength(1);
    expect(pattern.match(/data-lighting-layer="facet"/g)).toHaveLength(4);
  });

  it("preserves exact V2 Facet/Subtle and local-separation pixels", async () => {
    const v2 = composeD20AppearanceSvgWithOptions(
      {
        ...request,
        primaryColor: "#5426a8",
        secondaryColor: "#c93ee8",
        textColor: "#faf9f6",
        fill: { type: "gradient" },
        fontId: "liberation-sans",
        effect: null,
      },
      { localSeparation: true },
    );
    const v3 = composeD20AppearanceSvgV3({
      ...appearanceV3,
      result: 20,
      requiresLocalSeparation: true,
    });

    expect(v3).not.toContain("data-facet-compositor");
    expect(await renderComposedSvgToPng(v3)).toEqual(
      await renderComposedSvgToPng(v2),
    );
  });

  it("is byte-stable for the approved d20 fixture", async () => {
    expect(await sha256(composeD20AppearanceSvg(request))).toBe(
      "a10203a5dfb74a0a31a7329ebfe9c9cd335b7bf587e673588a4d4cc1bce0b65d",
    );
  });

  it("rasterizes distinct output for every embedded font", async () => {
    const hashes: string[] = [];
    for (const fontId of APPEARANCE_FONT_IDS) {
      const png = await renderD20AppearanceToPng({
        ...request,
        effect: null,
        fill: { type: "gradient" },
        fontId,
      });
      expect(hasPngSignature(png)).toBe(true);
      expect(png.byteLength).toBeGreaterThan(1_000);
      hashes.push(await sha256(png));
    }
    expect(new Set(hashes).size).toBe(APPEARANCE_FONT_IDS.length);
  });

  it("rejects results outside a d20", () => {
    expect(() => composeD20AppearanceSvg({ ...request, result: 21 })).toThrow(
      "D20 appearance result must be from 1 through 20",
    );
  });

  it("rejects a configurable border color", () => {
    expect(() =>
      composeD20AppearanceSvg({ ...request, outlineColor: "#ffffff" }),
    ).toThrow("D20 outline color must be #000000");
  });

  it("rejects unknown request and fill fields", () => {
    expect(() =>
      composeD20AppearanceSvg({ ...request, rawSvg: "<script/>" }),
    ).toThrow("D20 appearance request has invalid fields");
    expect(() =>
      composeD20AppearanceSvg({
        ...request,
        fill: { type: "solid", rawSvg: "<script/>" },
      }),
    ).toThrow("D20 appearance fill is invalid");
  });
});
