// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MixPickerStartFromRow } from "@/components/MixPickerStartFromRow";
import type {
  AppearanceCatalogV3,
} from "@/types/appearance";

function styleEntry(id: string) {
  return {
    id,
    name: id === "chaotic" ? "Random" : `${id}-name`,
    recipe: {},
  };
}

const catalog = {
  styles: [
    "dice-witch",
    "solid",
    "rainbow",
    "pride",
    "trans",
    "crimson-palette",
    "amber-palette",
    "verdant-palette",
    "azure-palette",
    "monochrome-palette",
    "chaotic",
    "classic-material",
    "glass-material",
  ].map((id) => styleEntry(id)),
  featuredStyleIds: [
    "dice-witch",
    "solid",
    "chaotic",
    "rainbow",
    "pride",
    "trans",
    "crimson-palette",
    "amber-palette",
    "verdant-palette",
    "azure-palette",
    "monochrome-palette",
  ],
  collectorStyleIds: ["classic-material", "glass-material"],
} as never as AppearanceCatalogV3;

const thumbVersion = { catalogVersion: 3, rendererRevision: "canvaskit-v4-r41" };

afterEach(cleanup);

describe("MixPickerStartFromRow", () => {
  it("renders an initial card set with thumbs and a more-expander", () => {
    render(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId=""
        thumbVersion={thumbVersion}
        onSelect={vi.fn()}
      />,
    );
    // 4 initial cards + the expander; collector styles stay hidden.
    expect(document.querySelectorAll("img")).toHaveLength(4);
    // 11 featured + 2 collector − 4 visible.
    expect(screen.getByRole("button", { name: /9 more/ })).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /classic-material/ }),
    ).toBeNull();
  });

  it("badges the Random builtin card as the default", () => {
    render(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId="chaotic"
        thumbVersion={null}
        onSelect={vi.fn()}
      />,
    );
    const randomCard = screen.getByRole("button", { name: /Random/ });
    expect(randomCard.getAttribute("aria-pressed")).toBe("true");
    // Uppercase presentation comes from CSS; the copy is "The default".
    expect(randomCard.textContent?.toLowerCase()).toContain("the default");
  });

  it("expands remaining styles and reports selections", () => {
    const onSelect = vi.fn();
    render(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId=""
        thumbVersion={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /9 more/ }));
    expect(
      screen.getByRole("button", { name: /monochrome-palette-name/ }),
    ).not.toBeNull();
    // Expanded view also exposes collector styles in their own strip.
    expect(
      screen.getByRole("button", { name: /classic-material-name/ }),
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /crimson-palette-name/ }),
    );
    expect(onSelect).toHaveBeenCalledWith("crimson-palette");
  });

  it("fails fast when the catalog is missing a listed style", () => {
    const broken = {
      ...catalog,
      styles: catalog.styles.slice(1),
    } as unknown as AppearanceCatalogV3;
    expect(() =>
      render(
        <MixPickerStartFromRow
          catalog={broken}
          selectedStyleId=""
          thumbVersion={null}
          onSelect={vi.fn()}
        />,
      ),
    ).toThrow(/start-from style is missing/);
  });
});
