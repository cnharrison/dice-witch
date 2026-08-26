// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthoritativeDiceImageGrid } from "./AuthoritativeDiceImageGrid";

const image = {
  contentType: "image/png" as const,
  width: 450,
  height: 374,
  base64: "iVBORw0KGgo=",
};

afterEach(cleanup);

describe("AuthoritativeDiceImageGrid", () => {
  it("wraps native 150px crops while preserving source pixels and group rows", () => {
    const { container } = render(
      <AuthoritativeDiceImageGrid
        image={image}
        groupSizes={[3, 2]}
        iconsByGroup={[
          [["recycle"], [], []],
          [[], []],
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Rendered dice result" })).toBeDefined();
    const cells = container.querySelectorAll("[data-dice-cell]");
    const images = container.querySelectorAll("img");
    expect(cells).toHaveLength(5);
    expect(images).toHaveLength(5);
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((cells[0] as HTMLElement).style).toMatchObject({
      width: "150px",
      height: "187px",
    });
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((images[0] as HTMLElement).style.left).toBe("0px");
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((images[1] as HTMLElement).style.left).toBe("-150px");
    // SAFETY: The test controls this fixture and verifies its use in the scenario below.
    expect((images[3] as HTMLElement).style.top).toBe("-187px");
    expect(container.querySelectorAll("[data-dice-group]")).toHaveLength(2);
  });

  it.each([
    { width: 307, height: 150, groupSizes: [2] },
    { width: 300, height: 150, groupSizes: [1] },
  ])(
    "preserves a framed $width×$height authoritative image without inferring crop offsets",
    ({ width, height, groupSizes }) => {
      const { container } = render(
        <AuthoritativeDiceImageGrid
          image={{ ...image, width, height }}
          groupSizes={groupSizes}
        />,
      );

      expect(screen.queryByRole("alert")).toBeNull();
      expect(container.querySelectorAll("img")).toHaveLength(1);
      const source = container.querySelector("[data-authoritative-image]");
      expect(source).not.toBeNull();
      // SAFETY: The test controls this fixture and verifies its use in the scenario below.
      expect((source as HTMLElement).style).toMatchObject({
        width: `${String(width)}px`,
        height: `${String(height)}px`,
      });
    },
  );
});
