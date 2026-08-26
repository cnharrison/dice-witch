// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { NavbarView } from "./Navbar";

const loadPersonalAppearance = vi.fn(async () => ({
  catalog: {},
  resource: { revision: 0, profile: null },
}));
const loadDocs = vi.fn(async () => ({ default: () => null }));
const loadHome = vi.fn(async () => ({ default: () => null }));
const loadLibrary = vi.fn(async () => ({ default: () => null }));
const loadPreferences = vi.fn(async () => ({ default: () => null }));
const signOut = vi.fn();

function renderNavbar(path = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <NavbarView
          signOut={signOut}
          user={{
            name: "Appearance Tester",
            image: "https://cdn.example.test/avatar.png",
          }}
          MobileMenuSlot={() => null}
          ThemeToggleSlot={() => null}
          routeLoaders={{
            loadDocs,
            loadHome,
            loadLibrary,
            loadPreferences,
          }}
          loadPersonalAppearance={loadPersonalAppearance}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  loadPersonalAppearance.mockClear();
  loadDocs.mockClear();
  loadHome.mockClear();
  loadLibrary.mockClear();
  loadPreferences.mockClear();
  signOut.mockReset();
});

describe("Navbar", () => {
  it.each([
    ["/app/preferences", "Preferences"],
    ["/app/library", "Library"],
  ])("shows the %s section in the top bar", (path, label) => {
    renderNavbar(path);

    const heading = screen.getByRole("heading", { name: label });
    expect(heading.className).toContain("border-l");
    expect(heading.className).toContain("text-muted-foreground");
  });

  it("shows branded navigation and moves logout into the avatar menu", async () => {
    const user = userEvent.setup();
    renderNavbar();

    const brand = screen.getByRole("link", { name: "Dice Witch" });
    expect(brand.className).toContain("UnifrakturMaguntia");
    expect(brand.className).toContain("h-full");
    expect(brand.className).toContain("text-[2.5rem]");
    expect(brand.className).toContain("text-brand");
    expect(screen.queryByRole("button", { name: "Logout" })).toBeNull();
    const docs = screen.getByRole("link", { name: "Docs" });
    expect(docs.textContent).toBe("");
    await user.hover(docs);
    expect(loadDocs).toHaveBeenCalledOnce();

    await user.hover(screen.getByRole("link", { name: "Preferences" }));
    await waitFor(() => {
      expect(loadPreferences).toHaveBeenCalled();
      expect(loadPersonalAppearance).toHaveBeenCalledOnce();
    });

    await user.click(
      screen.getByRole("button", {
        name: "Open account menu for Appearance Tester",
      }),
    );
    const logout = await screen.findByRole("menuitem", {
      name: "Logout Appearance Tester",
    });
    await user.click(logout);

    expect(signOut).toHaveBeenCalledOnce();
  });
});
