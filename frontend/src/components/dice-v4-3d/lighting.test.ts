import { describe, expect, it, vi } from "vitest";
import {
  createThreeLightingResourcesV4,
  disposeThreeLightingResourcesV4,
  resolveThreeLightingPolicyV4,
} from "./lighting";

describe("V4 Three.js lighting policy", () => {
  it("maps every lighting mode without erasing intrinsic form", () => {
    expect(resolveThreeLightingPolicyV4({ mode: "none" }, "classic")).toEqual({
      ambientIntensity: 1.1,
      hemisphereIntensity: 0.72,
      keyIntensity: 0,
      rimIntensity: 0,
      keyPosition: [0, 6, 5],
      rimPosition: [0, 1.5, -5],
    });
    expect(
      resolveThreeLightingPolicyV4(
        { mode: "facet", strength: "gentle" },
        "classic",
      ),
    ).toEqual({
      ambientIntensity: 0.78,
      hemisphereIntensity: 0.38 * 1.15,
      keyIntensity: 1.2 * 0.58,
      rimIntensity: 0,
      keyPosition: [0, 4, 6],
      rimPosition: [0, 1.5, -6],
    });
    expect(
      resolveThreeLightingPolicyV4(
        { mode: "directional", strength: "subtle", direction: "right" },
        "classic",
      ),
    ).toEqual({
      ambientIntensity: 0.72,
      hemisphereIntensity: 0.34559999999999996,
      keyIntensity: 1.75,
      rimIntensity: 0,
      keyPosition: [6, 0, 5],
      rimPosition: [-6, 1.5, -5],
    });
    expect(
      resolveThreeLightingPolicyV4(
        { mode: "combined", strength: "strong", direction: "upper-left" },
        "classic",
      ),
    ).toEqual({
      ambientIntensity: 0.62,
      hemisphereIntensity: 0.58 * 0.82,
      keyIntensity: 2.4,
      rimIntensity: 0.44,
      keyPosition: [-5, 5, 5],
      rimPosition: [5, 1.75, -5],
    });
  });

  it("preserves shared material highlight, shadow, and rim response", () => {
    const lighting = {
      mode: "combined",
      strength: "subtle",
      direction: "upper-right",
    } as const;
    const glass = resolveThreeLightingPolicyV4(lighting, "glass");
    const wood = resolveThreeLightingPolicyV4(lighting, "wood");
    expect(glass.keyIntensity).toBeGreaterThan(wood.keyIntensity);
    expect(glass.rimIntensity).toBeGreaterThan(wood.rimIntensity);
    expect(glass.ambientIntensity).toBeGreaterThan(wood.ambientIntensity);
  });

  it("creates and disposes only the directional lights a mode needs", () => {
    const none = createThreeLightingResourcesV4({ mode: "none" }, "classic");
    expect(none.group.children).toHaveLength(2);
    expect(none.directionalLights).toHaveLength(0);
    disposeThreeLightingResourcesV4(none);
    expect(none.group.children).toHaveLength(0);

    const combined = createThreeLightingResourcesV4(
      { mode: "combined", strength: "gentle", direction: "upper-left" },
      "glass",
    );
    expect(combined.group.children).toHaveLength(4);
    expect(combined.directionalLights).toHaveLength(2);
    const dispose = vi.spyOn(combined.directionalLights[0]!, "dispose");
    disposeThreeLightingResourcesV4(combined);
    expect(dispose).toHaveBeenCalledOnce();
    expect(combined.group.children).toHaveLength(0);
  });
});
