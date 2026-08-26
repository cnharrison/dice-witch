// @vitest-environment jsdom

import { MixPickerTexturesRow } from "@/components/MixPickerTexturesRow";
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import {
  parseAppearanceRecipeV3,
  type AppearanceMaterialV4,
  type AppearanceRecipeV3,
} from "@dice-witch/dice-v4-model";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function styleRecipe(styleId: string): AppearanceRecipeV3 {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style is missing: ${styleId}`);
  return structuredClone(style.recipe);
}

function defaultMaterial(family: string): AppearanceMaterialV4 {
  const material = APPEARANCE_CATALOG_V3.materials.find(
    ({ family: candidate }) => candidate === family,
  );
  if (material === undefined) throw new Error(`Material is missing: ${family}`);
  return structuredClone(material.defaultValue);
}

afterEach(cleanup);

describe("MixPickerTexturesRow", () => {
  it("edits one selected material without changing colors, siblings, or weights", () => {
    const recipe = {
      ...styleRecipe("solid"),
      material: {
        mode: "weighted" as const,
        options: [
          { value: defaultMaterial("metal"), weight: 700 },
          { value: defaultMaterial("wood"), weight: 300 },
        ],
      },
    };
    const onChange = vi.fn();
    render(
      <MixPickerTexturesRow
        recipe={recipe}
        catalog={APPEARANCE_CATALOG_V3}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("region", { name: "Textures" })).toBeDefined();
    const metal = screen.getByRole("button", { name: "Metal" });
    const wood = screen.getByRole("button", { name: "Wood" });
    expect(metal).toHaveProperty("ariaExpanded", "true");
    expect(metal.parentElement?.getAttribute("data-state")).toBe("open");
    expect(wood.parentElement?.getAttribute("data-state")).toBe("closed");
    fireEvent.change(screen.getByLabelText("Material finish"), {
      target: { value: "hammered" },
    });

    const next = parseAppearanceRecipeV3(onChange.mock.calls[0]?.[0]);
    expect(next.colors).toEqual(recipe.colors);
    expect(next.material.mode).toBe("weighted");
    if (next.material.mode !== "weighted") throw new Error("Expected weights");
    expect(next.material.options.map(({ weight }) => weight)).toEqual([700, 300]);
    expect(next.material.options[0]?.value).toMatchObject({
      family: "metal",
      finish: "hammered",
    });
    expect(next.material.options[1]?.value).toEqual(recipe.material.options[1]?.value);

    fireEvent.click(wood);
    expect(metal.parentElement?.getAttribute("data-state")).toBe("closed");
    expect(wood.parentElement?.getAttribute("data-state")).toBe("open");
  });

  it("disables expanded texture controls while a mutation is pending", () => {
    render(
      <MixPickerTexturesRow
        recipe={styleRecipe("solid")}
        catalog={APPEARANCE_CATALOG_V3}
        disabled
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText("Classic treatment").closest("fieldset"),
    ).toHaveProperty("disabled", true);
  });
});
