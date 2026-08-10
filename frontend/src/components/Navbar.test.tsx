// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Navbar } from "./Navbar";

const mocks = vi.hoisted(() => ({
  getPersonalAppearanceBootstrapV3: vi.fn(async () => ({
    catalog: {},
    resource: { revision: 0, profile: null },
  })),
  loadDocsApp: vi.fn(async () => ({})),
  loadHomePage: vi.fn(async () => ({})),
  loadLibraryPage: vi.fn(async () => ({})),
  loadPreferencesPage: vi.fn(async () => ({})),
  signOut: vi.fn(),
}));

vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ signOut: mocks.signOut }),
  useUser: () => ({
    user: {
      name: "Appearance Tester",
      image: "https://cdn.example.test/avatar.png",
    },
  }),
}));

vi.mock("@/lib/app-route-loaders", () => ({
  loadDocsApp: mocks.loadDocsApp,
  loadHomePage: mocks.loadHomePage,
  loadLibraryPage: mocks.loadLibraryPage,
  loadPreferencesPage: mocks.loadPreferencesPage,
}));

vi.mock("@/lib/appearance-v3", () => ({
  getPersonalAppearanceBootstrapV3:
    mocks.getPersonalAppearanceBootstrapV3,
  PERSONAL_APPEARANCE_BOOTSTRAP_QUERY_KEY: [
    "appearanceBootstrapV3",
    "personal",
  ],
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  mocks.getPersonalAppearanceBootstrapV3.mockClear();
  mocks.loadDocsApp.mockClear();
  mocks.loadHomePage.mockClear();
  mocks.loadLibraryPage.mockClear();
  mocks.loadPreferencesPage.mockClear();
  mocks.signOut.mockReset();
});

describe("Navbar", () => {
  it.each([
    ["/app/preferences", "Preferences"],
    ["/app/library", "Library"],
  ])("shows the %s section in the top bar", (path, label) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const heading = screen.getByRole("heading", { name: label });
    expect(heading.className).toContain("border-l");
    expect(heading.className).toContain("text-muted-foreground");
  });

  it("shows branded navigation and moves logout into the avatar menu", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const brand = screen.getByRole("link", { name: "Dice Witch" });
    expect(brand.className).toContain("UnifrakturMaguntia");
    expect(brand.className).toContain("h-full");
    expect(brand.className).toContain("text-[2.5rem]");
    expect(brand.className).toContain("text-brand");
    expect(screen.queryByRole("button", { name: "Logout" })).toBeNull();
    const docs = screen.getByRole("link", { name: "Docs" });
    expect(docs.textContent).toBe("");
    await user.hover(docs);
    expect(mocks.loadDocsApp).toHaveBeenCalledOnce();

    await user.hover(screen.getByRole("link", { name: "Preferences" }));
    await waitFor(() => {
      expect(mocks.loadPreferencesPage).toHaveBeenCalled();
      expect(mocks.getPersonalAppearanceBootstrapV3).toHaveBeenCalledOnce();
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

    expect(mocks.signOut).toHaveBeenCalledOnce();
  });
});
