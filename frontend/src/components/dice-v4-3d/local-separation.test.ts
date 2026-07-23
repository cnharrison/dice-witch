import {
  parsePublicRenderModelV4,
  type RenderAppearanceV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/d20-r3.json";
import {
  THREE_LOCAL_SEPARATION_OPACITY_V4,
  createThreeLocalSeparationMaterialV4,
  resolveThreeLocalSeparationPolicyV4,
} from "./local-separation";

const sourceAppearance = parsePublicRenderModelV4(fixture).groups[0]?.[0]
  ?.appearance;
if (sourceAppearance === undefined) {
  throw new Error("Local-separation fixture is empty");
}

function appearance(
  color: string,
  finish: RenderAppearanceV4["engraving"]["finish"],
  required = true,
): RenderAppearanceV4 {
  return {
    ...sourceAppearance,
    requiresLocalSeparation: required,
    engraving: { ...sourceAppearance.engraving, color, finish },
  };
}

describe("V4 Three.js local separation", () => {
  it("uses the CanvasKit 60% opposite-ink physical overlay policy", () => {
    expect(THREE_LOCAL_SEPARATION_OPACITY_V4).toBe(0.6);
    expect(
      resolveThreeLocalSeparationPolicyV4(
        appearance("#101010", "matte-ink"),
      ),
    ).toEqual({ color: "#ffffff", opacity: 0.6 });
    expect(
      resolveThreeLocalSeparationPolicyV4(
        appearance("#f0f0f0", "matte-ink"),
      ),
    ).toEqual({ color: "#000000", opacity: 0.6 });
    expect(
      resolveThreeLocalSeparationPolicyV4(appearance("#f0f0f0", "void")),
    ).toEqual({ color: "#ffffff", opacity: 0.6 });
  });

  it("creates a lighting-independent disposable overlay only when required", () => {
    expect(
      createThreeLocalSeparationMaterialV4(
        appearance("#f0f0f0", "matte-ink", false),
      ),
    ).toBeNull();

    const material = createThreeLocalSeparationMaterialV4(
      appearance("#f0f0f0", "matte-ink"),
    );
    expect(material).toMatchObject({
      name: "dice-v4-local-separation-black",
      opacity: 0.6,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    });
    material?.dispose();
  });

  it("fails closed for an invalid engraving color", () => {
    expect(() =>
      resolveThreeLocalSeparationPolicyV4(appearance("white", "matte-ink")),
    ).toThrow("Three.js V4 local-separation engraving color is invalid");
  });
});
