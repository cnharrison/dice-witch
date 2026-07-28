import { describe, expect, it, vi } from "vitest";
import {
  MOBILE_ROLL_DISPLAY_MODE_STORAGE_KEY_V4,
  readRollDisplayModeV4,
  ROLL_DISPLAY_MODE_STORAGE_KEY_V4,
  writeRollDisplayModeV4,
} from "./roll-display-mode";

describe("V4 roll display preference", () => {
  it("keeps mobile 2D-first unless 3D was explicitly selected on mobile", () => {
    const values = new Map<string, string>([
      [ROLL_DISPLAY_MODE_STORAGE_KEY_V4, "3d"],
    ]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
    };

    expect(readRollDisplayModeV4(storage, false)).toBe("3d");
    expect(readRollDisplayModeV4(storage, true)).toBe("2d");

    values.set(MOBILE_ROLL_DISPLAY_MODE_STORAGE_KEY_V4, "3d");
    expect(readRollDisplayModeV4(storage, true)).toBe("3d");
    expect(storage.getItem).toHaveBeenCalledWith(
      MOBILE_ROLL_DISPLAY_MODE_STORAGE_KEY_V4,
    );
  });

  it("ignores unavailable or invalid storage and writes each responsive preference separately", () => {
    const unavailable = {
      getItem: vi.fn(() => {
        throw new DOMException("blocked");
      }),
      setItem: vi.fn(() => {
        throw new DOMException("blocked");
      }),
    };
    const invalid = { getItem: vi.fn(() => "automatic") };

    expect(readRollDisplayModeV4(unavailable, false)).toBe("3d");
    expect(readRollDisplayModeV4(invalid, true)).toBe("2d");
    expect(() => writeRollDisplayModeV4(unavailable, "2d", false)).not.toThrow();

    const storage = { setItem: vi.fn() };
    writeRollDisplayModeV4(storage, "3d", false);
    writeRollDisplayModeV4(storage, "3d", true);
    expect(storage.setItem).toHaveBeenNthCalledWith(
      1,
      ROLL_DISPLAY_MODE_STORAGE_KEY_V4,
      "3d",
    );
    expect(storage.setItem).toHaveBeenNthCalledWith(
      2,
      MOBILE_ROLL_DISPLAY_MODE_STORAGE_KEY_V4,
      "3d",
    );
  });
});
