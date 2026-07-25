// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let intersectionCallback: IntersectionObserverCallback;

vi.mock("@/lib/AuthProvider", () => ({
  useAuth: () => ({ isSignedIn: false }),
  useSignIn: () => ({ isLoaded: true, signIn: { authenticateWithRedirect: vi.fn() } }),
}));

vi.mock("@/hooks/useServerStats", () => ({
  useServerStats: () => ({
    liveGuilds: 23_432,
    estimatedGuildMemberships: 1_000_000,
    knownDiceWitchUsers: 73_429,
    available: true,
  }),
}));

vi.mock("@/components/DeferredPreviewRoller", () => ({
  default: () => <div>Deferred preview roller</div>,
}));

vi.mock("@/components/SvgFilters", () => ({ SvgFilters: () => null }));

import LandingPage from "./LandingPage";

describe("LandingPage", () => {
  beforeEach(() => {
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

  it("loads the preview roller only when its below-fold section approaches the viewport", async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Deferred preview roller")).toBeNull();

    await act(async () => {
      intersectionCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });

    expect(await screen.findByText("Deferred preview roller")).toBeTruthy();
  });
});
