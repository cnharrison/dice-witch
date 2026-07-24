import { describe, expect, it } from "vitest";
import {
  composeD6AppearanceSvg,
  composeD6AppearanceSvgV3,
  getD6VisibleFaceValues,
  renderComposedSvgToPng,
  renderD6AppearanceToPng,
  type D6AppearanceRequest,
  type RenderAppearanceV3,
} from "../../packages/dice-svg/src";
import { composeD6AppearanceSvgWithOptions } from "../../packages/dice-svg/src/dice/generateD6Appearance";

const request: D6AppearanceRequest = {
  result: 6,
  primaryColor: "#5426a8",
  secondaryColor: "#c93ee8",
  textColor: "#ffffff",
  outlineColor: "#000000",
  fill: { type: "gradient" },
  fontId: "liberation-sans",
  effect: null,
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

describe("d6 appearance renderer", () => {
  it("uses the existing cube's deterministic adjacent faces", () => {
    expect(getD6VisibleFaceValues(1)).toEqual({ result: 1, top: 3, right: 2 });
    expect(getD6VisibleFaceValues(2)).toEqual({ result: 2, top: 6, right: 4 });
    expect(getD6VisibleFaceValues(3)).toEqual({ result: 3, top: 6, right: 2 });
    expect(getD6VisibleFaceValues(4)).toEqual({ result: 4, top: 1, right: 2 });
    expect(getD6VisibleFaceValues(5)).toEqual({ result: 5, top: 1, right: 4 });
    expect(getD6VisibleFaceValues(6)).toEqual({ result: 6, top: 5, right: 4 });
  });

  it("numbers every visible face with selectable engraved text", () => {
    const svg = composeD6AppearanceSvg(request);

    expect(svg).toContain('data-font-id="liberation-sans"');
    expect(svg).toContain('data-label-slot="result" data-face-value="6"');
    expect(svg).toContain('data-label-slot="top" data-face-value="5"');
    expect(svg).toContain('data-label-slot="right" data-face-value="4"');
    expect(svg.match(/data-face-value=/g)).toHaveLength(3);
    expect(svg).toContain('<filter id="engraved-number"');
    expect(svg).not.toContain('class="text" d=');
  });

  it("uses the original cube's numeral alignment and scale within each facet", () => {
    const svg = composeD6AppearanceSvg(request);

    for (const slot of ["result", "top", "right"]) {
      expect(svg).toContain(`<clipPath id="label-${slot}"`);
      expect(svg).toContain(`clip-path="url(#label-${slot})"`);
    }
    expect(svg).toMatch(
      /data-label-slot="result"[\s\S]*?translate\(270 346\) scale\(1 1\)[\s\S]*?font-size="240"/,
    );
    expect(svg).toMatch(
      /data-label-slot="top"[\s\S]*?translate\(315 128\) scale\(1\.4 0\.28\)[\s\S]*?font-size="160"/,
    );
    expect(svg).toMatch(
      /data-label-slot="right"[\s\S]*?translate\(478 307\) scale\(0\.36 1\)[\s\S]*?font-size="184"/,
    );
  });

  it("keeps the result dominant and uses thin cube borders", () => {
    const svg = composeD6AppearanceSvg(request);
    const resultSize = svg.match(
      /data-face="result"[^>]*font-size="(\d+)"/,
    )?.[1];
    const neighborSizes = Array.from(
      svg.matchAll(/data-face="neighbor"[^>]*font-size="(\d+)"/g),
      (match) => Number(match[1]),
    );

    expect(Number(resultSize)).toBeGreaterThan(Math.max(...neighborSizes));
    expect(svg).toContain(
      'stroke="#000000" stroke-width="3" stroke-linejoin="round"',
    );
  });

  it("uses one consistent pattern across every visible face", () => {
    const svg = composeD6AppearanceSvg({
      ...request,
      fill: { type: "pattern", pattern: "checkerboard" },
    });
    const faceFills = Array.from(
      svg.matchAll(/class="face" fill="([^"]+)"/g),
      (match) => match[1],
    );

    expect(svg.match(/<pattern /g)).toHaveLength(1);
    expect(faceFills).toHaveLength(3);
    expect(new Set(faceFills).size).toBe(1);
    expect(faceFills[0]).toMatch(/^url\(#pattern_checkerboard_/);
    expect(svg).not.toContain("_face-");
  });

  it("marks a standalone six for orientation", () => {
    expect(composeD6AppearanceSvg(request)).toContain(
      'data-orientation-mark="true"',
    );
  });

  it("adds the approved critical outline glow", () => {
    const svg = composeD6AppearanceSvg({
      ...request,
      effect: "critical-success",
    });

    expect(svg).toContain('data-effect="critical-success"');
    expect(svg).toContain("#ffcc00");
  });

  it("composes every V3 material and lighting layer on the existing cube", () => {
    const combined = composeD6AppearanceSvgV3({
      ...appearanceV3,
      result: 6,
      surface: {
        type: "gradient",
        colors: ["#5426a8", "#c93ee8", "#f2d95c"],
        scope: "die-wide",
        direction: "upper-right-to-lower-left",
      },
      lighting: {
        mode: "combined",
        strength: "strong",
        direction: "right",
      },
      requiresLocalSeparation: true,
    });
    const none = composeD6AppearanceSvgV3({
      ...appearanceV3,
      result: 6,
      surface: { type: "solid", color: "#5426a8" },
      lighting: { mode: "none" },
    });
    const pattern = composeD6AppearanceSvgV3({
      ...appearanceV3,
      result: 6,
      surface: {
        type: "pattern",
        pattern: "checkerboard",
        primaryColor: "#5426a8",
        secondaryColor: "#c93ee8",
      },
      lighting: {
        mode: "directional",
        strength: "subtle",
        direction: "left",
      },
    });

    expect(combined.match(/data-face-value=/g)).toHaveLength(3);
    expect(combined).toContain(`opacity="${String(0.12 * (5 / 3))}"`);
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
    expect(none.match(/class="face" fill="#5426a8"/g)).toHaveLength(3);
    expect(none).not.toContain("data-lighting-layer");
    expect(pattern.match(/<pattern /g)).toHaveLength(1);
    expect(pattern).toContain('data-appearance-layer="directional"');
    expect(pattern).not.toContain('data-appearance-layer="facet"');
  });

  it("preserves exact V2 Facet/Subtle and local-separation pixels", async () => {
    const v2 = composeD6AppearanceSvgWithOptions(
      { ...request, textColor: "#faf9f6" },
      { localSeparation: true },
    );
    const v3 = composeD6AppearanceSvgV3({
      ...appearanceV3,
      result: 6,
      requiresLocalSeparation: true,
    });

    expect(v3).not.toContain("data-facet-compositor");
    expect(await renderComposedSvgToPng(v3)).toEqual(
      await renderComposedSvgToPng(v2),
    );
  });

  it.each([
    ["liberation-sans", { type: "gradient" }],
    ["new-rocker", { type: "pattern", pattern: "honeycomb" }],
  ] as const)("rasterizes %s output", async (fontId, fill) => {
    const png = await renderD6AppearanceToPng({ ...request, fill, fontId });

    expect(hasPngSignature(png)).toBe(true);
    expect(png.byteLength).toBeGreaterThan(1_000);
  });

  it("strictly validates the d6 boundary", () => {
    expect(() => composeD6AppearanceSvg({ ...request, result: 7 })).toThrow(
      "D6 appearance result must be from 1 through 6",
    );
    expect(() =>
      composeD6AppearanceSvg({ ...request, rawSvg: "<script/>" }),
    ).toThrow("D6 appearance request has invalid fields");
  });
});
