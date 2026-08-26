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
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";

type MaterialFamilyFixture =
  | "classic"
  | "glass"
  | "fantasy"
  | "hollow-metal";

function catalogMaterial(family: MaterialFamilyFixture) {
  const material = APPEARANCE_CATALOG_V3.materials.find(
    ({ family: candidate }) => candidate === family,
  );
  if (material === undefined) throw new Error(`Missing ${family} fixture`);
  return material;
}

function materialValue(family: MaterialFamilyFixture): AppearanceMaterialV4 {
  return structuredClone(catalogMaterial(family).defaultValue);
}

const rainbowStyle = APPEARANCE_CATALOG_V3.styles.find(
  ({ id }) => id === "rainbow",
);
if (rainbowStyle === undefined) throw new Error("Missing rainbow fixture");
const prideStyle = APPEARANCE_CATALOG_V3.styles.find(
  ({ id }) => id === "pride",
);
if (prideStyle === undefined) throw new Error("Missing pride fixture");

const catalog = {
  ...APPEARANCE_CATALOG_V3,
  styles: [rainbowStyle, prideStyle],
  colorSchemeStyleIds: ["rainbow", "pride"],
  materials: [
    catalogMaterial("classic"),
    catalogMaterial("glass"),
    catalogMaterial("fantasy"),
    catalogMaterial("hollow-metal"),
  ],
  editorDefaults: {
    ...APPEARANCE_CATALOG_V3.editorDefaults,
    primaryColor: "#101010",
    palette: ["#201040", "#301050", "#401060"],
    patternId: "dots",
  },
} satisfies AppearanceCatalogV3;

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockRandomValues(...batches: number[][]) {
  let batchIndex = 0;
  return vi
    .spyOn(globalThis.crypto, "getRandomValues")
    .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      if (!(array instanceof Uint32Array)) {
        throw new Error("Expected a Uint32Array random buffer");
      }
      const batch = batches[batchIndex];
      if (batch === undefined) throw new Error("Missing random value batch");
      array.set(batch);
      batchIndex += 1;
      return array;
    });
}

describe("MixPickerColorsRow", () => {
  it("applies reusable color schemes without replacing material or texture", () => {
    const material = {
      family: "metal",
      metal: "steel",
      finish: "brushed",
      patinaStrength: 42,
      textureScale: 137,
    } as const satisfies AppearanceMaterialV4;
    const recipe = {
      ...recipeWith(
        { mode: "fixed", value: material },
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

    fireEvent.click(screen.getByRole("button", { name: "Pride" }));
    // SAFETY: The test controls this callback and verifies the emitted recipe below.
    const pride = onChange.mock.calls[0]?.[0] as AppearanceRecipeV3;
    expect(pride.colors).toEqual(catalog.styles[1]?.recipe.colors);
    expect(pride.colorDistribution).toBe("coordinated");
    expect(pride.material).toEqual(recipe.material);
    expect(pride.randomization).toBe("full-spectrum-v2");
    expect(pride.font).toEqual(recipe.font);

    fireEvent.click(screen.getByRole("button", { name: "Rainbow" }));
    // SAFETY: The test controls this callback and verifies the emitted recipe below.
    const rainbow = onChange.mock.calls[1]?.[0] as AppearanceRecipeV3;
    expect(rainbow.colorDistribution).toBe("one-per-die");
    expect(rainbow.material).toEqual(recipe.material);
  });

  it("keeps color schemes available when a material adds its own accents", () => {
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
    expect(screen.getByText("Fantasy adds its own accents")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Pride" })).toBeDefined();
    expect(screen.getAllByLabelText(/Palette color/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Random" })).toBeDefined();
  });

  it("lets Hollow Metal use a chosen tint without changing the material", () => {
    const hollowMetal = {
      family: "hollow-metal",
      construction: "filigree",
      metal: "steel",
      finish: "polished",
      openness: 58,
      textureScale: 100,
    } as const satisfies AppearanceMaterialV4;
    const recipe = recipeWith(
      { mode: "fixed", value: hollowMetal },
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

    fireEvent.click(screen.getByRole("button", { name: "Dice color" }));
    fireEvent.change(screen.getByLabelText("Hex color"), {
      target: { value: "#3366CC" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      colors: { mode: "solid", primary: "#3366cc" },
    });
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
      screen.getByText(
        "Applies to Classic — Fantasy adds its own accents",
      ),
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
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
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

  it("clears one-per-die distribution when Random produces one color", () => {
    mockRandomValues([0], [0, 1]);
    const recipe = {
      ...recipeWith(
        { mode: "fixed", value: materialValue("classic") },
        { mode: "palette", colors: ["#aa0000", "#00aa00", "#0000aa"] },
      ),
      colorDistribution: "one-per-die" as const,
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
    // SAFETY: The test controls this callback and verifies the emitted recipe below.
    const next = onChange.mock.calls[0]?.[0] as AppearanceRecipeV3;
    expect(next.colors.mode).toBe("solid");
    expect(next.colorDistribution).toBeUndefined();
  });

  it("Random generates new colors on every click", () => {
    mockRandomValues(
      [2],
      [0, 1, 2, 3],
      [3],
      [45, 4, 5, 6, 7],
    );
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
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
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
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const second = onChange.mock.calls[1]?.[0] as AppearanceRecipeV3;
    expect(second.colors).not.toEqual(first.colors);
  });

  it("Random chooses between one and six colors without touching other rows", () => {
    mockRandomValues(
      [0xffff_fffc],
      [0],
      [0, 1],
      [5],
      [0, 1, 2, 3, 4, 5, 6],
    );
    const recipe = {
      ...recipeWith(
        { mode: "fixed", value: materialValue("classic") },
        { mode: "solid", primary: "#444444" },
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

    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const oneColor = onChange.mock.calls[0]?.[0] as AppearanceRecipeV3;
    expect(oneColor.colors.mode).toBe("solid");
    expect(oneColor.material).toEqual(recipe.material);
    expect(oneColor.font).toEqual(recipe.font);
    expect(oneColor.randomization).toBeUndefined();

    rerender(
      <MixPickerColorsRow
        recipe={oneColor}
        catalog={catalog}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const sixColors = onChange.mock.calls[1]?.[0] as AppearanceRecipeV3;
    expect(sixColors.colors.mode).toBe("palette");
    if (sixColors.colors.mode !== "palette") {
      throw new Error("Expected a palette");
    }
    expect(sixColors.colors.colors).toHaveLength(6);
    expect(sixColors.material).toEqual(recipe.material);
    expect(sixColors.font).toEqual(recipe.font);
  });
});
