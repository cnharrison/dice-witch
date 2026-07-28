// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Guild } from "@/types/guild";
import { SavedRollLibrarySelect } from "./SavedRollLibrarySelect";

const guilds: Guild[] = [
  {
    guilds: { id: "100000000000000001", name: "Admin server", icon: "" },
    isAdmin: true,
    isDiceWitchAdmin: false,
  },
  {
    guilds: { id: "100000000000000002", name: "Witch server", icon: "" },
    isAdmin: false,
    isDiceWitchAdmin: true,
  },
];

afterEach(cleanup);

it("shows Personal without a scope label and renders server permission pills", () => {
  const view = render(
    <SavedRollLibrarySelect
      ariaLabel="Saved roll library"
      guilds={guilds}
      includePersonal
      value="personal"
      onValueChange={vi.fn()}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Saved roll library" }).textContent).toContain(
    "Personal",
  );

  view.rerender(
    <SavedRollLibrarySelect
      ariaLabel="Saved roll library"
      guilds={guilds}
      includePersonal
      value="100000000000000001"
      onValueChange={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Saved roll library" }).textContent).toContain(
    "Admin server",
  );
  expect(screen.getByText("Admin")).toBeTruthy();

  view.rerender(
    <SavedRollLibrarySelect
      ariaLabel="Saved roll library"
      guilds={guilds}
      includePersonal
      value="100000000000000002"
      onValueChange={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Saved roll library" }).textContent).toContain(
    "Witch server",
  );
  expect(screen.getByText("DW Admin")).toBeTruthy();
});
