import type {
  GeometryDescriptorV4,
  MaterialFamilyV4,
  PolyhedralGeometryDescriptorV4,
} from "@dice-witch/dice-v4-model";
import {
  ColliderDesc,
  RigidBodyDesc,
  World,
  type Collider,
  type RigidBody,
} from "@dimforge/rapier3d/rapier.js";

export const TRAY_FIXED_STEP_SECONDS_V4 = 1 / 60;
export const TRAY_WALL_CLOCK_LIMIT_MILLISECONDS_V4 = 2_000;
export const TRAY_DIE_RADIUS_V4 = 0.53;

const MAXIMUM_CATCH_UP_STEPS_V4 = 8;
const HIGH_COUNT_THRESHOLD_V4 = 20;

export type TrayVectorV4 = Readonly<{ x: number; y: number; z: number }>;
export type TrayRotationV4 = Readonly<{
  x: number;
  y: number;
  z: number;
  w: number;
}>;

export type TrayDieInputV4 = Readonly<{
  identity: string;
  descriptor: GeometryDescriptorV4;
  materialFamily: MaterialFamilyV4;
  motionSeed: number;
}>;

export type TrayBodySnapshotV4 = Readonly<{
  identity: string;
  handle: number;
  descriptorId: string;
  position: TrayVectorV4;
  rotation: TrayRotationV4;
  linearVelocity: TrayVectorV4;
  angularVelocity: TrayVectorV4;
  renderScale: number;
  sleeping: boolean;
}>;

export type TrayBoundsV4 = Readonly<{
  halfWidth: number;
  halfDepth: number;
}>;

export type TrayReconciliationV4 = Readonly<{
  added: readonly string[];
  retained: readonly string[];
  removed: readonly TrayBodySnapshotV4[];
}>;

export type TrayStepResultV4 = Readonly<{
  moving: boolean;
  fixedSteps: number;
  stoppedByDeadline: boolean;
}>;

export type TrayDiagnosticsV4 = Readonly<{
  rigidBodyCount: number;
  colliderCount: number;
  solverIterations: number;
  activeMotionDeadline: number | null;
}>;

export type TrayPhysicsV4 = {
  reconcile(
    inputs: readonly TrayDieInputV4[],
    now: number,
    reducedMotion: boolean,
  ): TrayReconciliationV4;
  step(now: number, deltaMilliseconds: number): TrayStepResultV4;
  energize(identities: readonly string[] | undefined, now: number): void;
  freeze(): void;
  snapshots(): readonly TrayBodySnapshotV4[];
  snapshot(identity: string): TrayBodySnapshotV4 | undefined;
  bounds(): TrayBoundsV4;
  diagnostics(): TrayDiagnosticsV4;
  dispose(): void;
};

type MaterialPhysicsProfileV4 = Readonly<{
  density: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
}>;

type TrayBodyRecordV4 = {
  identity: string;
  descriptor: GeometryDescriptorV4;
  materialFamily: MaterialFamilyV4;
  motionSeed: number;
  body: RigidBody;
  collider: Collider;
  activateAt: number;
  ccdUntil: number;
  renderScale: number;
};

