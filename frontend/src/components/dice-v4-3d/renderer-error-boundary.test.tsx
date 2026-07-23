// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreeRendererErrorBoundaryV4 } from "./renderer-error-boundary";

function BrokenRenderer(): React.ReactNode {
  throw new Error("3D chunk unavailable");
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ThreeRendererErrorBoundaryV4", () => {
  it("contains renderer load failures and reports a bounded capability failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const suppressWindowError = (event: ErrorEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("error", suppressWindowError);
    const onUnavailable = vi.fn();
    const view = render(
      <ThreeRendererErrorBoundaryV4 onUnavailable={onUnavailable}>
        <BrokenRenderer />
      </ThreeRendererErrorBoundaryV4>,
    );

    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(onUnavailable.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(view.container.childElementCount).toBe(0);
    window.removeEventListener("error", suppressWindowError);
  });
});
