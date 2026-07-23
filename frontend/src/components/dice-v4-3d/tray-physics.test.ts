import {
  D20_STANDARD_GEOMETRY_R2_V4,
  D6_STANDARD_GEOMETRY_V4,
  MATERIAL_FAMILIES_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  type GeometryDescriptorV4,
  type MaterialFamilyV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import {
  TRAY_DIE_RADIUS_V4,
  TRAY_WALL_CLOCK_LIMIT_MILLISECONDS_V4,
  createTrayPhysicsV4,
  materialPhysicsProfileV4,
  type TrayDieInputV4,
} from "./tray-physics";

function input(
  identity: string,
  index: number,
  descriptor: GeometryDescriptorV4 = D6_STANDARD_GEOMETRY_V4,
  materialFamily: MaterialFamilyV4 = "classic",
): TrayDieInputV4 {
  return {
    identity,
    descriptor,
    materialFamily,
    motionSeed: (0x64_15_0000 + index) >>> 0,
  };
}

describe("V4 Rapier pre-roll tray physics", () => {
  it("uses the approved preparation-only die scale", () => {
    expect(TRAY_DIE_RADIUS_V4).toBe(0.53);
  });

  it("launches deterministically from tray edges with inward, upward momentum", () => {
    const inputs = Array.from({ length: 16 }, (_, index) =>
      input(`die-${String(index)}`, index),
    );
    const first = createTrayPhysicsV4(inputs, 100, false);
    const replay = createTrayPhysicsV4(inputs, 100, false);
    try {
      const snapshots = first.snapshots();
      const bounds = first.bounds();
      const edgeInset = TRAY_DIE_RADIUS_V4 + 0.08;
      const edgeNames = snapshots.map(({ position, linearVelocity }) => {
        const onXEdge = Math.abs(
          Math.abs(position.x) - (bounds.halfWidth - edgeInset),
        ) < 1e-6;
        const onZEdge = Math.abs(
          Math.abs(position.z) - (bounds.halfDepth - edgeInset),
        ) < 1e-6;
        expect(onXEdge || onZEdge).toBe(true);
        expect(linearVelocity.y).toBeGreaterThan(2);
        expect(
          -(position.x * linearVelocity.x + position.z * linearVelocity.z),
        ).toBeGreaterThan(0);
        if (onXEdge) return position.x < 0 ? "left" : "right";
        return position.z < 0 ? "back" : "front";
      });

      expect(new Set(edgeNames).size).toBeGreaterThanOrEqual(3);
      expect(replay.snapshots()).toEqual(snapshots);
    } finally {
      first.dispose();
      replay.dispose();
    }
  });

  it("runs all fifty rigid bodies with adaptive fixed-step tuning and a true deadline", () => {
    const inputs = Array.from({ length: 50 }, (_, index) =>
      input(`die-${String(index)}`, index, D20_STANDARD_GEOMETRY_R2_V4),
    );
    const tray = createTrayPhysicsV4(inputs, 100, false);
    try {
      expect(tray.diagnostics()).toMatchObject({
        rigidBodyCount: 50,
        colliderCount: 55,
        solverIterations: 3,
        activeMotionDeadline: 2_100,
      });

      let fixedSteps = 0;
      for (let frame = 1; frame < 120; frame += 1) {
        fixedSteps += tray.step(100 + frame * (1_000 / 60), 1_000 / 60)
          .fixedSteps;
      }
      expect(fixedSteps).toBeGreaterThanOrEqual(118);
      const deadline = tray.step(
        100 + TRAY_WALL_CLOCK_LIMIT_MILLISECONDS_V4,
        1_000 / 60,
      );
      expect(deadline).toEqual({
        moving: false,
        fixedSteps: 0,
        stoppedByDeadline: true,
      });
      expect(tray.snapshots().every(({ sleeping }) => sleeping)).toBe(true);

      const bounds = tray.bounds();
      expect(
        tray.snapshots().every(({ position }) =>
          position.x >= -bounds.halfWidth - TRAY_DIE_RADIUS_V4 &&
          position.x <= bounds.halfWidth + TRAY_DIE_RADIUS_V4 &&
          position.z >= -bounds.halfDepth - TRAY_DIE_RADIUS_V4 &&
          position.z <= bounds.halfDepth + TRAY_DIE_RADIUS_V4 &&
          position.y >= -TRAY_DIE_RADIUS_V4
        ),
      ).toBe(true);
    } finally {
      tray.dispose();
    }
  });

  it("retains body handles, adds into the same world, and removes colliders immediately", () => {
    const tray = createTrayPhysicsV4(
      [input("first", 1), input("second", 2)],
      0,
      true,
    );
    try {
      const firstHandle = tray.snapshot("first")?.handle;
      const secondHandle = tray.snapshot("second")?.handle;
      const added = tray.reconcile(
        [input("first", 1), input("second", 2), input("third", 3)],
        10,
        false,
      );
      expect(added).toMatchObject({
        added: ["third"],
        retained: ["first", "second"],
        removed: [],
      });
      expect(tray.snapshot("first")?.handle).toBe(firstHandle);
      expect(tray.snapshot("second")?.handle).toBe(secondHandle);
      expect(tray.diagnostics()).toMatchObject({
        rigidBodyCount: 3,
        colliderCount: 8,
      });

      const removed = tray.reconcile(
        [input("first", 1), input("second", 2)],
        20,
        false,
      );
      expect(removed.removed.map(({ identity }) => identity)).toEqual([
        "third",
      ]);
      expect(tray.snapshot("third")).toBeUndefined();
      expect(tray.diagnostics()).toMatchObject({
        rigidBodyCount: 2,
        colliderCount: 7,
      });
    } finally {
      tray.dispose();
    }
  });

  it("uses static reduced-motion placement and only energizes requested identities", () => {
    const tray = createTrayPhysicsV4(
      [
        input("polyhedron", 1, D20_STANDARD_GEOMETRY_R2_V4, "metal"),
        input("sphere", 2, OTHER_SPHERE_GEOMETRY_V4, "wood"),
      ],
      0,
      true,
    );
    try {
      expect(tray.snapshots().every(({ sleeping }) => sleeping)).toBe(true);
      expect(
        tray.snapshots().every(({ linearVelocity, angularVelocity }) =>
          Object.values(linearVelocity).every((value) => value === 0) &&
          Object.values(angularVelocity).every((value) => value === 0)
        ),
      ).toBe(true);

      tray.energize(["sphere"], 50);
      expect(tray.snapshot("polyhedron")?.sleeping).toBe(true);
      expect(tray.snapshot("sphere")?.linearVelocity.y).toBeGreaterThan(4);
      tray.freeze();
      expect(tray.snapshots().every(({ sleeping }) => sleeping)).toBe(true);
    } finally {
      tray.dispose();
    }
  });

  it("bounds catch-up work while preserving fixed world steps", () => {
    const tray = createTrayPhysicsV4([input("die", 1)], 0, false);
    try {
      expect(tray.step(16, 16).fixedSteps).toBe(0);
      expect(tray.step(266, 250).fixedSteps).toBe(8);
      expect(tray.step(282, 16).fixedSteps).toBeLessThanOrEqual(1);
    } finally {
      tray.dispose();
    }
  });

  it("defines a bounded physics profile for every material family", () => {
    const profiles = MATERIAL_FAMILIES_V4.map(materialPhysicsProfileV4);
    expect(profiles).toHaveLength(10);
    expect(new Set(profiles.map(({ density }) => density)).size).toBeGreaterThan(
      5,
    );
    expect(
      profiles.every(
        ({ density, friction, restitution, linearDamping, angularDamping }) =>
          density >= 0.7 &&
          density <= 1.7 &&
          friction >= 0.5 &&
          friction <= 0.85 &&
          restitution >= 0.1 &&
          restitution <= 0.27 &&
          linearDamping >= 0.35 &&
          linearDamping <= 0.6 &&
          angularDamping >= 1.3 &&
          angularDamping <= 2.1,
      ),
    ).toBe(true);
  });
});
