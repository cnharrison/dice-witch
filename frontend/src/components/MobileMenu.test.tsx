// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MobileMenu } from "./MobileMenu";

vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
  useUser: () => ({ user: { name: "Appearance Tester", image: null } }),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

afterEach(cleanup);

describe("MobileMenu", () => {
  it("names its icon-only navigation trigger", () => {
    render(
      <MemoryRouter>
        <MobileMenu />
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
