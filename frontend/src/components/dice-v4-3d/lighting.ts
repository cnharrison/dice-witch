import {
  materialLightResponseV4,
  type MaterialFamilyV4,
  type RenderLightingV4,
} from "@dice-witch/dice-v4-model";
import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
} from "three";

export type ThreeLightingPolicyV4 = {
  ambientIntensity: number;
  hemisphereIntensity: number;
  keyIntensity: number;
  rimIntensity: number;
  keyPosition: readonly [number, number, number];
  rimPosition: readonly [number, number, number];
};

export type ThreeLightingResourcesV4 = {
  group: Group;
  directionalLights: DirectionalLight[];
  policy: ThreeLightingPolicyV4;
};

const LIGHT_DIRECTION_POSITIONS_V4 = Object.freeze({
  top: [0, 6, 5],
  "upper-left": [-5, 5, 5],
  "upper-right": [5, 5, 5],
  left: [-6, 0, 5],
  right: [6, 0, 5],
} as const);

const LIGHT_STRENGTHS_V4 = Object.freeze({
  gentle: { key: 1.2, rim: 0.18, hemisphere: 0.38 },
  subtle: { key: 1.75, rim: 0.3, hemisphere: 0.48 },
  strong: { key: 2.4, rim: 0.44, hemisphere: 0.58 },
});

function oppositeLightPositionV4(
  position: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    position[0] === 0 ? 0 : -position[0],
    Math.max(1.5, position[1] * 0.35),
    -position[2],
  ];
}

export function resolveThreeLightingPolicyV4(
  lighting: RenderLightingV4,
  family: MaterialFamilyV4,
): ThreeLightingPolicyV4 {
  const response = materialLightResponseV4(family);
  if (lighting.mode === "none") {
    return {
      ambientIntensity: 1.1 / (0.9 + response.shadow * 0.1),
      hemisphereIntensity: 0.72,
      keyIntensity: 0,
      rimIntensity: 0,
      keyPosition: [0, 6, 5],
      rimPosition: [0, 1.5, -5],
    };
  }

  const strength = LIGHT_STRENGTHS_V4[lighting.strength];
  const keyPosition =
    lighting.mode === "facet"
      ? ([0, 4, 6] as const)
      : LIGHT_DIRECTION_POSITIONS_V4[lighting.direction];
  const highlightResponse = 0.72 + response.highlight * 0.28;
  const shadowResponse = 0.9 + response.shadow * 0.1;
  if (lighting.mode === "facet") {
    return {
      ambientIntensity: 0.78 / shadowResponse,
      hemisphereIntensity: strength.hemisphere * 1.15,
      keyIntensity: strength.key * 0.58 * highlightResponse,
      rimIntensity: 0,
      keyPosition,
      rimPosition: oppositeLightPositionV4(keyPosition),
    };
  }
  if (lighting.mode === "directional") {
    return {
      ambientIntensity: 0.72 / shadowResponse,
      hemisphereIntensity: strength.hemisphere * 0.72,
      keyIntensity: strength.key * highlightResponse,
      rimIntensity: 0,
      keyPosition,
      rimPosition: oppositeLightPositionV4(keyPosition),
    };
  }
  return {
    ambientIntensity: 0.62 / shadowResponse,
    hemisphereIntensity: strength.hemisphere * 0.82,
    keyIntensity: strength.key * highlightResponse,
    rimIntensity: strength.rim * response.rim,
    keyPosition,
    rimPosition: oppositeLightPositionV4(keyPosition),
  };
}

export function createThreeLightingResourcesV4(
  lighting: RenderLightingV4,
  family: MaterialFamilyV4,
): ThreeLightingResourcesV4 {
  const policy = resolveThreeLightingPolicyV4(lighting, family);
  const group = new Group();
  group.name = `dice-v4-lighting-${lighting.mode}`;
  group.add(new AmbientLight(0xff_f4_df, policy.ambientIntensity));
  group.add(
    new HemisphereLight(
      0xff_fb_ee,
      0x24_14_2e,
      policy.hemisphereIntensity,
    ),
  );
  const directionalLights: DirectionalLight[] = [];
  if (policy.keyIntensity > 0) {
    const key = new DirectionalLight(0xff_ff_ff, policy.keyIntensity);
    key.position.set(...policy.keyPosition);
    group.add(key);
    directionalLights.push(key);
  }
  if (policy.rimIntensity > 0) {
    const rim = new DirectionalLight(0xf2_e4_ff, policy.rimIntensity);
    rim.position.set(...policy.rimPosition);
    group.add(rim);
    directionalLights.push(rim);
  }
  return { group, directionalLights, policy };
}

export function disposeThreeLightingResourcesV4(
  resources: ThreeLightingResourcesV4,
): void {
  resources.group.removeFromParent();
  resources.directionalLights.forEach((light) => light.dispose());
  resources.group.clear();
}
