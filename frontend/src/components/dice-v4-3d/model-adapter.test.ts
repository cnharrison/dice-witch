import {
  D20_CRYSTAL_CUT_GEOMETRY_V4,
  D20_HOLLOW_CAGE_GEOMETRY_V4,
  D20_SHARP_GEOMETRY_V4,
  D20_STANDARD_GEOMETRY_R2_V4,
  D20_STANDARD_GEOMETRY_V4,
  D6_STANDARD_GEOMETRY_V4,
  OTHER_SPHERE_GEOMETRY_V4,
  buildPhysicalPolyhedralMeshV4,
  createOctahedralTextureAtlasV4,
  createTextureGenerationInputV4,
  generateMaterialTextureV4,
  parsePublicRenderModelV4,
  projectPolyhedralGeometryV4,
  sphericalSkinCoordinateFromNormalV4,
} from "@dice-witch/dice-v4-model";
import { createHash } from "node:crypto";
import {
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import d10Fixture from "./fixtures/d10-r3.json";
import d10FixtureRaw from "./fixtures/d10-r3.json?raw";
import d12Fixture from "./fixtures/d12-r3.json";
import d12FixtureRaw from "./fixtures/d12-r3.json?raw";
import d20EnamelFixtureRaw from "./fixtures/d20-enamel-r3.json?raw";
import d20LuminousFixtureRaw from "./fixtures/d20-luminous-r3.json?raw";
import d20MetallicFixtureRaw from "./fixtures/d20-metallic-r3.json?raw";
import d20CrystalFixture from "./fixtures/d20-glass-crystal-cut-r3.json";
import d20Fixture from "./fixtures/d20-r3.json";
import d20FixtureRaw from "./fixtures/d20-r3.json?raw";
import d20HollowFixture from "./fixtures/d20-material-hollow-metal-r3.json";
import d20SharpFixture from "./fixtures/d20-sharp-resin-sharp-r3.json";
import d20VoidFixtureRaw from "./fixtures/d20-void-r3.json?raw";
import d4Fixture from "./fixtures/d4-r3.json";
import d4FixtureRaw from "./fixtures/d4-r3.json?raw";
import d6Fixture from "./fixtures/d6-r3.json";
import d6FixtureRaw from "./fixtures/d6-r3.json?raw";
import d8Fixture from "./fixtures/d8-r3.json";
import d8FixtureRaw from "./fixtures/d8-r3.json?raw";
import fudgeFixture from "./fixtures/fudge-r3.json";
import fudgeFixtureRaw from "./fixtures/fudge-r3.json?raw";
import otherEnamelFixtureRaw from "./fixtures/other-enamel-r3.json?raw";
import otherLuminousFixtureRaw from "./fixtures/other-luminous-r3.json?raw";
import otherMetallicFixtureRaw from "./fixtures/other-metallic-r3.json?raw";
import otherFixture from "./fixtures/other-r3.json";
import otherFixtureRaw from "./fixtures/other-r3.json?raw";
import otherVoidFixtureRaw from "./fixtures/other-void-r3.json?raw";
import percentileFixture from "./fixtures/percentile-r3.json";
import percentileFixtureRaw from "./fixtures/percentile-r3.json?raw";
import {
  createFaceCoordinateGeometryV4,
  createPhysicalPolyhedralGeometryV4,
  createSphericalGeometryV4,
  geometryDescriptorForDieV4,
  resultQuaternionForDieV4,
} from "./geometry";
import {
  createMaterialDataTextureV4,
  createPhysicalMaterialDataTextureV4,
  placedTextureUvV4,
} from "./texture";

const d6Request = parsePublicRenderModelV4(d6Fixture);
const d6 = d6Request.groups[0]?.[0];
if (d6 === undefined) throw new Error("D6 Three.js fixture is empty");
const d20Request = parsePublicRenderModelV4(d20Fixture);
const d20 = d20Request.groups[0]?.[0];
if (d20 === undefined) throw new Error("D20 Three.js fixture is empty");
const d20HollowRequest = parsePublicRenderModelV4(d20HollowFixture);
const d20Hollow = d20HollowRequest.groups[0]?.[0];
if (d20Hollow === undefined) {
  throw new Error("Hollow-cage Three.js fixture is empty");
}

const FIXTURES = [
  {
    fixture: d4Fixture,
    raw: d4FixtureRaw,
    target: "d4",
    result: 4,
    hash: "89ddaa8faeb3c9c452d9faeaf6c4e86ee9364fe6df5e98d49e5bd09a1ba9d50c",
  },
  {
    fixture: d6Fixture,
    raw: d6FixtureRaw,
    target: "d6",
    result: 6,
    hash: "7e7bf030b07c7443e282d28e948442d91441c5f7d600978c8562a7661813e348",
  },
  {
    fixture: d8Fixture,
    raw: d8FixtureRaw,
    target: "d8",
    result: 8,
    hash: "080e172ba4af9959c02ed5886a64933ed3ca89ba82801f1472f8eb3cf1f3606a",
  },
  {
    fixture: d10Fixture,
    raw: d10FixtureRaw,
    target: "d10",
    result: 10,
    hash: "6bf52420454aaac2d14851da06e597e3c0566a496c9a54d29ede622c710057b1",
  },
  {
    fixture: d12Fixture,
    raw: d12FixtureRaw,
    target: "d12",
    result: 12,
    hash: "7afa810e24f12f0b9ab4e2e6635014b4ef4fbd23b4e65134b2b42c899859f451",
  },
  {
    fixture: d20Fixture,
    raw: d20FixtureRaw,
    target: "d20",
    result: 20,
    hash: "549329aed737fe3a90894e30dcb4ba431ac6c9f045161369212accd7bec00b0d",
  },
  {
    fixture: percentileFixture,
    raw: percentileFixtureRaw,
    target: "percentile",
    result: 90,
    hash: "9dfcb4c675c9eb6a9644994a80e08960f09614edfe1812d719d97a7cec602c29",
  },
  {
    fixture: fudgeFixture,
    raw: fudgeFixtureRaw,
    target: "fudge",
    result: 1,
    hash: "497993ef274182539a6cff890549eb53f8caa308aabd55ae9b8b7911650739f9",
  },
  {
    fixture: otherFixture,
    raw: otherFixtureRaw,
    target: "other",
    result: 999,
    hash: "39811a52cb21ee9ce7db7b22fe3c183386fdb9f718f4ce0355cb3bf232a696c9",
  },
] as const;

const ENGRAVING_FIXTURE_CASES = [
  {
    raw: d20EnamelFixtureRaw,
    target: "d20",
    finish: "enamel",
    hash: "557e5f9a9b2f79ee8980fad8d883d330993cf328df23a79b9dd6171a656b0bed",
  },
  {
    raw: d20MetallicFixtureRaw,
    target: "d20",
    finish: "metallic",
    hash: "d625e78842cd7fe1c18e271205235cc4753286c542e8466845c138ccc0e4cf2b",
  },
  {
    raw: d20LuminousFixtureRaw,
    target: "d20",
    finish: "luminous",
    hash: "eff103dd8dc4f3c2e52d36b0432b65001b00f7ca917582432131958cb8fbcb8b",
  },
  {
    raw: d20VoidFixtureRaw,
    target: "d20",
    finish: "void",
    hash: "fbde89ff7fcb3aa9d48b28c0bd5ad1657095cbe42c4ca35e660617f63492c53a",
  },
  {
    raw: otherEnamelFixtureRaw,
    target: "other",
    finish: "enamel",
    hash: "468526a6a1f2eeaeac7259e28fbcebc0d667c5f77551d42268ac6c478e986f48",
  },
  {
    raw: otherMetallicFixtureRaw,
    target: "other",
    finish: "metallic",
    hash: "e1271c88970556bacfbd182b239173c49589ecd8773f8c80bb3feb0a13de2188",
  },
  {
    raw: otherLuminousFixtureRaw,
    target: "other",
    finish: "luminous",
    hash: "abf2b94a5748fe814b2909d6fefdc2fb1af87306ea84955db0c49a3b0efbb13f",
  },
  {
    raw: otherVoidFixtureRaw,
    target: "other",
    finish: "void",
    hash: "0edb65bacceb97bdfeb1c25f3796c5f615412558702492652e9fa237524bdaf9",
  },
] as const;

function fixtureHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("V4 Three.js model adapter", () => {
  it("pins and parses every prototype snapshot", () => {
    for (const { fixture, raw, target, result, hash } of FIXTURES) {
      expect(fixtureHash(raw)).toBe(hash);
      expect(parsePublicRenderModelV4(fixture)).toMatchObject({
        version: 4,
        rendererRevision: "canvaskit-v4-r3",
        groups: [[
          {
            target,
            result,
            form: target === "other" ? "sphere" : "standard",
          },
        ]],
      });
    }
  });

  it("pins representative engraving snapshots", () => {
    for (const { raw, target, finish, hash } of ENGRAVING_FIXTURE_CASES) {
      expect(fixtureHash(raw)).toBe(hash);
      const snapshot = parsePublicRenderModelV4(JSON.parse(raw));
      expect(snapshot.groups[0]?.[0]).toMatchObject({
        target,
        appearance: { engraving: { finish } },
      });
    }
  });

  it("builds all hard-edged d6 faces with canonical UVs and result pose", () => {
    const descriptor = geometryDescriptorForDieV4(
      d6Request.rendererRevision,
      d6,
    );
    expect(descriptor).toBe(D6_STANDARD_GEOMETRY_V4);
    if (descriptor.kind !== "polyhedral") {
      throw new Error("Expected polyhedral d6 geometry");
    }

    const geometry = createFaceCoordinateGeometryV4(
      descriptor,
      d6.appearance.texture,
    );
    expect(geometry.getAttribute("position").count).toBe(24);
    expect(geometry.getAttribute("normal").count).toBe(24);
    expect(geometry.getAttribute("uv").count).toBe(24);
    expect(geometry.getIndex()?.count).toBe(36);
    expect(geometry.userData.geometryId).toBe("d6-standard-r1");
    expect(Array.from(geometry.getAttribute("position").array.slice(0, 12))).toEqual([
      -1, -1, 1,
      1, -1, 1,
      1, 1, 1,
      -1, 1, 1,
    ]);
    expect(Array.from(geometry.getAttribute("normal").array.slice(0, 12))).toEqual([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]);
    expect(Array.from(geometry.getAttribute("uv").array.slice(0, 8))).toEqual([
      0, 1,
      1, 1,
      1, 0,
      0, 0,
    ]);
    expect(Array.from(geometry.getIndex()?.array.slice(0, 6) ?? [])).toEqual([
      0, 1, 2, 0, 2, 3,
    ]);

    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    if (index === null) throw new Error("D6 geometry index is missing");
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = new Vector3().fromBufferAttribute(positions, index.getX(offset));
      const b = new Vector3().fromBufferAttribute(positions, index.getX(offset + 1));
      const c = new Vector3().fromBufferAttribute(positions, index.getX(offset + 2));
      const normal = new Vector3().fromBufferAttribute(
        normals,
        index.getX(offset),
      );
      expect(b.sub(a).cross(c.sub(a)).dot(normal)).toBeGreaterThan(0);
    }

    const resultFace = descriptor.faces.find(({ id }) => id === "face-6");
    if (resultFace === undefined) throw new Error("D6 result face is missing");
    const posedNormal = new Vector3(...resultFace.normal).applyQuaternion(
      resultQuaternionForDieV4(descriptor, d6.result),
    );
    expect(posedNormal.x).toBeCloseTo(0, 12);
    expect(posedNormal.y).toBeCloseTo(1, 12);
    expect(posedNormal.z).toBeCloseTo(0, 12);

    geometry.dispose();
  });

  it("selects the additive r3 standard d20 descriptor only for r3", () => {
    expect(geometryDescriptorForDieV4("canvaskit-v4-r3", d20)).toBe(
      D20_STANDARD_GEOMETRY_R2_V4,
    );
    expect(geometryDescriptorForDieV4("canvaskit-v4-r2", d20)).toBe(
      D20_STANDARD_GEOMETRY_V4,
    );
    expect(geometryDescriptorForDieV4("canvaskit-v4-r1", d20)).toBe(
      D20_STANDARD_GEOMETRY_V4,
    );
    expect(
      geometryDescriptorForDieV4("canvaskit-v4-r3", {
        ...d20,
        form: "sharp",
      }).id,
    ).toBe("d20-sharp-r1");
    expect(() =>
      createFaceCoordinateGeometryV4(
        D20_STANDARD_GEOMETRY_R2_V4,
        d20.appearance.texture,
      ),
    ).toThrow("Three.js V4 skin mapping is not implemented: view-octahedral");
  });

  it("builds the sharp and crystal-cut d20 special forms", () => {
    for (const [fixture, canonical, vertexCount] of [
      [d20SharpFixture, D20_SHARP_GEOMETRY_V4, 2_160],
      [d20CrystalFixture, D20_CRYSTAL_CUT_GEOMETRY_V4, 5_568],
    ] as const) {
      const request = parsePublicRenderModelV4(fixture);
      const die = request.groups[0]?.[0];
      if (die === undefined) throw new Error("Special-form fixture is empty");
      const descriptor = geometryDescriptorForDieV4(
        request.rendererRevision,
        die,
      );
      expect(descriptor).toBe(canonical);
      if (descriptor.kind !== "polyhedral") {
        throw new Error("Expected a polyhedral special form");
      }
      const physical = buildPhysicalPolyhedralMeshV4(descriptor, die.result);
      const geometry = createPhysicalPolyhedralGeometryV4(
        descriptor,
        die.result,
        die.appearance.texture,
      );
      expect(physical.labels).toHaveLength(20);
      expect(
        physical.labels.find(({ value }) => value === die.result)?.normal[1],
      ).toBeCloseTo(1, 12);
      expect(geometry.getAttribute("position").count).toBe(vertexCount);
      expect(geometry.getAttribute("normal").count).toBe(vertexCount);
      expect(geometry.getAttribute("uv").count).toBe(vertexCount);
      expect(geometry.getIndex()?.count).toBe(vertexCount);
      geometry.dispose();
    }
  });

  it("builds every posed hollow-cage result with one fixed plaque atlas", () => {
    expect(
      geometryDescriptorForDieV4(
        d20HollowRequest.rendererRevision,
        d20Hollow,
      ),
    ).toBe(D20_HOLLOW_CAGE_GEOMETRY_V4);

    for (let result = 1; result <= 20; result += 1) {
      const physical = buildPhysicalPolyhedralMeshV4(
        D20_HOLLOW_CAGE_GEOMETRY_V4,
        result,
      );
      const resultLabel = physical.labels.find(
        ({ value }) => value === result,
      );
      const projection = projectPolyhedralGeometryV4(
        D20_HOLLOW_CAGE_GEOMETRY_V4,
        result,
      );
      expect(physical.faces).toHaveLength(140);
      expect(physical.labels).toHaveLength(20);
      expect(resultLabel?.faceId).toBe(`plaque-${String(result)}-0`);
      expect(resultLabel?.normal[1]).toBeCloseTo(1, 12);
      expect(
        projection.visibleFaces
          .flatMap(({ labels }) => labels)
          .some(({ value }) => value === result),
      ).toBe(true);
    }

    const geometry = createPhysicalPolyhedralGeometryV4(
      D20_HOLLOW_CAGE_GEOMETRY_V4,
      d20Hollow.result,
      d20Hollow.appearance.texture,
    );
    expect(geometry.getAttribute("position").count).toBe(3_120);
    expect(geometry.getAttribute("normal").count).toBe(3_120);
    expect(geometry.getAttribute("uv").count).toBe(3_120);
    expect(geometry.getIndex()?.count).toBe(3_120);
    expect(geometry.userData).toMatchObject({
      geometryId: "d20-hollow-cage-r1",
      result: 20,
    });
    geometry.dispose();
  });

  it("builds the complete posed r3 d20 mesh and exact octahedral atlas", () => {
    const descriptor = geometryDescriptorForDieV4("canvaskit-v4-r3", d20);
    if (descriptor.kind !== "polyhedral") {
      throw new Error("Expected polyhedral d20 geometry");
    }
    const physical = buildPhysicalPolyhedralMeshV4(descriptor, d20.result);
    const geometry = createPhysicalPolyhedralGeometryV4(
      descriptor,
      d20.result,
      d20.appearance.texture,
    );
    const texture = createPhysicalMaterialDataTextureV4(
      d20.appearance,
      descriptor,
    );
    const source = generateMaterialTextureV4(
      createTextureGenerationInputV4(
        "canvaskit-v4-r32",
        d20.appearance,
      ),
    );
    const expectedAtlas = createOctahedralTextureAtlasV4(
      source,
      d20.appearance.texture,
    );

    expect(geometry.getAttribute("position").count).toBe(2_160);
    expect(geometry.getAttribute("normal").count).toBe(2_160);
    expect(geometry.getAttribute("uv").count).toBe(2_160);
    expect(geometry.getIndex()?.count).toBe(2_160);
    expect(geometry.userData).toMatchObject({
      geometryId: "d20-standard-r2",
      result: 20,
    });
    expect(Array.from(geometry.getAttribute("uv").array.slice(0, 6))).toEqual(
      physical.mesh.skinCoordinates
        .slice(0, 3)
        .flatMap(([u, v]) => [Math.fround(u), Math.fround(v)]),
    );
    expect(texture.image).toMatchObject({
      width: expectedAtlas.width,
      height: expectedAtlas.height,
      data: expectedAtlas.pixels,
    });

    geometry.dispose();
    texture.dispose();
  });

  it("rejects unsupported face-local physical mapping for every geometry", () => {
    const descriptor = D20_STANDARD_GEOMETRY_R2_V4;
    const placement = {
      ...d20.appearance.texture,
      scope: "face-local" as const,
    };

    expect(() =>
      createPhysicalPolyhedralGeometryV4(descriptor, d20.result, placement),
    ).toThrow("Three.js V4 face-local physical mapping is not implemented");
    expect(() =>
      createPhysicalMaterialDataTextureV4(
        { ...d20.appearance, texture: placement },
        descriptor,
      ),
    ).toThrow("Three.js V4 face-local physical mapping is not implemented");

    const d6Placement = {
      ...d6.appearance.texture,
      scope: "face-local" as const,
    };
    expect(() =>
      createPhysicalPolyhedralGeometryV4(
        D6_STANDARD_GEOMETRY_V4,
        d6.result,
        d6Placement,
      ),
    ).toThrow("Three.js V4 face-local physical mapping is not implemented");
    expect(() =>
      createPhysicalMaterialDataTextureV4(
        { ...d6.appearance, texture: d6Placement },
        D6_STANDARD_GEOMETRY_V4,
      ),
    ).toThrow("Three.js V4 face-local physical mapping is not implemented");
  });

  it("builds a canonical seam-safe spherical Other mesh", () => {
    const geometry = createSphericalGeometryV4(
      OTHER_SPHERE_GEOMETRY_V4,
      d6.appearance.texture,
    );
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const uvs = geometry.getAttribute("uv");
    const indices = geometry.getIndex();
    if (indices === null) throw new Error("Sphere geometry index is missing");

    expect(positions.count).toBe(2_145);
    expect(normals.count).toBe(2_145);
    expect(uvs.count).toBe(2_145);
    expect(indices.count).toBe(11_904);
    expect(Array.from(positions.array.slice(0, 3))).toEqual([0, 1, 0]);
    expect(Array.from(uvs.array.slice(0, 2))).toEqual([0.5 / 64, 0]);
    expect(uvs.getX(64)).toBe(1 + 0.5 / 64);
    expect(uvs.getX(32 * 65)).toBe(-0.5 / 64);
    const capIndices = [
      indices.getX(0),
      indices.getX(1),
      indices.getX(2),
    ];
    const capDirection = capIndices
      .reduce(
        (sum, index) =>
          sum.add(new Vector3().fromBufferAttribute(positions, index)),
        new Vector3(),
      )
      .normalize();
    const capU =
      capIndices.reduce((sum, index) => sum + uvs.getX(index), 0) /
      capIndices.length;
    expect(capU).toBeCloseTo(
      sphericalSkinCoordinateFromNormalV4([
        capDirection.x,
        capDirection.y,
        capDirection.z,
      ])[0],
      7,
    );
    const bottomCapOffset = indices.count - 64 * 3;
    const bottomCapIndices = [
      indices.getX(bottomCapOffset),
      indices.getX(bottomCapOffset + 1),
      indices.getX(bottomCapOffset + 2),
    ];
    const bottomCapDirection = bottomCapIndices
      .reduce(
        (sum, index) =>
          sum.add(new Vector3().fromBufferAttribute(positions, index)),
        new Vector3(),
      )
      .normalize();
    const bottomCapU =
      bottomCapIndices.reduce((sum, index) => sum + uvs.getX(index), 0) /
      bottomCapIndices.length;
    expect(bottomCapU).toBeCloseTo(
      sphericalSkinCoordinateFromNormalV4([
        bottomCapDirection.x,
        bottomCapDirection.y,
        bottomCapDirection.z,
      ])[0],
      7,
    );
    const front = 16 * 65 + 32;
    expect(Array.from(positions.array.slice(front * 3, front * 3 + 3))).toEqual([
      0, 0, 1,
    ]);
    for (let offset = 0; offset < indices.count; offset += 3) {
      const first = new Vector3().fromBufferAttribute(
        positions,
        indices.getX(offset),
      );
      const second = new Vector3().fromBufferAttribute(
        positions,
        indices.getX(offset + 1),
      );
      const third = new Vector3().fromBufferAttribute(
        positions,
        indices.getX(offset + 2),
      );
      const normal = new Vector3().fromBufferAttribute(
        normals,
        indices.getX(offset),
      );
      expect(
        second.sub(first).cross(third.sub(first)).dot(normal),
      ).toBeGreaterThan(0);
    }
    geometry.dispose();

    const placement = {
      ...d6.appearance.texture,
      rotation: 37,
      offsetU: 12_345,
      offsetV: 54_321,
    };
    const placedGeometry = createSphericalGeometryV4(
      OTHER_SPHERE_GEOMETRY_V4,
      placement,
    );
    const placedUvs = placedGeometry.getAttribute("uv");
    const expectedPoleUv = placedTextureUvV4(0.5 / 64, 0, placement);
    expect(placedUvs.getX(0)).toBeCloseTo(expectedPoleUv[0], 7);
    expect(placedUvs.getY(0)).toBeCloseTo(expectedPoleUv[1], 7);
    placedGeometry.dispose();

    expect(() =>
      createSphericalGeometryV4(
        OTHER_SPHERE_GEOMETRY_V4,
        { ...d6.appearance.texture, scope: "face-local" },
      ),
    ).toThrow("Three.js V4 face-local physical mapping is not implemented");
    expect(() =>
      createSphericalGeometryV4(
        OTHER_SPHERE_GEOMETRY_V4,
        d6.appearance.texture,
        2,
      ),
    ).toThrow("Three.js V4 sphere geometry is invalid");
  });

  it("uploads exact source texels with CanvasKit-compatible sampling", () => {
    const expected = generateMaterialTextureV4(
      createTextureGenerationInputV4(
        "canvaskit-v4-r32",
        d6.appearance,
      ),
    );
    const texture = createMaterialDataTextureV4(d6.appearance);

    expect(texture.image).toMatchObject({
      width: expected.width,
      height: expected.height,
      data: expected.pixels,
    });
    expect(texture.format).toBe(RGBAFormat);
    expect(texture.type).toBe(UnsignedByteType);
    expect(texture.colorSpace).toBe(SRGBColorSpace);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.flipY).toBe(false);

    expect(
      placedTextureUvV4(0.25, 0.75, {
        rotation: 0,
        offsetU: 0,
        offsetV: 0,
      }),
    ).toEqual([0.25, 0.75]);
    expect(
      placedTextureUvV4(0.25, 0.75, {
        rotation: 90,
        offsetU: 0,
        offsetV: 0,
      }),
    ).toEqual([0.75, 0.75]);
    const arbitrarilyPlaced = placedTextureUvV4(0.25, 0.75, {
      rotation: 37,
      offsetU: 12_345,
      offsetV: 54_321,
    });
    expect(arbitrarilyPlaced[0]).toBeCloseTo(-0.1984719260044585, 14);
    expect(arbitrarilyPlaced[1]).toBeCloseTo(0.30150924856297934, 14);

    texture.dispose();
  });
});
