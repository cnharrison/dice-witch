// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppearanceThumb } from "@/components/AppearanceThumb";
import { appearanceThumbUrl } from "@/lib/appearance-thumbs";

describe("appearanceThumbUrl", () => {
  it("builds versioned bake-route URLs", () => {
    expect(
      appearanceThumbUrl(
        "https://api.example",
        {
          catalogVersion: 3,
          rendererRevision: "canvaskit-v4-r41",
          cacheRevision: 2,
        },
        "material",
        "glass",
      ),
    ).toBe(
      "https://api.example/thumbs/3-canvaskit-v4-r41/material/glass.png?v=2",
    );
  });
});

describe("AppearanceThumb", () => {
  it("renders a lazy img pointing at the baked tile behind a shimmer slot", () => {
    const { container, getByRole } = render(
      <AppearanceThumb
        kind="preset"
        id="dice-witch"
        catalogVersion={3}
        rendererRevision="canvaskit-v4-r41"
        cacheRevision={2}
        alt="Dice Witch preset"
      />,
    );
    const image = getByRole("img", { name: "Dice Witch preset" });
    expect(image.getAttribute("src")?.endsWith(
      "/thumbs/3-canvaskit-v4-r41/preset/dice-witch.png?v=2",
    )).toBe(true);
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });
});