const MATERIAL_PHYSICS_V4 = Object.freeze({
  classic: {
    density: 1,
    friction: 0.68,
    restitution: 0.18,
    linearDamping: 0.46,
    angularDamping: 1.65,
  },
  "sharp-resin": {
    density: 0.92,
    friction: 0.7,
    restitution: 0.22,
    linearDamping: 0.42,
    angularDamping: 1.5,
  },
  "liquid-core": {
    density: 0.98,
    friction: 0.63,
    restitution: 0.2,
    linearDamping: 0.44,
    angularDamping: 1.58,
  },
  gemstone: {
    density: 1.2,
    friction: 0.58,
    restitution: 0.21,
    linearDamping: 0.43,
    angularDamping: 1.52,
  },
  glass: {
    density: 1.12,
    friction: 0.54,
    restitution: 0.26,
    linearDamping: 0.38,
    angularDamping: 1.4,
  },
  stone: {
    density: 1.42,
    friction: 0.78,
    restitution: 0.12,
    linearDamping: 0.56,
    angularDamping: 1.9,
  },
  metal: {
    density: 1.65,
    friction: 0.64,
    restitution: 0.15,
    linearDamping: 0.52,
    angularDamping: 1.78,
  },
  "hollow-metal": {
    density: 1.28,
    friction: 0.61,
    restitution: 0.18,
    linearDamping: 0.48,
    angularDamping: 1.68,
  },
  wood: {
    density: 0.74,
    friction: 0.82,
    restitution: 0.16,
    linearDamping: 0.58,
    angularDamping: 2,
  },
  fantasy: {
    density: 0.88,
    friction: 0.6,
    restitution: 0.24,
    linearDamping: 0.4,
    angularDamping: 1.45,
  },
} satisfies Readonly<Record<MaterialFamilyV4, MaterialPhysicsProfileV4>>);

const colliderPointCacheV4 = new WeakMap<
  PolyhedralGeometryDescriptorV4,
  Float32Array
>();

function hashV4(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e37_79b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0_aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a_2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function unitV4(seed: number, salt: number): number {
  return hashV4(seed, salt) / 0x1_0000_0000;
}

function betweenV4(
  seed: number,
  salt: number,
  minimum: number,
  maximum: number,
): number {
  return minimum + (maximum - minimum) * unitV4(seed, salt);
}

function randomRotationV4(seed: number): TrayRotationV4 {
  const first = unitV4(seed, 1);
  const second = unitV4(seed, 2) * Math.PI * 2;
  const third = unitV4(seed, 3) * Math.PI * 2;
  const root = Math.sqrt(1 - first);
  const complement = Math.sqrt(first);
  return {
    x: root * Math.sin(second),
    y: root * Math.cos(second),
    z: complement * Math.sin(third),
    w: complement * Math.cos(third),
  };
}

function maximumDescriptorRadiusV4(
  descriptor: PolyhedralGeometryDescriptorV4,
): number {
  const radius = Math.max(
    ...descriptor.vertices.map(({ position: [x, y, z] }) =>
      Math.hypot(x, y, z),
    ),
  );
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error(`Rapier V4 collider geometry is invalid: ${descriptor.id}`);
  }
  return radius;
}

function renderScaleV4(descriptor: GeometryDescriptorV4): number {
  const radius = descriptor.kind === "sphere"
    ? descriptor.radius
    : maximumDescriptorRadiusV4(descriptor);
  return TRAY_DIE_RADIUS_V4 / radius;
}

function normalizedColliderPointsV4(
  descriptor: PolyhedralGeometryDescriptorV4,
): Float32Array {
  const cached = colliderPointCacheV4.get(descriptor);
  if (cached !== undefined) return cached;
  const scale = renderScaleV4(descriptor);
  const points = new Float32Array(
    descriptor.vertices.flatMap(({ position }) =>
      position.map((coordinate) => coordinate * scale),
    ),
  );
  colliderPointCacheV4.set(descriptor, points);
  return points;
}

function colliderDescriptorV4(
  descriptor: GeometryDescriptorV4,
  material: MaterialPhysicsProfileV4,
): ColliderDesc {
  const collider = descriptor.kind === "sphere"
    ? ColliderDesc.ball(TRAY_DIE_RADIUS_V4)
    : ColliderDesc.convexHull(normalizedColliderPointsV4(descriptor));
  if (collider === null) {
    throw new Error(`Rapier rejected canonical geometry: ${descriptor.id}`);
  }
  return collider
    .setDensity(material.density)
    .setFriction(material.friction)
    .setRestitution(material.restitution)
    .setContactSkin(0.0025);
}

function requestedBoundsV4(count: number): TrayBoundsV4 {
  const columns = Math.ceil(Math.sqrt(count * 1.5));
  const rows = Math.ceil(count / columns);
  return {
    halfWidth: Math.max(2.4, columns * 0.58),
    halfDepth: Math.max(1.8, rows * 0.58),
  };
}

