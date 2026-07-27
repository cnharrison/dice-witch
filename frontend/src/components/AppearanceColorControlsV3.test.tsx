// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type { AppearanceRecipeV3 } from "@dice-witch/dice-v4-model";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceColorControlsV3 } from "./AppearanceColorControlsV3";

function recipe(styleId: string): AppearanceRecipeV3 {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function Harness({ initial }: { initial: AppearanceRecipeV3 }) {
  const [value, setValue] = React.useState(initial);
  return (
    <AppearanceColorControlsV3
      recipe={value}
      catalog={APPEARANCE_CATALOG_V3}
      onChange={setValue}
    />
  );
}

afterEach(cleanup);

describe("AppearanceColorControlsV3", () => {
  it("uses catalog-owned colors when changing a generated pair to a palette", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("chaotic")} />);

    expect(
      screen.queryByRole("button", { name: "Choose color 1" }),
    ).toBeNull();
    const behavior = screen.getByLabelText("Color behavior");
    expect(behavior.className).toContain("appearance-none");
    expect(behavior.className).toContain("pr-10");
    expect(behavior.parentElement?.className).toContain("relative");
    expect(behavior.closest("label")?.firstElementChild?.className).toContain(
      "block",
    );
    await user.selectOptions(behavior, "palette");

    expect(
      screen.getByRole("button", { name: "Choose color 1" }),
    ).toHaveProperty("value", "#8a1f82");
    expect(
      screen.getByRole("button", { name: "Choose color 2" }),
    ).toHaveProperty("value", "#04c9df");
    await user.click(screen.getByRole("button", { name: "Add color" }));
    expect(
      screen.queryByRole("button", { name: "Choose color 3" }),
    ).toBeNull();

    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(
      screen.getByRole("button", { name: "Choose color 3" }),
    ).toHaveProperty("value", "#123456");
  });

  it("uses the shared custom picker to edit an appearance color", async () => {
    const user = userEvent.setup();
    const initial = recipe("pride");
    initial.colors = {
      mode: "palette",
      colors: ["#8a1f82", "#04c9df"],
    };
    render(<Harness initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Choose color 1" }));
    expect(
      screen.getByRole("heading", { name: "Appearance color" }).parentElement?.className,
    ).toContain("sr-only");
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#123456");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("button", { name: "Choose color 1" })).toHaveProperty(
      "value",
      "#123456",
    );
  });

  it("randomizes every palette stop without changing the color count", async () => {
    const user = userEvent.setup();
    const initial = recipe("pride");
    initial.colors = {
      mode: "palette",
      colors: ["#8a1f82", "#04c9df", "#f3d36a", "#d7263d"],
    };
    render(<Harness initial={initial} />);
    const before = Array.from(
      { length: 4 },
      (_, index) =>
        (
          screen.getByRole("button", {
            name: `Choose color ${String(index + 1)}`,
          }) as HTMLButtonElement
        ).value,
    );

    await user.click(screen.getByRole("button", { name: "Randomize palette" }));

    const after = Array.from(
      { length: 4 },
      (_, index) =>
        (
          screen.getByRole("button", {
            name: `Choose color ${String(index + 1)}`,
          }) as HTMLButtonElement
        ).value,
    );
    expect(after).toHaveLength(before.length);
    expect(new Set(after)).toHaveLength(after.length);
    expect(after).not.toEqual(before);
  });

  it("removes the selected palette stop without changing the remaining order", async () => {
    const user = userEvent.setup();
    const initial = recipe("pride");
    initial.colors = {
      mode: "palette",
      colors: ["#8a1f82", "#04c9df", "#f3d36a", "#d7263d"],
    };
    render(<Harness initial={initial} />);

    await user.click(screen.getByRole("button", { name: "Remove color 2" }));

    expect(
      screen.getByRole("button", { name: "Choose color 1" }),
    ).toHaveProperty("value", "#8a1f82");
    expect(
      screen.getByRole("button", { name: "Choose color 2" }),
    ).toHaveProperty("value", "#f3d36a");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Choose color 2" }),
    );
    expect(
      screen.getByRole("button", { name: "Choose color 3" }),
    ).toHaveProperty("value", "#d7263d");
    expect(
      screen.queryByRole("button", { name: "Choose color 4" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Remove color 4" }),
    ).toBeNull();
  });

  it("rejects a duplicate selected in the custom picker", async () => {
    const user = userEvent.setup();
    const initial = recipe("pride");
    initial.colors = {
      mode: "palette",
      colors: ["#8a1f82", "#04c9df"],
    };
    render(<Harness initial={initial} />);

    expect(
      screen.queryByRole("button", { name: "Remove color 1" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Choose color 2" }));
    const hex = screen.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#8A1F82");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(
      screen.getByRole("button", { name: "Choose color 2" }),
    ).toHaveProperty("value", "#04c9df");
    expect(screen.getByRole("alert").textContent).toContain(
      "Palette needs at least two distinct colors",
    );
  });
});
