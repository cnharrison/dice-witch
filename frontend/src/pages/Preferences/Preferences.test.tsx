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
  personalProfile?: unknown;
} = {}): void {
  const {
    isAdmin = false,
    guildStatus = 200,
    personalStatus = 200,
    personalProfile = null,
  } = options;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.pathname === "/api/appearance/v4/catalog") {
        return Response.json(APPEARANCE_CATALOG_V3);
      }
      if (url.pathname === "/api/appearance/v4/me") {
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body)) as { profile: unknown };
          return Response.json({
            status: "applied",
            revision: 1,
            profile: body.profile,
          });
        }
        return personalStatus === 200
          ? Response.json({
              revision: personalProfile === null ? 0 : 1,
              profile: personalProfile,
            })
          : Response.json(
              { error: "appearance_profile_version_conflict" },
              { status: personalStatus },
            );
      }
      if (url.pathname === "/api/appearance/v4/preview") {
        return Response.json({
          version: 4,
          contentType: "image/png",
          width: 150,
          height: 150,
          base64: "iVBORw0KGgo=",
        });
      }
      if (url.pathname === `/api/guilds/${GUILD_ID}/appearance/v4`) {
        return Response.json({ revision: 0, profile: null });
      }
      if (url.pathname === `/api/guilds/${GUILD_ID}/preferences`) {
        return init?.method === "PATCH"
          ? Response.json({ success: true })
          : Response.json({
              preferences: {
                skipDiceDelay: false,
                hideRollResultText: false,
              },
            });
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
  it("shows server refresh inside the Server appearance box", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderPreferences();

    expect(screen.queryByRole("heading", { name: "Preferences" })).toBeNull();
    expect(await screen.findByRole("region", { name: "Preview" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Personal" })).toBeDefined();
    expect(screen.queryByText("Dice Witch workbench")).toBeNull();
    expect(screen.queryByText(/Start with one design/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Refresh" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Server" }));

    const serverAppearanceBox = screen
      .getByRole("heading", { name: "Server appearance" })
      .closest("div");
    const refreshLink = screen.getByRole("link", { name: "Refresh" });
    expect(serverAppearanceBox?.contains(refreshLink)).toBe(true);
    expect(refreshLink.getAttribute("href")).toContain(
      "/api/auth/refresh/discord",
    );
    expect(refreshLink.className).not.toContain("bg-brand");
  });

  it("confirms before leaving a section with an appearance draft", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetch({ isAdmin: true });
    renderPreferences();

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );
    await user.click(screen.getByRole("button", { name: "Server" }));
    expect(confirm).toHaveBeenCalledWith("Discard unsaved appearance changes?");
    expect(
      screen.getByRole("button", { name: "Personal" }).getAttribute("aria-current"),
    ).toBe("page");

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Server" }));
    expect(
      await screen.findByRole("heading", { name: "Server appearance" }),
    ).toBeDefined();
  });

  it("keeps server refresh on the page when draft discard is declined", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mockFetch({ isAdmin: true });
    renderPreferences();

    await user.click(await screen.findByRole("button", { name: "Server" }));
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Preset" }),
      "dice-witch",
    );
    await user.click(screen.getByRole("link", { name: "Refresh" }));

    expect(confirm).toHaveBeenCalledWith("Discard unsaved appearance changes?");
    expect(window.location.pathname).not.toBe("/api/auth/refresh/discord");
  });

  it("saves camera drafts through the profile Save & apply action", async () => {
    const user = userEvent.setup();
    mockFetch();
    renderPreferences();

    await user.click(await screen.findByRole("tab", { name: "Camera" }));
    await user.click(
      screen.getByRole("switch", { name: "Keep rolled results clear" }),
    );
    expect(
      vi.mocked(fetch).mock.calls.some(
        ([input, init]) =>
          requestUrl(input).pathname === "/api/appearance/v4/me" &&
          init?.method === "PUT",
      ),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Save & apply" }));
    await waitFor(() => {
      const mutation = vi.mocked(fetch).mock.calls.find(
        ([input, init]) =>
          requestUrl(input).pathname === "/api/appearance/v4/me" &&
          init?.method === "PUT",
      );
      expect(mutation).toBeDefined();
      expect(JSON.parse(String(mutation?.[1]?.body))).toMatchObject({
        expectedRevision: 0,
        profile: {
          version: 4,
          diceView: { mode: "clear", elevationDegrees: 40 },
        },
      });
    });
  });

  it("keeps roll delivery inside the Server appearance section", async () => {
    const user = userEvent.setup();
    mockFetch({ isAdmin: true });
    renderPreferences();

    await user.click(
      await screen.findByRole("button", { name: "Server" }),
    );
    const sectionHeading = await screen.findByRole("heading", {
      name: "Server appearance",
    });
    expect(sectionHeading.closest("section")).not.toBeNull();
    expect(screen.getByLabelText("Search server names")).toBeDefined();
    expect(await screen.findByRole("tab", { name: "Design" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Camera" })).toBeDefined();
    const serverSettingsTab = screen.getByRole("tab", {
      name: "Server settings",
    });
    expect(
      screen.queryByRole("group", { name: "Server styling mode" }),
    ).toBeNull();
    expect(
      screen.queryByText("Skip dice roll delay and clatter message"),
    ).toBeNull();

    const preview = screen.getByRole("region", { name: "Preview" });
    await user.click(serverSettingsTab);
    const stylingMode = screen.getByRole("group", {
      name: "Server styling mode",
    });
    expect(stylingMode).toBeDefined();
    expect(
      screen.getByText("Skip dice roll delay and clatter message"),
    ).toBeDefined();
    expect(screen.getByText("Hide text results")).toBeDefined();
    expect(screen.getByRole("region", { name: "Preview" })).toBe(preview);
    expect(
      screen.queryByText("Control whether server rolls pause for the animated clatter notice."),
    ).toBeNull();
    expect(
      screen.queryByText("Choose an authorized server, then set its dice and roll delivery."),
    ).toBeNull();
  });

  it("distinguishes stored profile version conflicts", async () => {
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

  it("persists both roll-delivery preferences as one independent object", async () => {
    const user = userEvent.setup();
    mockFetch({ isAdmin: true });
    renderPreferences();

    await user.click(
      await screen.findByRole("button", { name: "Server" }),
    );
    await user.click(
      await screen.findByRole("tab", { name: "Server settings" }),
    );
    await user.click(
      screen.getByRole("switch", { name: "Hide text results" }),
    );

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      const read = calls.find(([input, init]) =>
        requestUrl(input).pathname === `/api/guilds/${GUILD_ID}/preferences` &&
        init?.method === undefined,
      );
      expect(requestUrl(read?.[0] as string).searchParams.get("version")).toBe("2");
      const mutations = calls.filter(([input, init]) =>
        requestUrl(input).pathname === `/api/guilds/${GUILD_ID}/preferences` &&
        init?.method === "PATCH",
      );
      expect(JSON.parse(String(mutations.at(-1)?.[1]?.body))).toEqual({
        skipDiceDelay: false,
        hideRollResultText: true,
      });
    });

    await user.click(
      screen.getByRole("switch", {
        name: "Skip dice roll delay and clatter message",
      }),
    );
    await waitFor(() => {
      const mutations = vi.mocked(fetch).mock.calls.filter(([input, init]) =>
        requestUrl(input).pathname === `/api/guilds/${GUILD_ID}/preferences` &&
        init?.method === "PATCH",
      );
      expect(mutations).toHaveLength(2);
      expect(JSON.parse(String(mutations.at(-1)?.[1]?.body))).toEqual({
        skipDiceDelay: true,
        hideRollResultText: true,
      });
    });
  });

  it("keeps server refresh available when guild lookup fails", async () => {
    const user = userEvent.setup();
    mockFetch({ guildStatus: 502 });
    renderPreferences();

    expect(await screen.findByRole("region", { name: "Preview" })).toBeDefined();
    expect(
      await screen.findByText(
        "Server appearance controls are unavailable: Guilds are unavailable",
        {},
        { timeout: 5_000 },
      ),
    ).toBeDefined();
    expect(screen.queryByRole("link", { name: "Refresh" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Server" }));

    expect(screen.getByRole("link", { name: "Refresh" })).toBeDefined();
  });
});
