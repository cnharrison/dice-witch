import { describe, expect, it } from "vitest";
import {
  renderDiceToPng,
  type IconName,
  type PatternNameV1V2,
  type RenderDie,
} from "../../packages/dice-svg/src";

const iconNames: IconName[] = [
  "trashcan",
  "explosion",
  "recycle",
  "chevronUp",
  "chevronDown",
  "target-success",
  "critical-success",
  "critical-failure",
  "penetrate",
  "unique",
  "blank",
];

const patternNames: PatternNameV1V2[] = [
  "checkerboard",
  "dots",
  "stripes",
  "stars",
  "zigzag",
  "triangles",
  "honeycomb",
  "circuit",
  "crosshatch",
  "swirl",
];

function createDie(
  sides: RenderDie["sides"],
  rolled: number,
  overrides: Partial<RenderDie> = {},
): RenderDie {
  return {
    sides,
    rolled,
    color: "#6f42c1",
    secondaryColor: "#24143d",
    textColor: "#faf9f6",
    outlineColor: "#000000",
    icons: [],
    fill: { type: "gradient" },
    ...overrides,
  };
}

async function expectRenderable(dice: RenderDie[]): Promise<void> {
  const result = await renderDiceToPng({ version: 1, groups: [dice] });
  expect([...result.png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(result.png.byteLength).toBeGreaterThan(1_000);
}

describe("renderer fixture corpus", () => {
  for (const sides of [4, 6, 8, 12, 20] as const) {
    it(`renders every d${sides} face`, async () => {
      await expectRenderable(
        Array.from({ length: sides }, (_, index) => createDie(sides, index + 1)),
      );
    });
  }

  it("renders every d10, percentile, and Fudge face", async () => {
    await expectRenderable([
      ...Array.from({ length: 10 }, (_, result) => createDie(10, result)),
      ...Array.from({ length: 10 }, (_, index) => createDie("%", index * 10)),
      ...[-1, 0, 1].map((result) => createDie("F", result)),
    ]);
  });

  it("renders generic dice and light/dark text combinations", async () => {
    await expectRenderable([
      createDie(2, 2),
      createDie(37, 23),
      createDie(100, 100),
      createDie(999, 999),
      createDie(20, 17, {
        color: "#f8f9fa",
        secondaryColor: "#ced4da",
        textColor: "#111111",
      }),
      createDie(20, 17, {
        color: "#111111",
        secondaryColor: "#343a40",
        textColor: "#ffffff",
      }),
    ]);
  });

  it("renders every deterministic pattern", async () => {
    await expectRenderable(
      patternNames.map((pattern, index) =>
        createDie(20, index + 1, { fill: { type: "pattern", pattern } }),
      ),
    );
  });

  it("renders every icon and multi-modifier spacing", async () => {
    await expectRenderable([
      ...iconNames.map((icon, index) =>
        createDie(20, index + 1, { icons: [icon] }),
      ),
      createDie(20, 20, { icons: ["explosion", "recycle"] }),
      createDie(20, 18, {
        icons: ["target-success", "chevronUp", "unique"],
      }),
    ]);
  });
});
