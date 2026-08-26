import { describe, expect, it } from "vitest";
import {
  createAppearanceTreatmentV3,
} from "../../packages/dice-svg/src/appearanceV3";
import { composeRenderedDiceGrid } from "../../packages/dice-svg/src/compose";
import {
  APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES,
  APPEARANCE_GENTLE_LIGHTING_MULTIPLIER,
  APPEARANCE_STRONG_LIGHTING_MULTIPLIER,
  composeAppearanceLayerStackV3,
  composeFacetLightingOverlayV3,
  resolveLightingLayersV3,
} from "../../packages/dice-svg/src/lightingV3";
import type {
  RenderLightingDirectionV3,
  RenderLightingStrengthV3,
  RenderLightingV3,
} from "../../packages/dice-svg/src/types";

const DIRECTIONS = [
  "top",
  "upper-left",
  "upper-right",
  "left",
  "right",
] as const satisfies readonly RenderLightingDirectionV3[];

const VECTORS = {
  top: 'x1="300" y1="70" x2="300" y2="545"',
  "upper-left": 'x1="90" y1="70" x2="520" y2="545"',
  "upper-right": 'x1="510" y1="70" x2="80" y2="545"',
  left: 'x1="70" y1="300" x2="545" y2="300"',
  right: 'x1="530" y1="300" x2="55" y2="300"',
} satisfies Record<RenderLightingDirectionV3, string>;

function directional(
  direction: RenderLightingDirectionV3 = "upper-left",
  strength: RenderLightingStrengthV3 = "subtle",
  mode: "directional" | "combined" = "directional",
): RenderLightingV3 {
  return { mode, strength, direction };
}

