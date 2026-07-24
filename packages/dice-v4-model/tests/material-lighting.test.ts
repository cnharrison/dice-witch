import { describe, expect, it } from "vitest";
import {
  MATERIAL_LIGHT_RESPONSES_V4,
  MATERIAL_FAMILIES_V4,
  materialLightResponseV4,
} from "../src/index";

describe("V4 material light response", () => {
  it("pins every material family", () => {
    expect(MATERIAL_LIGHT_RESPONSES_V4).toEqual({
      classic: { highlight: 1, shadow: 1, rim: 1 },
      "sharp-resin": { highlight: 1.15, shadow: 0.92, rim: 1.25 },
      "liquid-core": { highlight: 1.2, shadow: 0.9, rim: 1.35 },
      gemstone: { highlight: 1.35, shadow: 0.95, rim: 1.4 },
      glass: { highlight: 1.4, shadow: 0.9, rim: 1.5 },
      stone: { highlight: 0.72, shadow: 1.08, rim: 0.55 },
      metal: { highlight: 1.45, shadow: 1.12, rim: 1.1 },
      "hollow-metal": { highlight: 1.35, shadow: 1.15, rim: 1.2 },
      wood: { highlight: 0.68, shadow: 1.05, rim: 0.45 },
      fantasy: { highlight: 1.25, shadow: 1, rim: 1.35 },
    });
    expect(
      Object.fromEntries(
        MATERIAL_FAMILIES_V4.map((family) => [
          family,
          materialLightResponseV4(family),
        ]),
      ),
    ).toEqual(MATERIAL_LIGHT_RESPONSES_V4);
  });
});
