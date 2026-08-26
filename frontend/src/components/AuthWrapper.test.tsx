// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthWrapperView } from "./AuthWrapper";

const auth = {
  isLoading: false,
  isSignedIn: false,
};

const useAuthState = () => auth;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  auth.isLoading = false;
  auth.isSignedIn = false;
});

describe("AuthWrapper", () => {
  it("redirects an anonymous user to login with the requested route", () => {
    function LandingLocation() {
      const location = useLocation();
      return <p>Landing {location.search}</p>;
    }

    render(
      <MemoryRouter initialEntries={["/app/library"]}>
        <Routes>
          <Route path="/" element={<LandingLocation />} />
          <Route
            path="/app/library"
            element={
              <AuthWrapperView useAuthState={useAuthState}>
                <p>Private app</p>
              </AuthWrapperView>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Landing ?returnTo=%2Fapp%2Flibrary"),
    ).toBeDefined();
    expect(screen.queryByText("Private app")).toBeNull();
  });

  it("renders authenticated content without issuing an extra guild request", () => {
    auth.isSignedIn = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <AuthWrapperView useAuthState={useAuthState}>
          <p>Private app</p>
        </AuthWrapperView>
      </MemoryRouter>,
    );

    expect(screen.getByText("Private app")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
