// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MixBar,
  MixPickerMaterialsRow,
} from "@/components/MixPickerMaterialsRow";
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
const defaultMaterial = (family: string) =>
  ({ family, testVariant: "default" }) as AppearanceMaterialV4;

const catalog = {
  editorDefaults: {
    palette: ["#8a1f82", "#8A1F82", "#04c9df"],
  },
  materials: [
    { family: "classic", name: "Classic", defaultValue: defaultMaterial("classic") },
    { family: "glass", name: "Glass", defaultValue: defaultMaterial("glass") },
    { family: "metal", name: "Metal", defaultValue: defaultMaterial("metal") },
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

const thumbVersion = {
  catalogVersion: 3,
  rendererRevision: "canvaskit-v4-r41",
  cacheRevision: 2,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
    // Thumb imgs are decorative (alt="") inside named buttons.
    expect(document.querySelectorAll("img")).toHaveLength(3);
  });

  it("adds a tapped material as an equal weighted mix", () => {
    const recipe = recipeWithMaterial({
      mode: "fixed",
      value: materialValue("classic"),
    });
    const onChange = vi.fn();
    const { rerender } = render(
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
      mode: "weighted",
      options: [
        { value: materialValue("classic"), weight: 500 },
        { value: defaultMaterial("glass"), weight: 500 },
      ],
    });

    rerender(
      <MixPickerMaterialsRow
        recipe={next}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Material mix balance" }),
    ).not.toBeNull();
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
    const classic = screen.getByRole("button", { name: /Classic/ });
    expect(classic.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(classic);
    expect(onChange).not.toHaveBeenCalled();
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

  it("matches stable, distinct material accents to balance segments", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { rerender } = render(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            { value: materialValue("classic"), weight: 500 },
            { value: materialValue("glass"), weight: 300 },
            { value: materialValue("metal"), weight: 200 },
          ],
        })}
        catalog={catalog}
        thumbVersion={thumbVersion}
        onChange={vi.fn()}
      />,
    );

    const classic = screen.getByRole("button", { name: /Classic/ });
    const glass = screen.getByRole("button", { name: /Glass/ });
    const metal = screen.getByRole("button", { name: /Metal/ });
    const segments = Array.from(
      screen.getByRole("group", { name: "Material mix balance" }).children,
    ) as HTMLElement[];
    const classicAccent = classic.style.getPropertyValue("--material-accent");
    const glassAccent = glass.style.getPropertyValue("--material-accent");
    const metalAccent = metal.style.getPropertyValue("--material-accent");
    const accents = [classicAccent, glassAccent, metalAccent];

    expect(classic.parentElement?.className).toContain("sm:justify-center");
    expect(accents.every((accent) => /^#[0-9a-f]{6}$/iu.test(accent)))
      .toBe(true);
    expect(new Set(accents).size).toBe(3);
    expect(segments.map((segment) =>
      segment.style.getPropertyValue("--material-accent"),
    )).toEqual(accents);
    expect(classic.querySelector("img")?.parentElement?.className)
      .toContain("h-[4.5rem]");
    const thumbnailImage = classic.querySelector("img");
    expect(thumbnailImage?.className).toContain("scale-[1.3]");
    expect(thumbnailImage?.className).toContain("!w-auto");
    expect(thumbnailImage?.className).toContain("max-w-none");
    expect(thumbnailImage?.className).toContain("absolute");
    expect(thumbnailImage?.className).toContain("left-1/2");
    expect(thumbnailImage?.className).toContain("top-1/2");
    expect(thumbnailImage?.className).toContain("-translate-x-1/2");
    expect(thumbnailImage?.className).toContain("-translate-y-1/2");

    rerender(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            { value: materialValue("glass"), weight: 600 },
            { value: materialValue("metal"), weight: 400 },
          ],
        })}
        catalog={catalog}
        thumbVersion={thumbVersion}
        onChange={vi.fn()}
      />,
    );
    const survivingAccents = [
      screen.getByRole("button", { name: /Glass/ }).style
        .getPropertyValue("--material-accent"),
      screen.getByRole("button", { name: /Metal/ }).style
        .getPropertyValue("--material-accent"),
    ];
    expect(survivingAccents).toEqual([glassAccent, metalAccent]);
    expect(Array.from(
      screen.getByRole("group", { name: "Material mix balance" }).children,
    ).map((segment) =>
      (segment as HTMLElement).style.getPropertyValue("--material-accent"),
    )).toEqual(survivingAccents);
  });

  it("shows material names centrally on hover, focus, and tap", () => {
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
    const classic = screen.getByRole("button", { name: "Classic" });
    const glass = screen.getByRole("button", { name: "Glass" });
    const metal = screen.getByRole("button", { name: "Metal" });
    const material = screen.getByRole("region", { name: "Material" });

    expect(material.querySelector("header")?.textContent).toContain("Classic");
    expect(classic.textContent).not.toContain("Classic");
    fireEvent.mouseEnter(glass);
    expect(material.querySelector("header")?.textContent).toContain("Glass");
    fireEvent.mouseLeave(glass);
    expect(material.querySelector("header")?.textContent).toContain("Classic");
    fireEvent.focus(glass);
    expect(material.querySelector("header")?.textContent).toContain("Glass");
    fireEvent.mouseEnter(metal);
    expect(material.querySelector("header")?.textContent).toContain("Metal");
    fireEvent.mouseLeave(metal);
    expect(material.querySelector("header")?.textContent).toContain("Glass");
    fireEvent.blur(glass);
    fireEvent.click(glass);
    expect(material.querySelector("header")?.textContent).toContain("Glass");
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

  it("combines hidden material variants into one family segment", () => {
    const solid = {
      family: "classic",
      treatment: "solid",
    } as AppearanceMaterialV4;
    const gradient = {
      family: "classic",
      treatment: "gradient",
    } as AppearanceMaterialV4;
    render(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            { value: solid, weight: 400 },
            { value: gradient, weight: 200 },
            { value: materialValue("glass"), weight: 400 },
          ],
        })}
        catalog={catalog}
        thumbVersion={null}
        onChange={vi.fn()}
      />,
    );

    const segments = Array.from(
      screen.getByRole("group", { name: "Material mix balance" }).children,
    );
    expect(segments.map((segment) => segment.getAttribute("title"))).toEqual([
      "Classic: 60%",
      "Glass: 40%",
    ]);
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("labels segments against the actual weight sum, hiding unreadable shares", () => {
    render(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            { value: materialValue("classic"), weight: 900 },
            { value: materialValue("glass"), weight: 150 },
            { value: materialValue("metal"), weight: 30 },
          ],
        })}
        catalog={catalog}
        thumbVersion={null}
        onChange={vi.fn()}
      />,
    );
    const bar = screen.getByRole("group", { name: "Material mix balance" });
    const segments = Array.from(bar.children);
    // 900/150/30 of 1080, not of the normalized commit total.
    expect(segments.map((segment) => segment.getAttribute("title"))).toEqual([
      "Classic: 83%",
      "Glass: 14%",
      "Metal: 3%",
    ]);
    expect(
      segments.every(
        (segment) => (segment as HTMLElement).style.flexBasis === "0px",
      ),
    ).toBe(true);
    // The 3% share keeps only its accessible label.
    expect(segments[2]?.querySelector(".sr-only")?.textContent).toBe("3%");
    expect(segments[1]?.querySelector(".sr-only")).toBeNull();
    expect(
      screen.getAllByRole("slider").map(({ style }) => style.left),
    ).toEqual(["83.3%", "97.2%"]);
  });

  it("keeps tiny adjacent shares valid when nudged", () => {
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            { value: materialValue("classic"), weight: 900 },
            { value: materialValue("glass"), weight: 2 },
            { value: materialValue("metal"), weight: 2 },
          ],
        })}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getAllByRole("slider")[1] as HTMLElement, {
      key: "ArrowRight",
    });
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    if (next.material.mode !== "weighted") throw new Error("expected weighted");
    expect(next.material.options.map(({ weight }) => weight)).toEqual([
      996, 3, 1,
    ]);
  });

  it("uses catalog defaults when an edit collapses hidden family variants", () => {
    const onChange = vi.fn();
    render(
      <MixPickerMaterialsRow
        recipe={recipeWithMaterial({
          mode: "weighted",
          options: [
            {
              value: {
                family: "classic",
                treatment: "solid",
              } as AppearanceMaterialV4,
              weight: 900,
            },
            {
              value: {
                family: "classic",
                treatment: "gradient",
              } as AppearanceMaterialV4,
              weight: 150,
            },
          ],
        })}
        catalog={catalog}
        thumbVersion={null}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Glass/ }));
    const next = onChange.mock.calls[0][0] as AppearanceRecipeV3;
    if (next.material.mode !== "weighted") throw new Error("expected weighted");
    expect(next.material.options).toEqual([
      { value: defaultMaterial("classic"), weight: 500 },
      { value: defaultMaterial("glass"), weight: 500 },
    ]);
  });

  it("keeps direct share edits within the model weight limits", () => {
    const onCommit = vi.fn();
    render(
      <MixBar
        names={["Classic", "Glass"]}
        weights={[1_000, 990]}
        disabled={false}
        onCommit={onCommit}
      />,
    );
    const handle = screen.getByRole("slider");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onCommit).toHaveBeenCalledWith([990, 1_000]);
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
