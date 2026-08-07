// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let intersectionCallback: IntersectionObserverCallback;
const { authenticateWithRedirect } = vi.hoisted(() => ({
  authenticateWithRedirect: vi.fn(),
}));

vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ isSignedIn: false }),
  useSignIn: () => ({ isLoaded: true, signIn: { authenticateWithRedirect } }),
}));

vi.mock("@/hooks/useServerStats", () => ({
  useServerStats: () => ({
    liveGuilds: 23_432,
    estimatedGuildMemberships: 1_000_000,
    knownDiceWitchUsers: 73_429,
    available: true,
  }),
}));

vi.mock("@/components/SvgFilters", () => ({ SvgFilters: () => null }));

import LandingPage from "./LandingPage";

describe("LandingPage", () => {
  beforeEach(() => {
    authenticateWithRedirect.mockReset();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersectionCallback = callback;
        }
        observe() {}
        disconnect() {}
        unobserve() {}
        takeRecords() { return []; }
        root = null;
        rootMargin = "0px";
        thresholds = [0];
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers public docs and forwards the requested app route when login begins", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/?returnTo=%2Fapp%2Flibrary"]}>
        <LandingPage />
      </MemoryRouter>,
    );

    const getStarted = screen.getByRole("group", { name: "Get started" });
    const discordActions = within(getStarted).getByRole("group", {
      name: "Discord actions",
    });
    expect(Array.from(getStarted.querySelectorAll("a, button"), ({ textContent }) =>
      textContent?.trim(),
    )).toEqual([
      "Add Dice Witch to your server",
      "Login with Discord",
      "Read the docs",
    ]);
    const docsLink = screen.getByRole("link", { name: "Read the docs" });
    expect(docsLink.getAttribute("href")).toBe("/docs");
    expect(within(discordActions).queryByRole("link", { name: "Read the docs" }))
      .toBeNull();
    expect(docsLink.parentElement).toBe(getStarted);
    expect(screen.getByText("panache").tagName).toBe("EM");
    const clatter = screen.getByText("CLATTER");
    expect(clatter.getAttribute("font-size")).toBe("21");
    expect(clatter.nextElementSibling?.textContent).toBe("ACROSS");
    expect(clatter.nextElementSibling?.hasAttribute("dy")).toBe(false);
    expect(screen.getByText(
      "Don't worry, Dice Witch supports the complex rolls, modifiers and maths required for your esoteric shed-based hobby",
    )).toBeDefined();
    expect(screen.getByText(
      "Roll from the web and send the results directly to your Discord channel",
    )).toBeDefined();
    expect(screen.getByRole("heading", { name: "Saved rolls" })).toBeDefined();
    expect(screen.getByText(
      "Maintain a personal and server library of commonly used rolls and access them quickly in Discord or on the web",
    )).toBeDefined();
    expect(screen.getByRole("heading", { name: "Customize your dice" })).toBeDefined();
    expect(screen.getByText(/Choose from a wide array of fonts, materials, and textures/))
      .toBeDefined();
    const sampleHeading = screen.getByRole("heading", {
      name: "Check out a randomized sample of what we're conjuring onto your table here 👇",
    });
    expect(sampleHeading.className).toContain("max-w-4xl");
    expect(sampleHeading.className).toContain("mx-auto");
    expect(screen.queryByText(/Each click reveals another random mix/)).toBeNull();
    const loginButton = screen.getByRole("button", { name: "Login with Discord" });
    await user.hover(loginButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "You must have already added Dice Witch to your server to log in with Discord.",
    );
    await user.click(loginButton);

    expect(authenticateWithRedirect).toHaveBeenCalledWith({
      strategy: "oauth_discord",
      returnTo: "/app/library",
    });
  });

  it("loads the random appearance preview only when its below-fold section approaches the viewport", async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("region", { name: "Random appearance preview" }),
    ).toBeNull();

    await act(async () => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    const preview = await screen.findByRole("region", {
      name: "Random appearance preview",
    });
    expect(within(preview).getAllByRole("button")).toHaveLength(1);
  });
});
