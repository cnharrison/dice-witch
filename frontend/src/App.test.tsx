// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import { AppView, createAppRoutes } from "./App";

const AppRoutes = createAppRoutes({
  LandingPage: () => <div>Landing page</div>,
  loadAuthenticatedApp: async () => ({
    default: () => <div>Authenticated app</div>,
  }),
  loadDocsApp: async () => ({
    default: () => <div>Documentation page</div>,
  }),
});

afterEach(cleanup);

it("serves documentation publicly outside the authenticated app", async () => {
  render(
    <MemoryRouter initialEntries={["/docs/dice-notation"]}>
      <AppView
        AppRoutes={AppRoutes}
        EnvironmentBannerSlot={() => null}
        SvgFiltersSlot={() => null}
      />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Documentation page")).toBeDefined();
  expect(screen.queryByText("Authenticated app")).toBeNull();
});
