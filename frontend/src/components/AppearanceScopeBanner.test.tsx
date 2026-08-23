// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceScopeBanner } from "./AppearanceScopeBanner";

afterEach(cleanup);

describe("AppearanceScopeBanner", () => {
  it("states that ALL edits apply to every die without its own design", () => {
    render(
      <AppearanceScopeBanner
        target="all"
        hasOverride={false}
        affectedTargets={["d4", "d6", "d20", "fudge"]}
      />,
    );
    expect(screen.getByText("Editing ALL")).not.toBeNull();
    expect(
      screen.getByText("Applies to d4, d6, d20, and Fudge."),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Reset to ALL/ })).toBeNull();
  });

  it("warns a following target that its first change forks a copy", () => {
    render(
      <AppearanceScopeBanner
        target="d10"
        hasOverride={false}
        affectedTargets={[]}
      />,
    );
    expect(screen.getByText("d10 follows ALL right now")).not.toBeNull();
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
        affectedTargets={[]}
        sharedNotices={[
          "Changes to Night garden affect: All dice.",
        ]}
        onReset={onReset}
      />,
    );
    expect(screen.getByText("Editing d20 only")).not.toBeNull();
    const reset = screen.getByRole("button", { name: /Reset to ALL/ });
    fireEvent.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Changes to Night garden affect: All dice."),
    ).not.toBeNull();
  });
});
