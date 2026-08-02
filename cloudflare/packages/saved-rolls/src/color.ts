const HEX_COLOR = /^#[0-9A-F]{6}$/;

export function parseSavedRollNameColorV2(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    throw new Error("Library roll name color must be null or uppercase #RRGGBB");
  }
  return value;
}
