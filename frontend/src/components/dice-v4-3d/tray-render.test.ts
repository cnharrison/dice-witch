import { Group, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  addThreeTraySmokeV4,
  applyTraySnapshotToGroupV4,
  configureThreeTrayCameraV4,
  createThreeTrayRenderContextV4,
  disposeThreeTrayRenderContextV4,
  resetTrayGroupTransformV4,
  traySnapshotViewportV4,
  updateThreeTraySmokeV4,
} from "./tray-render";
import {
  TRAY_DIE_RADIUS_V4,
  type TrayBodySnapshotV4,
} from "./tray-physics";

const snapshot: TrayBodySnapshotV4 = {
  identity: "die",
  handle: 1,
  descriptorId: "d6-standard-r1",
  position: { x: 0.5, y: 0.7, z: -0.2 },
  rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
  linearVelocity: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
  renderScale: 0.3,
  sleeping: false,
};

describe("Three.js V4 shared tray rendering", () => {
  it("maps one Rapier transform into a shared shallow-perspective viewport", () => {
    const context = createThreeTrayRenderContextV4();
    try {
      const bounds = { halfWidth: 5.2, halfDepth: 3.5 };
      configureThreeTrayCameraV4(context, 600, 360, bounds);
      const boundingRadius = Math.hypot(
        bounds.halfWidth + TRAY_DIE_RADIUS_V4,
        2.4,
        bounds.halfDepth + TRAY_DIE_RADIUS_V4,
      );
      const originalFitDistance = boundingRadius / Math.sin(38 * Math.PI / 360);
      expect(
        context.camera.position.distanceTo(new Vector3(0, 1.8, 0)),
      ).toBeCloseTo(originalFitDistance * 0.75, 5);
      const group = new Group();
      applyTraySnapshotToGroupV4(group, snapshot);
      expect(group.position.toArray()).toEqual([0.5, 0.7, -0.2]);
      expect(group.scale.toArray()).toEqual([0.3, 0.3, 0.3]);

      const viewport = traySnapshotViewportV4(context, snapshot, 600, 360);
      expect(viewport.width).toBeGreaterThanOrEqual(24);
      expect(viewport.height).toBe(viewport.width);
      expect(Number.isFinite(viewport.x)).toBe(true);
      expect(Number.isFinite(viewport.y)).toBe(true);

      resetTrayGroupTransformV4(group);
      expect(group.position.toArray()).toEqual([0, 0, 0]);
      expect(group.scale.toArray()).toEqual([1, 1, 1]);
    } finally {
      disposeThreeTrayRenderContextV4(context);
    }
  });

  it("contains the maximum tray on a narrow portrait canvas", () => {
    const context = createThreeTrayRenderContextV4();
    try {
      const bounds = { halfWidth: 5.22, halfDepth: 3.48 };
      configureThreeTrayCameraV4(context, 150, 300, bounds);
      const xExtent = bounds.halfWidth + TRAY_DIE_RADIUS_V4;
      const zExtent = bounds.halfDepth + TRAY_DIE_RADIUS_V4;
      const corners = [-1, 1].flatMap((xDirection) =>
        [-1, 1].flatMap((zDirection) =>
          [-0.6, 4.2].map((y) =>
            new Vector3(
              xDirection * xExtent,
              y,
              zDirection * zExtent,
            ).project(context.camera),
          ),
        ),
      );

      expect(
        corners.every(
          ({ x, y, z }) =>
            Math.abs(x) <= 1.001 &&
            Math.abs(y) <= 1.001 &&
            z >= -1 &&
            z <= 1,
        ),
      ).toBe(true);
    } finally {
      disposeThreeTrayRenderContextV4(context);
    }
  });

  it("expires the natural gray removal puff and releases its material", () => {
    const context = createThreeTrayRenderContextV4();
    try {
      addThreeTraySmokeV4(
        context,
        snapshot.position,
        snapshot.rotation,
        42,
        100,
      );
      expect(context.smoke).toHaveLength(1);
      expect(context.smoke[0]?.group.children).toHaveLength(6);
      expect(updateThreeTraySmokeV4(context, 200)).toBe(true);
      expect(updateThreeTraySmokeV4(context, 500)).toBe(false);
      expect(context.smoke).toHaveLength(0);
    } finally {
      disposeThreeTrayRenderContextV4(context);
    }
  });
});
