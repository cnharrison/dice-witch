// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchableGuildPicker } from "./SearchableGuildPicker";

const guilds = [
  {
    guilds: { id: "1", name: "The Painted Tavern", icon: null },
    isAdmin: true,
    isDiceWitchAdmin: false,
  },
  {
    guilds: { id: "2", name: "Moonlit Library", icon: null },
    isAdmin: false,
    isDiceWitchAdmin: true,
  },
] as const;

afterEach(cleanup);

describe("SearchableGuildPicker", () => {
  it("filters authorized servers and selects the visible match", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SearchableGuildPicker
        guilds={guilds}
        value="1"
        onValueChange={onValueChange}
      />,
    );

    expect(
      screen.getByRole("radio", { name: /The Painted Tavern/ }),
    ).toHaveProperty("checked", true);

    await user.type(screen.getByLabelText("Find a server"), "moon");
    expect(
      screen.queryByRole("radio", { name: /The Painted Tavern/ }),
    ).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Moonlit Library/ }));
    expect(onValueChange).toHaveBeenCalledWith("2");
  });

  it("selects a server from the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SearchableGuildPicker
        guilds={guilds}
        value=""
        onValueChange={onValueChange}
      />,
    );

    const search = screen.getByLabelText("Find a server");
    expect(search.className).toContain("h-11");
    search.focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: /The Painted Tavern/ }),
    );
    await user.keyboard("[Space]");
    expect(onValueChange).toHaveBeenCalledWith("1");
  });

  it("shows an explicit empty result", async () => {
    const user = userEvent.setup();
    render(
      <SearchableGuildPicker guilds={guilds} value="" onValueChange={vi.fn()} />,
    );

    await user.type(screen.getByLabelText("Find a server"), "missing");
    expect(screen.getByRole("status")).toHaveProperty(
      "textContent",
      "No authorized servers match that search.",
    );
  });
});
