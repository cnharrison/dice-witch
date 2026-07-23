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
    expect((cells[0] as HTMLElement).style).toMatchObject({
      width: "150px",
      height: "187px",
    });
    expect((images[0] as HTMLElement).style.left).toBe("0px");
    expect((images[1] as HTMLElement).style.left).toBe("-150px");
    expect((images[3] as HTMLElement).style.top).toBe("-187px");
    expect(container.querySelectorAll("[data-dice-group]")).toHaveLength(2);
  });

  it("fails visibly when response dimensions cannot describe exact crops", () => {
    render(
      <AuthoritativeDiceImageGrid
        image={{ ...image, width: 451 }}
        groupSizes={[3, 2]}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Authoritative dice image layout is invalid",
    );
  });
});
