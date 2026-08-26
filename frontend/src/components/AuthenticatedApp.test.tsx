// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import {
  AuthenticatedAppView,
  createAuthenticatedAppRoutes,
} from "./AuthenticatedApp";

const AuthenticatedRoutes = createAuthenticatedAppRoutes({
  loadHomePage: async () => ({ default: () => <div>Home</div> }),
  loadPreferencesPage: async () => ({
    default: () => <div>Preferences</div>,
  }),
  loadLibraryPage: async () => ({
    default: () => <div>Library page</div>,
  }),
});

const Boundary = ({ children }: React.PropsWithChildren) => children;

function TestAuthenticatedApp() {
  return (
    <AuthenticatedAppView
      AuthenticatedRoutes={AuthenticatedRoutes}
      AuthBoundary={Boundary}
      GuildBoundary={Boundary}
      NavbarSlot={() => <nav>Navigation</nav>}
      ToasterSlot={() => null}
    />
  );
}

afterEach(cleanup);

it("keeps the authenticated scroll container at the viewport edge", () => {
  render(
    <MemoryRouter>
      <TestAuthenticatedApp />
    </MemoryRouter>,
  );

  const main = screen.getByRole("main");
  expect(main.className).toContain("w-full");
  expect(main.className).not.toContain("container");
  expect(main.className).toContain("overflow-y-auto");
});

it("serves the Library at /library without retaining the old route", async () => {
  const { unmount } = render(
    <MemoryRouter initialEntries={["/library"]}>
      <TestAuthenticatedApp />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Library page")).toBeDefined();
  unmount();

  render(
    <MemoryRouter initialEntries={["/saved-rolls"]}>
      <TestAuthenticatedApp />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Library page")).toBeNull();
});
