// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import MarketingAppearancePreview from "./MarketingAppearancePreview";

afterEach(cleanup);

it("shows one control that replaces the random appearance", async () => {
  const user = userEvent.setup();
  render(<MarketingAppearancePreview />);

  const preview = screen.getByRole("region", {
    name: "Random appearance preview",
  });
  const image = within(preview).getByRole("img");
  const initialSource = image.getAttribute("src");
  const buttons = within(preview).getAllByRole("button");

  expect(buttons).toHaveLength(1);
  expect(buttons[0]?.textContent).toContain("Reroll");
  expect(within(preview).queryByText("Preview")).toBeNull();
  expect(within(preview).queryByText("Random · All dice")).toBeNull();

  await user.click(buttons[0]!);

  expect(within(preview).getByRole("img").getAttribute("src")).not.toBe(
    initialSource,
  );
});
