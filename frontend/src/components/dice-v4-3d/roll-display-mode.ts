export const ROLL_DISPLAY_MODE_STORAGE_KEY_V4 =
  "dice-witch-roll-display-v1";

export type RollDisplayModeV4 = "2d" | "3d";

type ReadableStorageV4 = Pick<Storage, "getItem">;
type WritableStorageV4 = Pick<Storage, "setItem">;

export function readRollDisplayModeV4(
  storage: ReadableStorageV4,
  mobile: boolean,
): RollDisplayModeV4 {
  try {
    const value = storage.getItem(ROLL_DISPLAY_MODE_STORAGE_KEY_V4);
    if (value === "2d" || value === "3d") return value;
  } catch {
    // Browser storage may be unavailable; retain the responsive session default.
  }
  return mobile ? "2d" : "3d";
}

export function writeRollDisplayModeV4(
  storage: WritableStorageV4,
  mode: RollDisplayModeV4,
): void {
  try {
    storage.setItem(ROLL_DISPLAY_MODE_STORAGE_KEY_V4, mode);
  } catch {
    // The in-memory choice remains active when browser persistence is blocked.
  }
}
