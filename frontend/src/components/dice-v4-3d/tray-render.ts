import {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from "three";
import type { ThreeDiceGridResourcesV4 } from "./grid-resources";
import {
  TRAY_DIE_RADIUS_V4,
  type TrayBodySnapshotV4,
  type TrayBoundsV4,
  type TrayRotationV4,
  type TrayVectorV4,
} from "./tray-physics";
import type { ThreeDiceGridViewportV4 } from "./grid-layout";

const SMOKE_DURATION_MILLISECONDS_V4 = 360;
const SMOKE_PARTICLE_COUNT_V4 = 6;

export type ThreeTraySmokeV4 = {
  group: Group;
  material: MeshBasicMaterial;
  startedAt: number;
  originY: number;
};

export type ThreeTrayRenderContextV4 = {
  scene: Scene;
  camera: PerspectiveCamera;
  lighting: Group;
  smokeGeometry: SphereGeometry;
  smoke: ThreeTraySmokeV4[];
};

function hashV4(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e37_79b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0_aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a_2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function unitV4(seed: number, salt: number): number {
  return hashV4(seed, salt) / 0x1_0000_0000;
}

export function createThreeTrayRenderContextV4(): ThreeTrayRenderContextV4 {
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  const lighting = new Group();
  lighting.name = "dice-v4-tray-lighting";
  lighting.add(
    new AmbientLight(0xff_f4_e8, 0.86),
    new HemisphereLight(0xff_fb_ee, 0x26_18_31, 0.76),
  );
  const key = new DirectionalLight(0xff_ff_ff, 2.05);
  key.position.set(-4, 8, 6);
  const rim = new DirectionalLight(0xf0_e1_ff, 0.28);
  rim.position.set(5, 3, -5);
  lighting.add(key, rim);
  scene.add(lighting);
  return {
    scene,
    camera,
    lighting,
    smokeGeometry: new SphereGeometry(0.12, 8, 6),
    smoke: [],
  };
}

export function configureThreeTrayCameraV4(
  context: ThreeTrayRenderContextV4,
  width: number,
  height: number,
  bounds: TrayBoundsV4,
): void {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Three.js V4 tray camera dimensions are invalid");
  }
  const aspect = width / height;
  const verticalHalfFov = context.camera.fov * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  const boundingRadius = Math.hypot(
    bounds.halfWidth + TRAY_DIE_RADIUS_V4,
    2.4,
    bounds.halfDepth + TRAY_DIE_RADIUS_V4,
  );
  const distance = boundingRadius / Math.sin(limitingHalfFov);
  const target = new Vector3(0, 1.8, 0);
  const direction = new Vector3(0, 0.72, 0.69).normalize();
  context.camera.aspect = aspect;
  context.camera.position.copy(target).addScaledVector(direction, distance);
  context.camera.up.set(0, 1, 0);
  context.camera.lookAt(target);
  context.camera.far = Math.max(100, distance + boundingRadius * 2);
  context.camera.updateProjectionMatrix();
  context.camera.updateMatrixWorld();
}

export function applyTraySnapshotToGroupV4(
  group: Group,
  snapshot: TrayBodySnapshotV4,
): void {
  const { position, rotation, renderScale } = snapshot;
  group.position.set(position.x, position.y, position.z);
  group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  group.scale.setScalar(renderScale);
}

export function resetTrayGroupTransformV4(group: Group): void {
  group.position.set(0, 0, 0);
  group.scale.setScalar(1);
}

export function traySnapshotViewportV4(
  context: ThreeTrayRenderContextV4,
  snapshot: Pick<TrayBodySnapshotV4, "position">,
  width: number,
  height: number,
): ThreeDiceGridViewportV4 {
  const center = new Vector3(
    snapshot.position.x,
    snapshot.position.y,
    snapshot.position.z,
  ).project(context.camera);
  const edge = new Vector3(
    snapshot.position.x + TRAY_DIE_RADIUS_V4,
    snapshot.position.y,
    snapshot.position.z,
  ).project(context.camera);
  const radiusPixels = Math.max(12, Math.abs(edge.x - center.x) * width / 2);
  const size = Math.round(radiusPixels * 2);
  return {
    x: Math.round((center.x + 1) * width / 2 - radiusPixels),
    y: Math.round((center.y + 1) * height / 2 - radiusPixels),
    width: size,
    height: size,
  };
}

export function addThreeTraySmokeV4(
  context: ThreeTrayRenderContextV4,
  position: TrayVectorV4,
  rotation: TrayRotationV4,
  seed: number,
  now: number,
): void {
  const material = new MeshBasicMaterial({
    color: 0x80_80_80,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const group = new Group();
  group.name = "dice-v4-removal-smoke";
  group.position.set(position.x, position.y, position.z);
  group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  for (let index = 0; index < SMOKE_PARTICLE_COUNT_V4; index += 1) {
    const particle = new Mesh(context.smokeGeometry, material);
    const angle = unitV4(seed, index) * Math.PI * 2;
    const distance = 0.08 + unitV4(seed, index + 17) * 0.2;
    particle.position.set(
      Math.cos(angle) * distance,
      unitV4(seed, index + 31) * 0.18,
      Math.sin(angle) * distance,
    );
    particle.scale.setScalar(0.7 + unitV4(seed, index + 47) * 0.8);
    group.add(particle);
  }
  context.scene.add(group);
  context.smoke.push({ group, material, startedAt: now, originY: position.y });
}

export function updateThreeTraySmokeV4(
  context: ThreeTrayRenderContextV4,
  now: number,
): boolean {
  context.smoke = context.smoke.filter((smoke) => {
    const progress = (now - smoke.startedAt) / SMOKE_DURATION_MILLISECONDS_V4;
    if (progress >= 1) {
      smoke.group.removeFromParent();
      smoke.group.clear();
      smoke.material.dispose();
      return false;
    }
    const bounded = Math.max(0, progress);
    smoke.group.position.y = smoke.originY + bounded * 0.42;
    smoke.group.scale.setScalar(1 + bounded * 1.35);
    smoke.material.opacity = 0.42 * (1 - bounded) ** 1.5;
    return true;
  });
  return context.smoke.length > 0;
}

export function renderThreeTrayV4(
  renderer: WebGLRenderer,
  resources: ThreeDiceGridResourcesV4,
  context: ThreeTrayRenderContextV4,
  width: number,
  height: number,
): void {
  renderer.setScissorTest(false);
  renderer.setClearColor(0x00_00_00, 0);
  renderer.setViewport(0, 0, width, height);
  renderer.clear();
  const groups = resources.entries.map(({ group }) => group);
  context.scene.add(...groups);
  try {
    renderer.render(context.scene, context.camera);
  } finally {
    context.scene.remove(...groups);
  }
}

export function disposeThreeTrayRenderContextV4(
  context: ThreeTrayRenderContextV4,
): void {
  context.smoke.forEach(({ group, material }) => {
    group.removeFromParent();
    group.clear();
    material.dispose();
  });
  context.smoke = [];
  context.smokeGeometry.dispose();
  context.lighting.traverse((object) => {
    if (object instanceof DirectionalLight) object.dispose();
  });
  context.scene.clear();
  context.lighting.clear();
}
