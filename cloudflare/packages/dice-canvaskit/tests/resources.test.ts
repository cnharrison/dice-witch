import { describe, expect, it, vi } from "vitest";
import {
  CanvasKitResourceScopeV4,
  withCanvasKitResourcesSyncV4,
  withCanvasKitResourcesV4,
} from "../src/resources";

function resource(label: string, events: string[]) {
  let deleted = false;
  return {
    delete: vi.fn(() => {
      deleted = true;
      events.push(label);
    }),
    isDeleted: () => deleted,
  };
}

describe("CanvasKit V4 resource ownership", () => {
  it("deletes owned resources once in reverse order", () => {
    const events: string[] = [];
    const first = resource("first", events);
    const second = resource("second", events);
    const scope = new CanvasKitResourceScopeV4();

    scope.own(first, "first");
    scope.own(second, "second");
    scope.own(first, "first");
    scope.dispose();
    scope.dispose();

    expect(events).toEqual(["second", "first"]);
    expect(first.delete).toHaveBeenCalledTimes(1);
    expect(second.delete).toHaveBeenCalledTimes(1);
  });

  it("uses an explicit disposer for surface-like resources", () => {
    const events: string[] = [];
    const surface = resource("delete", events);
    const dispose = vi.fn(() => events.push("dispose"));
    const scope = new CanvasKitResourceScopeV4();

    scope.own(surface, "surface", dispose);
    scope.dispose();

    expect(events).toEqual(["dispose"]);
    expect(surface.delete).not.toHaveBeenCalled();
  });

  it("supports transfer and immediate deletion", () => {
    const events: string[] = [];
    const transferred = resource("transferred", events);
    const deleted = resource("deleted", events);
    const scope = new CanvasKitResourceScopeV4();

    expect(scope.release(scope.own(transferred, "transferred"))).toBe(
      transferred,
    );
    scope.delete(scope.own(deleted, "deleted"));
    scope.dispose();

    expect(events).toEqual(["deleted"]);
  });

  it("rejects failed allocations and ownership after disposal", () => {
    const scope = new CanvasKitResourceScopeV4();
    expect(() => scope.own(null, "surface")).toThrow(
      "CanvasKit surface allocation failed",
    );
    scope.dispose();
    expect(() => scope.own(resource("late", []), "late resource")).toThrow(
      "CanvasKit resource scope is disposed",
    );
  });

  it("attempts every cleanup and reports disposal failures", () => {
    const events: string[] = [];
    const first = resource("first", events);
    const second = resource("second", events);
    const scope = new CanvasKitResourceScopeV4();
    scope.own(first, "first", () => {
      events.push("first");
      throw new Error("first cleanup failed");
    });
    scope.own(second, "second", () => {
      events.push("second");
      throw new Error("second cleanup failed");
    });

    expect(() => {
      scope.dispose();
    }).toThrow("CanvasKit resource cleanup failed");
    expect(events).toEqual(["second", "first"]);
  });

  it("cleans up synchronous operations on success and failure", () => {
    const events: string[] = [];
    expect(
      withCanvasKitResourcesSyncV4((scope) => {
        scope.own(resource("success", events), "success");
        return "complete";
      }),
    ).toBe("complete");
    expect(() =>
      withCanvasKitResourcesSyncV4((scope) => {
        scope.own(resource("failure", events), "failure");
        throw new Error("render failed");
      }),
    ).toThrow("render failed");
    expect(events).toEqual(["success", "failure"]);
  });

  it("rejects promise-like synchronous callbacks and still cleans up", () => {
    const events: string[] = [];
    const asynchronousOperation = ((scope: CanvasKitResourceScopeV4) => {
      scope.own(resource("async", events), "async");
      return Promise.resolve("complete");
    }) as unknown as (scope: CanvasKitResourceScopeV4) => string;

    expect(() =>
      withCanvasKitResourcesSyncV4(asynchronousOperation),
    ).toThrow("CanvasKit synchronous resource callback returned a promise");
    expect(events).toEqual(["async"]);
  });

  it("cleans up when an operation fails", async () => {
    const events: string[] = [];
    await expect(
      withCanvasKitResourcesV4((scope) => {
        scope.own(resource("paint", events), "paint");
        scope.own(resource("surface", events), "surface");
        throw new Error("render failed");
      }),
    ).rejects.toThrow("render failed");
    expect(events).toEqual(["surface", "paint"]);
  });
});
