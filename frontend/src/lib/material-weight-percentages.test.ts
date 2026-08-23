import { describe, expect, it } from "vitest";
import {
  MATERIAL_WEIGHT_TOTAL_V3,
  addMaterialWeightV3,
  formatMaterialWeightPercentV3,
  normalizeMaterialWeightsV3,
  removeMaterialWeightV3,
  updateMaterialWeightV3,
} from "./material-weight-percentages";

describe("linked material weights", () => {
  it("normalizes arbitrary relative weights without changing an exact 1000-part mix", () => {
    const randomMix = [510, 68, 68, 68, 68, 68, 30, 30, 30, 30, 30];

    expect(normalizeMaterialWeightsV3(randomMix)).toEqual(randomMix);
    expect(normalizeMaterialWeightsV3([1, 1])).toEqual([500, 500]);
    expect(normalizeMaterialWeightsV3([1_200, 300])).toEqual([800, 200]);
    expect(normalizeMaterialWeightsV3([9, 3, 1]).reduce((sum, value) => sum + value, 0)).toBe(
      MATERIAL_WEIGHT_TOTAL_V3,
    );
  });

  it("pins the moved slider and redistributes the remainder proportionally", () => {
    expect(updateMaterialWeightV3([500, 300, 200], 0, 700)).toEqual([
      700,
      180,
      120,
    ]);
    expect(updateMaterialWeightV3([998, 1, 1], 1, 500)).toEqual([
      499,
      500,
      1,
    ]);
  });

  it("rebalances add and remove operations while keeping one option at 100%", () => {
    expect(addMaterialWeightV3([700, 300])).toEqual([467, 200, 333]);
    expect(removeMaterialWeightV3([467, 200, 333], 1)).toEqual([584, 416]);
    expect(removeMaterialWeightV3([500, 500], 0)).toEqual([1000]);
  });

  it("formats thousandths as concise percentages", () => {
    expect(formatMaterialWeightPercentV3(510)).toBe("51%");
    expect(formatMaterialWeightPercentV3(68)).toBe("6.8%");
    expect(formatMaterialWeightPercentV3(1)).toBe("0.1%");
  });
});
