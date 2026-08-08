import { describe, expect, it } from "vitest";
import {
  CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4,
  TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4,
  validateRenderRequestV4,
  type AppearanceMaterialV4,
  type RenderDieV4,
  type RenderRequestV4,
} from "../src";

const materials: AppearanceMaterialV4[] = [
  {
    family: "classic",
    treatment: "solid",
    opacity: "opaque",
    finish: "satin",
    textureScale: 100,
  },
  {
    family: "sharp-resin",
    style: "clear",
    inclusion: "foil",
    clarity: 85,
    inclusionDensity: 35,
    finish: "polished",
    textureScale: 120,
  },
  {
    family: "liquid-core",
    core: "cosmic",
    clarity: 90,
    particleDensity: 45,
    finish: "polished",
    textureScale: 110,
  },
  {
    family: "gemstone",
    stone: "jade",
    veinDensity: 55,
    finish: "polished",
    textureScale: 130,
  },
  {
    family: "glass",
    style: "prismatic",
    clarity: 95,
    finish: "etched",
    textureScale: 100,
  },
  {
    family: "stone",
    stone: "granite",
    grainDensity: 65,
    finish: "honed",
    textureScale: 90,
  },
  {
    family: "metal",
    metal: "brass",
    finish: "brushed",
    patinaStrength: 20,
    textureScale: 100,
  },
  {
    family: "hollow-metal",
    construction: "filigree",
    metal: "silver",
    finish: "polished",
    openness: 60,
    textureScale: 100,
  },
  {
    family: "wood",
    wood: "burl",
    finish: "lacquered",
    grainDensity: 75,
    textureScale: 150,
  },
  {
    family: "fantasy",
    essence: "void",
    intensity: 80,
    finish: "radiant",
    textureScale: 140,
  },
];

function formFor(material: AppearanceMaterialV4): RenderDieV4["form"] {
  if (material.family === "hollow-metal") return "hollow-cage";
  if (["gemstone", "glass", "fantasy"].includes(material.family)) {
    return "crystal-cut";
  }
  return "standard";
}

function die(
  material: AppearanceMaterialV4 = materials[0] as AppearanceMaterialV4,
): RenderDieV4 {
  const family = material.family;
  return {
    target: "d20",
    result: 20,
    form: formFor(material),
    appearance: {
      material,
      palette: ["#123456", "#abcdef"],
      texture: {
        generatorId: TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[family],
        seed: 0x51ce_b00c,
        scale: material.textureScale,
        rotation: 315,
        offsetU: 12_345,
        offsetV: 54_321,
      },
      lighting: {
        mode: "combined",
        strength: "gentle",
        direction: "upper-left",
      },
      engraving: {
        fontId: "liberation-sans",
        finish: "matte-ink",
        color: "#faf9f6",
      },
      outlineColor: "#000000",
      requiresLocalSeparation: false,
      effect: {
        state: "critical-success",
        treatment: CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4[family],
        color: "#ffcc00",
        intensity: 40,
      },
    },
    icons: ["critical-success"],
  };
}

function requestWithDie(value: unknown): unknown {
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r1",
    groups: [[value]],
  };
}

function validRequest(): RenderRequestV4 {
  return requestWithDie(die()) as RenderRequestV4;
}

function revision2Request(
  value: RenderDieV4 = die(),
  scope: "die-wide" | "face-local" = "die-wide",
) {
  const snapshot = structuredClone(value);
  Object.assign(snapshot.appearance.texture, {
    scope,
    ...(scope === "face-local" ? { offsetU: 0, offsetV: 0 } : {}),
  });
  return {
    version: 4,
    rendererRevision: "canvaskit-v4-r2",
    groups: [[snapshot]],
  };
}

