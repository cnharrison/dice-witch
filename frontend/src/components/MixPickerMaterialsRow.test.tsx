// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MixPickerMaterialsRow } from "@/components/MixPickerMaterialsRow";
import type {
  AppearanceCatalogV3,
} from "@/types/appearance";
import type {
  AppearanceMaterialV4,
  AppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";
import { MATERIAL_WEIGHT_TOTAL_V3 } from "@/lib/material-weight-percentages";

// Material values are opaque to this component; fixtures carry only the
// family discriminator.
const materialValue = (family: string) => ({ family }) as AppearanceMaterialV4;

const catalog = {
  materials: [
    { family: "classic", name: "Classic", defaultValue: materialValue("classic-default") },
    { family: "glass", name: "Glass", defaultValue: materialValue("glass-default") },
    { family: "metal", name: "Metal", defaultValue: materialValue("metal-default") },
  ],
} as never as AppearanceCatalogV3;

function recipeWithMaterial(
  material: AppearanceRecipeV3["material"],
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "curated",
    varyBy: "die",
    colors: { mode: "palette", colors: ["#111111", "#222222"] },
    material,
    form: { polyhedral: { mode: "fixed", value: "standard" }, other: "sphere" },
    font: { mode: "fixed", value: "cinzel" },
    engraving: { mode: "fixed", value: "matte-ink" },
    gradient: {
      scope: { mode: "fixed", value: "repeated" },
      direction: { mode: "fixed", value: "top-to-bottom" },
    },
    lighting: {
      mode: { mode: "fixed", value: "facet" },
      strength: { mode: "fixed", value: "subtle" },
      direction: { mode: "fixed", value: "upper-left" },
    },
  };
}

const thumbVersion = { catalogVersion: 3, rendererRevision: "canvaskit-v4-r41" };

afterEach(cleanup);

describe("MixPickerMaterialsRow", () => {
  it("renders one tile per catalog material with pressed state and thumbs", () => {
    const recipe = recipeWithMaterial({
      mode: "fixed",
      value: materialValue("classic"),
    });
    render(
      <MixPickerMaterialsRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={thumbVersion}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Classic/ }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /Glass/ }).getAttribute("aria-pressed"))
      .toBe("false");
    const images = screen.getAllByRole("presentation").length;
    void images;
    // Thumb imgs are decorative (alt="") inside named buttons.
    expect(document.querySelectorAll("img")).toHaveLength(3);
  });

  it("adds a tapped material to a fixed selection as an allowlist pair", () => {
    const recipe = recipeWithMaterial({
      mode: "fixed",
      value: materialValue("classic"),
    });
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Glass/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    expect(next.material).toEqual({
      mode: "allowlist",
      values: [materialValue("classic"), materialValue("glass-default")],
    });
  });

  it("keeps tuned parameters when a selected family stays in the mix", () => {
    const tuned = materialValue("glass");
    const recipe = recipeWithMaterial({
      mode: "allowlist",
      values: [materialValue("classic"), tuned],
    });
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Classic/ }));
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    expect(next.material).toEqual({ mode: "fixed", value: tuned });
  });

  it("drops a weighted segment and rebalances onto the shared total", () => {
    const recipe = recipeWithMaterial({
      mode: "weighted",
      options: [
        { value: materialValue("classic"), weight: 500 },
        { value: materialValue("glass"), weight: 300 },
        { value: materialValue("metal"), weight: 200 },
      ],
    });
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Glass/ }));
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    if (next.material.mode !== "weighted") throw new Error("expected weighted");
    // Proportional rebalance of the remaining shares onto the shared total.
    expect(next.material.options.map(({ weight }) => weight)).toEqual([714, 286]);
  });

  it("never removes the last remaining material", () => {
    const recipe = recipeWithMaterial({
      mode: "fixed",
      value: materialValue("classic"),
    });
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Classic/ }));
    expect(screen.getByRole("button", { name: /Classic/ }).disabled).toBe(true);
  });

  it("inserts a joining weighted tile at the smallest share and rebalances", () => {
    const recipe = recipeWithMaterial({
      mode: "weighted",
      options: [
        { value: materialValue("classic"), weight: 800 },
        { value: materialValue("glass"), weight: 200 },
      ],
    });
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Metal/ }));
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    if (next.material.mode !== "weighted") throw new Error("expected weighted");
    const total = next.material.options.reduce(
      (sum, option) => sum + option.weight,
      0,
    );
    expect(total).toBe(MATERIAL_WEIGHT_TOTAL_V3);
    expect(next.material.options.map(({ weight }) => weight)).toEqual([
      666, 167, 167,
    ]);
  });

  it("shows the mix bar only for weighted rows with several materials", () => {
    const fixed = recipeWithMaterial({
      mode: "fixed",
      value: materialValue("classic"),
    });
    const { rerender } = render(
      <MixPickerMaterialsRow
        recipe={fixed}
        catalog={catalog}
        thumbVersion={null}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("group", { name: "Material mix balance" }),
    ).toBeNull();

    rerender(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            { value: materialValue("classic"), weight: 700 },
            { value: materialValue("glass"), weight: 300 },
          ],
        })}
        catalog={catalog}
        thumbVersion={null}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Material mix balance" }),
    ).not.toBeNull();
  });

  it("rebalances adjacent segments with keyboard on the handle", () => {
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            { value: materialValue("classic"), weight: 700 },
            { value: materialValue("glass"), weight: 300 },
          ],
        })}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    const handle = screen.getByRole("slider");
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    if (next.material.mode !== "weighted") throw new Error("expected weighted");
    expect(next.material.options.map(({ weight }) => weight)).toEqual([
      690, 310,
    ]);
  });
});
