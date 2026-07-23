import {
  D20_HOLLOW_CAGE_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  buildPhysicalPolyhedralMeshV4,
} from "@dice-witch/dice-v4-model";
import { describe, expect, it } from "vitest";
import { createPhysicalPolyhedralGeometryV4 } from "./geometry";
import { createPhysicalEdgeGeometryV4 } from "./edge-geometry";

const placement = {
  rotation: 0,
  offsetU: 0,
  offsetV: 0,
} as const;

describe("V4 Three.js physical edge geometry", () => {
  it("retains one conventional edge layer for a standard d20", () => {
    const physical = buildPhysicalPolyhedralMeshV4(
      D20_STANDARD_GEOMETRY_R2_V4,
      20,
    );
    const base = createPhysicalPolyhedralGeometryV4(
      D20_STANDARD_GEOMETRY_R2_V4,
      20,
      placement,
    );
    const edge = createPhysicalEdgeGeometryV4(base, physical);

    expect(edge.vertexColors).toBe(false);
    expect(edge.geometry.userData).toMatchObject({
      geometryId: "d20-standard-r2",
      edgePolicy: "conventional",
    });
    expect(edge.geometry.getAttribute("position").count).toBe(360);
    expect(edge.geometry.getAttribute("color")).toBeUndefined();

    edge.geometry.dispose();
    base.dispose();
  });

  it("draws only physical and cut boundaries for the hollow cage", () => {
    const physical = buildPhysicalPolyhedralMeshV4(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
      20,
    );
    const base = createPhysicalPolyhedralGeometryV4(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
      20,
      placement,
    );
    const edge = createPhysicalEdgeGeometryV4(base, physical);

    expect(edge.vertexColors).toBe(true);
    expect(edge.geometry.userData).toEqual({
      geometryId: "d20-hollow-cage-r1",
      edgePolicy: "hollow-cage",
      primarySegmentCount: 30,
      cutSegmentCount: 360,
    });
    expect(edge.geometry.getAttribute("position").count).toBe(780);
    const colors = edge.geometry.getAttribute("color");
    expect(colors.count).toBe(780);
    expect([colors.getX(0), colors.getY(0), colors.getZ(0)]).toEqual([0, 0, 0]);
    expect(colors.getX(60)).toBeGreaterThan(0);
    expect(colors.getY(60)).toBeGreaterThan(0);
    expect(colors.getZ(60)).toBeGreaterThan(0);
    expect(edge.geometry.getIndex()).toBeNull();

    edge.geometry.dispose();
    base.dispose();
  });

  it("rejects an unknown hollow-cage surface instead of outlining it", () => {
    const physical = buildPhysicalPolyhedralMeshV4(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
      20,
    );
    const base = createPhysicalPolyhedralGeometryV4(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
      20,
      placement,
    );
    const invalid = {
      ...physical,
      faces: [{ ...physical.faces[0], id: "unknown-20-0" }, ...physical.faces.slice(1)],
    };

    expect(() => createPhysicalEdgeGeometryV4(base, invalid)).toThrow(
      "Three.js V4 hollow-cage edge surface is invalid: unknown-20-0",
    );
    base.dispose();
  });
});