describe("RenderRequestV4", () => {
  it("requires resolved camera angles only for the camera revision", () => {
    const legacy = validRequest();
    expect(validateRenderRequestV4(legacy)).toEqual(legacy);

    const currentDie = die();
    currentDie.appearance.texture.scope = "die-wide";
    currentDie.view = {
      kind: "camera",
      elevationDegrees: 40,
      azimuthOffsetDegrees: -10,
      poseAzimuthDegrees: 0,
    };
    const current = {
      version: 4,
      rendererRevision: "canvaskit-v4-r16",
      groups: [[currentDie]],
    } as const;
    expect(validateRenderRequestV4(current)).toEqual(current);

    const missingView = structuredClone(current);
    delete (missingView.groups[0][0] as { view?: unknown }).view;
    expect(() => validateRenderRequestV4(missingView)).toThrow(
      "Render request groups[0][0] has invalid fields",
    );

    const invalidPose = structuredClone(current);
    const invalidPoseView = invalidPose.groups[0][0].view;
    if (invalidPoseView?.kind !== "camera") {
      throw new Error("Current camera fixture is invalid");
    }
    invalidPoseView.poseAzimuthDegrees = 120;
    expect(() => validateRenderRequestV4(invalidPose)).toThrow(
      "Render request groups[0][0].view.poseAzimuthDegrees is invalid",
    );

    const realistic = {
      ...structuredClone(current),
      rendererRevision: "canvaskit-v4-r17" as const,
    };
    const realisticView = realistic.groups[0][0].view;
    if (realisticView === undefined || realisticView.kind !== "camera") {
      throw new Error("Realistic camera fixture is invalid");
    }
    realisticView.azimuthOffsetDegrees = 45;
    realisticView.poseAzimuthDegrees = 180;
    expect(validateRenderRequestV4(realistic)).toEqual(realistic);

    const azimuths = [-45, -35, -25, -15, -5, 5, 15, 25, 35, 45];
    const poses = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];
    for (const [index, azimuthOffsetDegrees] of azimuths.entries()) {
      const preset = structuredClone(realistic);
      const presetView = preset.groups[0][0].view;
      if (presetView === undefined || presetView.kind !== "camera") {
        throw new Error("Camera preset fixture is invalid");
      }
      const poseAzimuthDegrees = poses[index];
      if (poseAzimuthDegrees === undefined) {
        throw new Error("Pose preset fixture is missing");
      }
      presetView.azimuthOffsetDegrees = azimuthOffsetDegrees;
      presetView.poseAzimuthDegrees = poseAzimuthDegrees;
      expect(validateRenderRequestV4(preset)).toEqual(preset);
    }
  });

  it("accepts and canonicalizes every material family", () => {
    for (const material of materials) {
      const parsed = validateRenderRequestV4(requestWithDie(die(material)));
      const parsedDie = parsed.groups[0]?.[0];
      expect(parsedDie?.appearance.material).toEqual(material);
      expect(parsedDie?.appearance.texture.generatorId).toBe(
        TEXTURE_GENERATOR_BY_MATERIAL_FAMILY_V4[material.family],
      );
      expect(parsedDie?.appearance.effect?.treatment).toBe(
        CRITICAL_TREATMENT_BY_MATERIAL_FAMILY_V4[material.family],
      );
    }

    const uppercase = validRequest();
    const uppercaseDie = uppercase.groups[0]?.[0];
    if (uppercaseDie === undefined) throw new Error("Test die is missing");
    uppercaseDie.appearance.palette = ["#ABCDEF", "#123456"];
    expect(
      validateRenderRequestV4(uppercase).groups[0]?.[0]?.appearance.palette,
    ).toEqual(["#abcdef", "#123456"]);
  });

  it("keeps r1 scope-free and requires explicit texture scope in later revisions", () => {
    const r1 = validateRenderRequestV4(validRequest());
    expect(r1.groups[0]?.[0]?.appearance.texture).not.toHaveProperty("scope");
    for (const rendererRevision of [
      "canvaskit-v4-r2",
      "canvaskit-v4-r3",
      "canvaskit-v4-r4",
      "canvaskit-v4-r5",
      "canvaskit-v4-r6",
      "canvaskit-v4-r7",
      "canvaskit-v4-r8",
      "canvaskit-v4-r9",
      "canvaskit-v4-r10",
      "canvaskit-v4-r11",
      "canvaskit-v4-r12",
      "canvaskit-v4-r13",
      "canvaskit-v4-r14",
    ] as const) {
      expect(() =>
        validateRenderRequestV4({
          ...validRequest(),
          rendererRevision,
        }),
      ).toThrow("appearance.texture has invalid fields");
    }
    expect(() =>
      validateRenderRequestV4({
        ...revision2Request(),
        rendererRevision: "canvaskit-v4-r1",
      }),
    ).toThrow("appearance.texture has invalid fields");

    const dieWide = validateRenderRequestV4(revision2Request());
    const revision3 = revision2Request();
    revision3.rendererRevision = "canvaskit-v4-r3";
    const dieWideR3 = validateRenderRequestV4(revision3);
    const revision4 = revision2Request();
    revision4.rendererRevision = "canvaskit-v4-r4";
    const dieWideR4 = validateRenderRequestV4(revision4);
    const revision5 = revision2Request();
    revision5.rendererRevision = "canvaskit-v4-r5";
    const dieWideR5 = validateRenderRequestV4(revision5);
    const revision6 = revision2Request();
    revision6.rendererRevision = "canvaskit-v4-r6";
    const dieWideR6 = validateRenderRequestV4(revision6);
    const revision7 = revision2Request();
    revision7.rendererRevision = "canvaskit-v4-r7";
    const dieWideR7 = validateRenderRequestV4(revision7);
    const revision8 = revision2Request();
    revision8.rendererRevision = "canvaskit-v4-r8";
    const dieWideR8 = validateRenderRequestV4(revision8);
    const faceLocal = validateRenderRequestV4(
      revision2Request(
        die({
          family: "classic",
          treatment: "gradient",
          opacity: "opaque",
          finish: "satin",
          textureScale: 100,
        }),
        "face-local",
      ),
    );
    expect(dieWide.groups[0]?.[0]?.appearance.texture.scope).toBe("die-wide");
    expect(dieWideR3.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR4.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR5.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR6.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR7.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(dieWideR8.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "die-wide",
    );
    expect(faceLocal.groups[0]?.[0]?.appearance.texture.scope).toBe(
      "face-local",
    );
  });

  it("bounds face-local scope to zero-offset standard polyhedral classic gradients", () => {
    const gradient = die({
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    const offset = revision2Request(gradient, "face-local");
    const offsetDie = offset.groups[0]?.[0];
    if (offsetDie === undefined) throw new Error("Test die is missing");
    offsetDie.appearance.texture.offsetU = 1;
    expect(() => validateRenderRequestV4(offset)).toThrow(
      "face-local texture scope does not support offsets",
    );

    const pattern = die({
      family: "classic",
      treatment: "pattern",
      patternId: "checkerboard",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    expect(() =>
      validateRenderRequestV4(revision2Request(pattern, "face-local")),
    ).toThrow("face-local texture scope requires classic gradient material");

    const sharp = die({
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    sharp.form = "sharp";
    expect(() =>
      validateRenderRequestV4(revision2Request(sharp, "face-local")),
    ).toThrow("face-local texture scope requires standard form");

    const other = die({
      family: "classic",
      treatment: "gradient",
      opacity: "opaque",
      finish: "satin",
      textureScale: 100,
    });
    const otherValue = {
      ...other,
      target: "other",
      sides: 20,
      form: "sphere",
    };
    expect(() =>
      validateRenderRequestV4(
        revision2Request(otherValue as RenderDieV4, "face-local"),
      ),
    ).toThrow("face-local texture scope is invalid for other");
  });

  it("accepts the authored beech and vine-carved wood contract", () => {
    const material = {
      family: "wood",
      wood: "beech",
      finish: "vine-carved",
      grainDensity: 48,
      textureScale: 100,
    } as const;
    const parsed = validateRenderRequestV4(requestWithDie(die(material)));
    expect(parsed.groups[0]?.[0]?.appearance.material).toEqual(material);
  });

  it("enforces exact request fields, version, non-empty groups, and 50 dice", () => {
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), extra: true }),
    ).toThrow("Render request V4 has invalid fields");
    expect(() =>
      validateRenderRequestV4(
        Object.assign(Object.create({}) as object, validRequest()),
      ),
    ).toThrow("Render request V4 has invalid fields");
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), version: 3 }),
    ).toThrow("Render request version must be 4");
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), groups: [] }),
    ).toThrow("Render request groups must be a non-empty array");
    expect(() =>
      validateRenderRequestV4({ ...validRequest(), groups: [[]] }),
    ).toThrow("Render request groups[0] must be a non-empty array");

    expect(() =>
      validateRenderRequestV4({
        ...validRequest(),
        groups: [Array.from({ length: 50 }, () => die())],
      }),
    ).not.toThrow();
    expect(() =>
      validateRenderRequestV4({
        ...validRequest(),
        groups: [Array.from({ length: 51 }, () => die())],
      }),
    ).toThrow("Render request exceeds 50 dice");
  });

  it("validates target results, Other sides, and form compatibility", () => {
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(), target: "d10", result: 1 }),
      ),
    ).not.toThrow();
    for (const result of [0, 11]) {
      expect(() =>
        validateRenderRequestV4(
          requestWithDie({ ...die(), target: "d10", result }),
        ),
      ).toThrow(
        "Render request groups[0][0].result must be from 1 through 10",
      );
    }
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(), target: "percentile", result: 85 }),
      ),
    ).toThrow(
      "Render request groups[0][0].result must be a multiple of 10 from 0 through 90",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(), target: "fudge", result: 2 }),
      ),
    ).toThrow("Render request groups[0][0].result must be -1, 0, or 1");

    const other = { ...die(), target: "other", sides: 999, result: 999, form: "sphere" };
    expect(() => validateRenderRequestV4(requestWithDie(other))).not.toThrow();
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...other, sides: 1_000, result: 1_000 }),
      ),
    ).toThrow("Render request groups[0][0].sides must be from 1 through 999");
    expect(() =>
      validateRenderRequestV4(requestWithDie({ ...die(), form: "sphere" })),
    ).toThrow("Render request groups[0][0].form is invalid for d20");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...other, form: "standard" }),
      ),
    ).toThrow("Render request groups[0][0].form is invalid for other");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({ ...die(materials[6]), form: "hollow-cage" }),
      ),
    ).toThrow(
      "Render request groups[0][0].form is incompatible with metal material",
    );
    for (const form of ["sharp", "crystal-cut", "hollow-cage"] as const) {
      const material =
        form === "hollow-cage" ? materials[7] : materials[4];
      if (material === undefined) throw new Error("Test material is missing");
      expect(() =>
        validateRenderRequestV4(
          requestWithDie({ ...die(material), target: "d6", result: 6, form }),
        ),
      ).toThrow(
        `Render request groups[0][0].form is not implemented for d6`,
      );
    }
  });

  it("rejects invalid material parameters and mismatched renderer assets", () => {
    const base = die(materials[1]);
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            material: { ...base.appearance.material, clarity: 101 },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.material.clarity must be from 0 through 100",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            material: { ...base.appearance.material, extra: true },
          },
        }),
      ),
    ).toThrow("Render request groups[0][0].appearance.material has invalid fields");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            texture: { ...base.appearance.texture, generatorId: "glass-v1" },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.texture.generatorId does not match sharp-resin material",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            texture: { ...base.appearance.texture, scale: 121 },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.texture.scale does not match material textureScale",
    );
    const effect = base.appearance.effect;
    if (effect === null) throw new Error("Test effect is missing");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            effect: { ...effect, treatment: "spectral-rim" },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.effect.treatment does not match sharp-resin material",
    );
  });

  it("keeps critical effects and modifier icons consistent", () => {
    const critical = die();
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...critical,
          appearance: { ...critical.appearance, effect: null },
        }),
      ),
    ).toThrow("critical effect does not match modifier icons");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...critical,
          icons: ["critical-failure"],
        }),
      ),
    ).toThrow("critical effect does not match modifier icons");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...critical,
          icons: ["critical-success", "critical-failure"],
        }),
      ),
    ).toThrow("critical effect does not match modifier icons");
  });

  it("bounds palette, texture, lighting, engraving, and icons", () => {
    const base = die();
    for (const palette of [
      ["#123456"],
      ["#123456", "#123456"],
      ["#000000", "#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
    ]) {
      expect(() =>
        validateRenderRequestV4(
          requestWithDie({
            ...base,
            appearance: { ...base.appearance, palette },
          }),
        ),
      ).toThrow("Render request groups[0][0].appearance.palette is invalid");
    }
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            texture: { ...base.appearance.texture, rotation: 360 },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.texture.rotation must be from 0 through 359",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            lighting: { mode: "none", strength: "gentle" },
          },
        }),
      ),
    ).toThrow("Render request groups[0][0].appearance.lighting is invalid");
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          appearance: {
            ...base.appearance,
            engraving: { ...base.appearance.engraving, fontId: "missing" },
          },
        }),
      ),
    ).toThrow(
      "Render request groups[0][0].appearance.engraving.fontId is not supported",
    );
    expect(() =>
      validateRenderRequestV4(
        requestWithDie({
          ...base,
          icons: ["trashcan", "explosion", "recycle", "unique"],
        }),
      ),
    ).toThrow("Render request groups[0][0].icons must contain at most three icons");
  });
});
