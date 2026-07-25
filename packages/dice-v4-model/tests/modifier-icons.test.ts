import { describe, expect, it } from "vitest";
import {
  ICON_NAMES_V4,
  LEGACY_MODIFIER_ICON_SIZE_V4,
  SIGNAL_DISK_MODIFIER_ICON_SIZE_V4,
  SIGNAL_DISK_MODIFIER_ICONS_V4,
  modifierIconDesignV4,
  modifierIconLeftV4,
  modifierIconSizeV4,
} from "../src";

describe("V4 modifier icon designs", () => {
  it("defines one immutable signal-disk vector for every visible icon", () => {
    const visibleIcons = ICON_NAMES_V4.filter((icon) => icon !== "blank");

    expect(Object.keys(SIGNAL_DISK_MODIFIER_ICONS_V4)).toEqual(visibleIcons);
    expect(Object.isFrozen(SIGNAL_DISK_MODIFIER_ICONS_V4)).toBe(true);
    for (const icon of visibleIcons) {
      const commands = SIGNAL_DISK_MODIFIER_ICONS_V4[icon];
      expect(commands.length).toBeGreaterThan(2);
      expect(Object.isFrozen(commands)).toBe(true);
      expect(commands.every(Object.isFrozen)).toBe(true);
    }
  });

  it("changes only r8 to the approved 42px signal-disk design", () => {
    for (const revision of [
      "canvaskit-v4-r1",
      "canvaskit-v4-r2",
      "canvaskit-v4-r3",
      "canvaskit-v4-r4",
      "canvaskit-v4-r5",
      "canvaskit-v4-r6",
      "canvaskit-v4-r7",
    ] as const) {
      expect(modifierIconDesignV4(revision)).toBe("legacy-r1");
      expect(modifierIconSizeV4(revision)).toBe(LEGACY_MODIFIER_ICON_SIZE_V4);
    }
    expect(modifierIconDesignV4("canvaskit-v4-r8")).toBe(
      "signal-disks-r8",
    );
    expect(modifierIconSizeV4("canvaskit-v4-r8")).toBe(
      SIGNAL_DISK_MODIFIER_ICON_SIZE_V4,
    );
  });

  it("preserves legacy slot centers when r8 icons grow from 37px to 42px", () => {
    expect(
      [0, 1, 2].map((slot) =>
        modifierIconLeftV4(3, slot, "canvaskit-v4-r7") +
        LEGACY_MODIFIER_ICON_SIZE_V4 / 2,
      ),
    ).toEqual([47, 75.5, 104]);
    expect(
      [0, 1, 2].map((slot) =>
        modifierIconLeftV4(3, slot, "canvaskit-v4-r8") +
        SIGNAL_DISK_MODIFIER_ICON_SIZE_V4 / 2,
      ),
    ).toEqual([47, 75.5, 104]);
  });
});
