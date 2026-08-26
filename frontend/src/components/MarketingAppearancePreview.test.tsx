// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { MarketingAppearancePreviewView } from "./MarketingAppearancePreview";

function ImageTransition({
  candidate,
  alt,
  onError,
}: {
  candidate: { source: string; width: number; height: number };
  alt: string;
  onError(error: Error): void;
}) {
  return (
    <>
      <img
        src={candidate.source}
        width={candidate.width}
        height={candidate.height}
        alt={alt}
        data-pixelated-transition="true"
      />
      <span
        data-testid="fail-preview"
        onClick={() => onError(new Error("decode failed"))}
      />
    </>
  );
}

afterEach(cleanup);

it("shows one control that replaces the random appearance", async () => {
  const user = userEvent.setup();
  render(<MarketingAppearancePreviewView ImageTransition={ImageTransition} />);

  const preview = screen.getByRole("region", {
    name: "Random appearance preview",
  });
  const image = within(preview).getByRole("img");
  expect(image.dataset.pixelatedTransition).toBe("true");
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

it("recovers from an image error when rerolled", async () => {
  const user = userEvent.setup();
  render(<MarketingAppearancePreviewView ImageTransition={ImageTransition} />);

  await user.click(screen.getByTestId("fail-preview"));
  expect(screen.getByRole("alert").textContent).toBe("Preview unavailable.");

  await user.click(screen.getByRole("button", { name: "Reroll" }));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("img")).toBeDefined();
});
