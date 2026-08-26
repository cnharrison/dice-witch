// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceScopeBanner } from "./AppearanceScopeBanner";

afterEach(cleanup);

describe("AppearanceScopeBanner", () => {
  it("renders no persistent scope copy while editing all dice", () => {
    const { container } = render(
      <AppearanceScopeBanner target="all" hasOverride={false} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("warns a following target that its first change forks a copy", () => {
    render(
      <AppearanceScopeBanner target="d10" hasOverride={false} />,
    );
    expect(
      screen.getByText(/Your first change gives d10 its own copy/),
    ).not.toBeNull();
  });

  it("offers Reset to ALL for an override and lists shared-design notices", () => {
    const onReset = vi.fn();
    render(
      <AppearanceScopeBanner
        target="d20"
        hasOverride
        sharedNotices={[
          "Changes to Night garden affect: All dice.",
        ]}
        onReset={onReset}
      />,
    );
    const reset = screen.getByRole("button", { name: /Reset to ALL/ });
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Changes to Night garden affect: All dice."),
    ).not.toBeNull();
  });
});
