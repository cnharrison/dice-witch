import {
  CRITICAL_TREATMENTS_V4,
  type CriticalTreatmentV4,
  type RenderCriticalEffectV4,
} from "@dice-witch/dice-v4-model";
import * as z from "zod";
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";

const HEX_COLOR_V4 = /^#[0-9a-fA-F]{6}$/;
const criticalTreatmentSchema = z.enum(CRITICAL_TREATMENTS_V4);
const criticalStateSchema = z.enum(["critical-success", "critical-failure"]);

export type RenderCriticalEffectInputV4 = {
  state: string;
  treatment: string;
  color: string;
  intensity: number;
};

const SURFACE_EFFECT_VERTEX_SHADER_V4 = `
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vLocalPosition = position;
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const SURFACE_EFFECT_FRAGMENT_SHADER_V4 = `
  uniform vec3 effectColor;
  uniform float effectIntensity;
  uniform float effectMode;
  varying vec3 vLocalPosition;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  void main() {
    float facing = max(dot(normalize(vViewNormal), normalize(vViewDirection)), 0.0);
    float rim = pow(1.0 - facing, 2.2);
    vec2 flareCenter = vec2(-0.28, 0.24);
    float flare = exp(-7.5 * distance(vLocalPosition.xy, flareCenter));
    float ray = max(
      exp(-45.0 * abs(vLocalPosition.x - flareCenter.x)),
      exp(-45.0 * abs(vLocalPosition.y - flareCenter.y))
    );
    float latitude = smoothstep(0.9, 1.0, abs(sin(vLocalPosition.y * 15.0)));
    float longitude = smoothstep(
      0.9,
      1.0,
      abs(sin(atan(vLocalPosition.z, vLocalPosition.x) * 6.0))
    );
    float lattice = max(latitude, longitude) * (0.35 + rim * 0.65);
    float treatmentAlpha = flare + ray * 0.42;
    if (effectMode > 0.5 && effectMode < 1.5) treatmentAlpha = rim;
    if (effectMode > 1.5) treatmentAlpha = lattice;
    float alpha = clamp(
      treatmentAlpha * (0.2 + effectIntensity * 0.58),
      0.0,
      0.82
    );
    gl_FragColor = vec4(effectColor, alpha);
  }
`;

const STATE_ACCENT_FRAGMENT_SHADER_V4 = `
  uniform vec3 effectColor;
  uniform float effectIntensity;
  uniform float effectState;
  varying vec3 vLocalPosition;

  void main() {
    float successVertical = smoothstep(
      0.94,
      1.0,
      abs(sin(vLocalPosition.x * 19.0))
    );
    float successHorizontal = smoothstep(
      0.94,
      1.0,
      abs(sin(vLocalPosition.y * 19.0))
    );
    float successAccent = min(successVertical, successHorizontal);
    float failurePrimary = smoothstep(
      0.96,
      1.0,
      abs(sin((vLocalPosition.x - vLocalPosition.y) * 23.0))
    );
    float failureBranch = smoothstep(
      0.975,
      1.0,
      abs(sin((vLocalPosition.x * 0.7 + vLocalPosition.y) * 31.0))
    );
    float failureAccent = max(failurePrimary, failureBranch * 0.55);
    float accent = mix(failureAccent, successAccent, step(0.0, effectState));
    float alpha = accent * (0.06 + effectIntensity * 0.18);
    gl_FragColor = vec4(effectColor, alpha);
  }
