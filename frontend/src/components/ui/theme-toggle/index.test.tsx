// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "./index";

function matchMedia(dark: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: dark,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
});

describe("ThemeToggle", () => {
  it("describes and performs the theme-changing action", async () => {
    matchMedia(false);
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light" storageKey="theme-toggle-test">
        <ThemeToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeDefined();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("resolves the system theme before choosing the action", () => {
    matchMedia(true);
    render(
      <ThemeProvider defaultTheme="system" storageKey="theme-toggle-test">
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeDefined();
  });
});
