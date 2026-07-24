import {
  createEngravingLayerRecipeV4,
  type RenderAppearanceV4,
} from "@dice-witch/dice-v4-model";
import { MeshBasicMaterial } from "three";

export const THREE_LOCAL_SEPARATION_OPACITY_V4 = 0.6;

export type ThreeLocalSeparationPolicyV4 = {
  color: "#000000" | "#ffffff";
  opacity: number;
};

function colorComponentsV4(
  color: string,
): readonly [red: number, green: number, blue: number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error("Three.js V4 local-separation engraving color is invalid");
  }
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

export function resolveThreeLocalSeparationPolicyV4(
  appearance: RenderAppearanceV4,
): ThreeLocalSeparationPolicyV4 | null {
  if (!appearance.requiresLocalSeparation) return null;
  const [red, green, blue] = colorComponentsV4(
    appearance.engraving.color,
  );
  const [inkRed, inkGreen, inkBlue] = createEngravingLayerRecipeV4(
    appearance.engraving.finish,
    red,
    green,
    blue,
  ).ink;
  const brightness =
    inkRed * 0.2126 + inkGreen * 0.7152 + inkBlue * 0.0722;
  return {
    color: brightness < 0.5 ? "#ffffff" : "#000000",
    opacity: THREE_LOCAL_SEPARATION_OPACITY_V4,
  };
}

export function createThreeLocalSeparationMaterialV4(
  appearance: RenderAppearanceV4,
): MeshBasicMaterial | null {
  const policy = resolveThreeLocalSeparationPolicyV4(appearance);
  if (policy === null) return null;
  const material = new MeshBasicMaterial({
    color: policy.color,
    depthWrite: false,
    opacity: policy.opacity,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    transparent: true,
  });
  material.name = `dice-v4-local-separation-${policy.color === "#ffffff" ? "white" : "black"}`;
  material.toneMapped = false;
  return material;
}
