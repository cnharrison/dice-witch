// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerAppearanceModeV3 } from "./ServerAppearanceModeV3";

afterEach(cleanup);

describe("ServerAppearanceModeV3", () => {
  it.each([
    [
      "Off",
      "Dice Witch does not apply a server design. Each member's personal design remains active.",
    ],
    [
      "Default",
      "Members use their personal design when set; the server design fills targets they have not customized.",
    ],
    [
      "Enforced",
      "The server design overrides personal designs for every configured target.",
    ],
  ] as const)(
    "explains %s server styling on hover and keyboard focus",
    async (label, description) => {
      const user = userEvent.setup();
      render(
        <ServerAppearanceModeV3
          mode="default"
          onChange={vi.fn(async () => undefined)}
        />,
      );

      const radio = screen.getByRole("radio", { name: label });
      const descriptionId = radio.getAttribute("aria-describedby");
      expect(descriptionId).not.toBeNull();
      expect(document.getElementById(descriptionId ?? "")?.textContent).toContain(
        description,
      );
      await user.hover(screen.getByText(label));
      expect((await screen.findByRole("tooltip")).textContent).toContain(
        description,
      );
      await user.unhover(screen.getByText(label));
      fireEvent.focus(radio);
      await waitFor(() =>
        expect(screen.getByRole("tooltip").textContent).toContain(description),
      );
    },
  );

  it("saves a selected mode immediately", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn(async () => undefined);
    render(<ServerAppearanceModeV3 mode="default" onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Enforced" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("enforced"));
    expect(
      (screen.getByRole("radio", { name: "Enforced" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect((await screen.findByRole("status")).textContent).toBe(
      "Server styling mode was saved.",
    );
  });

  it("restores the persisted mode when saving fails", async () => {
    const user = userEvent.setup();
    render(
      <ServerAppearanceModeV3
        mode="default"
        onChange={vi.fn(async () => {
          throw new Error("save failed");
        })}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Off" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Server styling mode could not be saved.",
    );
    expect(
      (screen.getByRole("radio", { name: "Default" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});
