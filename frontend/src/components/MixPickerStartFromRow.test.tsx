// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MixPickerStartFromRow } from "@/components/MixPickerStartFromRow";
import type { AppearanceCatalogV3 } from "@/types/appearance";
import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";

function styleEntry(id: string) {
  return {
    id,
    name: id === "chaotic" ? "Random" : `${id}-name`,
    recipe: {},
  };
}

const catalog = {
  ...APPEARANCE_CATALOG_V3,
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
  colorSchemeStyleIds: [
    "solid",
    "rainbow",
    "pride",
    "trans",
    "crimson-palette",
    "amber-palette",
    "verdant-palette",
    "azure-palette",
    "monochrome-palette",
  ],
  completeLookStyleIds: [
    "dice-witch",
    "chaotic",
    "classic-material",
    "glass-material",
  ],
} satisfies AppearanceCatalogV3;

const thumbVersion = {
  catalogVersion: 3,
  rendererRevision: "canvaskit-v4-r41",
  cacheRevision: 2,
};

afterEach(cleanup);

describe("MixPickerStartFromRow", () => {
  it("renders every style immediately", () => {
    render(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId="dice-witch"
        thumbVersion={thumbVersion}
        onSelect={vi.fn()}
      />,
    );
    expect(document.querySelectorAll("img")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /classic-material/ }),
    ).not.toBeNull();
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
    expect(thumbnail?.closest("div")?.className).toContain(
      "sm:justify-center",
    );
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

  it("shows one style name only on hover or focus", () => {
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
    const glass = screen.getByRole("button", { name: "glass-material-name" });
    const random = screen.getByRole("button", {
      name: "Random, The default",
    });
    const completeLooks = screen.getByRole("region", {
      name: "Complete looks",
    });

    const activeName = completeLooks.querySelector("header p");
    expect(activeName?.textContent).toBe("");
    expect(diceWitch.textContent).not.toContain("dice-witch-name");
    fireEvent.mouseEnter(glass);
    expect(activeName?.textContent).toBe("glass-material-name");
    fireEvent.mouseLeave(glass);
    expect(activeName?.textContent).toBe("");
    fireEvent.focus(glass);
    expect(activeName?.textContent).toBe("glass-material-name");
    fireEvent.mouseEnter(random);
    expect(activeName?.textContent).toBe("Random");
    fireEvent.mouseLeave(random);
    expect(activeName?.textContent).toBe("glass-material-name");
    fireEvent.blur(glass);
    expect(activeName?.textContent).toBe("");
    fireEvent.click(glass);
    expect(activeName?.textContent).toBe("");
  });

  it("keeps a newly selected Complete look visible after upstream layout changes", () => {
    const scrollIntoView = vi.fn();
    const onSelect = vi.fn();
    const view = render(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId="dice-witch"
        thumbVersion={null}
        onSelect={onSelect}
      />,
    );
    const random = screen.getByRole("button", {
      name: "Random, The default",
    });
    Object.defineProperty(random, "scrollIntoView", {
      value: scrollIntoView,
    });

    fireEvent.click(random);
    view.rerender(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId="chaotic"
        thumbVersion={null}
        onSelect={onSelect}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("reports selections from the complete style list", () => {
    const onSelect = vi.fn();
    render(
      <MixPickerStartFromRow
        catalog={catalog}
        selectedStyleId=""
        thumbVersion={null}
        onSelect={onSelect}
      />,
    );
    expect(screen.queryByRole("button", { name: /monochrome-palette-name/ }))
      .toBeNull();
    expect(
      screen.getByRole("button", { name: /classic-material-name/ }),
    ).not.toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /classic-material-name/ }),
    );
    expect(onSelect).toHaveBeenCalledWith("classic-material");
  });

  it("fails fast when the catalog is missing a listed style", () => {
    const broken = {
      ...catalog,
      styles: catalog.styles.slice(1),
    } satisfies AppearanceCatalogV3;
    expect(() =>
      render(
        <MixPickerStartFromRow
          catalog={broken}
          selectedStyleId=""
          thumbVersion={null}
          onSelect={vi.fn()}
        />,
      ),
    ).toThrow(/complete look is missing/);
  });
});
