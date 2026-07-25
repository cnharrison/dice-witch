// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./AuthWrapper", () => ({
  AuthWrapper: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./Navbar", () => ({ Navbar: () => <nav>Navigation</nav> }));
vi.mock("./ui/toaster", () => ({ Toaster: () => null }));
vi.mock("@/context/GuildContext", () => ({
  GuildProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/pages/Home", () => ({ default: () => <div>Home</div> }));
vi.mock("@/pages/Preferences", () => ({
  default: () => <div>Preferences</div>,
}));

import AuthenticatedApp from "./AuthenticatedApp";

afterEach(cleanup);

it("keeps the authenticated scroll container at the viewport edge", () => {
  render(
    <MemoryRouter>
      <AuthenticatedApp />
    </MemoryRouter>,
  );

  const main = screen.getByRole("main");
  expect(main.className).toContain("w-full");
  expect(main.className).not.toContain("container");
  expect(main.className).toContain("overflow-y-auto");
});
