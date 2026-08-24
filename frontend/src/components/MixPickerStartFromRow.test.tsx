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
        selectedStyleId="dice-witch"
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
    const thumbnail = screen
      .getByRole("button", { name: "dice-witch-name" })
      .querySelector("img");
    expect(thumbnail?.parentElement?.className).toContain("h-[4.5rem]");
    expect(thumbnail?.className).toContain("!w-auto");
    expect(thumbnail?.className).toContain("max-w-none");
    expect(thumbnail?.className).toContain("left-1/2");
    expect(thumbnail?.className).toContain("top-1/2");
    expect(thumbnail?.className).toContain("-translate-x-1/2");
    expect(thumbnail?.className).toContain("-translate-y-1/2");
    expect(thumbnail?.className).toContain("scale-[1.3]");
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
    const randomCard = screen.getByRole("button", {
      name: "Random, The default",
    });
    expect(randomCard.getAttribute("aria-pressed")).toBe("true");
    // Uppercase presentation comes from CSS; the copy is "The default".
    expect(randomCard.textContent?.toLowerCase()).toContain("the default");
  });

  it("shows one style name centrally on hover, focus, and tap", () => {
    render(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId="dice-witch"
        thumbVersion={thumbVersion}
        onSelect={vi.fn()}
      />,
    );
    const diceWitch = screen.getByRole("button", {
      name: "dice-witch-name",
    });
    const solid = screen.getByRole("button", { name: "solid-name" });
    const random = screen.getByRole("button", {
      name: "Random, The default",
    });
    const startFrom = screen.getByRole("region", { name: "Start from" });

    expect(startFrom.querySelector("header")?.textContent).toContain(
      "dice-witch-name",
    );
    expect(diceWitch.textContent).not.toContain("dice-witch-name");
    fireEvent.mouseEnter(solid);
    expect(startFrom.querySelector("header")?.textContent).toContain(
      "solid-name",
    );
    fireEvent.mouseLeave(solid);
    expect(startFrom.querySelector("header")?.textContent).toContain(
      "dice-witch-name",
    );
    fireEvent.focus(solid);
    fireEvent.mouseEnter(random);
    expect(startFrom.querySelector("header")?.textContent).toContain("Random");
    fireEvent.mouseLeave(random);
    expect(startFrom.querySelector("header")?.textContent).toContain(
      "solid-name",
    );
    fireEvent.blur(solid);
    fireEvent.click(solid);
    expect(startFrom.querySelector("header")?.textContent).toContain(
      "solid-name",
    );
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