describe("V3 lighting composition", () => {
  it("resolves None, Facet, Directional, and Combined into active layers", () => {
    expect(resolveLightingLayersV3({ mode: "none" })).toEqual({
      facetStrength: null,
      directional: null,
    });
    expect(
      resolveLightingLayersV3({ mode: "facet", strength: "strong" }),
    ).toEqual({ facetStrength: "strong", directional: null });

    const directionalLayers = resolveLightingLayersV3(directional());
    expect(directionalLayers.facetStrength).toBeNull();
    expect(directionalLayers.directional?.value).toContain("url(#");

    const combined = resolveLightingLayersV3(
      directional("right", "strong", "combined"),
    );
    expect(combined.facetStrength).toBe("strong");
    expect(combined.directional?.definition).toContain(
      'data-lighting-strength="strong"',
    );
  });

  it("uses every approved directional vector", () => {
    for (const direction of DIRECTIONS) {
      const vector = VECTORS[direction];
      const layer = resolveLightingLayersV3(
        directional(direction),
      ).directional;
      expect(layer?.definition).toContain(
        `gradientUnits="userSpaceOnUse" ${vector}`,
      );
    }
  });

  it("adds Gentle without changing the approved Subtle and Strong endpoints", () => {
    expect(APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES).toEqual({
      gentle: { highlight: 0.03, shadow: 0.04 },
      subtle: { highlight: 0.2, shadow: 0.3 },
      strong: { highlight: 0.34, shadow: 0.5 },
    });
    expect(APPEARANCE_GENTLE_LIGHTING_MULTIPLIER).toBe(0.2);
    expect(APPEARANCE_STRONG_LIGHTING_MULTIPLIER).toBe(5 / 3);

    for (const strength of ["gentle", "subtle", "strong"] as const) {
      const opacities = APPEARANCE_DIRECTIONAL_LIGHTING_OPACITIES[strength];
      expect(opacities.highlight).toBeGreaterThanOrEqual(0);
      expect(opacities.highlight).toBeLessThanOrEqual(1);
      expect(opacities.shadow).toBeGreaterThanOrEqual(0);
      expect(opacities.shadow).toBeLessThanOrEqual(1);
      const definition = resolveLightingLayersV3(
        directional("upper-left", strength),
      ).directional?.definition;
      expect(definition).toContain(
        `<stop offset="0%" stop-color="#ffffff" stop-opacity="${String(opacities.highlight)}"/>`,
      );
      expect(definition).toContain(
        '<stop offset="44%" stop-color="#ffffff" stop-opacity="0"/>',
      );
      expect(definition).toContain(
        '<stop offset="56%" stop-color="#000000" stop-opacity="0"/>',
      );
      expect(definition).toContain(
        `<stop offset="100%" stop-color="#000000" stop-opacity="${String(opacities.shadow)}"/>`,
      );
      expect(definition).not.toContain("mix-blend-mode");
    }
  });

  it("adds Gentle facet opacity without changing Subtle or Strong", () => {
    const shade = { color: "#000000" as const, opacity: 0.14 };
    expect(
      composeFacetLightingOverlayV3("0,0 10,0 0,10", shade, "gentle"),
    ).toContain(`opacity="${String(0.14 * 0.2)}"`);
    expect(
      composeFacetLightingOverlayV3("0,0 10,0 0,10", shade, "subtle"),
    ).toContain('opacity="0.14"');
    expect(
      composeFacetLightingOverlayV3("0,0 10,0 0,10", shade, "strong"),
    ).toContain(`opacity="${String(0.14 * (5 / 3))}"`);
    expect(
      composeFacetLightingOverlayV3("0,0 10,0 0,10", null, "strong"),
    ).toBe("");
    expect(() =>
      composeFacetLightingOverlayV3(
        "0,0 10,0 0,10",
        { color: "#ffffff", opacity: 0.7 },
        "strong",
      ),
    ).toThrow("Strong facet lighting opacity must not exceed one");
  });

  it("composes the approved visual layer order", () => {
    expect(
      composeAppearanceLayerStackV3({
        material: "<material/>",
        facet: "<facet/>",
        directional: "<directional/>",
        localSeparation: "<local-separation/>",
        borders: "<borders/>",
        labels: "<labels/>",
      }),
    ).toBe(
      "<material/>\n<facet/>\n<directional/>\n<local-separation/>\n<borders/>\n<labels/>",
    );
  });

  it("combines material and lighting definitions for renderer consumers", () => {
    const treatment = createAppearanceTreatmentV3({
      surface: {
        type: "gradient",
        colors: ["#123456", "#abcdef"],
        scope: "die-wide",
        direction: "left-to-right",
      },
      lighting: directional("right", "strong", "combined"),
    });

    expect(treatment.definitions.indexOf("appearance-gradient-v3")).toBeLessThan(
      treatment.definitions.indexOf("appearance-directional-light-v3"),
    );
    expect(treatment.materialFill).toContain("appearance-gradient-v3");
    expect(treatment.facetStrength).toBe("strong");
    expect(treatment.directionalFill).toContain(
      "appearance-directional-light-v3",
    );
  });

  it("namespaces directional IDs and references independently per die", () => {
    const directionalLayer = resolveLightingLayersV3(
      directional("upper-left", "subtle"),
    ).directional;
    if (directionalLayer === null) {
      throw new Error("Directional lighting fixture is missing");
    }
    const svg = `<svg viewBox="0 0 600 600"><defs>${directionalLayer.definition}</defs><polygon points="0,0 600,0 600,600 0,600" fill="${directionalLayer.value}"/></svg>`;
    const composed = composeRenderedDiceGrid([[
      { svg, icons: [], target: "d20" },
      { svg, icons: [], target: "d20" },
    ]]).svg;
    const id = "appearance-directional-light-v3_subtle_upper-left";

    expect(composed).toContain(`id="dw-die-0-${id}"`);
    expect(composed).toContain(`fill="url(#dw-die-0-${id})"`);
    expect(composed).toContain(`id="dw-die-1-${id}"`);
    expect(composed).toContain(`fill="url(#dw-die-1-${id})"`);
    expect(composed).not.toContain(`fill="url(#${id})"`);
  });
});