`;

type ThreeCriticalGeometryV4 = {
  base: BufferGeometry;
  labels: BufferGeometry;
  labelTexture: Texture;
  edgeMaterial: LineBasicMaterial | null;
};

export type ThreeCriticalEffectResourcesV4 = {
  group: Group;
  materials: Material[];
  treatment: CriticalTreatmentV4 | null;
  state: RenderCriticalEffectV4["state"] | null;
  intensity: number;
  objectCount: number;
};

function validateEffectV4(
  effect: RenderCriticalEffectInputV4,
): asserts effect is RenderCriticalEffectV4 {
  if (!criticalTreatmentSchema.safeParse(effect.treatment).success) {
    throw new Error(
      `Three.js V4 critical effect treatment is invalid: ${String(effect.treatment)}`,
    );
  }
  if (!criticalStateSchema.safeParse(effect.state).success) {
    throw new Error("Three.js V4 critical effect state is invalid");
  }
  if (!HEX_COLOR_V4.test(effect.color)) {
    throw new Error("Three.js V4 critical effect color is invalid");
  }
  if (
    !Number.isFinite(effect.intensity) ||
    effect.intensity < 0 ||
    effect.intensity > 100
  ) {
    throw new Error("Three.js V4 critical effect intensity is invalid");
  }
}

function configureOverlayMaterialV4<MaterialType extends Material>(
  material: MaterialType,
  name: string,
): MaterialType {
  material.name = name;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  material.toneMapped = false;
  material.transparent = true;
  return material;
}

function createSurfaceEffectMaterialV4(
  effect: RenderCriticalEffectV4,
  intensity: number,
  mode: 0 | 1 | 2,
): ShaderMaterial {
  return configureOverlayMaterialV4(
    new ShaderMaterial({
      blending: AdditiveBlending,
      fragmentShader: SURFACE_EFFECT_FRAGMENT_SHADER_V4,
      uniforms: {
        effectColor: { value: new Color(effect.color) },
        effectIntensity: { value: intensity },
        effectMode: { value: mode },
      },
      vertexShader: SURFACE_EFFECT_VERTEX_SHADER_V4,
    }),
    `dice-v4-critical-${effect.treatment}`,
  );
}

function createStateAccentMaterialV4(
  effect: RenderCriticalEffectV4,
  intensity: number,
): ShaderMaterial {
  return configureOverlayMaterialV4(
    new ShaderMaterial({
      blending: AdditiveBlending,
      fragmentShader: STATE_ACCENT_FRAGMENT_SHADER_V4,
      uniforms: {
        effectColor: { value: new Color(effect.color) },
        effectIntensity: { value: intensity },
        effectState: {
          value: effect.state === "critical-success" ? 1 : -1,
        },
      },
      vertexShader: SURFACE_EFFECT_VERTEX_SHADER_V4,
    }),
    `dice-v4-critical-${effect.treatment}-state`,
  );
}

function addSurfaceEffectV4(
  resources: ThreeCriticalEffectResourcesV4,
  geometry: BufferGeometry,
  material: Material,
): void {
  resources.materials.push(material);
  const mesh = new Mesh(geometry, material);
  mesh.name = `dice-v4-critical-${resources.treatment ?? "none"}`;
  mesh.renderOrder = 0.75;
  resources.group.add(mesh);
}

function addStateAccentV4(
  resources: ThreeCriticalEffectResourcesV4,
  geometry: BufferGeometry,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const material = createStateAccentMaterialV4(effect, intensity);
  resources.materials.push(material);
  const accent = new Mesh(geometry, material);
  accent.name = `dice-v4-critical-${effect.treatment}-state`;
  accent.renderOrder = 0.9;
  resources.group.add(accent);
}

function applyEdgeEffectV4(
  material: LineBasicMaterial,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  material.name = `dice-v4-critical-${effect.treatment}`;
  material.color.set(effect.color);
  material.opacity = Math.min(1, 0.64 + intensity * 0.32);
  material.toneMapped = false;
}

function addClassicGlowV4(
  resources: ThreeCriticalEffectResourcesV4,
  geometry: BufferGeometry,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const material = configureOverlayMaterialV4(
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: effect.color,
      opacity: 0.12 + intensity * 0.24,
      side: BackSide,
    }),
    "dice-v4-critical-classic-glow",
  );
  resources.materials.push(material);
  const glow = new Mesh(geometry, material);
  glow.name = "dice-v4-critical-classic-glow";
  glow.renderOrder = 0.25;
  glow.scale.setScalar(1.025 + intensity * 0.025);
  resources.group.add(glow);
}

function addEngravingBurnV4(
  resources: ThreeCriticalEffectResourcesV4,
  geometry: BufferGeometry,
  texture: Texture,
  effect: RenderCriticalEffectV4,
  intensity: number,
): void {
  const material = configureOverlayMaterialV4(
    new MeshBasicMaterial({
      alphaTest: 0.02,
      blending: AdditiveBlending,
      color: effect.color,
      map: texture,
      opacity: 0.3 + intensity * 0.48,
    }),
    "dice-v4-critical-engraving-burn",
  );
  resources.materials.push(material);
  const burn = new Mesh(geometry, material);
  burn.name = "dice-v4-critical-engraving-burn";
  burn.renderOrder = 3;
  resources.group.add(burn);
}

export function createThreeCriticalEffectResourcesV4(
  geometry: ThreeCriticalGeometryV4,
  effect: RenderCriticalEffectInputV4 | null,
): ThreeCriticalEffectResourcesV4 {
  const resources: ThreeCriticalEffectResourcesV4 = {
    group: new Group(),
    materials: [],
    treatment: effect?.treatment ?? null,
    state: effect?.state ?? null,
    intensity: 0,
    objectCount: 0,
  };
  resources.group.name = "dice-v4-critical-effect";
  if (effect === null) return resources;

  validateEffectV4(effect);
  const intensity = effect.intensity / 100;
  resources.intensity = intensity;
  if (intensity === 0) return resources;

  switch (effect.treatment) {
    case "classic-glow":
      addClassicGlowV4(resources, geometry.base, effect, intensity);
      break;
    case "internal-flare":
      addSurfaceEffectV4(
        resources,
        geometry.base,
        createSurfaceEffectMaterialV4(effect, intensity, 0),
      );
      break;
    case "spectral-rim":
      addSurfaceEffectV4(
        resources,
        geometry.base,
        createSurfaceEffectMaterialV4(effect, intensity, 1),
      );
      break;
    case "metal-edge":
      if (geometry.edgeMaterial === null) {
        addSurfaceEffectV4(
          resources,
          geometry.base,
          createSurfaceEffectMaterialV4(effect, intensity, 1),
        );
      } else {
        applyEdgeEffectV4(geometry.edgeMaterial, effect, intensity);
      }
      break;
    case "engraving-burn":
      addEngravingBurnV4(
        resources,
        geometry.labels,
        geometry.labelTexture,
        effect,
        intensity,
      );
      break;
    case "inner-cage":
      if (geometry.edgeMaterial === null) {
        addSurfaceEffectV4(
          resources,
          geometry.base,
          createSurfaceEffectMaterialV4(effect, intensity, 2),
        );
      } else {
        applyEdgeEffectV4(geometry.edgeMaterial, effect, intensity);
      }
      break;
    default:
      throw new Error(
        `Three.js V4 critical effect treatment is invalid: ${String(effect.treatment)}`,
      );
  }
  addStateAccentV4(resources, geometry.base, effect, intensity);
  resources.objectCount = resources.group.children.length;
  return resources;
}
