// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { authState, authenticateWithRedirect } = vi.hoisted(() => ({
  authState: { isSignedIn: false },
  authenticateWithRedirect: vi.fn(),
}));

vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => authState,
  useSignIn: () => ({
    isLoaded: true,
    signIn: { authenticateWithRedirect },
  }),
}));
vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav aria-label="Authenticated">Authenticated navigation</nav>,
}));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => null }));

import DocsApp from "./DocsApp";

beforeEach(() => {
  authState.isSignedIn = false;
  authenticateWithRedirect.mockReset();
});

afterEach(cleanup);

function renderDocs(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs/*" element={<DocsApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("opens the public documentation at the quick start", async () => {
  const user = userEvent.setup();
  renderDocs("/docs");

  expect(
    await screen.findByRole("heading", { level: 1, name: "Quick start" }),
  ).toBeDefined();
  const publicNavigation = screen.getByRole("navigation", { name: "Public" });
  expect(within(publicNavigation).getByRole("link", { name: "Home" }).getAttribute("href"))
    .toBe("/");
  expect(within(publicNavigation).getByRole("link", {
    name: "Add Dice Witch to your server",
  })).toBeDefined();
  const loginButton = within(publicNavigation).getByRole("button", {
    name: "Login with Discord",
  });
  await user.click(loginButton);
  expect(authenticateWithRedirect).toHaveBeenCalledWith({
    strategy: "oauth_discord",
    returnTo: "/docs",
  });
  expect(screen.queryByRole("navigation", { name: "Authenticated" })).toBeNull();

  const navigation = screen.getByRole("navigation", { name: "Documentation" });
  expect(
    within(navigation)
      .getByRole("link", { name: /^Dice notation/ })
      .getAttribute("href"),
  ).toBe("/docs/dice-notation");
});

it("uses the authenticated app navigation after login", async () => {
  authState.isSignedIn = true;
  renderDocs("/docs");

  expect(await screen.findByRole("navigation", { name: "Authenticated" }))
    .toBeDefined();
  expect(screen.queryByRole("navigation", { name: "Public" })).toBeNull();
});

it("supports a direct link to the notation guide", async () => {
  renderDocs("/docs/dice-notation");

  const title = await screen.findByRole("heading", {
    level: 1,
    name: "Dice notation",
  });
  expect(
    within(title).getByRole("link", { name: "Dice notation" }).getAttribute("href"),
  ).toBe("#dice-notation");
  const diceHeading = screen.getByRole("heading", { level: 2, name: "Dice" });
  expect(
    within(diceHeading).getByRole("link", { name: "Dice" }).getAttribute("href"),
  ).toBe("#dice");
  expect(document.title).toBe("Dice notation · Dice Witch Docs");
  const navigation = screen.getByRole("navigation", { name: "Documentation" });
  expect(
    within(navigation)
      .getByRole("link", { name: /^Dice notation/ })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
});

it("searches the complete local guide content", async () => {
  const user = userEvent.setup();
  renderDocs("/docs");
  await screen.findByRole("heading", { level: 1, name: "Quick start" });

  const search = screen.getByRole("searchbox", { name: "Search docs" });
  expect(search.parentElement?.className).toContain("px-0.5");
  await user.type(search, "penetrating");

  const navigation = screen.getByRole("navigation", { name: "Documentation" });
  expect(within(navigation).getByRole("link", { name: /^Modifiers/ })).toBeDefined();
  expect(within(navigation).queryByRole("link", { name: /^Quick start/ })).toBeNull();

  await user.clear(search);
  await user.type(search, "Copy to");

  expect(within(navigation).getByRole("link", { name: /^Saved rolls/ })).toBeDefined();
  expect(within(navigation).queryByRole("link", { name: /^Modifiers/ })).toBeNull();

  await user.clear(search);
  await user.type(search, "manage the server library, server appearance");

  expect(
    within(navigation).getByRole("link", { name: /^Appearances and web rolling/ }),
  ).toBeDefined();
});

it("explains which destinations appear and how modifiers can stop", async () => {
  renderDocs("/docs/troubleshooting");

  expect(
    await screen.findByText(
      "You can access the channel and have permission to send messages and use Dice Witch's slash commands there.",
    ),
  ).toBeDefined();
  const listItems = screen.getAllByRole("listitem");
  expect(
    listItems.some((item) =>
      item.textContent?.includes("d6r>=1 and d6!>=1 can never stop"),
    ),
  ).toBe(true);
  expect(
    listItems.some((item) =>
      item.textContent?.includes("7d6u cannot make seven unique d6 results"),
    ),
  ).toBe(true);
});
