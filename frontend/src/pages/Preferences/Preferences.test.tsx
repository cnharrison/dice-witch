// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../../cloudflare/packages/dice-appearance/src/catalog";
import { GuildProvider } from "@/context/GuildContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Preferences from "./index";

const GUILD_ID = "123456789012345678";

function queryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPreferences(): void {
  render(
    <QueryClientProvider client={queryClient()}>
      <GuildProvider>
        <Preferences />
      </GuildProvider>
    </QueryClientProvider>,
  );
}

function requestUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

function mockFetch(options: {
  isAdmin?: boolean;
  guildStatus?: number;
  personalStatus?: number;
} = {}): void {
  const {
    isAdmin = false,
    guildStatus = 200,
    personalStatus = 200,
  } = options;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/appearance/v3/catalog") {
        return Response.json(APPEARANCE_CATALOG_V3);
      }
      if (url.pathname === "/api/appearance/v3/me") {
        return personalStatus === 200
          ? Response.json({ revision: 0, profile: null })
          : Response.json(
              { error: "appearance_profile_version_conflict" },
              { status: personalStatus },
            );
      }
      if (url.pathname === "/api/appearance/v3/preview") {
        return Response.json({
          version: 3,
          contentType: "image/png",
          width: 150,
          height: 150,
          base64: "iVBORw0KGgo=",
        });
      }
      if (url.pathname === `/api/guilds/${GUILD_ID}/appearance/v3`) {
        return Response.json({ revision: 0, profile: null });
      }
      if (url.pathname === `/api/guilds/${GUILD_ID}/preferences`) {
        return init?.method === "PATCH"
          ? Response.json({ success: true })
          : Response.json({ preferences: { skipDiceDelay: false } });
      }
      if (url.pathname === "/api/guilds/mutual") {
        if (guildStatus !== 200) {
          return Response.json({ error: "unavailable" }, { status: guildStatus });
        }
        return Response.json({
          guilds: [
            {
              guilds: {
                id: GUILD_ID,
                name: "The Painted Tavern",
                icon: null,
              },
              isAdmin,
              isDiceWitchAdmin: false,
            },
          ],
        });
      }
      return Response.json(
        { error: `Unexpected request: ${url.pathname}` },
        { status: 500 },
      );
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("appearance preference authorization", () => {
  it("restores the concise Preferences identity for personal appearance", async () => {
    mockFetch();
    renderPreferences();

    const heading = await screen.findByRole("heading", { name: "Preferences" });
    expect(heading.className).toContain("UnifrakturMaguntia");
    expect(await screen.findByText("Preview")).toBeDefined();
    expect(screen.getByRole("button", { name: "My appearance" })).toBeDefined();
    expect(screen.queryByText("Dice Witch workbench")).toBeNull();
    expect(screen.queryByText(/Start with one design/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Server appearance" }),
    ).toBeNull();
  });

  it("keeps roll delivery inside the Server appearance section", async () => {
    const user = userEvent.setup();
    mockFetch({ isAdmin: true });
    renderPreferences();

    await user.click(
      await screen.findByRole("button", { name: "Server appearance" }),
    );
    const sectionHeading = await screen.findByRole("heading", {
      name: "Server appearance",
    });
    expect(sectionHeading.closest("section")).not.toBeNull();
    expect(screen.getByLabelText("Find a server")).toBeDefined();
    const serverGroup = sectionHeading.parentElement;
    const stylingMode = await screen.findByRole("group", {
      name: "Server styling mode",
    });
    expect(serverGroup?.contains(stylingMode)).toBe(true);
    expect(
      await screen.findByText("Skip dice roll delay and clatter message"),
    ).toBeDefined();
    expect(
      screen.queryByText("Control whether server rolls pause for the animated clatter notice."),
    ).toBeNull();
    expect(
      screen.queryByText("Choose an authorized server, then set its dice and roll delivery."),
    ).toBeNull();
    const rollDelivery = screen.getByRole("heading", { name: "Roll delivery" });
    expect(
      stylingMode.compareDocumentPosition(rollDelivery) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("distinguishes stored Profile V3 version conflicts", async () => {
    mockFetch({ personalStatus: 409 });
    renderPreferences();

    expect(
      await screen.findByText(
        "The stored profile belongs to another appearance version and was not migrated in the browser.",
        {},
        { timeout: 5_000 },
      ),
    ).toBeDefined();
    expect(screen.queryByText("Preview")).toBeNull();
  });

  it("keeps roll-delay persistence independent from Profile V3", async () => {
    const user = userEvent.setup();
    mockFetch({ isAdmin: true });
    renderPreferences();

    await user.click(
      await screen.findByRole("button", { name: "Server appearance" }),
    );
    await user.click(
      await screen.findByRole("switch", {
        name: "Skip dice roll delay and clatter message",
      }),
    );

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      const mutation = calls.find(([input, init]) =>
        requestUrl(input).pathname === `/api/guilds/${GUILD_ID}/preferences` &&
        init?.method === "PATCH",
      );
      expect(mutation).toBeDefined();
      expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
        skipDiceDelay: true,
      });
    });
  });

  it("reports guild lookup failures without hiding personal controls", async () => {
    mockFetch({ guildStatus: 502 });
    renderPreferences();

    expect(await screen.findByText("Preview")).toBeDefined();
    expect(
      await screen.findByText(
        "Server appearance controls are unavailable: Guilds are unavailable",
        {},
        { timeout: 5_000 },
      ),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: "Server appearance" }),
    ).toBeNull();
  });
});
