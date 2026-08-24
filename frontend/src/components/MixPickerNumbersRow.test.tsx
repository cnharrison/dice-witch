// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MixPickerNumbersRow } from "@/components/MixPickerNumbersRow";
import { MixPickerVarietyControl } from "@/components/MixPickerVarietyControl";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AppearanceCatalogV3,
  AppearanceRecipeV3,
} from "@/types/appearance";

const appearanceCss = readFileSync(
  resolve(process.cwd(), "src/index.css"),
  "utf8",
);

const catalog = {
  fonts: [
    { id: "cinzel", name: "Cinzel" },
    { id: "fraunces", name: "Fraunces" },
    { id: "alcarin-tengwar", name: "Alcarin Tengwar" },
  ],
  engravingFinishes: [
    { id: "matte-ink", name: "Matte ink" },
    { id: "luminous", name: "Luminous" },
  ],
} as never as AppearanceCatalogV3;

function recipeWith(
  font: AppearanceRecipeV3["font"],
  engraving: AppearanceRecipeV3["engraving"],
): AppearanceRecipeV3 {
  return {
    version: 3,
    variation: "curated",
    varyBy: "die",
    colors: { mode: "palette", colors: ["#111111", "#222222"] },
    material: { mode: "fixed", value: { family: "classic" } as never },
    form: { polyhedral: { mode: "fixed", value: "standard" }, other: "sphere" },
    font,
    engraving,
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

const thumbVersion = {
  catalogVersion: 3,
  rendererRevision: "canvaskit-v4-r41",
  cacheRevision: 2,
};

afterEach(cleanup);

describe("MixPickerNumbersRow", () => {
  it("renders font names in their own typefaces without thumbnails", () => {
    render(
      <MixPickerNumbersRow
        recipe={recipeWith(
          { mode: "fixed", value: "cinzel" },
          { mode: "fixed", value: "matte-ink" },
        )}
        catalog={catalog}
        thumbVersion={thumbVersion}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /Cinzel/ }).getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByRole("button", { name: /Fraunces/ }).getAttribute("aria-pressed"))
      .toBe("false");
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Cinzel" }).style.fontFamily)
      .toBe("DiceWitchV4-cinzel");
    expect(screen.getByRole("button", { name: "Fraunces" }).style.fontFamily)
      .toBe("DiceWitchV4-fraunces");
    const alcarin = screen.getByRole("button", { name: "Alcarin Tengwar" });
    expect(alcarin.style.fontFamily).toBe("DiceWitchV4-alcarin-tengwar");
    expect(alcarin.textContent).toBe(
      "\ue02e\ue040\ue022\ue002\ue040\ue020\ue044\ue010 \ue000\ue046\ue007\ue040\ue014",
    );
    expect(alcarin.textContent).not.toContain("Alcarin Tengwar");
    expect(appearanceCss).toContain(
      'font-family: "DiceWitchV4-alcarin-tengwar"',
    );
    expect(appearanceCss).toContain("AlcarinTengwar-Bold-ui.ttf");
    expect(screen.getByText("Typeface")).not.toBeNull();
    expect(screen.getByText("Ink")).not.toBeNull();
    for (const groupName of ["Font", "Engraving finish"]) {
      const group = screen.getByRole("group", { name: groupName });
      expect(group.querySelector(".flex-wrap")).not.toBeNull();
      expect(group.className).not.toContain("overflow-x-auto");
    }
    expect(screen.getByRole("group", { name: "Engraving finish" }).className)
      .toContain("border-t");
  });

  it("builds a font allowlist from taps and collapses back to fixed", () => {
    const recipe = recipeWith(
      { mode: "fixed", value: "cinzel" },
      { mode: "fixed", value: "matte-ink" },
    );
    const onChange = vi.fn();
    const { rerender } = render(
      <MixPickerNumbersRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fraunces/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      font: { mode: "allowlist", values: ["cinzel", "fraunces"] },
    });

    rerender(
      <MixPickerNumbersRow
        recipe={{
          ...recipe,
          font: { mode: "allowlist", values: ["cinzel", "fraunces"] },
        }}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fraunces/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      font: { mode: "fixed", value: "cinzel" },
    });
  });

  it("surfaces legacy procedural fonts as a read-only chip replaced on tap", () => {
    const recipe = recipeWith(
      {
        mode: "weighted",
        options: [
          { value: "cinzel" as const, weight: 700 },
          { value: "fraunces" as const, weight: 300 },
        ],
      },
      { mode: "fixed", value: "matte-ink" },
    );
    const onChange = vi.fn();
    render(
      <MixPickerNumbersRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByText("Procedural mix · pick to replace"),
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: /Cinzel/ }).getAttribute("aria-pressed"))
      .toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Fraunces/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      font: { mode: "fixed", value: "fraunces" },
    });
  });

  it("toggles ink allowlists normally but resets weighted engraving on tap", () => {
    const recipe = recipeWith(
      { mode: "fixed", value: "cinzel" },
      { mode: "fixed", value: "matte-ink" },
    );
    const onChange = vi.fn();
    const { rerender } = render(
      <MixPickerNumbersRow
        recipe={recipe}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Luminous/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      engraving: { mode: "allowlist", values: ["matte-ink", "luminous"] },
    });

    rerender(
      <MixPickerNumbersRow
        recipe={{
          ...recipe,
          engraving: {
            mode: "weighted",
            options: [
              { value: "matte-ink" as const, weight: 600 },
              { value: "luminous" as const, weight: 400 },
            ],
          },
        }}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Weighted mix · pick to replace")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Matte ink/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...recipe,
      engraving: { mode: "fixed", value: "matte-ink" },
    });
  });
});

describe("MixPickerVarietyControl", () => {
  it("reflects the recipe variety and swaps captions per state", () => {
    const base = recipeWith(
      { mode: "fixed", value: "cinzel" },
      { mode: "fixed", value: "matte-ink" },
    );
    const { rerender } = render(
      <MixPickerVarietyControl
        recipe={{ ...base, variation: "curated", varyBy: "roll" }}
        onSelect={vi.fn()}
        onChaos={vi.fn()}
      />,
    );
    expect(screen.getByText("One draw for the whole roll.")).not.toBeNull();

    rerender(
      <MixPickerVarietyControl
        recipe={{ ...base, variation: "curated", varyBy: "die" }}
        onSelect={vi.fn()}
        onChaos={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Every die draws its own combo from your mix."),
    ).not.toBeNull();
  });

  it("routes matched/mixed edits to onSelect and chaos to onChaos", () => {
    const base = recipeWith(
      { mode: "fixed", value: "cinzel" },
      { mode: "fixed", value: "matte-ink" },
    );
    const onSelect = vi.fn();
    const onChaos = vi.fn();
    render(
      <MixPickerVarietyControl
        recipe={{ ...base, variation: "curated", varyBy: "die" }}
        onSelect={onSelect}
        onChaos={onChaos}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Matched set" }));
    expect(onSelect).toHaveBeenCalledWith("matched");
    fireEvent.click(screen.getByRole("button", { name: "Mixed bag" }));
    expect(onSelect).toHaveBeenCalledWith("mixed");
    fireEvent.click(screen.getByRole("button", { name: "Chaos" }));
    expect(onChaos).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalledWith("chaos");
  });
});
