// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { MobileMenuView } from "./MobileMenu";


afterEach(cleanup);

describe("MobileMenu", () => {
  it("names its icon-only navigation trigger", () => {
    render(
      <MemoryRouter>
        <MobileMenuView theme="dark" />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    expect(trigger.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