type TrayLaunchV4 = Readonly<{
  position: TrayVectorV4;
  linearVelocity: TrayVectorV4;
}>;

function trayLaunchV4(seed: number, bounds: TrayBoundsV4): TrayLaunchV4 {
  const edgeInset = TRAY_DIE_RADIUS_V4 + 0.08;
  const xLimit = bounds.halfWidth - edgeInset;
  const zLimit = bounds.halfDepth - edgeInset;
  const edge = hashV4(seed, 7) % 4;
  let x: number;
  let z: number;
  if (edge < 2) {
    x = edge === 0 ? -xLimit : xLimit;
    z = betweenV4(seed, 11, -zLimit, zLimit);
  } else {
    x = betweenV4(seed, 11, -xLimit, xLimit);
    z = edge === 2 ? -zLimit : zLimit;
  }

  const distance = Math.hypot(x, z);
  const inwardX = -x / distance;
  const inwardZ = -z / distance;
  const speed = betweenV4(seed, 23, 5.2, 7.2);
  const tangent = betweenV4(seed, 29, -1.1, 1.1);
  return {
    position: {
      x,
      y: betweenV4(seed, 13, 0.78, 1.14),
      z,
    },
    linearVelocity: {
      x: inwardX * speed + inwardZ * tangent,
      y: betweenV4(seed, 31, 2.8, 4.4),
      z: inwardZ * speed - inwardX * tangent,
    },
  };
}

function validateInputsV4(inputs: readonly TrayDieInputV4[]): void {
  if (inputs.length < 1 || inputs.length > 50) {
    throw new Error("Rapier V4 tray must contain from 1 through 50 dice");
  }
  const identities = inputs.map(({ identity }) => identity);
  if (
    new Set(identities).size !== identities.length ||
    identities.some((identity) => identity.length < 1 || identity.length > 512) ||
    inputs.some(({ motionSeed }) =>
      !Number.isSafeInteger(motionSeed) || motionSeed < 0 || motionSeed > 0xffff_ffff
    )
  ) {
    throw new Error("Rapier V4 tray inputs are invalid");
  }
}

function copyVectorV4(vector: { x: number; y: number; z: number }): TrayVectorV4 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function copyRotationV4(rotation: {
  x: number;
  y: number;
  z: number;
  w: number;
}): TrayRotationV4 {
  return {
    x: rotation.x,
    y: rotation.y,
    z: rotation.z,
    w: rotation.w,
  };
}

export function materialPhysicsProfileV4(
  family: MaterialFamilyV4,
): MaterialPhysicsProfileV4 {
  return MATERIAL_PHYSICS_V4[family];
}

export function freshMotionSeedV4(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  const value = values[0];
  if (value === undefined) throw new Error("Rapier V4 motion seed is unavailable");
  return value;
}

