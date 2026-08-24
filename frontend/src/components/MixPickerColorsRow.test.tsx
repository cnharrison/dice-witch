// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MixPickerColorsRow } from "@/components/MixPickerColorsRow";
import type {
  AppearanceCatalogV3,
} from "@/types/appearance";
import type {
  AppearanceMaterialV4,
  AppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";

const materialValue = (family: string) => ({ family }) as AppearanceMaterialV4;

const catalog = {
  styles: [
    {
      id: "rainbow",
      recipe: {
        colors: { mode: "palette", colors: ["#aa0000", "#00aa00", "#0000aa"] },
      },
    },
  ],
  materials: [
    { family: "classic", name: "Classic", defaultValue: materialValue("classic-default") },
    { family: "glass", name: "Glass", defaultValue: materialValue("glass-default") },
    { family: "fantasy", name: "Fantasy", defaultValue: materialValue("fantasy-default") },
  ],
  editorDefaults: {
    primaryColor: "#101010",
    palette: ["#201040", "#301050", "#401060"],
    patternId: "dots",
  },
} as never as AppearanceCatalogV3;

function recipeWith(
  material: AppearanceRecipeV3["material"],
  colors: AppearanceRecipeV3["colors"],
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "curated",
    varyBy: "die",
    colors,
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

const palette = { mode: "palette" as const, colors: ["#111111", "#222222"] };

afterEach(cleanup);

describe("MixPickerColorsRow", () => {
  it("collapses to a caption when every selected material brings its own colors", () => {
    const onChange = vi.fn();
    render(
      <MixPickerColorsRow
        recipe={recipeWith(
          { mode: "fixed", value: materialValue("fantasy") },
          palette,
        )}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("These materials bring their own colors."))
      .not.toBeNull();
    expect(screen.queryByLabelText(/Palette color/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Random" })).toBeNull();
  });

  it("explains which selected materials the row applies to without duplicate families", () => {
    render(
      <MixPickerColorsRow
        recipe={recipeWith(
          {
            mode: "weighted",
            options: [
              { value: materialValue("classic"), weight: 300 },
              { value: materialValue("classic"), weight: 300 },
              { value: materialValue("fantasy"), weight: 400 },
            ],
          },
          palette,
        )}
        catalog={catalog}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Applies to Classic — Fantasy brings its own"),
    ).not.toBeNull();
  });

  it("adds and removes palette chips within the validator bounds", () => {
    const material = {
      mode: "allowlist" as const,
      values: [materialValue("classic"), materialValue("glass")],
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <MixPickerColorsRow
        recipe={recipeWith(
          material,
          { mode: "palette", colors: ["#111111", "#222222", "#333333"] },
        )}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    // jsdom cannot simulate <input type="color"> change events, so the emit
    // paths run through the plain chip controls.
    fireEvent.click(screen.getByRole("button", { name: "Add palette color" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipeWith(material, { mode: "palette", colors: [] }),
      colors: {
        mode: "palette",
        colors: ["#111111", "#222222", "#333333", "#201040"],
      },
    });

    rerender(
      <MixPickerColorsRow
        recipe={recipeWith(
          material,
          { mode: "palette", colors: ["#abcdef", "#222222", "#333333"] },
        )}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    onChange.mockClear();
    fireEvent.click(screen.getByLabelText("Remove palette color 1"));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipeWith(material, { mode: "palette", colors: [] }),
      colors: { mode: "palette", colors: ["#222222", "#333333"] },
    });

    rerender(
      <MixPickerColorsRow
        recipe={recipeWith(
          material,
          { mode: "palette", colors: ["#abcdef", "#222222"] },
        )}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    expect(screen.queryByLabelText(/Remove palette color/)).toBeNull();
  });

  it("edits dice colors through the custom picker instead of a native input", () => {
    const recipe = recipeWith(
      { mode: "fixed", value: materialValue("classic") },
      { mode: "solid", primary: "#444444" },
    );
    const onChange = vi.fn();
    render(
      <MixPickerColorsRow
        recipe={recipe}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    expect(document.querySelector('input[type="color"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dice color" }));
    expect(screen.getByRole("button", { name: "Choose hue and saturation" }))
      .not.toBeNull();
    fireEvent.change(screen.getByLabelText("Hex color"), {
      target: { value: "#ABCDEF" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      colors: { mode: "solid", primary: "#abcdef" },
    });
  });

  it("adds a second color to a solid design", () => {
    const recipe = recipeWith(
      { mode: "fixed", value: materialValue("classic") },
      { mode: "solid", primary: "#444444" },
    );
    const onChange = vi.fn();
    const { rerender } = render(
      <MixPickerColorsRow
        recipe={recipe}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add palette color" }));
    const next = {
      ...recipe,
      colors: {
        mode: "palette" as const,
        colors: ["#444444", "#201040"],
      },
    };
    expect(onChange).toHaveBeenLastCalledWith(next);

    rerender(
      <MixPickerColorsRow
        recipe={next}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Choose hue and saturation" }))
      .not.toBeNull();
  });

  it("converts procedural pairs before explicit color edits", () => {
    const recipe = {
      ...recipeWith(
        { mode: "fixed", value: materialValue("classic") },
        { mode: "vivid-random-pair" },
      ),
      randomization: "full-spectrum-v2" as const,
    };
    const onChange = vi.fn();
    const { rerender } = render(
      <MixPickerColorsRow
        recipe={recipe}
        catalog={catalog}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Dice color" }));
    const solid = onChange.mock.calls[0]?.[0] as AppearanceRecipeV3;
    expect(solid.colors).toEqual({
      mode: "solid",
      primary: catalog.editorDefaults.primaryColor,
    });
    expect(solid.randomization).toBeUndefined();

    rerender(
      <MixPickerColorsRow
        recipe={solid}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "Choose hue and saturation" }))
      .not.toBeNull();
  });

  it("toggles single-color treatment between solid and tonal", () => {
    const recipe = recipeWith(
      { mode: "fixed", value: materialValue("classic") },
      { mode: "solid", primary: "#444444" },
    );
    const onChange = vi.fn();
    render(
      <MixPickerColorsRow
        recipe={recipe}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "tonal" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      colors: { mode: "tonal", primary: "#444444" },
    });
  });

  it("keeps randomized colors read-only with an explanatory caption", () => {
    render(
      <MixPickerColorsRow
        recipe={recipeWith(
          { mode: "fixed", value: materialValue("classic") },
          { mode: "random", primary: "#666666" },
        )}
        catalog={catalog}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByText("A new color is drawn every roll."),
    ).not.toBeNull();
    expect(screen.queryByLabelText("Dice color")).toBeNull();
  });

  it("Random always changes the current palette", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const recipe = recipeWith(
      { mode: "fixed", value: materialValue("classic") },
      { mode: "palette", colors: ["#aa0000", "#00aa00", "#0000aa"] },
    );
    const onChange = vi.fn();
    const { rerender } = render(
      <MixPickerColorsRow
        recipe={recipe}
        catalog={catalog}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    const first = onChange.mock.calls[0]?.[0] as AppearanceRecipeV3;
    expect(first.colors).not.toEqual(recipe.colors);

    rerender(
      <MixPickerColorsRow
        recipe={first}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    const second = onChange.mock.calls[1]?.[0] as AppearanceRecipeV3;
    expect(second.colors).not.toEqual(first.colors);
    randomSpy.mockRestore();
  });

  it("Random writes a curated palette without touching other rows", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const recipe = {
      ...recipeWith(
        { mode: "fixed", value: materialValue("classic") },
        { mode: "solid", primary: "#444444" },
      ),
      randomization: "full-spectrum-v2" as const,
    };
    const onChange = vi.fn();
    render(
      <MixPickerColorsRow
        recipe={recipe}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    randomSpy.mockRestore();
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    expect(next.colors).toEqual({
      mode: "palette",
      colors: ["#aa0000", "#00aa00", "#0000aa"],
    });
    expect(next.material).toEqual(recipe.material);
    expect(next.font).toEqual(recipe.font);
    // Stale full-spectrum policies never survive an explicit color pick.
    expect(next.randomization).toBeUndefined();
  });
});
