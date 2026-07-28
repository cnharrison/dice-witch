// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./components/EnvironmentBanner", () => ({
  EnvironmentBanner: () => null,
}));
vi.mock("./components/SvgFilters", () => ({ SvgFilters: () => null }));
vi.mock("./pages/LandingPage", () => ({
  default: () => <div>Landing page</div>,
}));
vi.mock("./lib/app-route-loaders", () => ({
  loadAuthenticatedApp: async () => ({
    default: () => <div>Authenticated app</div>,
  }),
  loadDocsApp: async () => ({ default: () => <div>Documentation page</div> }),
  loadHomePage: async () => ({ default: () => null }),
  loadLibraryPage: async () => ({ default: () => null }),
  loadPreferencesPage: async () => ({ default: () => null }),
}));

import App from "./App";

afterEach(cleanup);

it("serves documentation publicly outside the authenticated app", async () => {
  render(
    <MemoryRouter initialEntries={["/docs/dice-notation"]}>
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Documentation page")).toBeDefined();
  expect(screen.queryByText("Authenticated app")).toBeNull();
});
