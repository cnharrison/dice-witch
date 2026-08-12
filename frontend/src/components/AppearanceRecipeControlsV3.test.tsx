// @vitest-environment jsdom

import { APPEARANCE_CATALOG_V3 } from "../../../cloudflare/packages/dice-appearance/src/catalog";
import type { AppearanceRecipeV3 } from "@dice-witch/dice-v4-model";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppearanceRecipeControlsV3 } from "./AppearanceRecipeControlsV3";

function recipe(styleId: string): AppearanceRecipeV3 {
  const style = APPEARANCE_CATALOG_V3.styles.find(({ id }) => id === styleId);
  if (style === undefined) throw new Error(`Style ${styleId} is missing`);
  return structuredClone(style.recipe);
}

function Harness({ initial }: { initial: AppearanceRecipeV3 }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <AppearanceRecipeControlsV3
        recipe={value}
        catalog={APPEARANCE_CATALOG_V3}
        target="all"
        onChange={setValue}
      />
      <output data-testid="recipe">{JSON.stringify(value)}</output>
    </>
  );
}

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterAll(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

afterEach(cleanup);

describe("AppearanceRecipeControlsV3", () => {
  it("shows one material list and shared editor after Customize", () => {
    render(<Harness initial={recipe("chaotic")} />);

    expect(
      screen.getByRole("group", {
        name: "Material: Weighted mix · 23 materials · Some alter colors",
      }),
    ).toBeDefined();
    const materials = screen.getByRole("heading", { name: "Materials" });
    const colors = screen.getByRole("group", { name: "Colors" });
    expect(
      materials.compareDocumentPosition(colors) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Primary font" }).textContent,
    ).toContain("Procedural mix");
    expect(screen.queryByText("Form")).toBeNull();
    expect(
      screen.queryByRole("group", { name: /Polyhedral/i }),
    ).toBeNull();
    expect(screen.queryByText("Advanced appearance controls")).toBeNull();
    expect(screen.getByLabelText("Material selection mode")).toHaveProperty(
      "value",
      "weighted",
    );
  });

  it("switches fixed Classic Solid to Gradient for multi-color modes", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("solid")} />);

    await user.selectOptions(
      screen.getByLabelText("Color behavior"),
      "vivid-random-pair",
    );

    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.colors).toEqual({ mode: "vivid-random-pair" });
    expect(value.material).toMatchObject({
      mode: "fixed",
      value: { family: "classic", treatment: "gradient" },
    });
    expect(screen.getAllByLabelText("Gradient scope")).toHaveLength(2);
  });

  it("switches multi-color recipes to one color for fixed Classic Solid", async () => {
    const user = userEvent.setup();
    const initial = recipe("pride");
    if (initial.colors.mode !== "palette") {
      throw new Error("Pride fixture must use a palette");
    }
    const primary = initial.colors.colors[0];
    const gradient = structuredClone(initial.gradient);
    render(<Harness initial={initial} />);

    await user.selectOptions(
      screen.getByLabelText("Classic treatment"),
      "solid",
    );

    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.colors).toEqual({ mode: "solid", primary });
    expect(value.material).toMatchObject({
      mode: "fixed",
      value: { family: "classic", treatment: "solid" },
    });
    expect(value.gradient).toEqual(gradient);
    expect(screen.queryAllByLabelText("Gradient scope")).toHaveLength(0);

    await user.selectOptions(
      screen.getByLabelText("Color behavior"),
      "palette",
    );
    const reopened = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(reopened.material).toMatchObject({
      mode: "fixed",
      value: { family: "classic", treatment: "gradient" },
    });
    expect(reopened.gradient).toEqual(gradient);
    expect(screen.getAllByLabelText("Gradient scope")).toHaveLength(2);
  });

  it("locks fixed Fantasy colors to the selected essence", async () => {
    const user = userEvent.setup();
    const initial = recipe("elemental-lava");
    initial.material = {
      mode: "fixed",
      value: {
        family: "fantasy",
        essence: "arcane",
        intensity: 60,
        finish: "radiant",
        textureScale: 100,
      },
    };
    initial.colors = {
      mode: "palette",
      colors: ["#111111", "#222222"],
    };
    render(<Harness initial={initial} />);

    expect(screen.queryByLabelText("Color behavior")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Fantasy essence"), "ice");

    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.colors).toEqual({
      mode: "palette",
      colors: ["#071b2b", "#2f7f9d", "#a9e8f2", "#f4fdff"],
    });
  });

  it("shows each font choice in its own typeface", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("chaotic")} />);

    const font = screen.getByRole("combobox", { name: "Primary font" });
    font.focus();
    await user.keyboard("{Enter}");
    const newRocker = screen.getByRole("option", { name: "New Rocker" });
    expect(newRocker.style.fontFamily).toBe("DiceWitchV4-new-rocker");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(font.style.fontFamily).toBe("DiceWitchV4-new-rocker");
    const value = JSON.parse(
      screen.getByTestId("recipe").textContent ?? "null",
    ) as AppearanceRecipeV3;
    expect(value.font).toEqual({ mode: "fixed", value: "new-rocker" });
  });

  it("shows the full Alcarin Tengwar name in its own typeface", async () => {
    const user = userEvent.setup();
    render(<Harness initial={recipe("chaotic")} />);

    const font = screen.getByRole("combobox", { name: "Primary font" });
    font.focus();
    await user.keyboard("{Enter}");
    const option = screen.getByRole("option", { name: "Alcarin Tengwar" });
    expect(option.style.fontFamily).toBe("DiceWitchV4-alcarin-tengwar");
    expect(option.textContent).toContain("Alcarin Tengwar");
    expect(option.querySelector("[aria-hidden=true]")).toBeNull();

    await user.keyboard("{End}{Enter}");
    expect(font.textContent).toContain("Alcarin Tengwar");
    expect(font.style.fontFamily).toBe("DiceWitchV4-alcarin-tengwar");
  });
});
