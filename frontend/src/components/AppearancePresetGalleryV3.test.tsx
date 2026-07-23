// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearancePresetGalleryV3 } from "./AppearancePresetGalleryV3";

afterEach(cleanup);

function sortedStyleNames(styleIds: readonly string[]): string[] {
  return styleIds
    .map((styleId) => {
      const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
      if (style === undefined) throw new Error(`Test style is missing: ${styleId}`);
      return style.name;
    })
    .sort((left, right) => left.localeCompare(right));
}

describe("AppearancePresetGalleryV3", () => {
  it("shows alphabetized style and material presets in one compact selector", () => {
    render(
      <AppearancePresetGalleryV3
        catalog={APPEARANCE_CATALOG_V3}
        selectedStyleId="chaotic"
        onSelect={vi.fn()}
      />,
    );

    const selector = screen.getByRole<HTMLSelectElement>("combobox", { name: "Preset" });
    expect(selector.value).toBe("chaotic");
    expect(screen.getAllByRole("option")).toHaveLength(
      APPEARANCE_CATALOG_V3.featuredStyleIds.length +
        APPEARANCE_CATALOG_V3.collectorStyleIds.length,
    );
    const groups = screen.getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("label"))).toEqual([
      "Random",
      "Styles",
      "Materials",
    ]);
    const random = screen.getByRole("group", { name: "Random" });
    const styles = screen.getByRole("group", { name: "Styles" });
    const materials = screen.getByRole("group", { name: "Materials" });
    expect(
      [...random.querySelectorAll("option")].map(({ textContent }) => textContent),
    ).toEqual(["Random"]);
    expect(
      [...styles.querySelectorAll("option")].map(({ textContent }) => textContent),
    ).toEqual(
      sortedStyleNames(
        APPEARANCE_CATALOG_V3.featuredStyleIds.filter(
          (styleId) => styleId !== "chaotic",
        ),
      ),
    );
    expect(
      [...materials.querySelectorAll("option")].map(({ textContent }) => textContent),
    ).toEqual(sortedStyleNames(APPEARANCE_CATALOG_V3.collectorStyleIds));
    expect(screen.queryByRole("group", { name: "Featured" })).toBeNull();
    expect(screen.getByRole("option", { name: "Prismatic Glass" })).toBeDefined();
    expect(screen.queryByText(/collector/i)).toBeNull();
    expect(screen.queryByLabelText("Preset material family")).toBeNull();
  });

  it("retains a selected historical style and reports selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AppearancePresetGalleryV3
        catalog={APPEARANCE_CATALOG_V3}
        selectedStyleId="rose-palette"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole("option", { name: "Rose — Archive" })).toBeDefined();
    await user.selectOptions(screen.getByRole("combobox", { name: "Preset" }), "hex-appeal");
    expect(onSelect).toHaveBeenCalledWith("hex-appeal");
  });

  it("represents a custom draft without inventing a preset", () => {
    render(
      <AppearancePresetGalleryV3
        catalog={APPEARANCE_CATALOG_V3}
        selectedStyleId=""
        onSelect={vi.fn()}
      />,
    );

    const selector = screen.getByRole<HTMLSelectElement>("combobox", { name: "Preset" });
    const custom = screen.getByRole<HTMLOptionElement>("option", { name: "Custom design" });
    expect(selector.value).toBe("");
    expect(custom.disabled).toBe(true);
  });
});