export function createTrayPhysicsV4(
  inputs: readonly TrayDieInputV4[],
  now: number,
  reducedMotion: boolean,
): TrayPhysicsV4 {
  validateInputsV4(inputs);
  if (!Number.isFinite(now)) throw new Error("Rapier V4 tray clock is invalid");

  const world = new World({ x: 0, y: -14, z: 0 });
  world.timestep = TRAY_FIXED_STEP_SECONDS_V4;
  world.lengthUnit = 1;
  world.numInternalPgsIterations = 1;
  world.maxCcdSubsteps = 1;

  const bodies = new Map<string, TrayBodyRecordV4>();
  let trayColliders: Collider[] = [];
  let trayBounds = requestedBoundsV4(inputs.length);
  let accumulatorSeconds = 0;
  let motionDeadline: number | null = null;
  let disposed = false;

  const requireActive = (): void => {
    if (disposed) throw new Error("Rapier V4 tray is disposed");
  };

  const rebuildTray = (): void => {
    trayColliders.forEach((collider) => world.removeCollider(collider, true));
    const { halfWidth, halfDepth } = trayBounds;
    const wallHeight = 1.4;
    const wallThickness = 0.12;
    trayColliders = [
      world.createCollider(
        ColliderDesc.cuboid(halfWidth, 0.12, halfDepth)
          .setTranslation(0, -0.12, 0)
          .setFriction(0.85)
          .setRestitution(0.11),
      ),
      world.createCollider(
        ColliderDesc.cuboid(wallThickness, wallHeight, halfDepth)
          .setTranslation(-halfWidth - wallThickness, wallHeight, 0)
          .setFriction(0.72)
          .setRestitution(0.16),
      ),
      world.createCollider(
        ColliderDesc.cuboid(wallThickness, wallHeight, halfDepth)
          .setTranslation(halfWidth + wallThickness, wallHeight, 0)
          .setFriction(0.72)
          .setRestitution(0.16),
      ),
      world.createCollider(
        ColliderDesc.cuboid(halfWidth, wallHeight, wallThickness)
          .setTranslation(0, wallHeight, -halfDepth - wallThickness)
          .setFriction(0.72)
          .setRestitution(0.16),
      ),
      world.createCollider(
        ColliderDesc.cuboid(halfWidth, wallHeight, wallThickness)
          .setTranslation(0, wallHeight, halfDepth + wallThickness)
          .setFriction(0.72)
          .setRestitution(0.16),
      ),
    ];
  };

  const updateCountPolicy = (count: number): void => {
    world.numSolverIterations = count > HIGH_COUNT_THRESHOLD_V4 ? 3 : 4;
    const requested = requestedBoundsV4(count);
    if (
      requested.halfWidth > trayBounds.halfWidth ||
      requested.halfDepth > trayBounds.halfDepth ||
      trayColliders.length === 0
    ) {
      trayBounds = {
        halfWidth: Math.max(trayBounds.halfWidth, requested.halfWidth),
        halfDepth: Math.max(trayBounds.halfDepth, requested.halfDepth),
      };
      rebuildTray();
    }
  };

  const beginMotion = (startedAt: number): void => {
    accumulatorSeconds = 0;
    motionDeadline = startedAt + TRAY_WALL_CLOCK_LIMIT_MILLISECONDS_V4;
  };

  const bodySnapshot = (record: TrayBodyRecordV4): TrayBodySnapshotV4 => ({
    identity: record.identity,
    handle: record.body.handle,
    descriptorId: record.descriptor.id,
    position: copyVectorV4(record.body.translation()),
    rotation: copyRotationV4(record.body.rotation()),
    linearVelocity: copyVectorV4(record.body.linvel()),
    angularVelocity: copyVectorV4(record.body.angvel()),
    renderScale: record.renderScale,
    sleeping: record.body.isSleeping(),
  });

  const staticPosition = (
    index: number,
    count: number,
  ): TrayVectorV4 => {
    const columns = Math.ceil(Math.sqrt(count * 1.5));
    const rows = Math.ceil(count / columns);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const spacing = TRAY_DIE_RADIUS_V4 * 2.15;
    return {
      x: (column - (Math.min(columns, count) - 1) / 2) * spacing,
      y: TRAY_DIE_RADIUS_V4 + 0.04,
      z: (row - (rows - 1) / 2) * spacing,
    };
  };

  const arrangeStatic = (): void => {
    const records = [...bodies.values()];
    records.forEach((record, index) => {
      record.body.setEnabled(true);
      record.body.setTranslation(staticPosition(index, records.length), false);
      record.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      record.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      record.body.sleep();
      record.activateAt = 0;
      record.ccdUntil = 0;
      record.body.enableCcd(false);
    });
    motionDeadline = null;
    accumulatorSeconds = 0;
  };

  const createBody = (
    input: TrayDieInputV4,
    index: number,
    count: number,
    startedAt: number,
    staticLayout: boolean,
  ): TrayBodyRecordV4 => {
    const material = materialPhysicsProfileV4(input.materialFamily);
    const base = staticPosition(index, count);
    const launch = trayLaunchV4(input.motionSeed, trayBounds);
    const activationDelay = staticLayout
      ? 0
      : (count > HIGH_COUNT_THRESHOLD_V4 ? Math.floor(index / 2) : index) * 16;
    const body = world.createRigidBody(
      RigidBodyDesc.dynamic()
        .setTranslation(
          staticLayout ? base.x : launch.position.x,
          staticLayout ? base.y : launch.position.y,
          staticLayout ? base.z : launch.position.z,
        )
        .setRotation(randomRotationV4(input.motionSeed))
        .setLinvel(
          staticLayout ? 0 : launch.linearVelocity.x,
          staticLayout ? 0 : launch.linearVelocity.y,
          staticLayout ? 0 : launch.linearVelocity.z,
        )
        .setAngvel({
          x: staticLayout ? 0 : betweenV4(input.motionSeed, 37, -12, 12),
          y: staticLayout ? 0 : betweenV4(input.motionSeed, 41, -12, 12),
          z: staticLayout ? 0 : betweenV4(input.motionSeed, 43, -12, 12),
        })
        .setLinearDamping(material.linearDamping)
        .setAngularDamping(material.angularDamping)
        .setCcdEnabled(!staticLayout)
        .setCanSleep(true)
        .setEnabled(staticLayout || activationDelay === 0)
        .setUserData({ identity: input.identity }),
    );
    const collider = world.createCollider(
      colliderDescriptorV4(input.descriptor, material),
      body,
    );
    if (staticLayout) body.sleep();
    return {
      ...input,
      body,
      collider,
      activateAt: startedAt + activationDelay,
      ccdUntil: startedAt + activationDelay + 400,
      renderScale: renderScaleV4(input.descriptor),
    };
  };

  const replaceCollider = (
    record: TrayBodyRecordV4,
    input: TrayDieInputV4,
  ): void => {
    world.removeCollider(record.collider, true);
    const material = materialPhysicsProfileV4(input.materialFamily);
    record.collider = world.createCollider(
      colliderDescriptorV4(input.descriptor, material),
      record.body,
    );
    record.body.setLinearDamping(material.linearDamping);
    record.body.setAngularDamping(material.angularDamping);
    record.descriptor = input.descriptor;
    record.materialFamily = input.materialFamily;
    record.renderScale = renderScaleV4(input.descriptor);
    record.body.wakeUp();
  };

  const freeze = (): void => {
    requireActive();
    bodies.forEach(({ body }) => {
      body.setEnabled(true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      body.enableCcd(false);
      body.sleep();
    });
    motionDeadline = null;
    accumulatorSeconds = 0;
  };

  const controller: TrayPhysicsV4 = {
    reconcile(nextInputs, currentTime, staticLayout) {
      requireActive();
      validateInputsV4(nextInputs);
      if (!Number.isFinite(currentTime)) {
        throw new Error("Rapier V4 tray clock is invalid");
      }
      const nextIdentities = new Set(nextInputs.map(({ identity }) => identity));
      const removed: TrayBodySnapshotV4[] = [];
      bodies.forEach((record, identity) => {
        if (nextIdentities.has(identity)) return;
        removed.push(bodySnapshot(record));
        world.removeRigidBody(record.body);
        bodies.delete(identity);
      });

      updateCountPolicy(nextInputs.length);
      const retained: string[] = [];
      const added: string[] = [];
      let colliderChanged = false;
      nextInputs.forEach((input, index) => {
        const existing = bodies.get(input.identity);
        if (existing !== undefined) {
          retained.push(input.identity);
          if (
            existing.descriptor.id !== input.descriptor.id ||
            existing.materialFamily !== input.materialFamily
          ) {
            replaceCollider(existing, input);
            colliderChanged = true;
          }
          return;
        }
        const record = createBody(
          input,
          index,
          nextInputs.length,
          currentTime,
          staticLayout,
        );
        bodies.set(input.identity, record);
        added.push(input.identity);
      });

      if (staticLayout) {
        arrangeStatic();
      } else if (added.length > 0 || colliderChanged) {
        beginMotion(currentTime);
      }
      return { added, retained, removed };
    },
    step(currentTime, deltaMilliseconds) {
      requireActive();
      if (!Number.isFinite(currentTime) || !Number.isFinite(deltaMilliseconds)) {
        throw new Error("Rapier V4 tray clock is invalid");
      }
      if (motionDeadline === null) {
        return { moving: false, fixedSteps: 0, stoppedByDeadline: false };
      }
      if (currentTime >= motionDeadline) {
        freeze();
        return { moving: false, fixedSteps: 0, stoppedByDeadline: true };
      }

      bodies.forEach((record) => {
        if (!record.body.isEnabled() && currentTime >= record.activateAt) {
          record.body.setEnabled(true);
        }
        if (record.body.isCcdEnabled() && currentTime >= record.ccdUntil) {
          record.body.enableCcd(false);
        }
      });

      const maximumAccumulation =
        TRAY_FIXED_STEP_SECONDS_V4 * MAXIMUM_CATCH_UP_STEPS_V4;
      accumulatorSeconds = Math.min(
        maximumAccumulation,
        accumulatorSeconds + Math.max(0, deltaMilliseconds) / 1_000,
      );
      let fixedSteps = 0;
      while (
        accumulatorSeconds >= TRAY_FIXED_STEP_SECONDS_V4 &&
        fixedSteps < MAXIMUM_CATCH_UP_STEPS_V4
      ) {
        world.step();
        accumulatorSeconds -= TRAY_FIXED_STEP_SECONDS_V4;
        fixedSteps += 1;
      }

      const allActive = [...bodies.values()].every(({ body }) =>
        body.isEnabled(),
      );
      const sleeping = allActive && [...bodies.values()].every(({ body }) =>
        body.isSleeping(),
      );
      if (sleeping) {
        motionDeadline = null;
        accumulatorSeconds = 0;
      }
      return {
        moving: !sleeping,
        fixedSteps,
        stoppedByDeadline: false,
      };
    },
    energize(identities, currentTime) {
      requireActive();
      if (!Number.isFinite(currentTime)) {
        throw new Error("Rapier V4 tray clock is invalid");
      }
      const selected = identities === undefined ? null : new Set(identities);
      if (
        selected !== null &&
        (selected.size !== identities?.length ||
          [...selected].some((identity) => !bodies.has(identity)))
      ) {
        throw new Error("Rapier V4 energized identities are invalid");
      }
      bodies.forEach((record, identity) => {
        if (selected !== null && !selected.has(identity)) return;
        const seed = hashV4(record.motionSeed, Math.round(currentTime));
        record.body.setEnabled(true);
        record.body.wakeUp();
        record.body.setLinvel(
          {
            x: betweenV4(seed, 53, -1.4, 1.4),
            y: betweenV4(seed, 59, 4.8, 7.4),
            z: betweenV4(seed, 61, -1.2, 1.2),
          },
          true,
        );
        record.body.setAngvel(
          {
            x: betweenV4(seed, 67, -9, 9),
            y: betweenV4(seed, 71, -9, 9),
            z: betweenV4(seed, 73, -9, 9),
          },
          true,
        );
        record.body.enableCcd(true);
        record.activateAt = currentTime;
        record.ccdUntil = currentTime + 400;
      });
      beginMotion(currentTime);
    },
    freeze,
    snapshots() {
      requireActive();
      return [...bodies.values()].map(bodySnapshot);
    },
    snapshot(identity) {
      requireActive();
      const record = bodies.get(identity);
      return record === undefined ? undefined : bodySnapshot(record);
    },
    bounds() {
      requireActive();
      return { ...trayBounds };
    },
    diagnostics() {
      requireActive();
      return {
        rigidBodyCount: world.bodies.len(),
        colliderCount: world.colliders.len(),
        solverIterations: world.numSolverIterations,
        activeMotionDeadline: motionDeadline,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bodies.clear();
      trayColliders = [];
      world.free();
    },
  };

  controller.reconcile(inputs, now, reducedMotion);
  return controller;
}
