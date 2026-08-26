// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MixPickerFineTune } from "./MixPickerFineTune";
import {
  applyColorChance,
  colorChanceOf,
} from "@/lib/mix-picker-state";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";

const catalog = {
  ...APPEARANCE_CATALOG_V3,
  materials: [
    {
      family: "classic",
      name: "Classic",
      treatments: [
        { id: "solid", name: "Solid" },
        { id: "gradient", name: "Gradient" },
      ],
      opacities: [{ id: "opaque", name: "Opaque" }],
      finishes: [{ id: "matte", name: "Matte" }],
      textureScale: { minimum: 1, maximum: 4, step: 1 },
    },
    { family: "glass", name: "Glass" },
  ],
  variationScopes: [
    { id: "die", name: "Die" },
    { id: "group", name: "Group" },
    { id: "roll", name: "Roll" },
  ],
  fonts: [
    { id: "cinzel", name: "Cinzel" },
    { id: "fraunces", name: "Fraunces" },
  ],
  engravingFinishes: [
    { id: "matte-ink", name: "Matte ink" },
    { id: "luminous", name: "Luminous" },
  ],
  gradient: {
    scopes: [
      { id: "whole-die", name: "Whole die" },
      { id: "per-side", name: "Per side" },
    ],
    directions: [{ id: "top-to-bottom", name: "Top to bottom" }],
  },
  forms: [{ id: "standard", name: "Standard" }],
  lighting: {
    modes: [
      { id: "none", name: "None" },
      { id: "facet", name: "Facet" },
    ],
    strengths: [{ id: "subtle", name: "Subtle" }],
    directions: [{ id: "upper-left", name: "Upper left" }],
  },
  editorDefaults: {
    ...APPEARANCE_CATALOG_V3.editorDefaults,
    primaryColor: "#101010",
    palette: ["#201040", "#301050"],
    patternId: "dots",
  },
} satisfies AppearanceCatalogV3;

function recipeWith(
  overrides: Partial<AppearanceRecipeV3> = {},
): AppearanceRecipeV3 {
  // SAFETY: The test controls this fixture and verifies its use in the scenario below.
  return {
    version: 3,
    variation: "curated",
    varyBy: "die",
    colors: { mode: "palette", colors: ["#111111", "#222222"] },
    material: { mode: "fixed", value: { family: "classic" } as never },
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
    ...overrides,
  };
}

function renderFineTune(
  recipe: AppearanceRecipeV3,
  onChange = vi.fn(),
): ReturnType<typeof render> {
  return render(
    <MixPickerFineTune
      recipe={recipe}
      catalog={catalog}
      open
      onChange={onChange}
      onClose={vi.fn()}
    />,
  );
}

afterEach(cleanup);

describe("color chance mapping", () => {
  it("reads the three states from randomization policies and color modes", () => {
    expect(colorChanceOf(recipeWith())).toBe("mine");
    expect(
      colorChanceOf(
        recipeWith({ randomization: "one-palette-color-v1" }),
      ),
    ).toBe("accent");
    expect(
      colorChanceOf(
        recipeWith({
          colors: { mode: "vivid-random-pair" },
          randomization: "full-spectrum-v2",
        }),
      ),
    ).toBe("bright");
  });

  it("my colors only clears stale randomization without touching colors", () => {
    const recipe = recipeWith({ randomization: "full-spectrum-v1" });
    const next = applyColorChance(recipe, "mine", catalog);
    expect(next.randomization).toBeUndefined();
    expect(next.colors).toEqual(recipe.colors);
  });

  it("accent requires a palette and converts a single color with a note", () => {
    const recipe = recipeWith({
      colors: { mode: "solid", primary: "#444444" },
      colorDistribution: "coordinated",
    });
    const next = applyColorChance(recipe, "accent", catalog);
    expect(next.colors.mode).toBe("palette");
    expect(next.randomization).toBe("one-palette-color-v1");
    expect(next.colorDistribution).toBeUndefined();
    if (next.colors.mode !== "palette") throw new Error("expected palette");
    expect(next.colors.colors[0]).toBe("#444444");
    expect(next.colors.colors).toHaveLength(2);
  });

  it("bright random pair pins varyBy die and the vivid policy", () => {
    const next = applyColorChance(
      recipeWith({ colorDistribution: "one-per-die" }),
      "bright",
      catalog,
    );
    expect(next.varyBy).toBe("die");
    expect(next.randomization).toBe("full-spectrum-v2");
    expect(next.colors).toEqual({ mode: "vivid-random-pair" });
    expect(next.colorDistribution).toBeUndefined();
  });
});

describe("MixPickerFineTune panel", () => {
  it("renders nothing when closed", () => {
    render(
      <MixPickerFineTune
        recipe={recipeWith()}
        catalog={catalog}
        open={false}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog", { name: "Fine-tune" })).toBeNull();
  });

  it("writes varyBy from the mix-details group", () => {
    const onChange = vi.fn();
    renderFineTune(recipeWith(), onChange);
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    expect(onChange.mock.calls[0][0].varyBy).toBe("group");
  });

  it("shows the gradient trigger caption when no classic gradient is in play", () => {
    renderFineTune(recipeWith());
    expect(
      screen.getByText(/Gradient appears when Classic · Gradient is in your mix/),
    ).not.toBeNull();
    expect(screen.queryByRole("group", { name: "Spread" })).toBeNull();
  });

  it("reveals spread and direction once a classic gradient joins the mix", () => {
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const gradientMaterial = {
      family: "classic",
      treatment: "gradient",
    } as never;
    renderFineTune(
      recipeWith({ material: { mode: "fixed", value: gradientMaterial } }),
    );
    expect(
      screen.queryByText(/Gradient appears when Classic · Gradient/),
    ).toBeNull();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Spread" })).getByRole(
        "button",
        { name: "Per side" },
      ),
    );
  });

  it("upgrades multi-select rows to weighted equal shares with the toggle on", () => {
    const onChange = vi.fn();
    renderFineTune(
      recipeWith({
        font: { mode: "allowlist", values: ["cinzel", "fraunces"] },
        engraving: { mode: "allowlist", values: ["matte-ink", "luminous"] },
      }),
      onChange,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    if (next.font.mode !== "weighted") throw new Error("expected weighted");
    expect(next.font.options.map(({ weight }) => weight)).toEqual([500, 500]);
    if (next.engraving.mode !== "weighted") {
      throw new Error("expected weighted engraving");
    }
  });

  it("downgrades weighted rows back to allowlists when toggled off", () => {
    const onChange = vi.fn();
    renderFineTune(
      recipeWith({
        font: {
          mode: "weighted",
          options: [
            { value: "cinzel", weight: 700 },
            { value: "fraunces", weight: 300 },
          ],
        },
        engraving: { mode: "fixed", value: "matte-ink" },
      }),
      onChange,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    expect(next.font).toEqual({ mode: "allowlist", values: ["cinzel", "fraunces"] });
    // Fixed single-id rows pass through untouched.
    expect(next.engraving).toEqual({ mode: "fixed", value: "matte-ink" });
  });
});
